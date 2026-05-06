import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/infrastructure/db/supabase/server"
import { createAdminClient } from "@/infrastructure/db/supabase/admin"
import { getEffectivePlanForApiUser } from "@/modules/ai/application/effective-plan"
import { aiBatchLimitOr429, apiIpLimitOr429 } from "@/core/security/api-ip-limit"
import { aiBatchJobPayloadSchema, enqueueAiBatchJob, hashAiBatchRequest } from "@/modules/ai/application/batch-jobs"
import { resolveAiTaskPolicy } from "@/modules/ai/domain/task-policy"
import { logBusinessEvent } from "@/modules/master-admin/application/events"
import type { Json } from "@/infrastructure/db/types/database"

export const dynamic = "force-dynamic"

function payloadInputSize(payload: Record<string, unknown>): number {
  const text = [payload.screenplay, payload.content, payload.userPrompt, payload.context]
    .filter((value): value is string => typeof value === "string")
    .join("\n")
  return text.length
}

export async function POST(req: NextRequest) {
  const tooMany = await apiIpLimitOr429(req)
  if (tooMany) return tooMany

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const batchLimit = await aiBatchLimitOr429(req, user.id)
  if (batchLimit) return batchLimit

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const parsed = aiBatchJobPayloadSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid AI batch job payload" }, { status: 400 })
  }

  const body = parsed.data
  const effectivePlan = await getEffectivePlanForApiUser(supabase, user.id)
  const policy = resolveAiTaskPolicy({
    endpoint: body.endpoint,
    plan: effectivePlan,
    inputSize: payloadInputSize(body.payload),
    requestedMode: "batch",
  })

  if (!policy.batchEligible) {
    return NextResponse.json({ error: "This AI task is not eligible for batch processing." }, { status: 400 })
  }

  const admin = createAdminClient()
  let orgId: string | null = null

  if (body.projectId) {
    const { data: project, error } = await admin
      .from("projects")
      .select("id, org_id")
      .eq("id", body.projectId)
      .eq("user_id", user.id)
      .maybeSingle()

    if (error) {
      return NextResponse.json({ error: "Unable to verify project access" }, { status: 500 })
    }
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 })
    }
    orgId = project.org_id
  }

  const requestHash = hashAiBatchRequest(user.id, body.endpoint, body.projectId ?? null, body.payload)
  const insert = {
    user_id: user.id,
    org_id: orgId,
    project_id: body.projectId ?? null,
    endpoint: body.endpoint,
    request_hash: requestHash,
    payload: body.payload as Json,
    status: "queued",
  }

  const inserted = await (admin as any).from("ai_batch_jobs").insert(insert).select("*").maybeSingle()
  let job = inserted.data

  if (inserted.error?.code === "23505") {
    const { data, error } = await admin
      .from("ai_batch_jobs")
      .select("*")
      .eq("user_id", user.id)
      .eq("endpoint", body.endpoint)
      .eq("request_hash", requestHash)
      .maybeSingle()
    if (error) return NextResponse.json({ error: "Failed to load existing batch job" }, { status: 500 })
    job = data
  } else if (inserted.error) {
    return NextResponse.json({ error: "Failed to create AI batch job" }, { status: 500 })
  }

  if (!job) {
    return NextResponse.json({ error: "Batch job not found" }, { status: 500 })
  }

  const enqueue = await enqueueAiBatchJob(job.id)
  void logBusinessEvent(req, {
    eventType: "ai_batch.created",
    userId: user.id,
    outcome: enqueue.ok ? "success" : "pending",
    plan: effectivePlan,
    metadata: {
      jobId: job.id,
      endpoint: body.endpoint,
      projectId: body.projectId ?? null,
      qstash: enqueue.ok,
      qstashReason: enqueue.ok ? null : enqueue.reason,
    },
  }).catch(() => {})

  return NextResponse.json(
    {
      job: {
        id: job.id,
        endpoint: job.endpoint,
        status: job.status,
        createdAt: job.created_at,
        updatedAt: job.updated_at,
      },
      queued: enqueue.ok,
      queueReason: enqueue.ok ? null : enqueue.reason,
    },
    { status: inserted.error?.code === "23505" ? 200 : 202 }
  )
}

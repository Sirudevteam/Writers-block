import { NextRequest, NextResponse } from "next/server"
import { Receiver } from "@upstash/qstash"
import { z } from "zod"
import { createAdminClient } from "@/infrastructure/db/supabase/admin"
import { getEffectivePlanForApiUser } from "@/modules/ai/application/effective-plan"
import { generateTextWithService } from "@/modules/ai/application/generation-service"
import { resolveAiTaskPolicy } from "@/modules/ai/domain/task-policy"
import { getAiBatchJobUrl } from "@/modules/ai/application/batch-jobs"
import { logBusinessEvent } from "@/modules/master-admin/application/events"
import { classifyAiTaskKind } from "@/modules/ai/domain/generation"
import type { AiBatchJob, Json } from "@/infrastructure/db/types/database"

export const dynamic = "force-dynamic"

const jobRequestSchema = z
  .object({
    jobId: z.string().uuid().optional(),
  })
  .strict()

function receiverFromEnv(): Receiver | null {
  const currentSigningKey = process.env.QSTASH_CURRENT_SIGNING_KEY
  const nextSigningKey = process.env.QSTASH_NEXT_SIGNING_KEY
  if (!currentSigningKey || !nextSigningKey) return null
  return new Receiver({ currentSigningKey, nextSigningKey })
}

async function verifyJobRequest(req: NextRequest, rawBody: string): Promise<boolean> {
  const secret = process.env.AI_BATCH_JOB_SECRET
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
  if (secret && bearer && bearer === secret) return true
  if (secret && req.headers.get("x-ai-batch-job-secret") === secret) return true

  const receiver = receiverFromEnv()
  const url = getAiBatchJobUrl()
  const signature = req.headers.get("upstash-signature")
  if (!receiver || !url || !signature) return false

  try {
    return await receiver.verify({ signature, body: rawBody, url })
  } catch {
    return false
  }
}

function asRecord(value: Json | null): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function textValue(payload: Record<string, unknown>, key: string): string {
  const value = payload[key]
  return typeof value === "string" ? value : ""
}

function buildBatchPrompts(job: AiBatchJob): { systemPrompt: string; userPrompt: string; inputSize: number; cacheContext: string } {
  const payload = asRecord(job.payload)
  const customSystem = textValue(payload, "systemPrompt")
  const customUser = textValue(payload, "userPrompt")
  if (customSystem && customUser) {
    return {
      systemPrompt: customSystem,
      userPrompt: customUser,
      inputSize: customUser.length,
      cacheContext: textValue(payload, "context") || customUser,
    }
  }

  const screenplay = textValue(payload, "screenplay") || textValue(payload, "content")
  if (job.endpoint === "movie-references" || job.endpoint === "background-references") {
    return {
      systemPrompt:
        "You are a film reference researcher. Return concise JSON with relevant movie scenes, emotional match, and practical staging notes.",
      userPrompt: `Find cinematic references for this screenplay context.\n\n${screenplay}`,
      inputSize: screenplay.length,
      cacheContext: screenplay,
    }
  }

  if (job.endpoint === "bulk-formatting") {
    return {
      systemPrompt:
        "You are a screenplay formatter. Clean formatting, preserve story content, preserve character names, and return only the formatted screenplay.",
      userPrompt: `Format this screenplay for professional readability.\n\n${screenplay}`,
      inputSize: screenplay.length,
      cacheContext: screenplay,
    }
  }

  if (job.endpoint === "improve-dialogue") {
    return {
      systemPrompt:
        "You are an expert Tamil cinema dialogue writer. Improve only dialogue while preserving scene headings, action, character names, and plot.",
      userPrompt: `Improve dialogue in this screenplay and return the complete screenplay.\n\n${screenplay}`,
      inputSize: screenplay.length,
      cacheContext: screenplay,
    }
  }

  if (job.endpoint === "generate-next") {
    return {
      systemPrompt:
        "You are an expert Tamil cinema screenplay writer. Continue the existing screenplay with 3-5 new scenes and return only the continuation.",
      userPrompt: `Existing screenplay:\n${screenplay}\n\nContinue from the latest scene without repeating earlier material.`,
      inputSize: screenplay.length,
      cacheContext: screenplay,
    }
  }

  return {
    systemPrompt:
      "You are an expert Tamil cinema co-writer. Rewrite the screenplay with stronger structure, cleaner dialogue, and professional screenplay formatting.",
    userPrompt: `Rewrite this screenplay and return only the rewritten screenplay.\n\n${screenplay}`,
    inputSize: screenplay.length,
    cacheContext: screenplay,
  }
}

async function claimJob(admin: ReturnType<typeof createAdminClient>, jobId?: string) {
  const { data, error } = await (admin as any).rpc("claim_ai_batch_job", {
    p_job_id: jobId ?? null,
  })
  if (error) throw new Error(error.message)
  return data as { status: "claimed" | "none"; job?: AiBatchJob }
}

async function completeJob(admin: ReturnType<typeof createAdminClient>, jobId: string, result: Json) {
  const { error } = await (admin as any).rpc("complete_ai_batch_job", {
    p_job_id: jobId,
    p_result: result,
  })
  if (error) throw new Error(error.message)
}

async function failJob(admin: ReturnType<typeof createAdminClient>, jobId: string, errorMessage: string) {
  const { error } = await (admin as any).rpc("fail_ai_batch_job", {
    p_job_id: jobId,
    p_error: errorMessage,
  })
  if (error) console.error("[ai-batch] failed to mark job failed:", error.message)
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const verified = await verifyJobRequest(req, rawBody)
  if (!verified) {
    return NextResponse.json({ error: "Invalid AI batch job signature" }, { status: 401 })
  }

  let rawPayload: unknown = {}
  if (rawBody.trim()) {
    try {
      rawPayload = JSON.parse(rawBody)
    } catch {
      return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 })
    }
  }

  const parsed = jobRequestSchema.safeParse(rawPayload)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid job payload" }, { status: 400 })
  }

  const admin = createAdminClient()
  const claimed = await claimJob(admin, parsed.data.jobId)
  if (claimed.status === "none" || !claimed.job) {
    return NextResponse.json({ ok: true, skipped: "no_claimable_job" })
  }

  const job = claimed.job
  try {
    const plan = await getEffectivePlanForApiUser(admin, job.user_id)
    const prompts = buildBatchPrompts(job)
    const policy = resolveAiTaskPolicy({
      endpoint: job.endpoint,
      plan,
      inputSize: prompts.inputSize,
      requestedMode: "batch",
    })

    if (!policy.batchEligible) {
      throw new Error("AI batch job endpoint is not batch eligible")
    }

    const result = await generateTextWithService({
      userId: job.user_id,
      orgId: job.org_id,
      projectId: job.project_id,
      plan,
      endpoint: job.endpoint,
      taskKind: classifyAiTaskKind(job.endpoint),
      requestedMode: "batch",
      complexity: policy.complexity,
      candidateModels: policy.candidateModels,
      cacheStrategy: policy.cacheStrategy,
      cacheContext: prompts.cacheContext,
      systemPrompt: prompts.systemPrompt,
      userPrompt: prompts.userPrompt,
      fallbackContext: prompts.cacheContext,
      contextQuery: prompts.userPrompt,
      maxTokens: policy.maxTokens,
      temperature: 0.45,
      topP: 0.9,
      signal: req.signal,
      metadata: {
        batchJobId: job.id,
        batch: true,
        routingPolicy: policy.reason,
      },
    })

    await completeJob(admin, job.id, {
      requestId: result.requestId,
      provider: result.ref.provider,
      model: result.ref.model,
      complexity: result.effectiveComplexity,
      text: result.text,
      usage: result.usage,
    } as Json)

    void logBusinessEvent(req, {
      eventType: "ai_batch.completed",
      userId: job.user_id,
      outcome: "success",
      plan,
      metadata: { jobId: job.id, endpoint: job.endpoint, requestId: result.requestId },
    }).catch(() => {})

    return NextResponse.json({ ok: true, jobId: job.id, requestId: result.requestId })
  } catch (e) {
    const message = e instanceof Error ? e.message : "AI batch job failed"
    await failJob(admin, job.id, message)
    void logBusinessEvent(req, {
      eventType: "ai_batch.failed",
      userId: job.user_id,
      outcome: "failure",
      metadata: { jobId: job.id, endpoint: job.endpoint, error: message.slice(0, 500) },
    }).catch(() => {})
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

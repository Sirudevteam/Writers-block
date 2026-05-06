import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/infrastructure/db/supabase/server"
import { createAdminClient } from "@/infrastructure/db/supabase/admin"
import { aiFeedbackLimitOr429, apiIpLimitOr429 } from "@/core/security/api-ip-limit"
import { logBusinessEvent } from "@/modules/master-admin/application/events"

export const dynamic = "force-dynamic"

const feedbackSchema = z
  .object({
    requestId: z.string().uuid(),
    rating: z.union([z.literal("up"), z.literal("down"), z.literal(1), z.literal(-1)]),
    reason: z.string().trim().max(500).optional().nullable(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict()

function ratingValue(input: z.infer<typeof feedbackSchema>["rating"]): -1 | 1 {
  return input === "down" || input === -1 ? -1 : 1
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

  const feedbackLimit = await aiFeedbackLimitOr429(req, user.id)
  if (feedbackLimit) return feedbackLimit

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const parsed = feedbackSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid feedback payload" }, { status: 400 })
  }

  const body = parsed.data
  const admin = createAdminClient()
  const { data: usageLog, error: usageError } = await admin
    .from("usage_logs")
    .select("id, endpoint, provider, model, complexity")
    .eq("user_id", user.id)
    .eq("metadata->>requestId", body.requestId)
    .maybeSingle()

  if (usageError) {
    return NextResponse.json({ error: "Unable to verify AI request" }, { status: 500 })
  }
  if (!usageLog) {
    return NextResponse.json({ error: "AI request not found for this user" }, { status: 404 })
  }

  const { error } = await (admin as any).from("ai_generation_feedback").upsert(
    {
      user_id: user.id,
      usage_log_id: usageLog.id,
      request_id: body.requestId,
      endpoint: usageLog.endpoint,
      provider: usageLog.provider,
      model: usageLog.model,
      complexity: usageLog.complexity,
      rating: ratingValue(body.rating),
      reason: body.reason ?? null,
      metadata: body.metadata ?? {},
    },
    { onConflict: "user_id,request_id" }
  )

  if (error) {
    return NextResponse.json({ error: "Failed to save feedback" }, { status: 500 })
  }

  void logBusinessEvent(req, {
    eventType: "ai.feedback",
    userId: user.id,
    outcome: "success",
    metadata: {
      requestId: body.requestId,
      endpoint: usageLog.endpoint,
      rating: ratingValue(body.rating),
    },
  }).catch(() => {})

  return NextResponse.json({ ok: true })
}

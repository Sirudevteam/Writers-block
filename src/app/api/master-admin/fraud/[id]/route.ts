import { NextResponse, type NextRequest } from "next/server"
import { createClient as createAdminClient } from "@supabase/supabase-js"
import { z } from "zod"
import type { Database } from "@/infrastructure/db/types/database"
import { createClient } from "@/infrastructure/db/supabase/server"
import { guardMasterAdminApi } from "@/modules/master-admin/security/api-guard"
import { MASTER_ADMIN_JSON_HEADERS } from "@/modules/master-admin/application/http"
import { updateSignupRiskReview } from "@/modules/master-admin/infrastructure/admin-queries"
import { logIamAudit } from "@/modules/iam/application/audit"
import { logSecurityEvent } from "@/modules/master-admin/application/events"

export const dynamic = "force-dynamic"

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const bodySchema = z.object({
  reviewStatus: z.enum(["not_required", "open", "reviewed_safe", "confirmed_abuse"]),
  reviewNote: z.string().max(1000).optional().nullable(),
})

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const gate = await guardMasterAdminApi(req)
  if (!gate.ok) return gate.response

  if (!UUID_RE.test(id)) {
    return NextResponse.json(
      { error: "Invalid event id" },
      { status: 400, headers: MASTER_ADMIN_JSON_HEADERS }
    )
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: "Server misconfigured" },
      { status: 500, headers: MASTER_ADMIN_JSON_HEADERS }
    )
  }

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json(
      { error: "Invalid request" },
      { status: 400, headers: MASTER_ADMIN_JSON_HEADERS }
    )
  }

  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input" },
      { status: 400, headers: MASTER_ADMIN_JSON_HEADERS }
    )
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user?.id) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: MASTER_ADMIN_JSON_HEADERS }
    )
  }

  const adminSupabase = createAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  try {
    const row = await updateSignupRiskReview(
      adminSupabase,
      id,
      user.id,
      parsed.data.reviewStatus,
      parsed.data.reviewNote?.trim() || null
    )
    if (!row) {
      return NextResponse.json(
        { error: "Risk event not found" },
        { status: 404, headers: MASTER_ADMIN_JSON_HEADERS }
      )
    }

    void logIamAudit(req, {
      actorUserId: user.id,
      orgId: null,
      action: "platform.fraud_review.update",
      targetType: "signup_risk_event",
      targetId: id,
      metadata: { reviewStatus: parsed.data.reviewStatus },
    }).catch(() => {})
    void logSecurityEvent(req, {
      eventType: "fraud.review_updated",
      severity: parsed.data.reviewStatus === "confirmed_abuse" ? "high" : "medium",
      outcome: "success",
      actorUserId: user.id,
      targetUserId: row.user_id,
      metadata: { signupRiskEventId: id, reviewStatus: parsed.data.reviewStatus },
    }).catch(() => {})

    return NextResponse.json({ row }, { headers: MASTER_ADMIN_JSON_HEADERS })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to update review"
    return NextResponse.json(
      { error: message },
      { status: 500, headers: MASTER_ADMIN_JSON_HEADERS }
    )
  }
}

import { NextResponse, type NextRequest } from "next/server"
import { createClient as createAdminClient } from "@supabase/supabase-js"
import { z } from "zod"
import type { Database } from "@/infrastructure/db/types/database"
import { createClient } from "@/infrastructure/db/supabase/server"
import { guardMasterAdminApi } from "@/modules/master-admin/security/api-guard"
import { MASTER_ADMIN_JSON_HEADERS } from "@/modules/master-admin/application/http"
import { updateSecurityEventReview } from "@/modules/master-admin/infrastructure/admin-queries"
import { logIamAudit } from "@/modules/iam/application/audit"
import { logSecurityEvent } from "@/modules/master-admin/application/events"

export const dynamic = "force-dynamic"

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const bodySchema = z.object({
  reviewStatus: z.enum(["not_required", "open", "acknowledged", "resolved", "ignored"]),
  reviewNote: z.string().max(1000).optional().nullable(),
})

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await guardMasterAdminApi(req)
  if (!gate.ok) return gate.response

  const { id } = await params

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
    const row = await updateSecurityEventReview(
      adminSupabase,
      id,
      user.id,
      parsed.data.reviewStatus,
      parsed.data.reviewNote?.trim() || null
    )
    if (!row) {
      return NextResponse.json(
        { error: "Security event not found" },
        { status: 404, headers: MASTER_ADMIN_JSON_HEADERS }
      )
    }

    void logIamAudit(req, {
      actorUserId: user.id,
      orgId: null,
      action: "platform.security_event_review.update",
      targetType: "security_event",
      targetId: id,
      metadata: { reviewStatus: parsed.data.reviewStatus },
    }).catch(() => {})
    void logSecurityEvent(req, {
      eventType: "security.event_review_updated",
      severity: "medium",
      outcome: "success",
      actorUserId: user.id,
      targetUserId: row.target_user_id,
      metadata: { securityEventId: id, reviewStatus: parsed.data.reviewStatus },
    }).catch(() => {})

    return NextResponse.json({ row }, { headers: MASTER_ADMIN_JSON_HEADERS })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to update security event"
    return NextResponse.json({ error: message }, { status: 500, headers: MASTER_ADMIN_JSON_HEADERS })
  }
}

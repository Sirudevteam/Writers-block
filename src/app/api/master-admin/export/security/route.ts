import { NextResponse, type NextRequest } from "next/server"
import { createClient as createAdminClient } from "@supabase/supabase-js"
import type { Database, Json } from "@/infrastructure/db/types/database"
import { createClient } from "@/infrastructure/db/supabase/server"
import { guardMasterAdminApi } from "@/modules/master-admin/security/api-guard"
import { MASTER_ADMIN_CSV_HEADERS, MASTER_ADMIN_JSON_HEADERS } from "@/modules/master-admin/application/http"
import { formatCsv } from "@/modules/master-admin/application/csv"
import { MASTER_ADMIN_EXPORT_MAX_ROWS, resolveMasterAdminDateRange } from "@/modules/master-admin/domain/date-range"
import {
  fetchSecurityEventsExport,
  parseSecurityEventType,
  parseSecurityOutcome,
  parseSecurityReviewStatus,
  parseSecuritySeverity,
  parseUuid,
} from "@/modules/master-admin/infrastructure/admin-queries"
import { logIamAudit } from "@/modules/iam/application/audit"
import { logSecurityEvent } from "@/modules/master-admin/application/events"

export const dynamic = "force-dynamic"

function searchRecord(url: URL): Record<string, string | string[] | undefined> {
  const out: Record<string, string | string[] | undefined> = {}
  url.searchParams.forEach((value, key) => {
    out[key] = value
  })
  return out
}

function jsonCell(value: Json): string {
  if (value == null) return ""
  return JSON.stringify(value)
}

export async function GET(req: NextRequest) {
  const gate = await guardMasterAdminApi(req)
  if (!gate.ok) return gate.response

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: "Server misconfigured" },
      { status: 500, headers: MASTER_ADMIN_JSON_HEADERS }
    )
  }

  const url = new URL(req.url)
  const sp = searchRecord(url)
  const range = resolveMasterAdminDateRange(sp)
  const filters = {
    eventType: parseSecurityEventType(sp.event_type),
    severity: parseSecuritySeverity(sp.severity),
    outcome: parseSecurityOutcome(sp.outcome),
    reviewStatus: parseSecurityReviewStatus(sp.status ?? sp.review_status),
    actorUserId: parseUuid(sp.actor_user_id),
    targetUserId: parseUuid(sp.target_user_id),
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user?.id) {
    void logIamAudit(req, {
      actorUserId: user.id,
      orgId: null,
      action: "platform.export.security_events",
      targetType: "master-admin",
      targetId: "security",
      metadata: { preset: range.preset, from: range.fromIso, to: range.toIso, ...filters },
    }).catch(() => {})
    void logSecurityEvent(req, {
      eventType: "admin.export.security_events",
      severity: "medium",
      outcome: "success",
      actorUserId: user.id,
      metadata: { preset: range.preset, from: range.fromIso, to: range.toIso },
    }).catch(() => {})
  }

  const adminSupabase = createAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  try {
    const rows = await fetchSecurityEventsExport(adminSupabase, range.fromIso, range.toIso, filters)
    const body = formatCsv(
      [
        "id",
        "created_at",
        "event_type",
        "severity",
        "outcome",
        "review_status",
        "actor_user_id",
        "actor_email",
        "target_user_id",
        "target_email",
        "method",
        "route",
        "status_code",
        "ip_hash",
        "user_agent_hash",
        "country",
        "metadata",
        "reviewed_by",
        "reviewed_at",
        "review_note",
      ],
      rows.map((r) => [
        r.id,
        r.created_at,
        r.event_type,
        r.severity,
        r.outcome,
        r.review_status,
        r.actor_user_id,
        r.actor_email,
        r.target_user_id,
        r.target_email,
        r.method,
        r.route,
        r.status_code,
        r.ip_hash,
        r.user_agent_hash,
        r.country,
        jsonCell(r.metadata),
        r.reviewed_by,
        r.reviewed_at,
        r.review_note,
      ])
    )

    const day = new Date().toISOString().slice(0, 10)
    return new NextResponse(body, {
      status: 200,
      headers: {
        ...MASTER_ADMIN_CSV_HEADERS,
        "Content-Disposition": `attachment; filename="master-admin-security-${day}.csv"`,
        "X-Export-Row-Count": String(rows.length),
        "X-Export-Row-Cap": String(MASTER_ADMIN_EXPORT_MAX_ROWS),
      },
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Export failed"
    return NextResponse.json({ error: message }, { status: 500, headers: MASTER_ADMIN_JSON_HEADERS })
  }
}

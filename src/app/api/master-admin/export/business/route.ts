import { NextResponse, type NextRequest } from "next/server"
import { createClient as createAdminClient } from "@supabase/supabase-js"
import type { Database, Json } from "@/infrastructure/db/types/database"
import { createClient } from "@/infrastructure/db/supabase/server"
import { guardMasterAdminApi } from "@/modules/master-admin/security/api-guard"
import { MASTER_ADMIN_CSV_HEADERS, MASTER_ADMIN_JSON_HEADERS } from "@/modules/master-admin/application/http"
import { formatCsv } from "@/modules/master-admin/application/csv"
import { MASTER_ADMIN_EXPORT_MAX_ROWS, resolveMasterAdminDateRange } from "@/modules/master-admin/domain/date-range"
import { fetchBusinessEventsExport } from "@/modules/master-admin/infrastructure/admin-queries"
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

  const range = resolveMasterAdminDateRange(searchRecord(new URL(req.url)))

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user?.id) {
    void logIamAudit(req, {
      actorUserId: user.id,
      orgId: null,
      action: "platform.export.business_events",
      targetType: "master-admin",
      targetId: "business",
      metadata: { preset: range.preset, from: range.fromIso, to: range.toIso },
    }).catch(() => {})
    void logSecurityEvent(req, {
      eventType: "admin.export.business_events",
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
    const rows = await fetchBusinessEventsExport(adminSupabase, range.fromIso, range.toIso)
    const body = formatCsv(
      [
        "id",
        "created_at",
        "event_type",
        "user_id",
        "user_email",
        "outcome",
        "plan",
        "billing_cycle",
        "amount_paise",
        "route",
        "ip_hash",
        "user_agent_hash",
        "country",
        "metadata",
      ],
      rows.map((r) => [
        r.id,
        r.created_at,
        r.event_type,
        r.user_id,
        r.user_email,
        r.outcome,
        r.plan,
        r.billing_cycle,
        r.amount_paise,
        r.route,
        r.ip_hash,
        r.user_agent_hash,
        r.country,
        jsonCell(r.metadata),
      ])
    )

    const day = new Date().toISOString().slice(0, 10)
    return new NextResponse(body, {
      status: 200,
      headers: {
        ...MASTER_ADMIN_CSV_HEADERS,
        "Content-Disposition": `attachment; filename="master-admin-business-${day}.csv"`,
        "X-Export-Row-Count": String(rows.length),
        "X-Export-Row-Cap": String(MASTER_ADMIN_EXPORT_MAX_ROWS),
      },
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Export failed"
    return NextResponse.json({ error: message }, { status: 500, headers: MASTER_ADMIN_JSON_HEADERS })
  }
}

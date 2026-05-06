import { NextResponse, type NextRequest } from "next/server"
import { createClient as createAdminClient } from "@supabase/supabase-js"
import type { Database, Json } from "@/infrastructure/db/types/database"
import { createClient } from "@/infrastructure/db/supabase/server"
import { guardMasterAdminApi } from "@/modules/master-admin/security/api-guard"
import { MASTER_ADMIN_CSV_HEADERS, MASTER_ADMIN_JSON_HEADERS } from "@/modules/master-admin/application/http"
import { formatCsv } from "@/modules/master-admin/application/csv"
import { MASTER_ADMIN_EXPORT_MAX_ROWS, resolveMasterAdminDateRange } from "@/modules/master-admin/domain/date-range"
import {
  fetchSignupRiskExport,
  parseSignupRiskIpHash,
  parseSignupRiskLevel,
  parseSignupRiskReviewStatus,
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

function summarizeReasons(reasons: Json): string {
  if (!Array.isArray(reasons)) return ""
  return reasons
    .map((reason) => {
      if (reason && typeof reason === "object" && !Array.isArray(reason) && "message" in reason) {
        return String(reason.message ?? "")
      }
      return ""
    })
    .filter(Boolean)
    .join("; ")
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
    reviewStatus: parseSignupRiskReviewStatus(sp.status),
    riskLevel: parseSignupRiskLevel(sp.level),
    ipHash: parseSignupRiskIpHash(sp.ip_hash),
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user?.id) {
    void logIamAudit(req, {
      actorUserId: user.id,
      orgId: null,
      action: "platform.export.fraud",
      targetType: "master-admin",
      targetId: "fraud",
      metadata: { preset: range.preset, from: range.fromIso, to: range.toIso, ...filters },
    }).catch(() => {})
    void logSecurityEvent(req, {
      eventType: "admin.export.fraud",
      severity: "medium",
      outcome: "success",
      actorUserId: user.id,
      metadata: { preset: range.preset, from: range.fromIso, to: range.toIso, ...filters },
    }).catch(() => {})
  }

  const adminSupabase = createAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  try {
    const rows = await fetchSignupRiskExport(adminSupabase, range.fromIso, range.toIso, filters)
    const body = formatCsv(
      [
        "id",
        "user_id",
        "user_email",
        "email_domain",
        "ip_hash",
        "user_agent_hash",
        "country",
        "created_at",
        "verified_at",
        "risk_score",
        "risk_level",
        "review_status",
        "risk_reasons",
        "reviewed_by",
        "reviewed_at",
        "review_note",
      ],
      rows.map((r) => [
        r.id,
        r.user_id,
        r.user_email,
        r.email_domain,
        r.ip_hash,
        r.user_agent_hash,
        r.country,
        r.created_at,
        r.verified_at,
        r.risk_score,
        r.risk_level,
        r.review_status,
        summarizeReasons(r.risk_reasons),
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
        "Content-Disposition": `attachment; filename="master-admin-fraud-${day}.csv"`,
        "X-Export-Row-Count": String(rows.length),
        "X-Export-Row-Cap": String(MASTER_ADMIN_EXPORT_MAX_ROWS),
      },
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Export failed"
    return NextResponse.json({ error: message }, { status: 500, headers: MASTER_ADMIN_JSON_HEADERS })
  }
}

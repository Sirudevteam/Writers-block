import { NextResponse, type NextRequest } from "next/server"
import { createClient as createAdminClient } from "@supabase/supabase-js"
import type { Database } from "@/infrastructure/db/types/database"
import { guardMasterAdminApi } from "@/modules/master-admin/security/api-guard"
import { MASTER_ADMIN_JSON_HEADERS } from "@/modules/master-admin/application/http"
import {
  MASTER_ADMIN_PAGE_SIZE,
  parseMasterAdminPage,
  resolveMasterAdminDateRange,
} from "@/modules/master-admin/domain/date-range"
import {
  fetchSecurityEventSummary,
  fetchSecurityEventsInRange,
  parseSecurityEventType,
  parseSecurityOutcome,
  parseSecurityReviewStatus,
  parseSecuritySeverity,
  parseUuid,
} from "@/modules/master-admin/infrastructure/admin-queries"

export const dynamic = "force-dynamic"

function searchRecord(url: URL): Record<string, string | string[] | undefined> {
  const out: Record<string, string | string[] | undefined> = {}
  url.searchParams.forEach((value, key) => {
    out[key] = value
  })
  return out
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
  const page = parseMasterAdminPage(sp)
  const filters = {
    eventType: parseSecurityEventType(sp.event_type),
    severity: parseSecuritySeverity(sp.severity),
    outcome: parseSecurityOutcome(sp.outcome),
    reviewStatus: parseSecurityReviewStatus(sp.status ?? sp.review_status),
    actorUserId: parseUuid(sp.actor_user_id),
    targetUserId: parseUuid(sp.target_user_id),
  }

  const adminSupabase = createAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  try {
    const [{ rows, total }, summary] = await Promise.all([
      fetchSecurityEventsInRange(adminSupabase, range.fromIso, range.toIso, page, filters),
      fetchSecurityEventSummary(adminSupabase, range.fromIso, range.toIso),
    ])

    return NextResponse.json(
      { range, page, pageSize: MASTER_ADMIN_PAGE_SIZE, total, filters, summary, rows },
      { headers: MASTER_ADMIN_JSON_HEADERS }
    )
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load security events"
    return NextResponse.json({ error: message }, { status: 500, headers: MASTER_ADMIN_JSON_HEADERS })
  }
}

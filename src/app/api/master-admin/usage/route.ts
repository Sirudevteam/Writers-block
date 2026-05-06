import { NextResponse, type NextRequest } from "next/server"
import { createClient as createAdminClient } from "@supabase/supabase-js"
import type { Database } from "@/infrastructure/db/types/database"
import { guardMasterAdminApi } from "@/modules/master-admin/security/api-guard"
import { MASTER_ADMIN_JSON_HEADERS } from "@/modules/master-admin/application/http"
import { withMasterAdminCache } from "@/modules/master-admin/infrastructure/cache"
import { resolveMasterAdminDateRange } from "@/modules/master-admin/domain/date-range"
import { fetchTopUsersByUsage, fetchUsageDailyBuckets, fetchUsageEndpointBreakdown } from "@/modules/master-admin/infrastructure/admin-queries"

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

  const adminSupabase = createAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  try {
    const body = await withMasterAdminCache(["usage", url.searchParams.toString()], async () => {
      const [usage, endpoints, topUsers] = await Promise.all([
        fetchUsageDailyBuckets(adminSupabase, range.fromIso, range.toIso),
        fetchUsageEndpointBreakdown(adminSupabase, range.fromIso, range.toIso, 5000),
        fetchTopUsersByUsage(adminSupabase, range.fromIso, range.toIso, 15),
      ])
      return { range, ...usage, endpoints, topUsers }
    })
    return NextResponse.json(
      body,
      { headers: MASTER_ADMIN_JSON_HEADERS }
    )
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load usage"
    return NextResponse.json(
      { error: message },
      { status: 500, headers: MASTER_ADMIN_JSON_HEADERS }
    )
  }
}

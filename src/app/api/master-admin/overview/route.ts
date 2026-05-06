import { NextResponse, type NextRequest } from "next/server"
import { createClient as createAdminClient } from "@supabase/supabase-js"
import type { Database } from "@/infrastructure/db/types/database"
import { guardMasterAdminApi } from "@/modules/master-admin/security/api-guard"
import { MASTER_ADMIN_JSON_HEADERS } from "@/modules/master-admin/application/http"
import { withMasterAdminCache } from "@/modules/master-admin/infrastructure/cache"
import { computeAdminStats } from "@/modules/master-admin/application/admin-stats"
import {
  fetchBusinessFunnel,
  fetchMrrDailyBuckets,
  fetchPaymentOpsSummary,
  fetchSecurityEventSummary,
  fetchSignupDailyBuckets,
  fetchSignupRiskSummary,
  fetchTopUsersByUsage,
  fetchUpcomingRenewals,
  fetchUsageDailyBuckets,
  fetchUsageEndpointBreakdown,
} from "@/modules/master-admin/infrastructure/admin-queries"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const gate = await guardMasterAdminApi(req)
  if (!gate.ok) return gate.response

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: "Server misconfigured" },
      { status: 500, headers: MASTER_ADMIN_JSON_HEADERS }
    )
  }

  const adminSupabase = createAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  try {
    const body = await withMasterAdminCache(["overview"], async () => {
      const stats = await computeAdminStats(adminSupabase)
      const now = new Date()
      const toIso = now.toISOString()
      const from30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
      const fromPrev30d = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString()

      const [
        signup30d,
        signupPrev30d,
        usage30d,
        endpoints,
        mrr30d,
        renewals7d,
        topUsers,
        fraudSummary,
        securitySummary,
        businessFunnel,
        paymentOps,
      ] = await Promise.all([
        fetchSignupDailyBuckets(adminSupabase, from30d, toIso),
        fetchSignupDailyBuckets(adminSupabase, fromPrev30d, from30d),
        fetchUsageDailyBuckets(adminSupabase, from30d, toIso),
        fetchUsageEndpointBreakdown(adminSupabase, from30d, toIso, 5000),
        fetchMrrDailyBuckets(adminSupabase, from30d, toIso),
        fetchUpcomingRenewals(adminSupabase, toIso, 7),
        fetchTopUsersByUsage(adminSupabase, from30d, toIso, 10),
        fetchSignupRiskSummary(adminSupabase, from30d, toIso),
        fetchSecurityEventSummary(adminSupabase, from30d, toIso),
        fetchBusinessFunnel(adminSupabase, from30d, toIso),
        fetchPaymentOpsSummary(adminSupabase, from30d, toIso),
      ])

      return {
        stats,
        range: { from30d, toIso, fromPrev30d },
        signup30d,
        signupPrev30d,
        usage30d,
        endpoints,
        mrr30d,
        renewals7d,
        topUsers,
        fraudSummary,
        securitySummary,
        businessFunnel,
        paymentOps,
      }
    })
    return NextResponse.json(body, {
      headers: MASTER_ADMIN_JSON_HEADERS,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load stats"
    return NextResponse.json(
      { error: message },
      { status: 500, headers: MASTER_ADMIN_JSON_HEADERS }
    )
  }
}

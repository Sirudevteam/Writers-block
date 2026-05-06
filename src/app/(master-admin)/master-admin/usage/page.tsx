import type { Metadata } from "next"
import Link from "next/link"
import { createClient as createAdminClient } from "@supabase/supabase-js"
import type { Database } from "@/infrastructure/db/types/database"
import { requireMasterAdminSession } from "@/modules/master-admin/security/auth"
import { resolveMasterAdminDateRange } from "@/modules/master-admin/domain/date-range"
import { fetchTopUsersByUsage, fetchUsageDailyBuckets, fetchUsageEndpointBreakdown } from "@/modules/master-admin/infrastructure/admin-queries"
import { MasterAdminDatePresets } from "@/modules/master-admin/presentation/components/date-presets"

export const metadata: Metadata = {
  title: "Usage",
}

type Search = Record<string, string | string[] | undefined>

export default async function MasterAdminUsagePage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireMasterAdminSession()
  const resolvedSearchParams = await searchParams

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-red-300">
        Missing <code className="font-mono text-sm">SUPABASE_SERVICE_ROLE_KEY</code>.
      </div>
    )
  }

  const range = resolveMasterAdminDateRange(resolvedSearchParams)

  const adminSupabase = createAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  const { buckets, totalInRange, truncated } = await fetchUsageDailyBuckets(
    adminSupabase,
    range.fromIso,
    range.toIso
  )
  const [{ byEndpoint, truncated: endpointTruncated }, topUsers] = await Promise.all([
    fetchUsageEndpointBreakdown(adminSupabase, range.fromIso, range.toIso, 5000),
    fetchTopUsersByUsage(adminSupabase, range.fromIso, range.toIso, 15),
  ])

  const maxCount = Math.max(1, ...buckets.map((b) => b.count))

  return (
    <div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">AI usage</h1>
          <p className="mt-2 text-sm text-white/55">
            Based on <code className="font-mono text-xs text-white/70">usage_logs.created_at</code> between{" "}
            <span className="font-mono text-white/80">{new Date(range.fromIso).toLocaleString("en-IN")}</span> and{" "}
            <span className="font-mono text-white/80">{new Date(range.toIso).toLocaleString("en-IN")}</span>
          </p>
        </div>
        <div className="text-xs text-white/45">
          <Link className="text-white/70 hover:text-white" href="/master-admin/users?preset=30d">
            Users →
          </Link>
        </div>
      </div>

      <div className="mt-6">
        <MasterAdminDatePresets basePath="/master-admin/usage" range={range} />
      </div>

      <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-[#111] p-5">
          <div className="text-2xl font-bold">{totalInRange.toLocaleString()}</div>
          <div className="mt-1 text-xs text-white/45">Total events in range (exact count)</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-[#111] p-5 md:col-span-2">
          <div className="text-sm text-white/70">
            Daily buckets are computed from a capped sample of rows for charting performance.
          </div>
          {truncated ? (
            <p className="mt-2 text-xs text-amber-400/90">
              Sample cap reached — daily chart may undercount dense periods. Totals still use the exact count above.
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="overflow-x-auto rounded-2xl border border-white/10 bg-[#111]/80 p-6 backdrop-blur-sm lg:col-span-7">
          <h2 className="text-lg font-semibold">Daily buckets</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-white/45">
                  <th className="px-4 py-3 font-medium">Day (UTC)</th>
                  <th className="px-4 py-3 font-medium">Events (sample)</th>
                  <th className="px-4 py-3 font-medium w-[55%]">Share</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {buckets.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-8 text-center text-white/45">
                      No usage in this range.
                    </td>
                  </tr>
                ) : (
                  buckets.map((b) => (
                    <tr key={b.day} className="hover:bg-white/5">
                      <td className="px-4 py-3 font-mono text-xs text-white/80">{b.day}</td>
                      <td className="px-4 py-3 text-white/80">{b.count.toLocaleString()}</td>
                      <td className="px-4 py-3">
                        <div className="h-2 w-full max-w-md overflow-hidden rounded-full bg-white/10">
                          <div
                            className="h-2 rounded-full bg-cinematic-orange"
                            style={{ width: `${Math.round((b.count / maxCount) * 100)}%` }}
                          />
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#111]/80 p-6 backdrop-blur-sm lg:col-span-5">
          <h2 className="text-lg font-semibold">Endpoints (sample)</h2>
          <p className="mt-1 text-xs text-white/45">Bounded sample in range; good for directional debugging.</p>
          <div className="mt-4 max-h-72 space-y-2 overflow-y-auto text-sm">
            {Object.entries(byEndpoint)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 50)
              .map(([endpoint, count]) => (
                <div key={endpoint} className="flex justify-between gap-4">
                  <span className="truncate text-white/55">{endpoint}</span>
                  <span className="shrink-0 font-mono text-white/85">{count.toLocaleString()}</span>
                </div>
              ))}
          </div>
          <div className="mt-3 text-xs text-white/45">
            {endpointTruncated ? <span className="text-amber-300/90">Sample cap reached</span> : null}
          </div>
        </div>
      </div>

      <div className="mt-8 overflow-x-auto rounded-2xl border border-white/10 bg-[#111]/80 p-6 backdrop-blur-sm">
        <h2 className="text-lg font-semibold">Top users (usage)</h2>
        <p className="mt-1 text-xs text-white/45">Ranked from a bounded sample; use for abuse/success triage.</p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-white/45">
                <th className="py-2 pr-4 font-medium">User</th>
                <th className="py-2 pr-4 font-medium">Email</th>
                <th className="py-2 pr-4 font-medium">Name</th>
                <th className="py-2 font-medium">Count</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {topUsers.rows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-white/45">
                    No usage in this range.
                  </td>
                </tr>
              ) : (
                topUsers.rows.map((u) => (
                  <tr key={u.user_id} className="hover:bg-white/5">
                    <td className="py-2 pr-4 font-mono text-xs text-white/70">{u.user_id}</td>
                    <td className="py-2 pr-4 text-white/70">{u.email ?? "—"}</td>
                    <td className="py-2 pr-4 text-white/70">{u.full_name ?? "—"}</td>
                    <td className="py-2 font-mono text-white/85">{u.count.toLocaleString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-3 text-xs text-white/45">
          {topUsers.truncated ? <span className="text-amber-300/90">Sample cap reached</span> : null}
        </div>
      </div>
    </div>
  )
}

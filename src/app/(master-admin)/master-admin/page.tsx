import type { Metadata } from "next"
import { createClient as createAdminClient } from "@supabase/supabase-js"
import type { Database } from "@/infrastructure/db/types/database"
import { requireMasterAdminSession } from "@/modules/master-admin/security/auth"
import { computeAdminStats, type AdminStats } from "@/modules/master-admin/application/admin-stats"
import Link from "next/link"
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
} from "@/modules/master-admin/infrastructure/admin-queries"
import { StatTile, MiniBars } from "@/modules/master-admin/presentation/components/stat-tile"

export const metadata: Metadata = {
  title: "Overview",
}

export default async function MasterAdminOverviewPage() {
  await requireMasterAdminSession()

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-red-300">
        Missing <code className="font-mono text-sm">SUPABASE_SERVICE_ROLE_KEY</code>. Master Admin requires the
        service role on the server.
      </div>
    )
  }

  const adminSupabase = createAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  let stats: AdminStats
  try {
    stats = await computeAdminStats(adminSupabase)
  } catch {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-red-300">
        Failed to load platform stats. Check database access and server logs.
      </div>
    )
  }

  const { overview, plans, usage, recentPayments } = stats
  const activeTotal = Object.values(plans).reduce((a, b) => a + b, 0)

  const now = new Date()
  const toIso = now.toISOString()
  const from30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const fromPrev30d = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString()

  const [
    signup30d,
    signupPrev30d,
    usage30d,
    mrr30d,
    renewals7d,
    payments,
    topUsers,
    fraudSummary,
    securitySummary,
    businessFunnel,
    paymentOps,
  ] = await Promise.all([
    fetchSignupDailyBuckets(adminSupabase, from30d, toIso),
    fetchSignupDailyBuckets(adminSupabase, fromPrev30d, from30d),
    fetchUsageDailyBuckets(adminSupabase, from30d, toIso),
    fetchMrrDailyBuckets(adminSupabase, from30d, toIso),
    fetchUpcomingRenewals(adminSupabase, toIso, 7),
    Promise.resolve(recentPayments),
    fetchTopUsersByUsage(adminSupabase, from30d, toIso, 10),
    fetchSignupRiskSummary(adminSupabase, from30d, toIso),
    fetchSecurityEventSummary(adminSupabase, from30d, toIso),
    fetchBusinessFunnel(adminSupabase, from30d, toIso),
    fetchPaymentOpsSummary(adminSupabase, from30d, toIso),
  ])

  const signupDelta = (signup30d.totalInRange ?? 0) - (signupPrev30d.totalInRange ?? 0)
  const signupDeltaPct =
    (signupPrev30d.totalInRange ?? 0) > 0
      ? Math.round((signupDelta / (signupPrev30d.totalInRange ?? 1)) * 100)
      : null

  const lastSignupBars = signup30d.buckets.slice(-14)
  const lastUsageBars = usage30d.buckets.slice(-14)
  const mrrBars = mrr30d.buckets.slice(-14).map((b) => ({ day: b.day, count: b.mrrInr }))
  const businessSignupUsers = businessFunnel.steps[0]?.users ?? 0
  const businessPaymentSuccessUsers =
    businessFunnel.steps.find((step) => step.eventType === "payment.webhook_applied")?.users ?? 0

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Platform overview</h1>
          <p className="mt-2 text-sm text-white/55">
            30-day operating picture + global totals. Use tabs for drill-down.
          </p>
        </div>
        <div className="text-xs text-white/45">
          Range: <span className="font-mono text-white/70">{new Date(from30d).toLocaleDateString("en-IN")}</span> →{" "}
          <span className="font-mono text-white/70">{new Date(toIso).toLocaleDateString("en-IN")}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatTile label="Total users" value={overview.totalUsers.toLocaleString()} />
        <StatTile label="Total projects" value={overview.totalProjects.toLocaleString()} />
        <StatTile label="Active paid subscribers" value={overview.activeSubscribers.toLocaleString()} />
        <StatTile label="Est. MRR (env pricing)" value={`₹${overview.mrr.toLocaleString("en-IN")}`} accent />
        <Link href="/master-admin/fraud?preset=30d&status=open&level=high">
          <StatTile
            label="Open high-risk signups"
            value={fraudSummary.openHigh.toLocaleString()}
            helper={`${fraudSummary.open.toLocaleString()} open total`}
            accent
          />
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <section className="rounded-2xl border border-white/10 bg-[#111]/80 p-6 backdrop-blur-sm lg:col-span-7">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Signup trend</h2>
              <p className="mt-1 text-xs text-white/45">Daily buckets (sample-capped). Totals are exact.</p>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold">{signup30d.totalInRange.toLocaleString()}</div>
              <div className="text-xs text-white/45">
                vs prev 30d{" "}
                <span className={signupDelta >= 0 ? "text-emerald-300" : "text-red-300"}>
                  {signupDelta >= 0 ? "+" : ""}
                  {signupDelta.toLocaleString()}
                  {signupDeltaPct !== null ? ` (${signupDeltaPct >= 0 ? "+" : ""}${signupDeltaPct}%)` : ""}
                </span>
              </div>
            </div>
          </div>
          <div className="mt-4">
            <MiniBars buckets={lastSignupBars} accent="blue" height={56} />
            <div className="mt-2 flex justify-between text-[11px] text-white/35">
              <span>{lastSignupBars[0]?.day ?? ""}</span>
              <span>{lastSignupBars.at(-1)?.day ?? ""}</span>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3 text-xs">
            <Link className="text-cinematic-blue hover:text-cinematic-blue/85" href="/master-admin/users?preset=30d">
              View users →
            </Link>
            {signup30d.truncated ? <span className="text-amber-300/90">Sample cap reached</span> : null}
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-[#111]/80 p-6 backdrop-blur-sm lg:col-span-5">
          <h2 className="text-lg font-semibold">MRR trend (estimated)</h2>
          <p className="mt-1 text-xs text-white/45">Derived from subscription updates in range (sample-capped).</p>
          <div className="mt-4">
            <MiniBars buckets={mrrBars} accent="orange" height={56} />
            <div className="mt-2 flex justify-between text-[11px] text-white/35">
              <span>{mrrBars[0]?.day ?? ""}</span>
              <span>{mrrBars.at(-1)?.day ?? ""}</span>
            </div>
          </div>
          <div className="mt-4 space-y-2 text-sm">
            {Object.entries(plans).map(([plan, count]) => (
              <div key={plan} className="flex items-center justify-between">
                <span className="capitalize text-white/70">{plan}</span>
                <div className="flex items-center gap-3">
                  <div
                    className="h-2 rounded bg-cinematic-orange"
                    style={{ width: `${Math.max(4, (count / Math.max(1, activeTotal)) * 120)}px` }}
                  />
                  <span className="w-8 text-right font-mono text-white/90">{count}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 text-xs text-white/45">
            {mrr30d.truncated ? <span className="text-amber-300/90">Sample cap reached</span> : null}
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-[#111]/80 p-6 backdrop-blur-sm lg:col-span-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">AI usage</h2>
              <p className="mt-1 text-xs text-white/45">Daily buckets (sample-capped) + endpoint breakdown (recent sample).</p>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold">{usage30d.totalInRange.toLocaleString()}</div>
              <div className="text-xs text-white/45">events in last 30d (exact)</div>
            </div>
          </div>
          <div className="mt-4">
            <MiniBars buckets={lastUsageBars} accent="orange" height={56} />
            <div className="mt-2 flex justify-between text-[11px] text-white/35">
              <span>{lastUsageBars[0]?.day ?? ""}</span>
              <span>{lastUsageBars.at(-1)?.day ?? ""}</span>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
              <div className="text-xs text-white/45">All-time generations</div>
              <div className="mt-1 text-xl font-bold">{usage.total.toLocaleString()}</div>
              <div className="mt-3 text-xs text-white/45">Last 24h</div>
              <div className="mt-1 text-xl font-bold">{usage.last24h.toLocaleString()}</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
              <div className="flex items-baseline justify-between">
                <div className="text-xs text-white/45">Endpoints (recent sample)</div>
                <div className="text-[11px] text-white/35">{usage.breakdownSampleSize} rows</div>
              </div>
              <div className="mt-3 max-h-36 space-y-2 overflow-y-auto text-sm">
                {Object.entries(usage.byEndpoint).map(([endpoint, count]) => (
                  <div key={endpoint} className="flex justify-between gap-4">
                    <span className="truncate text-white/55">{endpoint}</span>
                    <span className="shrink-0 font-mono text-white/85">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3 text-xs">
            <Link className="text-cinematic-orange hover:text-cinematic-orange/85" href="/master-admin/usage?preset=30d">
              View usage →
            </Link>
            {usage30d.truncated ? <span className="text-amber-300/90">Sample cap reached</span> : null}
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-[#111]/80 p-6 backdrop-blur-sm lg:col-span-5">
          <h2 className="text-lg font-semibold">Renewals (next 7 days)</h2>
          <p className="mt-1 text-xs text-white/45">Based on subscriptions.current_period_end.</p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-white/45">
                  <th className="py-2 pr-4 font-medium">User</th>
                  <th className="py-2 pr-4 font-medium">Plan</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 font-medium">Ends</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {renewals7d.rows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-white/45">
                      No renewals in the next 7 days.
                    </td>
                  </tr>
                ) : (
                  renewals7d.rows.map((r) => (
                    <tr key={`${r.user_id}-${r.current_period_end ?? ""}`} className="hover:bg-white/5">
                      <td className="py-2 pr-4 font-mono text-xs text-white/75">{r.user_id}</td>
                      <td className="py-2 pr-4 capitalize text-white/80">{r.plan}</td>
                      <td className="py-2 pr-4 capitalize text-white/55">{r.status}</td>
                      <td className="py-2 text-white/45">
                        {r.current_period_end ? new Date(r.current_period_end).toLocaleDateString("en-IN") : "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="mt-4 text-xs text-white/45">
            <Link className="text-white/70 hover:text-white" href="/master-admin/subscriptions?preset=30d">
              View subscriptions →
            </Link>
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <section className="rounded-2xl border border-white/10 bg-[#111]/80 p-6 backdrop-blur-sm lg:col-span-7">
          <h2 className="text-lg font-semibold">Recent payments</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-white/45">
                  <th className="py-2 pr-4 font-medium">Plan</th>
                  <th className="py-2 pr-4 font-medium">Cycle</th>
                  <th className="py-2 pr-4 font-medium">Payment ID</th>
                  <th className="py-2 font-medium">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {payments.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-white/45">
                      No payments yet.
                    </td>
                  </tr>
                ) : (
                  payments.map((p) => (
                    <tr key={p.razorpay_payment_id} className="hover:bg-white/5">
                      <td className="py-2 pr-4 capitalize">{p.plan}</td>
                      <td className="py-2 pr-4 capitalize text-white/70">{p.billing_cycle}</td>
                      <td className="py-2 pr-4 font-mono text-xs text-white/55">{p.razorpay_payment_id}</td>
                      <td className="py-2 text-white/45">{new Date(p.updated_at).toLocaleString("en-IN")}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="mt-4 text-xs text-white/45">
            Payment failures are not stored yet (webhook only records successful captures).
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-[#111]/80 p-6 backdrop-blur-sm lg:col-span-5">
          <h2 className="text-lg font-semibold">Top users (usage)</h2>
          <p className="mt-1 text-xs text-white/45">Ranked from a bounded sample in range. Use for abuse/success triage.</p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-white/45">
                  <th className="py-2 pr-4 font-medium">User</th>
                  <th className="py-2 pr-4 font-medium">Email</th>
                  <th className="py-2 font-medium">Count</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {topUsers.rows.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="py-6 text-center text-white/45">
                      No usage in range.
                    </td>
                  </tr>
                ) : (
                  topUsers.rows.map((u) => (
                    <tr key={u.user_id} className="hover:bg-white/5">
                      <td className="py-2 pr-4 font-mono text-xs text-white/75">{u.user_id}</td>
                      <td className="py-2 pr-4 text-white/70">{u.email ?? "—"}</td>
                      <td className="py-2 font-mono text-white/85">{u.count.toLocaleString()}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="mt-4 text-xs text-white/45">
            {topUsers.truncated ? <span className="text-amber-300/90">Sample cap reached</span> : null}
          </div>
        </section>
      </div>

      <section className="rounded-2xl border border-white/10 bg-[#111]/80 p-6 backdrop-blur-sm">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
          <h2 className="text-lg font-semibold">Security and payment ops</h2>
          <span className="text-xs text-white/45">From Master Admin security/business telemetry</span>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <div className="text-xs text-white/55">Open security reviews</div>
            <div className="mt-1 text-xl font-bold text-cinematic-orange">{securitySummary.open.toLocaleString()}</div>
            <div className="mt-2 text-xs text-white/40">
              {securitySummary.highOrCritical.toLocaleString()} high or critical events in range
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <div className="text-xs text-white/55">Payment ops alerts</div>
            <div className="mt-1 text-xl font-bold text-red-300">
              {(paymentOps.verifyFailures + paymentOps.webhookFailures + paymentOps.delayedWebhookOrders).toLocaleString()}
            </div>
            <div className="mt-2 text-xs text-white/45">
              {paymentOps.verifyFailures.toLocaleString()} verify failures, {paymentOps.webhookFailures.toLocaleString()} webhook failures
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <div className="text-xs text-white/55">Business funnel</div>
            <div className="mt-1 text-xl font-bold text-emerald-300">
              {businessPaymentSuccessUsers.toLocaleString()} paid users
            </div>
            <div className="mt-2 text-xs text-white/45">
              From {businessSignupUsers.toLocaleString()} signup-created users in range
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

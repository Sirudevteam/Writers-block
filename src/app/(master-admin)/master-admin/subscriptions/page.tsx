import type { Metadata } from "next"
import Link from "next/link"
import { createClient as createAdminClient } from "@supabase/supabase-js"
import type { Database } from "@/infrastructure/db/types/database"
import { requireMasterAdminSession } from "@/modules/master-admin/security/auth"
import {
  MASTER_ADMIN_PAGE_SIZE,
  masterAdminRangeQuery,
  parseMasterAdminPage,
  resolveMasterAdminDateRange,
} from "@/modules/master-admin/domain/date-range"
import { fetchSubscriptionsInRange, fetchUpcomingRenewals } from "@/modules/master-admin/infrastructure/admin-queries"
import { MasterAdminDatePresets } from "@/modules/master-admin/presentation/components/date-presets"

export const metadata: Metadata = {
  title: "Subscriptions",
}

type Search = Record<string, string | string[] | undefined>

export default async function MasterAdminSubscriptionsPage({ searchParams }: { searchParams: Promise<Search> }) {
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
  const page = parseMasterAdminPage(resolvedSearchParams)
  const status = typeof resolvedSearchParams.status === "string" ? resolvedSearchParams.status : undefined
  const plan = typeof resolvedSearchParams.plan === "string" ? resolvedSearchParams.plan : undefined
  const cycle = typeof resolvedSearchParams.cycle === "string" ? resolvedSearchParams.cycle : undefined
  const userId = typeof resolvedSearchParams.user_id === "string" ? resolvedSearchParams.user_id : undefined

  const adminSupabase = createAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  const filters =
    status && ["active", "cancelled", "expired"].includes(status)
      ? {
          status,
          ...(plan && ["free", "pro", "premium"].includes(plan) ? { plan } : {}),
          ...(cycle && ["monthly", "annual"].includes(cycle) ? { billing_cycle: cycle } : {}),
          ...(userId ? { user_id: userId } : {}),
        }
      : plan && ["free", "pro", "premium"].includes(plan)
        ? {
            plan,
            ...(cycle && ["monthly", "annual"].includes(cycle) ? { billing_cycle: cycle } : {}),
            ...(userId ? { user_id: userId } : {}),
          }
        : cycle && ["monthly", "annual"].includes(cycle)
          ? { billing_cycle: cycle, ...(userId ? { user_id: userId } : {}) }
          : userId
            ? { user_id: userId }
        : undefined

  const { rows, total } = await fetchSubscriptionsInRange(
    adminSupabase,
    range.fromIso,
    range.toIso,
    page,
    filters
  )
  const totalPages = Math.max(1, Math.ceil(total / MASTER_ADMIN_PAGE_SIZE))

  const filterExtra: Record<string, string> = {}
  if (status) filterExtra.status = status
  if (plan) filterExtra.plan = plan
  if (cycle) filterExtra.cycle = cycle
  if (userId) filterExtra.user_id = userId

  const planOnlyExtra: Record<string, string> = {}
  if (plan) planOnlyExtra.plan = plan
  if (cycle) planOnlyExtra.cycle = cycle
  if (userId) planOnlyExtra.user_id = userId

  const statusOnlyExtra: Record<string, string> = {}
  if (status) statusOnlyExtra.status = status
  if (cycle) statusOnlyExtra.cycle = cycle
  if (userId) statusOnlyExtra.user_id = userId

  const cycleOnlyExtra: Record<string, string> = {}
  if (plan) cycleOnlyExtra.plan = plan
  if (status) cycleOnlyExtra.status = status
  if (userId) cycleOnlyExtra.user_id = userId

  const renewals = await fetchUpcomingRenewals(adminSupabase, new Date().toISOString(), 14)

  return (
    <div>
      <h1 className="text-3xl font-bold tracking-tight">Subscriptions</h1>
      <p className="mt-2 text-sm text-white/55">
        Rows with <code className="font-mono text-xs text-white/70">updated_at</code> between{" "}
        <span className="font-mono text-white/80">{new Date(range.fromIso).toLocaleString("en-IN")}</span> and{" "}
        <span className="font-mono text-white/80">{new Date(range.toIso).toLocaleString("en-IN")}</span>
      </p>

      <div className="mt-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <MasterAdminDatePresets basePath="/master-admin/subscriptions" range={range} extra={filterExtra} />
        <div className="flex flex-wrap gap-2 text-sm">
          <FilterChip
            label="All statuses"
            href={`/master-admin/subscriptions?${masterAdminRangeQuery(range, { ...planOnlyExtra, page: "1" })}`}
            active={!status}
          />
          {(["active", "cancelled", "expired"] as const).map((s) => (
            <FilterChip
              key={s}
              label={s}
              href={`/master-admin/subscriptions?${masterAdminRangeQuery(range, {
                ...planOnlyExtra,
                page: "1",
                status: s,
              })}`}
              active={status === s}
            />
          ))}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-xs uppercase tracking-wide text-white/40">Cycle</span>
        <FilterChip
          label="All cycles"
          href={`/master-admin/subscriptions?${masterAdminRangeQuery(range, { ...cycleOnlyExtra, page: "1" })}`}
          active={!cycle}
        />
        {(["monthly", "annual"] as const).map((c) => (
          <FilterChip
            key={c}
            label={c}
            href={`/master-admin/subscriptions?${masterAdminRangeQuery(range, { ...cycleOnlyExtra, page: "1", cycle: c })}`}
            active={cycle === c}
          />
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-sm">
        <span className="text-xs uppercase tracking-wide text-white/40">Plan</span>
        {(["free", "pro", "premium"] as const).map((p) => (
          <FilterChip
            key={p}
            label={p}
            href={`/master-admin/subscriptions?${masterAdminRangeQuery(range, {
              ...statusOnlyExtra,
              page: "1",
              plan: p,
            })}`}
            active={plan === p}
          />
        ))}
        <Link
          href={`/master-admin/subscriptions?preset=${range.preset}&page=1`}
          className="ml-2 text-xs text-cinematic-orange hover:text-cinematic-orange/85"
        >
          Clear filters
        </Link>
      </div>

      <div className="mt-6 overflow-x-auto rounded-2xl border border-white/10 bg-[#111]/80 p-6 backdrop-blur-sm">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
          <h2 className="text-lg font-semibold">Upcoming renewals (next 14 days)</h2>
          <span className="text-xs text-white/45">From subscriptions.current_period_end</span>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-white/45">
                <th className="py-2 pr-4 font-medium">User</th>
                <th className="py-2 pr-4 font-medium">Plan</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 pr-4 font-medium">Cycle</th>
                <th className="py-2 font-medium">Ends</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {renewals.rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-white/45">
                    No renewals in the next 14 days.
                  </td>
                </tr>
              ) : (
                renewals.rows.map((r) => (
                  <tr key={`${r.user_id}-${r.current_period_end ?? ""}`} className="hover:bg-white/5">
                    <td className="py-2 pr-4 font-mono text-xs text-white/70">{r.user_id}</td>
                    <td className="py-2 pr-4 capitalize text-white/80">{r.plan}</td>
                    <td className="py-2 pr-4 capitalize text-white/55">{r.status}</td>
                    <td className="py-2 pr-4 capitalize text-white/55">{r.billing_cycle}</td>
                    <td className="py-2 text-white/45">
                      {r.current_period_end ? new Date(r.current_period_end).toLocaleString("en-IN") : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-8 overflow-x-auto rounded-xl border border-white/10 bg-[#111]">
        <table className="w-full min-w-[800px] text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 text-white/45">
              <th className="px-4 py-3 font-medium">User</th>
              <th className="px-4 py-3 font-medium">Plan</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Cycle</th>
              <th className="px-4 py-3 font-medium">Updated</th>
              <th className="px-4 py-3 font-medium">Payment</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-white/45">
                  No subscriptions in this range.
                </td>
              </tr>
            ) : (
              rows.map((s) => (
                <tr key={s.id} className="hover:bg-white/5">
                  <td className="px-4 py-3 font-mono text-xs text-white/70">{s.user_id}</td>
                  <td className="px-4 py-3 capitalize text-white/80">{s.plan}</td>
                  <td className="px-4 py-3 capitalize text-white/55">{s.status}</td>
                  <td className="px-4 py-3 capitalize text-white/55">{s.billing_cycle}</td>
                  <td className="px-4 py-3 text-white/45">{new Date(s.updated_at).toLocaleString("en-IN")}</td>
                  <td className="px-4 py-3 font-mono text-xs text-white/45">{s.razorpay_payment_id ?? "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-4 text-sm text-white/55">
        <span>
          Page {page} of {totalPages} · {total.toLocaleString()} total
        </span>
        <div className="flex gap-3">
          {page > 1 ? (
            <Link
              href={`/master-admin/subscriptions?${masterAdminRangeQuery(range, { ...filterExtra, page: String(page - 1) })}`}
              className="rounded-lg border border-white/15 px-3 py-1.5 text-white/80 hover:border-cinematic-orange/40 hover:text-cinematic-orange"
            >
              Previous
            </Link>
          ) : null}
          {page < totalPages ? (
            <Link
              href={`/master-admin/subscriptions?${masterAdminRangeQuery(range, { ...filterExtra, page: String(page + 1) })}`}
              className="rounded-lg border border-white/15 px-3 py-1.5 text-white/80 hover:border-cinematic-orange/40 hover:text-cinematic-orange"
            >
              Next
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function FilterChip({
  label,
  href,
  active,
}: {
  label: string
  href: string
  active: boolean
}) {
  return (
    <Link
      href={href}
      className={`rounded-lg border px-3 py-1.5 capitalize transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cinematic-orange/50 ${
        active
          ? "border-cinematic-orange/60 bg-cinematic-orange/15 text-cinematic-orange"
          : "border-white/10 bg-white/5 text-white/70 hover:border-white/20 hover:text-white"
      }`}
    >
      {label}
    </Link>
  )
}

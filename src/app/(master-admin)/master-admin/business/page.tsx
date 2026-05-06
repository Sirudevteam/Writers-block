import type { Metadata } from "next"
import Link from "next/link"
import { createClient as createAdminClient } from "@supabase/supabase-js"
import type { Database, Json } from "@/infrastructure/db/types/database"
import { requireMasterAdminSession } from "@/modules/master-admin/security/auth"
import {
  MASTER_ADMIN_EXPORT_MAX_ROWS,
  MASTER_ADMIN_PAGE_SIZE,
  masterAdminRangeQuery,
  parseMasterAdminPage,
  resolveMasterAdminDateRange,
} from "@/modules/master-admin/domain/date-range"
import { fetchBusinessEventsInRange, fetchBusinessFunnel } from "@/modules/master-admin/infrastructure/admin-queries"
import { MasterAdminDatePresets } from "@/modules/master-admin/presentation/components/date-presets"

export const metadata: Metadata = {
  title: "Business",
}

type Search = Record<string, string | string[] | undefined>

function formatPercent(numerator: number, denominator: number): string {
  if (denominator <= 0) return "0%"
  return `${Math.round((numerator / denominator) * 100)}%`
}

function formatInrPaise(paise: number | null): string {
  if (paise == null) return ""
  return (paise / 100).toLocaleString("en-IN", { style: "currency", currency: "INR" })
}

function metadataPreview(value: Json): string {
  if (value == null) return ""
  const text = JSON.stringify(value)
  return text.length > 140 ? `${text.slice(0, 137)}...` : text
}

function outcomeClass(outcome: string) {
  if (outcome === "success") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
  if (outcome === "failure") return "border-red-500/40 bg-red-500/10 text-red-300"
  if (outcome === "pending") return "border-amber-500/40 bg-amber-500/10 text-amber-300"
  return "border-white/15 bg-white/5 text-white/55"
}

export default async function MasterAdminBusinessPage({ searchParams }: { searchParams: Promise<Search> }) {
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
  const adminSupabase = createAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  const [funnel, { rows, total }] = await Promise.all([
    fetchBusinessFunnel(adminSupabase, range.fromIso, range.toIso),
    fetchBusinessEventsInRange(adminSupabase, range.fromIso, range.toIso, page),
  ])

  const totalPages = Math.max(1, Math.ceil(total / MASTER_ADMIN_PAGE_SIZE))
  const exportQuery = masterAdminRangeQuery(range)
  const signupUsers = funnel.steps[0]?.users ?? 0
  const paymentSuccessUsers = funnel.steps.find((s) => s.eventType === "payment.webhook_applied")?.users ?? 0

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Business operations</h1>
          <p className="mt-2 text-sm text-white/55">
            Funnel and revenue telemetry between{" "}
            <span className="font-mono text-white/80">{new Date(range.fromIso).toLocaleString("en-IN")}</span> and{" "}
            <span className="font-mono text-white/80">{new Date(range.toIso).toLocaleString("en-IN")}</span>
          </p>
        </div>
        <a
          href={`/api/master-admin/export/business?${exportQuery}`}
          className="inline-flex items-center justify-center rounded-lg border border-cinematic-orange/40 bg-cinematic-orange/10 px-3 py-2 text-sm font-medium text-cinematic-orange hover:border-cinematic-orange/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cinematic-orange/50"
        >
          CSV export (max {MASTER_ADMIN_EXPORT_MAX_ROWS.toLocaleString()} rows)
        </a>
      </div>

      <div className="mt-6">
        <MasterAdminDatePresets basePath="/master-admin/business" range={range} />
      </div>

      <div className="mt-8 grid gap-4 lg:grid-cols-[1fr_1fr_1fr]">
        <div className="rounded-xl border border-white/10 bg-[#111] p-5">
          <div className="text-2xl font-bold">{funnel.totalEvents.toLocaleString()}</div>
          <div className="mt-1 text-xs text-white/45">Tracked funnel events</div>
        </div>
        <div className="rounded-xl border border-cinematic-blue/30 bg-cinematic-blue/10 p-5">
          <div className="text-2xl font-bold text-cinematic-blue">{signupUsers.toLocaleString()}</div>
          <div className="mt-1 text-xs text-white/55">Signup-created users</div>
        </div>
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-5">
          <div className="text-2xl font-bold text-emerald-300">{formatPercent(paymentSuccessUsers, signupUsers)}</div>
          <div className="mt-1 text-xs text-white/55">Signup to payment success</div>
        </div>
      </div>

      <section className="mt-6 rounded-xl border border-white/10 bg-[#111] p-5">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-white/45">Funnel</h2>
            <p className="mt-1 text-xs text-white/35">Counts are unique users plus raw event volume for each step.</p>
          </div>
          <a
            href={`/api/master-admin/business/funnel?${exportQuery}`}
            className="text-sm text-cinematic-orange hover:underline"
          >
            JSON
          </a>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {funnel.steps.map((step, index) => {
            const previousUsers = index > 0 ? funnel.steps[index - 1]?.users ?? 0 : step.users
            return (
              <div key={step.eventType} className="rounded-xl border border-white/10 bg-black/25 p-4">
                <div className="font-mono text-[11px] text-white/35">{step.eventType}</div>
                <div className="mt-2 text-sm font-semibold text-white/85">{step.label}</div>
                <div className="mt-3 flex items-end justify-between gap-3">
                  <div>
                    <div className="text-2xl font-bold">{step.users.toLocaleString()}</div>
                    <div className="text-xs text-white/40">users</div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-sm text-white/65">{step.events.toLocaleString()}</div>
                    <div className="text-xs text-white/35">events</div>
                  </div>
                </div>
                <div className="mt-3 text-xs text-white/40">
                  Prior-step conversion <span className="font-mono text-white/65">{formatPercent(step.users, previousUsers)}</span>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      <div className="mt-8 overflow-x-auto rounded-xl border border-white/10 bg-[#111]">
        <table className="w-full min-w-[1060px] text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 text-white/45">
              <th className="px-4 py-3 font-medium">Time</th>
              <th className="px-4 py-3 font-medium">Event</th>
              <th className="px-4 py-3 font-medium">User</th>
              <th className="px-4 py-3 font-medium">Outcome</th>
              <th className="px-4 py-3 font-medium">Plan</th>
              <th className="px-4 py-3 font-medium">Amount</th>
              <th className="px-4 py-3 font-medium">Route</th>
              <th className="px-4 py-3 font-medium">Metadata</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-white/45">
                  No business events in this range.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="hover:bg-white/5">
                  <td className="px-4 py-3 text-xs text-white/55">{new Date(r.created_at).toLocaleString("en-IN")}</td>
                  <td className="px-4 py-3 font-mono text-xs text-white/80">{r.event_type}</td>
                  <td className="px-4 py-3">
                    {r.user_id ? (
                      <Link href={`/master-admin/users/${r.user_id}`} className="font-mono text-xs text-cinematic-orange hover:underline">
                        {r.user_email ?? r.user_id.slice(0, 8)}
                      </Link>
                    ) : (
                      <span className="text-white/35">None</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold capitalize ${outcomeClass(r.outcome)}`}>
                      {r.outcome}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-white/60">
                    {r.plan ?? "None"}
                    {r.billing_cycle ? <span className="text-white/35"> / {r.billing_cycle}</span> : null}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-white/70">{formatInrPaise(r.amount_paise)}</td>
                  <td className="px-4 py-3">
                    <div className="max-w-[240px] truncate font-mono text-xs text-white/45" title={r.route ?? ""}>
                      {r.route ?? "None"}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="max-w-[260px] truncate font-mono text-[10px] text-white/35" title={metadataPreview(r.metadata)}>
                      {metadataPreview(r.metadata)}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-4 text-sm text-white/55">
        <span>
          Page {page} of {totalPages} - {total.toLocaleString()} total
        </span>
        <div className="flex gap-3">
          {page > 1 ? (
            <Link
              href={`/master-admin/business?${masterAdminRangeQuery(range, { page: String(page - 1) })}`}
              className="rounded-lg border border-white/15 px-3 py-1.5 text-white/80 hover:border-cinematic-orange/40 hover:text-cinematic-orange"
            >
              Previous
            </Link>
          ) : null}
          {page < totalPages ? (
            <Link
              href={`/master-admin/business?${masterAdminRangeQuery(range, { page: String(page + 1) })}`}
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

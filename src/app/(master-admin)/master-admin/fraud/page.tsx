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
import {
  fetchSignupRiskEventsInRange,
  fetchSignupRiskSummary,
  parseSignupRiskIpHash,
  parseSignupRiskLevel,
  parseSignupRiskReviewStatus,
} from "@/modules/master-admin/infrastructure/admin-queries"
import { MasterAdminDatePresets } from "@/modules/master-admin/presentation/components/date-presets"
import { FraudReviewActions } from "@/modules/master-admin/presentation/components/fraud-review-actions"
import { Input } from "@/ui/components/input"

export const metadata: Metadata = {
  title: "Fraud Review",
}

type Search = Record<string, string | string[] | undefined>

const REVIEW_OPTIONS = [
  ["", "All statuses"],
  ["open", "Open"],
  ["not_required", "No review"],
  ["reviewed_safe", "Reviewed safe"],
  ["confirmed_abuse", "Confirmed abuse"],
] as const

const LEVEL_OPTIONS = [
  ["", "All levels"],
  ["high", "High"],
  ["medium", "Medium"],
  ["low", "Low"],
] as const

function reasonMessages(reasons: Json): string[] {
  if (!Array.isArray(reasons)) return []
  return reasons
    .map((reason) => {
      if (reason && typeof reason === "object" && !Array.isArray(reason) && "message" in reason) {
        return String(reason.message ?? "")
      }
      return ""
    })
    .filter(Boolean)
}

function riskBadgeClass(level: string) {
  if (level === "high") return "border-red-500/40 bg-red-500/10 text-red-300"
  if (level === "medium") return "border-amber-500/40 bg-amber-500/10 text-amber-300"
  return "border-white/15 bg-white/5 text-white/55"
}

function statusBadgeClass(status: string) {
  if (status === "open") return "border-cinematic-orange/40 bg-cinematic-orange/10 text-cinematic-orange"
  if (status === "confirmed_abuse") return "border-red-500/40 bg-red-500/10 text-red-300"
  if (status === "reviewed_safe") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
  return "border-white/15 bg-white/5 text-white/55"
}

function filterExtra(filters: { status?: string; level?: string; ipHash?: string }): Record<string, string> {
  const out: Record<string, string> = {}
  if (filters.status) out.status = filters.status
  if (filters.level) out.level = filters.level
  if (filters.ipHash) out.ip_hash = filters.ipHash
  return out
}

export default async function MasterAdminFraudPage({ searchParams }: { searchParams: Promise<Search> }) {
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
  const status = parseSignupRiskReviewStatus(resolvedSearchParams.status)
  const level = parseSignupRiskLevel(resolvedSearchParams.level)
  const ipHash = parseSignupRiskIpHash(resolvedSearchParams.ip_hash)
  const extra = filterExtra({ status, level, ipHash })

  const adminSupabase = createAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  const [{ rows, total }, summary] = await Promise.all([
    fetchSignupRiskEventsInRange(adminSupabase, range.fromIso, range.toIso, page, {
      reviewStatus: status,
      riskLevel: level,
      ipHash,
    }),
    fetchSignupRiskSummary(adminSupabase, range.fromIso, range.toIso),
  ])

  const totalPages = Math.max(1, Math.ceil(total / MASTER_ADMIN_PAGE_SIZE))
  const exportQuery = masterAdminRangeQuery(range, extra)

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Fraud review</h1>
          <p className="mt-2 text-sm text-white/55">
            Hash-only signup risk events between{" "}
            <span className="font-mono text-white/80">{new Date(range.fromIso).toLocaleString("en-IN")}</span> and{" "}
            <span className="font-mono text-white/80">{new Date(range.toIso).toLocaleString("en-IN")}</span>
          </p>
        </div>
        <a
          href={`/api/master-admin/export/fraud?${exportQuery}`}
          className="inline-flex items-center justify-center rounded-lg border border-cinematic-orange/40 bg-cinematic-orange/10 px-3 py-2 text-sm font-medium text-cinematic-orange hover:border-cinematic-orange/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cinematic-orange/50"
        >
          CSV export (max {MASTER_ADMIN_EXPORT_MAX_ROWS.toLocaleString()} rows)
        </a>
      </div>

      {!process.env.FRAUD_SIGNAL_HASH_SECRET ? (
        <div className="mt-5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
          <code className="font-mono">FRAUD_SIGNAL_HASH_SECRET</code> is not configured, so new signup risk events will
          be skipped until it is set.
        </div>
      ) : null}

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-xl border border-white/10 bg-[#111] p-4">
          <div className="text-2xl font-bold">{summary.total.toLocaleString()}</div>
          <div className="mt-1 text-xs text-white/45">Signals in range</div>
        </div>
        <div className="rounded-xl border border-cinematic-orange/30 bg-cinematic-orange/10 p-4">
          <div className="text-2xl font-bold text-cinematic-orange">{summary.open.toLocaleString()}</div>
          <div className="mt-1 text-xs text-white/55">Open reviews</div>
        </div>
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4">
          <div className="text-2xl font-bold text-red-300">{summary.openHigh.toLocaleString()}</div>
          <div className="mt-1 text-xs text-white/55">Open high risk</div>
        </div>
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
          <div className="text-2xl font-bold text-amber-300">{summary.openMedium.toLocaleString()}</div>
          <div className="mt-1 text-xs text-white/55">Open medium risk</div>
        </div>
      </div>

      <div className="mt-6">
        <MasterAdminDatePresets basePath="/master-admin/fraud" range={range} extra={extra} />
      </div>

      <form method="get" action="/master-admin/fraud" className="mt-5 grid gap-3 rounded-xl border border-white/10 bg-[#111] p-4 md:grid-cols-[1fr_1fr_2fr_auto_auto]">
        <input type="hidden" name="preset" value={range.preset} />
        <input type="hidden" name="from" value={range.fromIso} />
        <input type="hidden" name="to" value={range.toIso} />
        <input type="hidden" name="page" value="1" />
        <label className="block">
          <span className="text-xs uppercase tracking-wide text-white/40">Status</span>
          <select
            name="status"
            defaultValue={status ?? ""}
            className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cinematic-orange/50"
          >
            {REVIEW_OPTIONS.map(([value, label]) => (
              <option key={value} value={value} className="bg-[#111] text-white">
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs uppercase tracking-wide text-white/40">Risk</span>
          <select
            name="level"
            defaultValue={level ?? ""}
            className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cinematic-orange/50"
          >
            {LEVEL_OPTIONS.map(([value, label]) => (
              <option key={value} value={value} className="bg-[#111] text-white">
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs uppercase tracking-wide text-white/40">IP hash cluster</span>
          <Input
            name="ip_hash"
            defaultValue={ipHash ?? ""}
            placeholder="Full hashed IP"
            className="mt-2 h-11 rounded-xl border-white/10 bg-black/30 text-white placeholder:text-white/30"
          />
        </label>
        <button
          type="submit"
          className="self-end rounded-lg border border-cinematic-orange/40 bg-cinematic-orange/10 px-4 py-2.5 text-sm font-medium text-cinematic-orange hover:border-cinematic-orange/60"
        >
          Apply
        </button>
        <Link
          href="/master-admin/fraud?preset=30d&status=open&page=1"
          className="self-end rounded-lg border border-white/15 px-4 py-2.5 text-center text-sm text-white/70 hover:border-white/25 hover:text-white"
        >
          Reset
        </Link>
      </form>

      <div className="mt-8 overflow-x-auto rounded-xl border border-white/10 bg-[#111]">
        <table className="w-full min-w-[1180px] text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 text-white/45">
              <th className="px-4 py-3 font-medium">Risk</th>
              <th className="px-4 py-3 font-medium">User</th>
              <th className="px-4 py-3 font-medium">Domain</th>
              <th className="px-4 py-3 font-medium">IP hash</th>
              <th className="px-4 py-3 font-medium">Device hash</th>
              <th className="px-4 py-3 font-medium">Time</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Reasons</th>
              <th className="px-4 py-3 font-medium">Review</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-white/45">
                  No signup risk events in this range.
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const messages = reasonMessages(r.risk_reasons)
                return (
                  <tr key={r.id} className="align-top hover:bg-white/5">
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold capitalize ${riskBadgeClass(r.risk_level)}`}>
                        {r.risk_level} {r.risk_score}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/master-admin/users/${r.user_id}`}
                        className="font-mono text-xs text-cinematic-orange hover:underline"
                      >
                        {r.user_email ?? r.user_id}
                      </Link>
                      {r.user_full_name ? <div className="mt-1 text-xs text-white/45">{r.user_full_name}</div> : null}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-white/70">{r.email_domain}</td>
                    <td className="px-4 py-3">
                      {r.ip_hash ? (
                        <Link
                          href={`/master-admin/fraud?${masterAdminRangeQuery(range, { ip_hash: r.ip_hash, page: "1" })}`}
                          className="font-mono text-xs text-cinematic-blue hover:underline"
                          title={r.ip_hash}
                        >
                          {r.ip_hash.slice(0, 16)}
                        </Link>
                      ) : (
                        <span className="text-white/35">None</span>
                      )}
                      {r.country ? <div className="mt-1 text-xs text-white/35">{r.country}</div> : null}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-white/45">
                      {r.user_agent_hash ? r.user_agent_hash.slice(0, 16) : "None"}
                    </td>
                    <td className="px-4 py-3 text-xs text-white/55">
                      <div>{new Date(r.created_at).toLocaleString("en-IN")}</div>
                      <div className="mt-1 text-white/35">
                        Verified {r.verified_at ? new Date(r.verified_at).toLocaleString("en-IN") : "No"}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold capitalize ${statusBadgeClass(r.review_status)}`}>
                        {r.review_status.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-white/60">
                      {messages.length > 0 ? (
                        <ul className="max-w-xs space-y-1">
                          {messages.map((m) => (
                            <li key={m}>{m}</li>
                          ))}
                        </ul>
                      ) : (
                        <span className="text-white/35">No risk threshold crossed</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <FraudReviewActions eventId={r.id} initialStatus={r.review_status} initialNote={r.review_note} />
                    </td>
                  </tr>
                )
              })
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
              href={`/master-admin/fraud?${masterAdminRangeQuery(range, { ...extra, page: String(page - 1) })}`}
              className="rounded-lg border border-white/15 px-3 py-1.5 text-white/80 hover:border-cinematic-orange/40 hover:text-cinematic-orange"
            >
              Previous
            </Link>
          ) : null}
          {page < totalPages ? (
            <Link
              href={`/master-admin/fraud?${masterAdminRangeQuery(range, { ...extra, page: String(page + 1) })}`}
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

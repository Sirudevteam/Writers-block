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
  fetchSecurityEventSummary,
  fetchSecurityEventsInRange,
  parseSecurityEventType,
  parseSecurityOutcome,
  parseSecurityReviewStatus,
  parseSecuritySeverity,
  parseUuid,
} from "@/modules/master-admin/infrastructure/admin-queries"
import { MasterAdminDatePresets } from "@/modules/master-admin/presentation/components/date-presets"
import { SecurityEventReviewActions } from "@/modules/master-admin/presentation/components/security-event-review-actions"
import { Input } from "@/ui/components/input"

export const metadata: Metadata = {
  title: "Security",
}

type Search = Record<string, string | string[] | undefined>

const SEVERITY_OPTIONS = [
  ["", "All severities"],
  ["critical", "Critical"],
  ["high", "High"],
  ["medium", "Medium"],
  ["low", "Low"],
] as const

const OUTCOME_OPTIONS = [
  ["", "All outcomes"],
  ["blocked", "Blocked"],
  ["failure", "Failure"],
  ["success", "Success"],
  ["info", "Info"],
] as const

const REVIEW_OPTIONS = [
  ["", "All statuses"],
  ["open", "Open"],
  ["acknowledged", "Acknowledged"],
  ["resolved", "Resolved"],
  ["ignored", "Ignored"],
  ["not_required", "No review"],
] as const

function badgeClass(kind: "severity" | "outcome" | "status", value: string) {
  if (kind === "severity") {
    if (value === "critical") return "border-red-500/60 bg-red-500/15 text-red-200"
    if (value === "high") return "border-red-500/40 bg-red-500/10 text-red-300"
    if (value === "medium") return "border-amber-500/40 bg-amber-500/10 text-amber-300"
    return "border-white/15 bg-white/5 text-white/55"
  }
  if (kind === "outcome") {
    if (value === "blocked") return "border-red-500/40 bg-red-500/10 text-red-300"
    if (value === "failure") return "border-amber-500/40 bg-amber-500/10 text-amber-300"
    if (value === "success") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
    return "border-white/15 bg-white/5 text-white/55"
  }
  if (value === "open") return "border-cinematic-orange/40 bg-cinematic-orange/10 text-cinematic-orange"
  if (value === "resolved") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
  if (value === "acknowledged") return "border-cinematic-blue/40 bg-cinematic-blue/10 text-cinematic-blue"
  return "border-white/15 bg-white/5 text-white/55"
}

function metadataPreview(value: Json): string {
  if (value == null) return ""
  const text = JSON.stringify(value)
  return text.length > 180 ? `${text.slice(0, 177)}...` : text
}

function filterExtra(filters: {
  eventType?: string
  severity?: string
  outcome?: string
  reviewStatus?: string
  actorUserId?: string
  targetUserId?: string
}): Record<string, string> {
  const out: Record<string, string> = {}
  if (filters.eventType) out.event_type = filters.eventType
  if (filters.severity) out.severity = filters.severity
  if (filters.outcome) out.outcome = filters.outcome
  if (filters.reviewStatus) out.status = filters.reviewStatus
  if (filters.actorUserId) out.actor_user_id = filters.actorUserId
  if (filters.targetUserId) out.target_user_id = filters.targetUserId
  return out
}

export default async function MasterAdminSecurityPage({ searchParams }: { searchParams: Promise<Search> }) {
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
  const filters = {
    eventType: parseSecurityEventType(resolvedSearchParams.event_type),
    severity: parseSecuritySeverity(resolvedSearchParams.severity),
    outcome: parseSecurityOutcome(resolvedSearchParams.outcome),
    reviewStatus: parseSecurityReviewStatus(resolvedSearchParams.status ?? resolvedSearchParams.review_status),
    actorUserId: parseUuid(resolvedSearchParams.actor_user_id),
    targetUserId: parseUuid(resolvedSearchParams.target_user_id),
  }
  const extra = filterExtra(filters)

  const adminSupabase = createAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  const [{ rows, total }, summary] = await Promise.all([
    fetchSecurityEventsInRange(adminSupabase, range.fromIso, range.toIso, page, filters),
    fetchSecurityEventSummary(adminSupabase, range.fromIso, range.toIso),
  ])

  const totalPages = Math.max(1, Math.ceil(total / MASTER_ADMIN_PAGE_SIZE))
  const exportQuery = masterAdminRangeQuery(range, extra)

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Security events</h1>
          <p className="mt-2 text-sm text-white/55">
            Server-side security telemetry between{" "}
            <span className="font-mono text-white/80">{new Date(range.fromIso).toLocaleString("en-IN")}</span> and{" "}
            <span className="font-mono text-white/80">{new Date(range.toIso).toLocaleString("en-IN")}</span>
          </p>
        </div>
        <a
          href={`/api/master-admin/export/security?${exportQuery}`}
          className="inline-flex items-center justify-center rounded-lg border border-cinematic-orange/40 bg-cinematic-orange/10 px-3 py-2 text-sm font-medium text-cinematic-orange hover:border-cinematic-orange/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cinematic-orange/50"
        >
          CSV export (max {MASTER_ADMIN_EXPORT_MAX_ROWS.toLocaleString()} rows)
        </a>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <div className="rounded-xl border border-white/10 bg-[#111] p-4">
          <div className="text-2xl font-bold">{summary.total.toLocaleString()}</div>
          <div className="mt-1 text-xs text-white/45">Events</div>
        </div>
        <div className="rounded-xl border border-cinematic-orange/30 bg-cinematic-orange/10 p-4">
          <div className="text-2xl font-bold text-cinematic-orange">{summary.open.toLocaleString()}</div>
          <div className="mt-1 text-xs text-white/55">Open reviews</div>
        </div>
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4">
          <div className="text-2xl font-bold text-red-300">{summary.blocked.toLocaleString()}</div>
          <div className="mt-1 text-xs text-white/55">Blocked</div>
        </div>
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
          <div className="text-2xl font-bold text-amber-300">{summary.failures.toLocaleString()}</div>
          <div className="mt-1 text-xs text-white/55">Failures</div>
        </div>
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4">
          <div className="text-2xl font-bold text-red-200">{summary.highOrCritical.toLocaleString()}</div>
          <div className="mt-1 text-xs text-white/55">High or critical</div>
        </div>
      </div>

      <div className="mt-6">
        <MasterAdminDatePresets basePath="/master-admin/security" range={range} extra={extra} />
      </div>

      <form
        method="get"
        action="/master-admin/security"
        className="mt-5 grid gap-3 rounded-xl border border-white/10 bg-[#111] p-4 lg:grid-cols-[1.4fr_1fr_1fr_1fr_1.6fr_1.6fr_auto_auto]"
      >
        <input type="hidden" name="preset" value={range.preset} />
        <input type="hidden" name="from" value={range.fromIso} />
        <input type="hidden" name="to" value={range.toIso} />
        <input type="hidden" name="page" value="1" />
        <label className="block">
          <span className="text-xs uppercase tracking-wide text-white/40">Event type</span>
          <Input
            name="event_type"
            defaultValue={filters.eventType ?? ""}
            placeholder="auth.signin_failure"
            className="mt-2 h-11 rounded-xl border-white/10 bg-black/30 text-white placeholder:text-white/30"
          />
        </label>
        <label className="block">
          <span className="text-xs uppercase tracking-wide text-white/40">Severity</span>
          <select
            name="severity"
            defaultValue={filters.severity ?? ""}
            className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cinematic-orange/50"
          >
            {SEVERITY_OPTIONS.map(([value, label]) => (
              <option key={value} value={value} className="bg-[#111] text-white">
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs uppercase tracking-wide text-white/40">Outcome</span>
          <select
            name="outcome"
            defaultValue={filters.outcome ?? ""}
            className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cinematic-orange/50"
          >
            {OUTCOME_OPTIONS.map(([value, label]) => (
              <option key={value} value={value} className="bg-[#111] text-white">
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs uppercase tracking-wide text-white/40">Review</span>
          <select
            name="status"
            defaultValue={filters.reviewStatus ?? ""}
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
          <span className="text-xs uppercase tracking-wide text-white/40">Actor user</span>
          <Input
            name="actor_user_id"
            defaultValue={filters.actorUserId ?? ""}
            placeholder="UUID"
            className="mt-2 h-11 rounded-xl border-white/10 bg-black/30 text-white placeholder:text-white/30"
          />
        </label>
        <label className="block">
          <span className="text-xs uppercase tracking-wide text-white/40">Target user</span>
          <Input
            name="target_user_id"
            defaultValue={filters.targetUserId ?? ""}
            placeholder="UUID"
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
          href="/master-admin/security?preset=30d&status=open&page=1"
          className="self-end rounded-lg border border-white/15 px-4 py-2.5 text-center text-sm text-white/70 hover:border-white/25 hover:text-white"
        >
          Reset
        </Link>
      </form>

      <div className="mt-8 overflow-x-auto rounded-xl border border-white/10 bg-[#111]">
        <table className="w-full min-w-[1320px] text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 text-white/45">
              <th className="px-4 py-3 font-medium">Time</th>
              <th className="px-4 py-3 font-medium">Event</th>
              <th className="px-4 py-3 font-medium">Severity</th>
              <th className="px-4 py-3 font-medium">Outcome</th>
              <th className="px-4 py-3 font-medium">Actor</th>
              <th className="px-4 py-3 font-medium">Target</th>
              <th className="px-4 py-3 font-medium">Route</th>
              <th className="px-4 py-3 font-medium">Signals</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Review</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-white/45">
                  No security events in this range.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="align-top hover:bg-white/5">
                  <td className="px-4 py-3 text-xs text-white/55">{new Date(r.created_at).toLocaleString("en-IN")}</td>
                  <td className="px-4 py-3">
                    <div className="font-mono text-xs text-white/80">{r.event_type}</div>
                    {r.status_code ? <div className="mt-1 text-xs text-white/35">HTTP {r.status_code}</div> : null}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold capitalize ${badgeClass("severity", r.severity)}`}>
                      {r.severity}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold capitalize ${badgeClass("outcome", r.outcome)}`}>
                      {r.outcome}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {r.actor_user_id ? (
                      <Link href={`/master-admin/users/${r.actor_user_id}`} className="font-mono text-xs text-cinematic-orange hover:underline">
                        {r.actor_email ?? r.actor_user_id.slice(0, 8)}
                      </Link>
                    ) : (
                      <span className="text-white/35">System</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {r.target_user_id ? (
                      <Link href={`/master-admin/users/${r.target_user_id}`} className="font-mono text-xs text-cinematic-orange hover:underline">
                        {r.target_email ?? r.target_user_id.slice(0, 8)}
                      </Link>
                    ) : (
                      <span className="text-white/35">None</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="max-w-[260px] truncate font-mono text-xs text-white/50" title={r.route ?? ""}>
                      {r.method ? `${r.method} ` : ""}
                      {r.route ?? "None"}
                    </div>
                    {metadataPreview(r.metadata) ? (
                      <div className="mt-1 max-w-[260px] truncate font-mono text-[10px] text-white/30" title={metadataPreview(r.metadata)}>
                        {metadataPreview(r.metadata)}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 font-mono text-[10px] text-white/45">
                    <div>IP {r.ip_hash ? r.ip_hash.slice(0, 16) : "none"}</div>
                    <div className="mt-1">UA {r.user_agent_hash ? r.user_agent_hash.slice(0, 16) : "none"}</div>
                    {r.country ? <div className="mt-1">Country {r.country}</div> : null}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold capitalize ${badgeClass("status", r.review_status)}`}>
                      {r.review_status.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <SecurityEventReviewActions eventId={r.id} initialStatus={r.review_status} initialNote={r.review_note} />
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
              href={`/master-admin/security?${masterAdminRangeQuery(range, { ...extra, page: String(page - 1) })}`}
              className="rounded-lg border border-white/15 px-3 py-1.5 text-white/80 hover:border-cinematic-orange/40 hover:text-cinematic-orange"
            >
              Previous
            </Link>
          ) : null}
          {page < totalPages ? (
            <Link
              href={`/master-admin/security?${masterAdminRangeQuery(range, { ...extra, page: String(page + 1) })}`}
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

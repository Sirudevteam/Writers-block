import type { Metadata } from "next"
import Link from "next/link"
import { createClient as createAdminClient } from "@supabase/supabase-js"
import type { Database } from "@/infrastructure/db/types/database"
import { requireMasterAdminSession } from "@/modules/master-admin/security/auth"
import {
  MASTER_ADMIN_EXPORT_MAX_ROWS,
  MASTER_ADMIN_PAGE_SIZE,
  masterAdminRangeQuery,
  parseMasterAdminPage,
  resolveMasterAdminDateRange,
} from "@/modules/master-admin/domain/date-range"
import { fetchMasterAdminAuditInRange } from "@/modules/master-admin/infrastructure/admin-queries"
import { MasterAdminDatePresets } from "@/modules/master-admin/presentation/components/date-presets"

export const metadata: Metadata = {
  title: "Audit log",
}

type Search = Record<string, string | string[] | undefined>

export default async function MasterAdminAuditPage({ searchParams }: { searchParams: Promise<Search> }) {
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

  const { rows, total } = await fetchMasterAdminAuditInRange(
    adminSupabase,
    range.fromIso,
    range.toIso,
    page
  )
  const totalPages = Math.max(1, Math.ceil(total / MASTER_ADMIN_PAGE_SIZE))
  const exportQuery = masterAdminRangeQuery(range)

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Master Admin audit</h1>
          <p className="mt-2 text-sm text-white/55">
            Operator API access between{" "}
            <span className="font-mono text-white/80">{new Date(range.fromIso).toLocaleString("en-IN")}</span> and{" "}
            <span className="font-mono text-white/80">{new Date(range.toIso).toLocaleString("en-IN")}</span>
          </p>
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          <a
            href={`/api/master-admin/export/audit?${exportQuery}`}
            className="rounded-lg border border-cinematic-orange/40 bg-cinematic-orange/10 px-3 py-2 text-sm font-medium text-cinematic-orange hover:border-cinematic-orange/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cinematic-orange/50"
          >
            Download CSV (max {MASTER_ADMIN_EXPORT_MAX_ROWS.toLocaleString()} rows)
          </a>
          <span className="text-[11px] text-white/35">Exports require the same host, session, and MFA as this UI.</span>
        </div>
      </div>

      <div className="mt-6">
        <MasterAdminDatePresets basePath="/master-admin/audit" range={range} />
      </div>

      <div className="mt-8 overflow-x-auto rounded-xl border border-white/10 bg-[#111]">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 text-white/45">
              <th className="px-4 py-3 font-medium">Time (IST display)</th>
              <th className="px-4 py-3 font-medium">Method</th>
              <th className="px-4 py-3 font-medium">Route</th>
              <th className="px-4 py-3 font-medium">Host</th>
              <th className="px-4 py-3 font-medium">Operator</th>
              <th className="px-4 py-3 font-medium">IP hash</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-white/45">
                  No audit events in this range.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="hover:bg-white/5">
                  <td className="px-4 py-3 text-white/50">{new Date(r.created_at).toLocaleString("en-IN")}</td>
                  <td className="px-4 py-3 font-mono text-xs text-white/80">{r.method}</td>
                  <td className="px-4 py-3 font-mono text-xs text-white/80">{r.route}</td>
                  <td className="px-4 py-3 font-mono text-xs text-white/55">{r.host ?? "—"}</td>
                  <td className="px-4 py-3">
                    {r.user_id ? (
                      <Link
                        href={`/master-admin/users/${r.user_id}`}
                        className="font-mono text-xs text-cinematic-orange hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cinematic-orange/50 rounded"
                      >
                        {r.operator_email ?? r.user_id.slice(0, 8) + "…"}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-[11px] text-white/40">{r.ip_hash ?? "—"}</td>
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
              href={`/master-admin/audit?${masterAdminRangeQuery(range, { page: String(page - 1) })}`}
              className="rounded-lg border border-white/15 px-3 py-1.5 text-white/80 hover:border-cinematic-orange/40 hover:text-cinematic-orange"
            >
              Previous
            </Link>
          ) : null}
          {page < totalPages ? (
            <Link
              href={`/master-admin/audit?${masterAdminRangeQuery(range, { page: String(page + 1) })}`}
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

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
import { fetchProfilesInRange } from "@/modules/master-admin/infrastructure/admin-queries"
import { MasterAdminDatePresets } from "@/modules/master-admin/presentation/components/date-presets"
import { Input } from "@/ui/components/input"

export const metadata: Metadata = {
  title: "Users",
}

type Search = Record<string, string | string[] | undefined>

export default async function MasterAdminUsersPage({ searchParams }: { searchParams: Promise<Search> }) {
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
  const q = typeof resolvedSearchParams.q === "string" ? resolvedSearchParams.q : ""

  const adminSupabase = createAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  const { rows, total } = await fetchProfilesInRange(adminSupabase, range.fromIso, range.toIso, page, q)
  const totalPages = Math.max(1, Math.ceil(total / MASTER_ADMIN_PAGE_SIZE))
  const exportQuery = masterAdminRangeQuery(range, q ? { q } : undefined)

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Users</h1>
          <p className="mt-2 text-sm text-white/55">
            Profiles created between{" "}
            <span className="font-mono text-white/80">{new Date(range.fromIso).toLocaleString("en-IN")}</span> and{" "}
            <span className="font-mono text-white/80">{new Date(range.toIso).toLocaleString("en-IN")}</span>
          </p>
        </div>
        <div className="flex w-full max-w-sm flex-col gap-3">
          <form method="get" action="/master-admin/users">
            <label className="block text-xs uppercase tracking-wide text-white/40">Email search</label>
            <Input
              name="q"
              defaultValue={q}
              placeholder="e.g. gmail.com"
              className="mt-2 h-11 rounded-xl border-white/10 bg-white/5 text-white placeholder:text-white/35"
            />
            <input type="hidden" name="preset" value={range.preset} />
            <input type="hidden" name="from" value={range.fromIso} />
            <input type="hidden" name="to" value={range.toIso} />
            <input type="hidden" name="page" value="1" />
          </form>
          <a
            href={`/api/master-admin/export/users?${exportQuery}`}
            className="inline-flex items-center justify-center rounded-lg border border-cinematic-orange/40 bg-cinematic-orange/10 px-3 py-2 text-center text-sm font-medium text-cinematic-orange hover:border-cinematic-orange/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cinematic-orange/50"
          >
            CSV export (max {MASTER_ADMIN_EXPORT_MAX_ROWS.toLocaleString()} rows)
          </a>
        </div>
      </div>

      <div className="mt-6">
        <MasterAdminDatePresets basePath="/master-admin/users" range={range} extra={q ? { q } : undefined} />
      </div>

      <div className="mt-8 overflow-x-auto rounded-xl border border-white/10 bg-[#111]">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 text-white/45">
              <th className="px-4 py-3 font-medium">User ID</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Created</th>
              <th className="px-4 py-3 font-medium">Plan</th>
              <th className="px-4 py-3 font-medium">Sub status</th>
              <th className="px-4 py-3 font-medium">360</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-white/45">
                  No users in this range.
                </td>
              </tr>
            ) : (
              rows.map((u) => (
                <tr key={u.id} className="hover:bg-white/5">
                  <td className="px-4 py-3 font-mono text-xs text-white/55">{u.id}</td>
                  <td className="px-4 py-3 font-mono text-xs text-white/80">{u.email}</td>
                  <td className="px-4 py-3 text-white/80">{u.full_name ?? "—"}</td>
                  <td className="px-4 py-3 text-white/50">{new Date(u.created_at).toLocaleString("en-IN")}</td>
                  <td className="px-4 py-3 capitalize text-white/80">{u.subscription?.plan ?? "—"}</td>
                  <td className="px-4 py-3 capitalize text-white/50">{u.subscription?.status ?? "—"}</td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/master-admin/users/${u.id}`}
                      className="text-sm text-cinematic-orange hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cinematic-orange/50 rounded"
                    >
                      View
                    </Link>
                  </td>
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
              href={`/master-admin/users?${masterAdminRangeQuery(range, { ...(q ? { q } : {}), page: String(page - 1) })}`}
              className="rounded-lg border border-white/15 px-3 py-1.5 text-white/80 hover:border-cinematic-orange/40 hover:text-cinematic-orange"
            >
              Previous
            </Link>
          ) : null}
          {page < totalPages ? (
            <Link
              href={`/master-admin/users?${masterAdminRangeQuery(range, { ...(q ? { q } : {}), page: String(page + 1) })}`}
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

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
import {
  fetchAiCreditOpsSummary,
  fetchAiCreditReservationsInRange,
  fetchAiCreditTopupsInRange,
  fetchPaymentOpsSummary,
  fetchPdfExportPurchasesInRange,
  fetchRazorpayPaymentsInRange,
} from "@/modules/master-admin/infrastructure/admin-queries"
import { MasterAdminDatePresets } from "@/modules/master-admin/presentation/components/date-presets"

export const metadata: Metadata = {
  title: "Payments",
}

function formatInrPaise(paise: number | null): string {
  if (paise == null) return "—"
  return (paise / 100).toLocaleString("en-IN", { style: "currency", currency: "INR" })
}

type Search = Record<string, string | string[] | undefined>

export default async function MasterAdminPaymentsPage({ searchParams }: { searchParams: Promise<Search> }) {
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

  const [
    { rows, total },
    { rows: pdfRows, total: pdfTotal },
    { rows: aiCreditRows, total: aiCreditTotal },
    { rows: aiCreditReservations, total: aiCreditReservationTotal },
    opsSummary,
    aiCreditOps,
  ] = await Promise.all([
    fetchRazorpayPaymentsInRange(adminSupabase, range.fromIso, range.toIso, page),
    fetchPdfExportPurchasesInRange(adminSupabase, range.fromIso, range.toIso, page),
    fetchAiCreditTopupsInRange(adminSupabase, range.fromIso, range.toIso, page),
    fetchAiCreditReservationsInRange(adminSupabase, range.fromIso, range.toIso, page),
    fetchPaymentOpsSummary(adminSupabase, range.fromIso, range.toIso),
    fetchAiCreditOpsSummary(adminSupabase, range.fromIso, range.toIso),
  ])
  const totalPages = Math.max(1, Math.ceil(total / MASTER_ADMIN_PAGE_SIZE))
  const pdfTotalPages = Math.max(1, Math.ceil(pdfTotal / MASTER_ADMIN_PAGE_SIZE))
  const exportQuery = masterAdminRangeQuery(range)

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Payment ledger</h1>
          <p className="mt-2 text-sm text-white/55">
            Rows from <code className="font-mono text-xs text-white/70">razorpay_payments</code> between{" "}
            <span className="font-mono text-white/80">{new Date(range.fromIso).toLocaleString("en-IN")}</span> and{" "}
            <span className="font-mono text-white/80">{new Date(range.toIso).toLocaleString("en-IN")}</span>
          </p>
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          <a
            href={`/api/master-admin/export/payments?${exportQuery}`}
            className="rounded-lg border border-cinematic-orange/40 bg-cinematic-orange/10 px-3 py-2 text-sm font-medium text-cinematic-orange hover:border-cinematic-orange/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cinematic-orange/50"
          >
            Download CSV (max {MASTER_ADMIN_EXPORT_MAX_ROWS.toLocaleString()} rows)
          </a>
          <span className="text-[11px] text-white/35">Amounts are stored in paise; CSV includes paise and a formatted INR column.</span>
        </div>
      </div>

      <div className="mt-6">
        <MasterAdminDatePresets basePath="/master-admin/payments" range={range} />
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4 xl:grid-cols-7">
        <Link
          href={`/master-admin/security?${masterAdminRangeQuery(range, { event_type: "payment.verify_failure", outcome: "failure" })}`}
          className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 hover:border-red-500/50"
        >
          <div className="text-2xl font-bold text-red-300">{opsSummary.verifyFailures.toLocaleString()}</div>
          <div className="mt-1 text-xs text-white/55">Verify failures</div>
        </Link>
        <Link
          href={`/master-admin/security?${masterAdminRangeQuery(range, { event_type: "payment.webhook_failure", outcome: "failure" })}`}
          className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 hover:border-red-500/50"
        >
          <div className="text-2xl font-bold text-red-300">{opsSummary.webhookFailures.toLocaleString()}</div>
          <div className="mt-1 text-xs text-white/55">Webhook failures</div>
        </Link>
        <Link
          href="/master-admin/business?preset=30d"
          className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 hover:border-amber-500/50"
        >
          <div className="text-2xl font-bold text-amber-300">{opsSummary.duplicateWebhooks.toLocaleString()}</div>
          <div className="mt-1 text-xs text-white/55">Duplicate webhooks</div>
        </Link>
        <Link
          href="/master-admin/business?preset=30d"
          className="rounded-xl border border-cinematic-blue/30 bg-cinematic-blue/10 p-4 hover:border-cinematic-blue/50"
        >
          <div className="text-2xl font-bold text-cinematic-blue">{opsSummary.pendingOrders.toLocaleString()}</div>
          <div className="mt-1 text-xs text-white/55">Started, not converted</div>
        </Link>
        <Link
          href="/master-admin/business?preset=30d"
          className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 hover:border-amber-500/50"
        >
          <div className="text-2xl font-bold text-amber-300">{opsSummary.delayedWebhookOrders.toLocaleString()}</div>
          <div className="mt-1 text-xs text-white/55">Webhook delayed 15m+</div>
        </Link>
        <Link
          href="/master-admin/business?preset=30d"
          className="rounded-xl border border-cinematic-blue/30 bg-cinematic-blue/10 p-4 hover:border-cinematic-blue/50"
        >
          <div className="text-2xl font-bold text-cinematic-blue">{opsSummary.pdfExportPurchases.toLocaleString()}</div>
          <div className="mt-1 text-xs text-white/55">Clean PDF purchases</div>
        </Link>
        <Link
          href={`/master-admin/security?${masterAdminRangeQuery(range, { event_type: "payment.pdf_export_consume_failure", outcome: "blocked" })}`}
          className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 hover:border-red-500/50"
        >
          <div className="text-2xl font-bold text-red-300">{opsSummary.pdfExportReplayBlocks.toLocaleString()}</div>
          <div className="mt-1 text-xs text-white/55">Clean PDF replays</div>
        </Link>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-xl border border-cinematic-blue/30 bg-cinematic-blue/10 p-4">
          <div className="text-2xl font-bold text-cinematic-blue">{aiCreditOps.topups.toLocaleString()}</div>
          <div className="mt-1 text-xs text-white/55">AI credit top-ups</div>
        </div>
        <div className="rounded-xl border border-cinematic-orange/30 bg-cinematic-orange/10 p-4">
          <div className="text-2xl font-bold text-cinematic-orange">{aiCreditOps.reserved.toLocaleString()}</div>
          <div className="mt-1 text-xs text-white/55">Credit reservations</div>
        </div>
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
          <div className="text-2xl font-bold text-amber-300">{aiCreditOps.pendingReservations.toLocaleString()}</div>
          <div className="mt-1 text-xs text-white/55">Pending reservations</div>
        </div>
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4">
          <div className="text-2xl font-bold text-red-300">{aiCreditOps.expiredPendingReservations.toLocaleString()}</div>
          <div className="mt-1 text-xs text-white/55">Expired pending</div>
        </div>
      </div>

      <div className="mt-8 overflow-x-auto rounded-xl border border-white/10 bg-[#111]">
        <table className="w-full min-w-[960px] text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 text-white/45">
              <th className="px-4 py-3 font-medium">Time</th>
              <th className="px-4 py-3 font-medium">User</th>
              <th className="px-4 py-3 font-medium">Amount</th>
              <th className="px-4 py-3 font-medium">Plan</th>
              <th className="px-4 py-3 font-medium">Billing</th>
              <th className="px-4 py-3 font-medium">Payment ID</th>
              <th className="px-4 py-3 font-medium">Order ID</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-white/45">
                  No payments in this range.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="hover:bg-white/5">
                  <td className="px-4 py-3 text-white/50">{new Date(r.created_at).toLocaleString("en-IN")}</td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/master-admin/users/${r.user_id}`}
                      className="block font-mono text-xs text-cinematic-orange hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cinematic-orange/50 rounded"
                    >
                      {r.user_email ?? `${r.user_id.slice(0, 8)}...`}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-white/80">{formatInrPaise(r.amount)}</td>
                  <td className="px-4 py-3 capitalize text-white/80">{r.plan}</td>
                  <td className="px-4 py-3 capitalize text-white/55">{r.billing_cycle}</td>
                  <td className="px-4 py-3 font-mono text-[11px] text-white/55">{r.razorpay_payment_id}</td>
                  <td className="px-4 py-3 font-mono text-[11px] text-white/55">{r.razorpay_order_id}</td>
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
              href={`/master-admin/payments?${masterAdminRangeQuery(range, { page: String(page - 1) })}`}
              className="rounded-lg border border-white/15 px-3 py-1.5 text-white/80 hover:border-cinematic-orange/40 hover:text-cinematic-orange"
            >
              Previous
            </Link>
          ) : null}
          {page < totalPages ? (
            <Link
              href={`/master-admin/payments?${masterAdminRangeQuery(range, { page: String(page + 1) })}`}
              className="rounded-lg border border-white/15 px-3 py-1.5 text-white/80 hover:border-cinematic-orange/40 hover:text-cinematic-orange"
            >
              Next
            </Link>
          ) : null}
        </div>
      </div>

      <div className="mt-10 flex flex-col gap-1">
        <h2 className="text-xl font-semibold tracking-tight">Clean PDF export purchases</h2>
        <p className="text-sm text-white/45">
          Rows from <code className="font-mono text-xs text-white/70">pdf_export_purchases</code>; consumed rows have already produced one clean download.
        </p>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-white/10 bg-[#111]">
        <table className="w-full min-w-[1080px] text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 text-white/45">
              <th className="px-4 py-3 font-medium">Time</th>
              <th className="px-4 py-3 font-medium">User</th>
              <th className="px-4 py-3 font-medium">Amount</th>
              <th className="px-4 py-3 font-medium">Project</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Payment ID</th>
              <th className="px-4 py-3 font-medium">Order ID</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {pdfRows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-white/45">
                  No clean PDF purchases in this range.
                </td>
              </tr>
            ) : (
              pdfRows.map((r) => (
                <tr key={r.id} className="hover:bg-white/5">
                  <td className="px-4 py-3 text-white/50">{new Date(r.created_at).toLocaleString("en-IN")}</td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/master-admin/users/${r.user_id}`}
                      className="block rounded font-mono text-xs text-cinematic-orange hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cinematic-orange/50"
                    >
                      {r.user_email ?? `${r.user_id.slice(0, 8)}...`}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-white/80">{formatInrPaise(r.amount_paise)}</td>
                  <td className="px-4 py-3">
                    <div className="max-w-[260px] truncate text-white/80">{r.project_title ?? "Untitled project"}</div>
                    <div className="font-mono text-[10px] text-white/35">{r.project_id}</div>
                  </td>
                  <td className="px-4 py-3 text-white/70">{r.consumed_at ? "Consumed" : "Unconsumed"}</td>
                  <td className="px-4 py-3 font-mono text-[11px] text-white/55">{r.razorpay_payment_id}</td>
                  <td className="px-4 py-3 font-mono text-[11px] text-white/55">{r.razorpay_order_id}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 text-sm text-white/55">
        Clean PDF page {page} of {pdfTotalPages} - {pdfTotal.toLocaleString()} total
      </div>

      <div className="mt-10 flex flex-col gap-1">
        <h2 className="text-xl font-semibold tracking-tight">AI credit top-ups</h2>
        <p className="text-sm text-white/45">
          Rows from <code className="font-mono text-xs text-white/70">ai_credit_topup_purchases</code>; remaining credits never expire.
        </p>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-white/10 bg-[#111]">
        <table className="w-full min-w-[1080px] text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 text-white/45">
              <th className="px-4 py-3 font-medium">Time</th>
              <th className="px-4 py-3 font-medium">User</th>
              <th className="px-4 py-3 font-medium">Amount</th>
              <th className="px-4 py-3 font-medium">Credits</th>
              <th className="px-4 py-3 font-medium">Remaining</th>
              <th className="px-4 py-3 font-medium">Payment ID</th>
              <th className="px-4 py-3 font-medium">Order ID</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {aiCreditRows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-white/45">
                  No AI credit top-ups in this range.
                </td>
              </tr>
            ) : (
              aiCreditRows.map((r) => (
                <tr key={r.id} className="hover:bg-white/5">
                  <td className="px-4 py-3 text-white/50">{new Date(r.created_at).toLocaleString("en-IN")}</td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/master-admin/users/${r.user_id}`}
                      className="block rounded font-mono text-xs text-cinematic-orange hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cinematic-orange/50"
                    >
                      {r.user_email ?? `${r.user_id.slice(0, 8)}...`}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-white/80">{formatInrPaise(r.amount_paise)}</td>
                  <td className="px-4 py-3 font-mono text-xs text-white/80">{r.credits_granted.toLocaleString("en-IN")}</td>
                  <td className="px-4 py-3 font-mono text-xs text-white/80">{r.credits_remaining.toLocaleString("en-IN")}</td>
                  <td className="px-4 py-3 font-mono text-[11px] text-white/55">{r.razorpay_payment_id}</td>
                  <td className="px-4 py-3 font-mono text-[11px] text-white/55">{r.razorpay_order_id}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-4 text-sm text-white/55">
        AI credit top-up page {page} - {aiCreditTotal.toLocaleString()} total
      </div>

      <div className="mt-10 flex flex-col gap-1">
        <h2 className="text-xl font-semibold tracking-tight">AI credit reservations</h2>
        <p className="text-sm text-white/45">
          Short-lived overage reservations from <code className="font-mono text-xs text-white/70">ai_credit_reservations</code>.
        </p>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-white/10 bg-[#111]">
        <table className="w-full min-w-[1120px] text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 text-white/45">
              <th className="px-4 py-3 font-medium">Time</th>
              <th className="px-4 py-3 font-medium">User</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Required</th>
              <th className="px-4 py-3 font-medium">Reserved</th>
              <th className="px-4 py-3 font-medium">Consumed</th>
              <th className="px-4 py-3 font-medium">Expires</th>
              <th className="px-4 py-3 font-medium">Request</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {aiCreditReservations.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-white/45">
                  No AI credit reservations in this range.
                </td>
              </tr>
            ) : (
              aiCreditReservations.map((r) => (
                <tr key={r.id} className="hover:bg-white/5">
                  <td className="px-4 py-3 text-white/50">{new Date(r.created_at).toLocaleString("en-IN")}</td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/master-admin/users/${r.user_id}`}
                      className="block rounded font-mono text-xs text-cinematic-orange hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cinematic-orange/50"
                    >
                      {r.user_email ?? `${r.user_id.slice(0, 8)}...`}
                    </Link>
                  </td>
                  <td className="px-4 py-3 capitalize text-white/80">{r.status}</td>
                  <td className="px-4 py-3 font-mono text-xs text-white/80">{r.required_credits.toLocaleString("en-IN")}</td>
                  <td className="px-4 py-3 font-mono text-xs text-white/80">{r.credits_reserved.toLocaleString("en-IN")}</td>
                  <td className="px-4 py-3 font-mono text-xs text-white/80">{r.consumed_credits.toLocaleString("en-IN")}</td>
                  <td className="px-4 py-3 text-white/50">{new Date(r.expires_at).toLocaleString("en-IN")}</td>
                  <td className="px-4 py-3 font-mono text-[11px] text-white/45">{r.request_id}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-4 text-sm text-white/55">
        AI credit reservation page {page} - {aiCreditReservationTotal.toLocaleString()} total
      </div>
    </div>
  )
}

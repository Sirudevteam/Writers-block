import { NextResponse, type NextRequest } from "next/server"
import { createClient as createAdminClient } from "@supabase/supabase-js"
import type { Database } from "@/infrastructure/db/types/database"
import { createClient } from "@/infrastructure/db/supabase/server"
import { guardMasterAdminApi } from "@/modules/master-admin/security/api-guard"
import { MASTER_ADMIN_CSV_HEADERS, MASTER_ADMIN_JSON_HEADERS } from "@/modules/master-admin/application/http"
import { formatCsv } from "@/modules/master-admin/application/csv"
import { MASTER_ADMIN_EXPORT_MAX_ROWS, resolveMasterAdminDateRange } from "@/modules/master-admin/domain/date-range"
import { fetchPdfExportPurchasesExport, fetchRazorpayPaymentsExport } from "@/modules/master-admin/infrastructure/admin-queries"
import { logIamAudit } from "@/modules/iam/application/audit"
import { logSecurityEvent } from "@/modules/master-admin/application/events"

export const dynamic = "force-dynamic"

function searchRecord(url: URL): Record<string, string | string[] | undefined> {
  const out: Record<string, string | string[] | undefined> = {}
  url.searchParams.forEach((value, key) => {
    out[key] = value
  })
  return out
}

function inrFromPaise(paise: number | null): string {
  if (paise == null) return ""
  return (paise / 100).toLocaleString("en-IN", { style: "currency", currency: "INR" })
}

export async function GET(req: NextRequest) {
  const gate = await guardMasterAdminApi(req)
  if (!gate.ok) return gate.response

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: "Server misconfigured" },
      { status: 500, headers: MASTER_ADMIN_JSON_HEADERS }
    )
  }

  const url = new URL(req.url)
  const range = resolveMasterAdminDateRange(searchRecord(url))

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user?.id) {
    void logIamAudit(req, {
      actorUserId: user.id,
      orgId: null,
      action: "platform.export.payments",
      targetType: "master-admin",
      targetId: "payments",
      metadata: { preset: range.preset, from: range.fromIso, to: range.toIso },
    }).catch(() => {})
    void logSecurityEvent(req, {
      eventType: "admin.export.payments",
      severity: "medium",
      outcome: "success",
      actorUserId: user.id,
      metadata: { preset: range.preset, from: range.fromIso, to: range.toIso },
    }).catch(() => {})
  }

  const adminSupabase = createAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  try {
    const [subscriptionRows, pdfRows] = await Promise.all([
      fetchRazorpayPaymentsExport(adminSupabase, range.fromIso, range.toIso),
      fetchPdfExportPurchasesExport(adminSupabase, range.fromIso, range.toIso),
    ])
    const rows = [
      ...subscriptionRows.map((r) => ({
        created_at: r.created_at,
        source: "subscription",
        user_id: r.user_id,
        user_email: r.user_email,
        amount_paise: r.amount,
        amount_inr: inrFromPaise(r.amount),
        plan: r.plan,
        billing_cycle: r.billing_cycle,
        project_id: "",
        project_title: "",
        consumed_at: "",
        razorpay_payment_id: r.razorpay_payment_id,
        razorpay_order_id: r.razorpay_order_id,
        ledger_id: r.id,
      })),
      ...pdfRows.map((r) => ({
        created_at: r.created_at,
        source: "pdf_clean_export",
        user_id: r.user_id,
        user_email: r.user_email,
        amount_paise: r.amount_paise,
        amount_inr: inrFromPaise(r.amount_paise),
        plan: "",
        billing_cycle: "",
        project_id: r.project_id,
        project_title: r.project_title ?? "",
        consumed_at: r.consumed_at ?? "",
        razorpay_payment_id: r.razorpay_payment_id,
        razorpay_order_id: r.razorpay_order_id,
        ledger_id: r.id,
      })),
    ]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, MASTER_ADMIN_EXPORT_MAX_ROWS)
    const body = formatCsv(
      [
        "created_at",
        "source",
        "user_id",
        "user_email",
        "amount_paise",
        "amount_inr",
        "plan",
        "billing_cycle",
        "project_id",
        "project_title",
        "consumed_at",
        "razorpay_payment_id",
        "razorpay_order_id",
        "ledger_id",
      ],
      rows.map((r) => [
        r.created_at,
        r.source,
        r.user_id,
        r.user_email,
        r.amount_paise,
        r.amount_inr,
        r.plan,
        r.billing_cycle,
        r.project_id,
        r.project_title,
        r.consumed_at,
        r.razorpay_payment_id,
        r.razorpay_order_id,
        r.ledger_id,
      ])
    )

    const day = new Date().toISOString().slice(0, 10)
    return new NextResponse(body, {
      status: 200,
      headers: {
        ...MASTER_ADMIN_CSV_HEADERS,
        "Content-Disposition": `attachment; filename="master-admin-payments-${day}.csv"`,
        "X-Export-Row-Count": String(rows.length),
        "X-Export-Row-Cap": String(MASTER_ADMIN_EXPORT_MAX_ROWS),
      },
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Export failed"
    return NextResponse.json({ error: message }, { status: 500, headers: MASTER_ADMIN_JSON_HEADERS })
  }
}

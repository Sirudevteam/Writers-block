import { NextRequest, NextResponse } from "next/server"
import { guardOrgApi, IAM_JSON_HEADERS } from "@/modules/iam/application/api-guard"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const gate = await guardOrgApi(req, "billing:read")
  if (!gate.ok) return gate.response

  const [subscription, customer, ledger, invoices, refunds] = await Promise.all([
    gate.supabase.from("subscriptions").select("*").eq("user_id", gate.userId).maybeSingle(),
    (gate.supabase.from("billing_customers") as any).select("*").eq("org_id", gate.orgId).maybeSingle(),
    (gate.supabase.from("billing_subscription_ledger") as any)
      .select("*")
      .or(`user_id.eq.${gate.userId},org_id.eq.${gate.orgId}`)
      .order("created_at", { ascending: false })
      .limit(100),
    (gate.supabase.from("billing_invoices") as any)
      .select("*")
      .or(`user_id.eq.${gate.userId},org_id.eq.${gate.orgId}`)
      .order("created_at", { ascending: false })
      .limit(100),
    (gate.supabase.from("billing_refunds") as any)
      .select("*")
      .or(`user_id.eq.${gate.userId},org_id.eq.${gate.orgId}`)
      .order("created_at", { ascending: false })
      .limit(100),
  ])

  const error = subscription.error ?? customer.error ?? ledger.error ?? invoices.error ?? refunds.error
  if (error) {
    return NextResponse.json({ error: "Failed to load billing history" }, { status: 500, headers: IAM_JSON_HEADERS })
  }

  return NextResponse.json(
    {
      ok: true,
      subscription: subscription.data ?? null,
      customer: customer.data ?? null,
      ledger: ledger.data ?? [],
      invoices: invoices.data ?? [],
      refunds: refunds.data ?? [],
    },
    { headers: IAM_JSON_HEADERS }
  )
}

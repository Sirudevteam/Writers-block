import { NextRequest, NextResponse } from "next/server"
import { isAllowedRequestOrigin } from "@/modules/auth/security/request-origin"
import { guardOrgApi, IAM_JSON_HEADERS } from "@/modules/iam/application/api-guard"
import {
  createRazorpayClient,
  getRazorpaySubscriptionPlanId,
  recordBillingLedger,
  type PaidPlan,
} from "@/modules/billing/application/razorpay-subscriptions"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  if (!isAllowedRequestOrigin((name) => req.headers.get(name))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: IAM_JSON_HEADERS })
  }
  const gate = await guardOrgApi(req, "billing:manage")
  if (!gate.ok) return gate.response

  const { data: current, error } = await gate.supabase
    .from("subscriptions")
    .select("*")
    .eq("user_id", gate.userId)
    .maybeSingle()

  if (error) return NextResponse.json({ error: "Failed to load subscription" }, { status: 500, headers: IAM_JSON_HEADERS })
  if (!current || current.plan === "free") {
    return NextResponse.json({ error: "No paid subscription is available to reactivate" }, { status: 404, headers: IAM_JSON_HEADERS })
  }

  try {
    const { data: customer } = await (gate.supabase.from("billing_customers") as any)
      .select("razorpay_customer_id")
      .eq("org_id", gate.orgId)
      .maybeSingle()

    if (!customer?.razorpay_customer_id) {
      return NextResponse.json({ error: "Billing customer is missing. Start checkout again." }, { status: 409, headers: IAM_JSON_HEADERS })
    }

    const planId = getRazorpaySubscriptionPlanId(current.plan as PaidPlan, current.billing_cycle)
    const razorpay = createRazorpayClient()
    const subscription = await (razorpay as any).subscriptions.create({
      plan_id: planId,
      customer_id: customer.razorpay_customer_id,
      total_count: current.billing_cycle === "annual" ? 10 : 120,
      customer_notify: 1,
      notes: {
        purpose: "subscription",
        user_id: gate.userId,
        org_id: gate.orgId,
        plan: current.plan,
        billing_cycle: current.billing_cycle,
      },
    })

    await gate.supabase
      .from("subscriptions")
      .update({
        cancel_at_period_end: false,
        razorpay_subscription_id: subscription.id,
        last_webhook_event: "subscription.reactivate_requested",
      } as any)
      .eq("user_id", gate.userId)

    await recordBillingLedger(gate.supabase as any, {
      userId: gate.userId,
      orgId: gate.orgId,
      eventType: "subscription.reactivate_requested",
      plan: current.plan,
      billingCycle: current.billing_cycle,
      razorpaySubscriptionId: subscription.id,
      status: subscription.status,
      payload: subscription,
    })

    return NextResponse.json({ ok: true, subscriptionId: subscription.id, status: subscription.status, shortUrl: subscription.short_url ?? null }, { headers: IAM_JSON_HEADERS })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to reactivate subscription"
    return NextResponse.json({ error: message }, { status: 500, headers: IAM_JSON_HEADERS })
  }
}

import { NextRequest, NextResponse } from "next/server"
import { isAllowedRequestOrigin } from "@/modules/auth/security/request-origin"
import { guardOrgApi, IAM_JSON_HEADERS } from "@/modules/iam/application/api-guard"
import { createRazorpayClient, recordBillingLedger } from "@/modules/billing/application/razorpay-subscriptions"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  if (!isAllowedRequestOrigin((name) => req.headers.get(name))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: IAM_JSON_HEADERS })
  }
  const gate = await guardOrgApi(req, "billing:manage")
  if (!gate.ok) return gate.response

  const { data: subscription, error } = await gate.supabase
    .from("subscriptions")
    .select("*")
    .eq("user_id", gate.userId)
    .maybeSingle()

  if (error) return NextResponse.json({ error: "Failed to load subscription" }, { status: 500, headers: IAM_JSON_HEADERS })
  if (!subscription?.razorpay_subscription_id) {
    return NextResponse.json({ error: "No active Razorpay subscription found" }, { status: 404, headers: IAM_JSON_HEADERS })
  }

  try {
    const razorpay = createRazorpayClient()
    const result = await (razorpay as any).subscriptions.cancel(subscription.razorpay_subscription_id, {
      cancel_at_cycle_end: 1,
    })

    await gate.supabase
      .from("subscriptions")
      .update({
        cancel_at_period_end: true,
        last_webhook_event: "subscription.cancel_requested",
      } as any)
      .eq("user_id", gate.userId)

    await recordBillingLedger(gate.supabase as any, {
      userId: gate.userId,
      orgId: gate.orgId,
      eventType: "subscription.cancel_requested",
      plan: subscription.plan,
      billingCycle: subscription.billing_cycle,
      razorpaySubscriptionId: subscription.razorpay_subscription_id,
      status: result.status ?? subscription.status,
      payload: result,
    })

    return NextResponse.json({ ok: true, subscription: result }, { headers: IAM_JSON_HEADERS })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to cancel subscription"
    return NextResponse.json({ error: message }, { status: 500, headers: IAM_JSON_HEADERS })
  }
}

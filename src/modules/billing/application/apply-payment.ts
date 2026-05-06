import type { SupabaseClient } from "@supabase/supabase-js"
import type { BillingCycle, SubscriptionPlan } from "@/shared/types/project"

type ApplyPaymentResult =
  | { status: "applied"; currentPeriodEnd: string; plan: string; billingCycle: string }
  | { status: "duplicate" }
  | { status: "error"; message: string }

type RpcRow = {
  status: string
  current_period_end?: string
  plan?: string
  billing_cycle?: string
  message?: string
}

/**
 * Idempotent subscription grant: inserts ledger row + extends period in one DB transaction.
 * Call only after Razorpay + business rules pass; requires service-role Supabase client.
 */
export async function applyRazorpayPayment(
  admin: SupabaseClient,
  params: {
    userId: string
    paymentId: string
    orderId: string
    plan: Exclude<SubscriptionPlan, "free">
    billingCycle: BillingCycle
    amountPaise: number
  }
): Promise<ApplyPaymentResult> {
  const { data, error } = await admin.rpc("apply_subscription_payment", {
    p_user_id: params.userId,
    p_payment_id: params.paymentId,
    p_order_id: params.orderId,
    p_plan: params.plan,
    p_billing_cycle: params.billingCycle,
    p_amount: params.amountPaise,
  })

  if (error) {
    console.error("[applyRazorpayPayment] RPC error:", error.message)
    return { status: "error", message: error.message }
  }

  const row = data as RpcRow | null
  if (!row || typeof row.status !== "string") {
    return { status: "error", message: "invalid RPC response" }
  }

  if (row.status === "duplicate") {
    return { status: "duplicate" }
  }

  if (row.status === "error") {
    return { status: "error", message: row.message ?? "apply failed" }
  }

  if (row.status === "applied" && row.current_period_end) {
    return {
      status: "applied",
      currentPeriodEnd: row.current_period_end,
      plan: row.plan ?? params.plan,
      billingCycle: row.billing_cycle ?? params.billingCycle,
    }
  }

  return { status: "error", message: "unexpected apply result" }
}

import Razorpay from "razorpay"
import type { SupabaseClient } from "@supabase/supabase-js"
import { PLAN_LIMITS, type BillingCycle, type SubscriptionPlan } from "@/shared/types/project"

export type PaidPlan = Exclude<SubscriptionPlan, "free">
export type SubscriptionStatus = "active" | "trialing" | "past_due" | "cancelled" | "expired"

const PLAN_ID_ENV: Record<PaidPlan, Record<BillingCycle, string>> = {
  pro: {
    monthly: "RAZORPAY_PLAN_PRO_MONTHLY",
    annual: "RAZORPAY_PLAN_PRO_ANNUAL",
  },
  premium: {
    monthly: "RAZORPAY_PLAN_PREMIUM_MONTHLY",
    annual: "RAZORPAY_PLAN_PREMIUM_ANNUAL",
  },
}

export function getRazorpaySubscriptionPlanId(plan: PaidPlan, billingCycle: BillingCycle): string {
  const envName = PLAN_ID_ENV[plan][billingCycle]
  const planId = process.env[envName]?.trim()
  if (!planId) {
    throw new Error(`${envName} is not configured`)
  }
  return planId
}

export function createRazorpayClient(): Razorpay {
  const keyId = process.env.RAZORPAY_KEY_ID?.trim()
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim()
  if (!keyId || !keySecret) {
    throw new Error("Razorpay is not configured")
  }
  return new Razorpay({ key_id: keyId, key_secret: keySecret })
}

export function subscriptionPeriodEndFromEntity(entity: any): string | null {
  const end = entity?.current_end ?? entity?.charge_at ?? entity?.end_at
  return typeof end === "number" ? new Date(end * 1000).toISOString() : null
}

export function mapRazorpaySubscriptionStatus(eventName: string, entityStatus?: string | null): SubscriptionStatus {
  if (eventName === "subscription.cancelled") return "cancelled"
  if (eventName === "subscription.completed") return "expired"
  if (eventName === "subscription.halted" || eventName === "subscription.payment_failed") return "past_due"
  if (eventName === "subscription.authenticated") return "trialing"
  if (eventName === "subscription.activated" || eventName === "subscription.charged") return "active"
  if (entityStatus === "cancelled") return "cancelled"
  if (entityStatus === "completed" || entityStatus === "expired") return "expired"
  if (entityStatus === "halted" || entityStatus === "pending") return "past_due"
  return "active"
}

export function gracePeriodEndFromNow(now = new Date()): string {
  return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
}

export async function recordBillingLedger(
  supabase: SupabaseClient<any>,
  row: {
    userId: string | null
    orgId: string | null
    eventType: string
    plan?: string | null
    billingCycle?: string | null
    razorpaySubscriptionId?: string | null
    razorpayPaymentId?: string | null
    razorpayInvoiceId?: string | null
    amountPaise?: number | null
    status?: string | null
    payload?: unknown
  }
): Promise<void> {
  await supabase.from("billing_subscription_ledger").insert({
    user_id: row.userId,
    org_id: row.orgId,
    event_type: row.eventType.slice(0, 120),
    plan: row.plan ?? null,
    billing_cycle: row.billingCycle ?? null,
    razorpay_subscription_id: row.razorpaySubscriptionId ?? null,
    razorpay_payment_id: row.razorpayPaymentId ?? null,
    razorpay_invoice_id: row.razorpayInvoiceId ?? null,
    amount_paise: row.amountPaise ?? null,
    status: row.status ?? null,
    payload: (row.payload ?? {}) as any,
  } as any)
}

export async function upsertBillingInvoice(
  supabase: SupabaseClient<any>,
  params: {
    userId: string | null
    orgId: string | null
    invoice: any
    subscriptionId: string | null
    paymentId: string | null
  }
): Promise<void> {
  const invoiceId = params.invoice?.id
  if (!invoiceId) return
  await supabase.from("billing_invoices").upsert(
    {
      user_id: params.userId,
      org_id: params.orgId,
      razorpay_invoice_id: invoiceId,
      razorpay_subscription_id: params.subscriptionId,
      razorpay_payment_id: params.paymentId,
      amount_paise: Number(params.invoice?.amount ?? params.invoice?.amount_paid ?? 0),
      currency: params.invoice?.currency ?? "INR",
      status: params.invoice?.status ?? null,
      invoice_number: params.invoice?.invoice_number ?? null,
      invoice_url: params.invoice?.short_url ?? params.invoice?.invoice_url ?? null,
      issued_at: typeof params.invoice?.issued_at === "number" ? new Date(params.invoice.issued_at * 1000).toISOString() : null,
      payload: params.invoice,
    } as any,
    { onConflict: "razorpay_invoice_id" }
  )
}

export async function applyRazorpaySubscriptionWebhook(
  supabase: SupabaseClient<any>,
  eventName: string,
  payload: any
): Promise<{ applied: boolean; reason?: string }> {
  const subscription = payload?.payload?.subscription?.entity ?? payload?.subscription?.entity ?? payload?.subscription
  const payment = payload?.payload?.payment?.entity ?? payload?.payment?.entity ?? payload?.payment
  const invoice = payload?.payload?.invoice?.entity ?? payload?.invoice?.entity ?? payload?.invoice
  const subscriptionId = subscription?.id ?? payment?.subscription_id ?? invoice?.subscription_id
  if (!subscriptionId) {
    return { applied: false, reason: "missing_subscription_id" }
  }

  const notes = {
    ...(subscription?.notes ?? {}),
    ...(payment?.notes ?? {}),
    ...(invoice?.notes ?? {}),
  }
  const userId = typeof notes.user_id === "string" ? notes.user_id : null
  const orgId = typeof notes.org_id === "string" ? notes.org_id : null
  const plan = notes.plan === "premium" ? "premium" : notes.plan === "pro" ? "pro" : null
  const billingCycle = notes.billing_cycle === "annual" ? "annual" : "monthly"
  if (!userId || !plan) {
    return { applied: false, reason: "missing_notes" }
  }

  const mappedStatus = mapRazorpaySubscriptionStatus(eventName, subscription?.status)
  const periodEnd = subscriptionPeriodEndFromEntity(subscription)
  const graceEnd = mappedStatus === "past_due" ? gracePeriodEndFromNow() : null
  const paymentId = payment?.id ?? invoice?.payment_id ?? null
  const invoiceId = invoice?.id ?? payment?.invoice_id ?? null

  await supabase.from("subscriptions").upsert(
    {
      user_id: userId,
      plan,
      status: mappedStatus,
      projects_limit: PLAN_LIMITS[plan],
      current_period_start:
        typeof subscription?.current_start === "number"
          ? new Date(subscription.current_start * 1000).toISOString()
          : undefined,
      current_period_end: periodEnd ?? undefined,
      billing_cycle: billingCycle,
      razorpay_subscription_id: subscriptionId,
      razorpay_customer_id: subscription?.customer_id ?? payment?.customer_id ?? invoice?.customer_id ?? null,
      razorpay_payment_id: paymentId,
      grace_period_end: graceEnd,
      cancel_at_period_end: Boolean(subscription?.cancel_at_cycle_end),
      cancelled_at:
        mappedStatus === "cancelled" && typeof subscription?.ended_at === "number"
          ? new Date(subscription.ended_at * 1000).toISOString()
          : undefined,
      last_webhook_event: eventName,
      updated_at: new Date().toISOString(),
    } as any,
    { onConflict: "user_id" }
  )

  await recordBillingLedger(supabase, {
    userId,
    orgId,
    eventType: eventName,
    plan,
    billingCycle,
    razorpaySubscriptionId: subscriptionId,
    razorpayPaymentId: paymentId,
    razorpayInvoiceId: invoiceId,
    amountPaise: Number(payment?.amount ?? invoice?.amount_paid ?? invoice?.amount ?? 0),
    status: mappedStatus,
    payload,
  })

  await upsertBillingInvoice(supabase, {
    userId,
    orgId,
    invoice,
    subscriptionId,
    paymentId,
  })

  return { applied: true }
}

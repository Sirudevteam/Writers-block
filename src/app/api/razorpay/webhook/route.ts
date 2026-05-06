/**
 * Razorpay Webhook Handler
 *
 * Handles server-side payment confirmation from Razorpay.
 * Fetches the order for authoritative notes + amount; applies payment via atomic RPC.
 *
 * Setup in Razorpay Dashboard → Settings → Webhooks:
 *   URL: https://yourdomain.com/api/razorpay/webhook
 *   Events: payment.captured and subscription.*
 *   Secret: set RAZORPAY_WEBHOOK_SECRET in your environment
 */

import { NextRequest, NextResponse } from "next/server"
import Razorpay from "razorpay"
import { createClient } from "@supabase/supabase-js"
import { applyAiCreditTopupPayment } from "@/modules/billing/application/apply-ai-credit-topup"
import { applyRazorpayPayment } from "@/modules/billing/application/apply-payment"
import { invalidateSubscriptionPlanCache } from "@/modules/billing/infrastructure/subscription-plan-cache"
import { logBusinessEvent, logSecurityEvent } from "@/modules/master-admin/application/events"
import {
  AI_CREDIT_TOPUP_PURPOSE,
  PDF_CLEAN_EXPORT_PURPOSE,
} from "@/modules/billing/domain/razorpay-pricing"
import {
  expectedAmountForAiCreditTopup,
  expectedAmountForPdfCleanExport,
  expectedAmountForSubscription,
  getRazorpayOrderNotes,
  validateAiCreditTopupOrderNotes,
  validatePdfExportOrderNotes,
  validateRazorpayPaymentConsistency,
  validateSubscriptionOrderNotes,
  verifyRazorpayWebhookSignature,
} from "@/modules/billing/security/razorpay-security"
import {
  enqueueRazorpayPostPaymentJob,
  isProductionRuntime,
} from "@/modules/billing/application/post-payment-job"
import { applyRazorpaySubscriptionWebhook } from "@/modules/billing/application/razorpay-subscriptions"
import type { BillingCycle, SubscriptionPlan } from "@/shared/types/project"
import type { Database } from "@/infrastructure/db/types/database"

const WEBHOOK_MAX_FUTURE_SKEW_SECONDS = 5 * 60
const WEBHOOK_MAX_EVENT_AGE_SECONDS = 7 * 24 * 60 * 60

function getAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function logWebhookFailure(
  req: NextRequest,
  params: {
    reason: string
    userId?: string | null
    orderId?: string
    paymentId?: string
    statusCode?: number
    severity?: "low" | "medium" | "high" | "critical"
    outcome?: "failure" | "blocked"
    metadata?: Record<string, unknown>
  }
) {
  void logSecurityEvent(req, {
    eventType: "payment.webhook_failure",
    severity: params.severity ?? "high",
    outcome: params.outcome ?? "failure",
    targetUserId: params.userId ?? null,
    statusCode: params.statusCode ?? 400,
    metadata: {
      reason: params.reason,
      orderId: params.orderId,
      paymentId: params.paymentId,
      ...(params.metadata ?? {}),
    },
  }).catch(() => {})
}

async function enqueuePostPaymentJobOrError(
  req: NextRequest,
  payload: {
    razorpayPaymentId: string
    razorpayOrderId: string
    userId: string
    plan: Exclude<SubscriptionPlan, "free">
    billingCycle: BillingCycle
    amountPaise: number
    currentPeriodEnd: string
  }
): Promise<NextResponse | null> {
  try {
    const queued = await enqueueRazorpayPostPaymentJob(payload)
    if (queued.ok) return null

    console.error("[webhook] QStash enqueue skipped:", queued.reason)
    void logSecurityEvent(req, {
      eventType: "payment.webhook_failure",
      severity: "high",
      outcome: "failure",
      targetUserId: payload.userId,
      statusCode: 500,
      metadata: {
        reason: "post_payment_queue_unavailable",
        detail: queued.reason,
        orderId: payload.razorpayOrderId,
        paymentId: payload.razorpayPaymentId,
      },
    }).catch(() => {})

    if (isProductionRuntime()) {
      return NextResponse.json({ error: "Post-payment queue unavailable" }, { status: 500 })
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "QStash enqueue failed"
    console.error("[webhook] QStash enqueue failed:", message)
    void logSecurityEvent(req, {
      eventType: "payment.webhook_failure",
      severity: "high",
      outcome: "failure",
      targetUserId: payload.userId,
      statusCode: 500,
      metadata: {
        reason: "post_payment_queue_failed",
        message,
        orderId: payload.razorpayOrderId,
        paymentId: payload.razorpayPaymentId,
      },
    }).catch(() => {})

    if (isProductionRuntime()) {
      return NextResponse.json({ error: "Post-payment queue failed" }, { status: 500 })
    }
  }

  return null
}

async function handlePdfCleanExportWebhook(
  req: NextRequest,
  supabaseAdmin: ReturnType<typeof getAdminClient>,
  params: {
    notes: Record<string, string>
    order: { amount?: number }
    razorpayPaymentId: string
    razorpayOrderId: string
    paymentAmount: number
    paymentStatus: string
  }
): Promise<NextResponse> {
  const pdfNotes = validatePdfExportOrderNotes(params.notes)
  if (!pdfNotes) {
    console.error("[webhook] Missing PDF export metadata in order notes:", params.notes)
    logWebhookFailure(req, {
      reason: "missing_pdf_export_metadata",
      orderId: params.razorpayOrderId,
      paymentId: params.razorpayPaymentId,
      severity: "medium",
    })
    return NextResponse.json({ received: true, error: "Missing PDF export metadata" })
  }

  const paymentCheck = validateRazorpayPaymentConsistency({
    orderId: params.razorpayOrderId,
    order: params.order,
    payment: {
      id: params.razorpayPaymentId,
      order_id: params.razorpayOrderId,
      status: params.paymentStatus,
      amount: params.paymentAmount,
    },
    expectedAmountPaise: expectedAmountForPdfCleanExport(),
  })
  if (!paymentCheck.ok) {
    console.error("[webhook] Clean PDF export payment validation failed:", paymentCheck.reason)
    logWebhookFailure(req, {
      reason: paymentCheck.reason,
      userId: pdfNotes.userId,
      orderId: params.razorpayOrderId,
      paymentId: params.razorpayPaymentId,
      metadata: {
        orderAmount: paymentCheck.orderAmount,
        paymentAmount: paymentCheck.paymentAmount,
        paymentStatus: paymentCheck.paymentStatus,
        purpose: PDF_CLEAN_EXPORT_PURPOSE,
      },
    })
    return NextResponse.json({ received: true, error: "Payment validation failed" })
  }

  const { data: project, error: projectError } = await supabaseAdmin
    .from("projects")
    .select("id")
    .eq("id", pdfNotes.projectId)
    .eq("org_id", pdfNotes.orgId)
    .maybeSingle()

  if (projectError) {
    console.error("[webhook] Clean PDF export project lookup failed:", projectError.message)
    logWebhookFailure(req, {
      reason: "project_lookup_failed",
      userId: pdfNotes.userId,
      orderId: params.razorpayOrderId,
      paymentId: params.razorpayPaymentId,
      statusCode: 500,
      metadata: { projectId: pdfNotes.projectId, orgId: pdfNotes.orgId },
    })
    return NextResponse.json({ error: "Project lookup failed" }, { status: 500 })
  }

  if (!project) {
    console.error("[webhook] Clean PDF export project mismatch:", {
      projectId: pdfNotes.projectId,
      orgId: pdfNotes.orgId,
    })
    logWebhookFailure(req, {
      reason: "project_mismatch",
      userId: pdfNotes.userId,
      orderId: params.razorpayOrderId,
      paymentId: params.razorpayPaymentId,
      metadata: { projectId: pdfNotes.projectId, orgId: pdfNotes.orgId },
    })
    return NextResponse.json({ received: true, error: "Project mismatch" })
  }

  const { data: existingPurchase } = await supabaseAdmin
    .from("pdf_export_purchases")
    .select("id")
    .eq("razorpay_payment_id", params.razorpayPaymentId)
    .maybeSingle()

  if (existingPurchase) {
    void logBusinessEvent(req, {
      eventType: "pdf_export.webhook_duplicate",
      userId: pdfNotes.userId,
      amountPaise: paymentCheck.amountPaise,
      metadata: {
        orderId: params.razorpayOrderId,
        paymentId: params.razorpayPaymentId,
        projectId: pdfNotes.projectId,
        orgId: pdfNotes.orgId,
      },
    }).catch(() => {})
    return NextResponse.json({ received: true, alreadyProcessed: true })
  }

  const { error: insertError } = await supabaseAdmin.from("pdf_export_purchases").insert({
    user_id: pdfNotes.userId,
    org_id: pdfNotes.orgId,
    project_id: pdfNotes.projectId,
    razorpay_payment_id: params.razorpayPaymentId,
    razorpay_order_id: params.razorpayOrderId,
    amount_paise: paymentCheck.amountPaise,
  })

  if (insertError) {
    if (insertError.code === "23505") {
      void logBusinessEvent(req, {
        eventType: "pdf_export.webhook_duplicate",
        userId: pdfNotes.userId,
        amountPaise: paymentCheck.amountPaise,
        metadata: {
          orderId: params.razorpayOrderId,
          paymentId: params.razorpayPaymentId,
          projectId: pdfNotes.projectId,
          orgId: pdfNotes.orgId,
        },
      }).catch(() => {})
      return NextResponse.json({ received: true, alreadyProcessed: true })
    }

    console.error("[webhook] Clean PDF export purchase insert failed:", insertError.message)
    logWebhookFailure(req, {
      reason: "pdf_export_purchase_insert_failed",
      userId: pdfNotes.userId,
      statusCode: 500,
      metadata: {
        orderId: params.razorpayOrderId,
        paymentId: params.razorpayPaymentId,
        projectId: pdfNotes.projectId,
        orgId: pdfNotes.orgId,
      },
    })
    return NextResponse.json({ error: "PDF export purchase insert failed" }, { status: 500 })
  }

  void logBusinessEvent(req, {
    eventType: "pdf_export.payment_applied",
    userId: pdfNotes.userId,
    amountPaise: paymentCheck.amountPaise,
    metadata: {
      orderId: params.razorpayOrderId,
      paymentId: params.razorpayPaymentId,
      projectId: pdfNotes.projectId,
      orgId: pdfNotes.orgId,
    },
  }).catch(() => {})

  return NextResponse.json({ received: true, success: true, purpose: PDF_CLEAN_EXPORT_PURPOSE })
}

async function handleAiCreditTopupWebhook(
  req: NextRequest,
  supabaseAdmin: ReturnType<typeof getAdminClient>,
  params: {
    notes: Record<string, string>
    order: { amount?: number }
    razorpayPaymentId: string
    razorpayOrderId: string
    paymentAmount: number
    paymentStatus: string
  }
): Promise<NextResponse> {
  const topupNotes = validateAiCreditTopupOrderNotes(params.notes)
  if (!topupNotes) {
    logWebhookFailure(req, {
      reason: "invalid_ai_credit_topup_metadata",
      orderId: params.razorpayOrderId,
      paymentId: params.razorpayPaymentId,
      severity: "medium",
    })
    return NextResponse.json({ received: true, error: "Missing AI credit top-up metadata" })
  }

  const paymentCheck = validateRazorpayPaymentConsistency({
    orderId: params.razorpayOrderId,
    order: params.order,
    payment: {
      id: params.razorpayPaymentId,
      order_id: params.razorpayOrderId,
      status: params.paymentStatus,
      amount: params.paymentAmount,
    },
    expectedAmountPaise: expectedAmountForAiCreditTopup(),
  })
  if (!paymentCheck.ok) {
    logWebhookFailure(req, {
      reason: paymentCheck.reason,
      userId: topupNotes.userId,
      orderId: params.razorpayOrderId,
      paymentId: params.razorpayPaymentId,
      metadata: {
        orderAmount: paymentCheck.orderAmount,
        paymentAmount: paymentCheck.paymentAmount,
        paymentStatus: paymentCheck.paymentStatus,
        purpose: AI_CREDIT_TOPUP_PURPOSE,
      },
    })
    return NextResponse.json({ received: true, error: "Payment validation failed" })
  }

  const applied = await applyAiCreditTopupPayment(supabaseAdmin, {
    userId: topupNotes.userId,
    paymentId: params.razorpayPaymentId,
    orderId: params.razorpayOrderId,
    amountPaise: paymentCheck.amountPaise,
    creditsGranted: topupNotes.credits,
  })

  if (applied.status === "error") {
    logWebhookFailure(req, {
      reason: "ai_credit_topup_apply_failed",
      userId: topupNotes.userId,
      orderId: params.razorpayOrderId,
      paymentId: params.razorpayPaymentId,
      statusCode: 500,
      metadata: { message: applied.message },
    })
    return NextResponse.json({ error: "AI credit top-up apply failed" }, { status: 500 })
  }

  void logBusinessEvent(req, {
    eventType: applied.status === "duplicate" ? "ai_credit_topup.webhook_duplicate" : "ai_credit_topup.payment_applied",
    userId: topupNotes.userId,
    amountPaise: paymentCheck.amountPaise,
    metadata: {
      orderId: params.razorpayOrderId,
      paymentId: params.razorpayPaymentId,
      purchaseId: applied.purchaseId,
      creditsGranted: applied.creditsGranted,
      creditsRemaining: applied.creditsRemaining,
    },
  }).catch(() => {})

  return NextResponse.json({
    received: true,
    success: applied.status === "applied",
    alreadyProcessed: applied.status === "duplicate",
    purpose: AI_CREDIT_TOPUP_PURPOSE,
  })
}

export async function POST(req: NextRequest) {
  const supabaseAdmin = getAdminClient()
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET
  if (!webhookSecret) {
    console.error("[webhook] RAZORPAY_WEBHOOK_SECRET not configured")
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 })
  }

  const rawBody = await req.text()
  const signature = req.headers.get("x-razorpay-signature")

  if (!signature) {
    logWebhookFailure(req, { reason: "missing_signature", statusCode: 400 })
    return NextResponse.json({ error: "Missing signature" }, { status: 400 })
  }

  const signatureValid = verifyRazorpayWebhookSignature({
    rawBody,
    signature,
    webhookSecret,
  })

  if (!signatureValid) {
    console.error("[webhook] Signature mismatch")
    logWebhookFailure(req, {
      reason: "invalid_signature",
      severity: "critical",
      outcome: "blocked",
      statusCode: 400,
    })
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
  }

  let event: Record<string, unknown>
  try {
    event = JSON.parse(rawBody)
  } catch {
    logWebhookFailure(req, { reason: "invalid_json", statusCode: 400, severity: "medium" })
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  // Razorpay documents `event.created_at` in the payload. Validate that
  // timestamp instead of relying on undocumented transport headers.
  const eventCreatedAt =
    typeof event.created_at === "number" ? event.created_at : Number(event.created_at)
  const nowSeconds = Math.floor(Date.now() / 1000)

  if (!Number.isFinite(eventCreatedAt)) {
    console.error("[webhook] Missing or invalid event.created_at")
    logWebhookFailure(req, { reason: "invalid_timestamp", statusCode: 400, severity: "medium" })
    return NextResponse.json({ error: "Invalid webhook timestamp" }, { status: 400 })
  }

  if (
    eventCreatedAt > nowSeconds + WEBHOOK_MAX_FUTURE_SKEW_SECONDS ||
    nowSeconds - eventCreatedAt > WEBHOOK_MAX_EVENT_AGE_SECONDS
  ) {
    console.error("[webhook] Stale event.created_at:", eventCreatedAt)
    logWebhookFailure(req, {
      reason: "stale_timestamp",
      statusCode: 400,
      severity: "medium",
      outcome: "blocked",
      metadata: { eventCreatedAt, nowSeconds },
    })
    return NextResponse.json({ error: "Stale webhook" }, { status: 400 })
  }

  const eventName = typeof event.event === "string" ? event.event : ""

  if (eventName.startsWith("subscription.")) {
    const applied = await applyRazorpaySubscriptionWebhook(supabaseAdmin as any, eventName, event)
    if (!applied.applied) {
      logWebhookFailure(req, {
        reason: applied.reason ?? "subscription_webhook_not_applied",
        statusCode: 400,
        severity: "medium",
        metadata: { eventName },
      })
      return NextResponse.json({ received: true, skipped: true, reason: applied.reason })
    }

    const subscription = (event.payload as any)?.subscription?.entity
    const payment = (event.payload as any)?.payment?.entity
    const invoice = (event.payload as any)?.invoice?.entity
    const userId =
      subscription?.notes?.user_id ??
      payment?.notes?.user_id ??
      invoice?.notes?.user_id ??
      null
    if (typeof userId === "string") {
      await invalidateSubscriptionPlanCache(userId).catch((err) => {
        console.error("[webhook] Subscription cache invalidation failed:", err)
      })
    }

    return NextResponse.json({ received: true, success: true, event: eventName })
  }

  if (eventName !== "payment.captured") {
    return NextResponse.json({ received: true, skipped: true })
  }

  const payment = (event.payload as { payment?: { entity?: Record<string, unknown> } })?.payment?.entity
  if (!payment || typeof payment.id !== "string" || typeof payment.order_id !== "string") {
    logWebhookFailure(req, { reason: "missing_payment_entity", statusCode: 400, severity: "medium" })
    return NextResponse.json({ error: "Missing payment entity" }, { status: 400 })
  }

  const razorpay_payment_id = payment.id
  const razorpay_order_id = payment.order_id
  const paymentAmount =
    typeof payment.amount === "number" ? payment.amount : Number(payment.amount)
  const paymentStatus = typeof payment.status === "string" ? payment.status : "captured"

  const keyId = process.env.RAZORPAY_KEY_ID
  const keySecret = process.env.RAZORPAY_KEY_SECRET
  if (!keyId || !keySecret) {
    console.error("[webhook] Razorpay keys not configured")
    logWebhookFailure(req, { reason: "razorpay_keys_missing", statusCode: 500 })
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 })
  }

  const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret })

  let order: { notes?: Record<string, string> | null; amount?: number }
  try {
    order = (await razorpay.orders.fetch(razorpay_order_id)) as typeof order
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "order fetch failed"
    console.error("[webhook] Razorpay order fetch error:", msg)
    logWebhookFailure(req, {
      reason: "order_fetch_failed",
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      statusCode: 500,
      metadata: { message: msg },
    })
    return NextResponse.json({ error: "Order fetch failed" }, { status: 500 })
  }

  const notes = getRazorpayOrderNotes(order)
  if (notes.purpose === PDF_CLEAN_EXPORT_PURPOSE) {
    return handlePdfCleanExportWebhook(req, supabaseAdmin, {
      notes,
      order,
      razorpayPaymentId: razorpay_payment_id,
      razorpayOrderId: razorpay_order_id,
      paymentAmount,
      paymentStatus,
    })
  }

  if (notes.purpose === AI_CREDIT_TOPUP_PURPOSE) {
    return handleAiCreditTopupWebhook(req, supabaseAdmin, {
      notes,
      order,
      razorpayPaymentId: razorpay_payment_id,
      razorpayOrderId: razorpay_order_id,
      paymentAmount,
      paymentStatus,
    })
  }

  const subscriptionNotes = validateSubscriptionOrderNotes(notes)
  if (!subscriptionNotes) {
    console.error("[webhook] Missing user_id or invalid plan in order notes:", notes)
    logWebhookFailure(req, {
      reason: "invalid_subscription_metadata",
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      severity: "medium",
      metadata: { plan: notes.plan ?? null, billingCycle: notes.billing_cycle ?? null },
    })
    return NextResponse.json({ received: true, error: "Missing metadata" })
  }

  const paymentCheck = validateRazorpayPaymentConsistency({
    orderId: razorpay_order_id,
    order,
    payment: {
      id: razorpay_payment_id,
      order_id: razorpay_order_id,
      status: paymentStatus,
      amount: paymentAmount,
    },
    expectedAmountPaise: expectedAmountForSubscription(subscriptionNotes.plan, subscriptionNotes.billingCycle),
  })
  if (!paymentCheck.ok) {
    console.error("[webhook] Subscription payment validation failed:", paymentCheck.reason)
    logWebhookFailure(req, {
      reason: paymentCheck.reason,
      userId: subscriptionNotes.userId,
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      metadata: {
        orderAmount: paymentCheck.orderAmount,
        paymentAmount: paymentCheck.paymentAmount,
        paymentStatus: paymentCheck.paymentStatus,
        plan: subscriptionNotes.plan,
        billingCycle: subscriptionNotes.billingCycle,
      },
    })
    return NextResponse.json({ received: true, error: "Payment validation failed" })
  }

  const applied = await applyRazorpayPayment(supabaseAdmin, {
    userId: subscriptionNotes.userId,
    paymentId: razorpay_payment_id,
    orderId: razorpay_order_id,
    plan: subscriptionNotes.plan,
    billingCycle: subscriptionNotes.billingCycle,
    amountPaise: paymentCheck.amountPaise,
  })

  if (applied.status === "error") {
    console.error("[webhook] apply_subscription_payment failed:", applied.message)
    void logSecurityEvent(req, {
      eventType: "payment.webhook_failure",
      severity: "high",
      outcome: "failure",
      targetUserId: subscriptionNotes.userId,
      statusCode: 500,
      metadata: { reason: "database_apply_failed", orderId: razorpay_order_id, paymentId: razorpay_payment_id },
    }).catch(() => {})
    return NextResponse.json({ error: "Database apply failed" }, { status: 500 })
  }

  if (applied.status === "duplicate") {
    console.log("[webhook] Payment already processed:", razorpay_payment_id)
    const { data: existingSubscription } = await supabaseAdmin
      .from("subscriptions")
      .select("current_period_end")
      .eq("user_id", subscriptionNotes.userId)
      .maybeSingle()

    if (existingSubscription?.current_period_end) {
      const queueError = await enqueuePostPaymentJobOrError(req, {
        razorpayPaymentId: razorpay_payment_id,
        razorpayOrderId: razorpay_order_id,
        userId: subscriptionNotes.userId,
        plan: subscriptionNotes.plan,
        billingCycle: subscriptionNotes.billingCycle,
        amountPaise: paymentCheck.amountPaise,
        currentPeriodEnd: existingSubscription.current_period_end,
      })
      if (queueError) return queueError
    }

    void logBusinessEvent(req, {
      eventType: "payment.webhook_duplicate",
      userId: subscriptionNotes.userId,
      plan: subscriptionNotes.plan,
      billingCycle: subscriptionNotes.billingCycle,
      amountPaise: paymentCheck.amountPaise,
      metadata: { orderId: razorpay_order_id, paymentId: razorpay_payment_id },
    }).catch(() => {})
    return NextResponse.json({ received: true, alreadyProcessed: true })
  }

  await invalidateSubscriptionPlanCache(String(subscriptionNotes.userId)).catch((err) => {
    console.error("[webhook] Subscription cache invalidation failed:", err)
  })

  const queueError = await enqueuePostPaymentJobOrError(req, {
    razorpayPaymentId: razorpay_payment_id,
    razorpayOrderId: razorpay_order_id,
    userId: subscriptionNotes.userId,
    plan: subscriptionNotes.plan,
    billingCycle: subscriptionNotes.billingCycle,
    amountPaise: paymentCheck.amountPaise,
    currentPeriodEnd: applied.currentPeriodEnd,
  })
  if (queueError) return queueError

  console.log(
    `[webhook] Subscription activated: user=${subscriptionNotes.userId} plan=${subscriptionNotes.plan} cycle=${subscriptionNotes.billingCycle}`
  )
  return NextResponse.json({ received: true, success: true })
}

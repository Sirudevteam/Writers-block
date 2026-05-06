import { NextRequest, NextResponse } from "next/server"
import Razorpay from "razorpay"
import { createClient as createAdminClient } from "@supabase/supabase-js"
import { createClient } from "@/infrastructure/db/supabase/server"
import { apiIpLimitOr429, paymentVerifyLimitOr429 } from "@/core/security/api-ip-limit"
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
  resolveRazorpayPurpose,
  validateAiCreditTopupOrderNotes,
  validatePdfExportOrderNotes,
  validateRazorpayPaymentConsistency,
  validateSubscriptionOrderNotes,
  verifyRazorpayCheckoutSignature,
} from "@/modules/billing/security/razorpay-security"
import type { Database } from "@/infrastructure/db/types/database"
import { z } from "zod"

function getAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createAdminClient<Database>(url, key)
}

const PAYMENT_HEADERS = { "Cache-Control": "private, no-store, max-age=0" } as const

const bodySchema = z.object({
  razorpay_order_id: z.string().min(1).max(120),
  razorpay_payment_id: z.string().min(1).max(120),
  razorpay_signature: z.string().min(1).max(200),
  amount: z.number().int().nonnegative().optional(),
})

function logVerifyFailure(
  req: NextRequest,
  params: {
    userId: string
    reason: string
    orderId?: string
    paymentId?: string
    statusCode?: number
    severity?: "low" | "medium" | "high" | "critical"
    outcome?: "failure" | "blocked"
    metadata?: Record<string, unknown>
  }
) {
  void logSecurityEvent(req, {
    eventType: "payment.verify_failure",
    severity: params.severity ?? "medium",
    outcome: params.outcome ?? "failure",
    actorUserId: params.userId,
    targetUserId: params.userId,
    statusCode: params.statusCode ?? 400,
    metadata: {
      reason: params.reason,
      orderId: params.orderId,
      paymentId: params.paymentId,
      ...(params.metadata ?? {}),
    },
  }).catch(() => {})
}

export async function POST(req: NextRequest) {
  const tooMany = await apiIpLimitOr429(req)
  if (tooMany) return tooMany

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: PAYMENT_HEADERS })
  }

  const paymentLimited = await paymentVerifyLimitOr429(req, user.id)
  if (paymentLimited) return paymentLimited

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400, headers: PAYMENT_HEADERS })
  }

  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400, headers: PAYMENT_HEADERS })
  }

  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = parsed.data

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return NextResponse.json(
      { error: "Missing payment verification fields" },
      { status: 400, headers: PAYMENT_HEADERS }
    )
  }

  const keySecret = process.env.RAZORPAY_KEY_SECRET
  const keyId = process.env.RAZORPAY_KEY_ID
  if (!keySecret || !keyId) {
    return NextResponse.json({ error: "Razorpay not configured" }, { status: 500, headers: PAYMENT_HEADERS })
  }

  const admin = getAdminSupabase()
  if (!admin) {
    console.error("[verify] SUPABASE_SERVICE_ROLE_KEY not configured")
    return NextResponse.json({ error: "Server configuration error" }, { status: 500, headers: PAYMENT_HEADERS })
  }

  const signatureValid = verifyRazorpayCheckoutSignature({
    orderId: razorpay_order_id,
    paymentId: razorpay_payment_id,
    signature: razorpay_signature,
    keySecret,
  })

  if (!signatureValid) {
    logVerifyFailure(req, {
      userId: user.id,
      reason: "invalid_signature",
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      severity: "high",
    })
    return NextResponse.json(
      { error: "Payment verification failed - invalid signature" },
      { status: 400, headers: PAYMENT_HEADERS }
    )
  }

  const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret })

  let order: { notes?: Record<string, string> | null; amount?: number }
  let payment: { order_id?: string; status?: string; amount?: number }
  try {
    order = (await razorpay.orders.fetch(razorpay_order_id)) as typeof order
    payment = (await razorpay.payments.fetch(razorpay_payment_id)) as typeof payment
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Razorpay fetch failed"
    console.error("[verify] Razorpay fetch error:", msg)
    void logSecurityEvent(req, {
      eventType: "payment.verify_failure",
      severity: "medium",
      outcome: "failure",
      actorUserId: user.id,
      targetUserId: user.id,
      statusCode: 502,
      metadata: { reason: "razorpay_fetch_failed", orderId: razorpay_order_id, paymentId: razorpay_payment_id },
    }).catch(() => {})
    return NextResponse.json(
      { error: "Could not verify order with Razorpay" },
      { status: 502, headers: PAYMENT_HEADERS }
    )
  }

  const notes = getRazorpayOrderNotes(order)
  if (notes.user_id !== user.id) {
    logVerifyFailure(req, {
      userId: user.id,
      reason: "order_user_mismatch",
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      statusCode: 403,
      severity: "high",
      outcome: "blocked",
      metadata: { orderUserId: notes.user_id ?? null },
    })
    return NextResponse.json(
      { error: "Order does not belong to this account" },
      { status: 403, headers: PAYMENT_HEADERS }
    )
  }

  const purpose = resolveRazorpayPurpose(notes)

  if (purpose === PDF_CLEAN_EXPORT_PURPOSE) {
    const pdfNotes = validatePdfExportOrderNotes(notes)
    if (!pdfNotes) {
      logVerifyFailure(req, {
        userId: user.id,
        reason: "missing_pdf_export_metadata",
        orderId: razorpay_order_id,
        paymentId: razorpay_payment_id,
      })
      return NextResponse.json(
        { error: "Invalid or missing PDF export metadata" },
        { status: 400, headers: PAYMENT_HEADERS }
      )
    }

    const paymentCheck = validateRazorpayPaymentConsistency({
      orderId: razorpay_order_id,
      order,
      payment,
      expectedAmountPaise: expectedAmountForPdfCleanExport(),
    })
    if (!paymentCheck.ok) {
      logVerifyFailure(req, {
        userId: user.id,
        reason: paymentCheck.reason,
        orderId: razorpay_order_id,
        paymentId: razorpay_payment_id,
        metadata: {
          orderAmount: paymentCheck.orderAmount,
          paymentAmount: paymentCheck.paymentAmount,
          paymentStatus: paymentCheck.paymentStatus,
          purpose,
        },
      })
      return NextResponse.json(
        { error: "Payment does not match this clean PDF export order" },
        { status: 400, headers: PAYMENT_HEADERS }
      )
    }

    const { data: project } = await admin
      .from("projects")
      .select("id")
      .eq("id", pdfNotes.projectId)
      .eq("org_id", pdfNotes.orgId)
      .maybeSingle()

    if (!project) {
      logVerifyFailure(req, {
        userId: user.id,
        reason: "project_mismatch",
        orderId: razorpay_order_id,
        paymentId: razorpay_payment_id,
        metadata: { projectId: pdfNotes.projectId, orgId: pdfNotes.orgId },
      })
      return NextResponse.json(
        { error: "Project does not match this order" },
        { status: 400, headers: PAYMENT_HEADERS }
      )
    }

    const { data: purchase } = await admin
      .from("pdf_export_purchases")
      .select("*")
      .eq("razorpay_payment_id", razorpay_payment_id)
      .eq("user_id", user.id)
      .eq("org_id", pdfNotes.orgId)
      .eq("project_id", pdfNotes.projectId)
      .maybeSingle()

    const appliedByWebhook = Boolean(purchase)

    void logBusinessEvent(req, {
      eventType: "pdf_export.verified",
      userId: user.id,
      amountPaise: paymentCheck.amountPaise,
      outcome: appliedByWebhook ? "success" : "pending",
      metadata: {
        orderId: razorpay_order_id,
        paymentId: razorpay_payment_id,
        projectId: pdfNotes.projectId,
        orgId: pdfNotes.orgId,
        appliedByWebhook,
      },
    }).catch(() => {})

    return NextResponse.json(
      {
        success: true,
        applied: appliedByWebhook,
        pendingWebhook: !appliedByWebhook,
        paymentId: razorpay_payment_id,
        purpose,
        projectId: pdfNotes.projectId,
        purchase: appliedByWebhook ? purchase : null,
      },
      { headers: PAYMENT_HEADERS }
    )
  }

  if (purpose === AI_CREDIT_TOPUP_PURPOSE) {
    const topupNotes = validateAiCreditTopupOrderNotes(notes)
    if (!topupNotes) {
      logVerifyFailure(req, {
        userId: user.id,
        reason: "invalid_ai_credit_topup_metadata",
        orderId: razorpay_order_id,
        paymentId: razorpay_payment_id,
      })
      return NextResponse.json(
        { error: "Invalid or missing AI credit top-up metadata" },
        { status: 400, headers: PAYMENT_HEADERS }
      )
    }

    const paymentCheck = validateRazorpayPaymentConsistency({
      orderId: razorpay_order_id,
      order,
      payment,
      expectedAmountPaise: expectedAmountForAiCreditTopup(),
    })
    if (!paymentCheck.ok) {
      logVerifyFailure(req, {
        userId: user.id,
        reason: paymentCheck.reason,
        orderId: razorpay_order_id,
        paymentId: razorpay_payment_id,
        metadata: {
          orderAmount: paymentCheck.orderAmount,
          paymentAmount: paymentCheck.paymentAmount,
          paymentStatus: paymentCheck.paymentStatus,
          purpose,
        },
      })
      return NextResponse.json(
        { error: "Payment does not match this AI credit top-up order" },
        { status: 400, headers: PAYMENT_HEADERS }
      )
    }

    const { data: purchase } = await (admin as any)
      .from("ai_credit_topup_purchases")
      .select("*")
      .eq("razorpay_payment_id", razorpay_payment_id)
      .eq("user_id", user.id)
      .maybeSingle()

    const appliedByWebhook = Boolean(purchase)

    void logBusinessEvent(req, {
      eventType: "ai_credit_topup.verified",
      userId: user.id,
      amountPaise: paymentCheck.amountPaise,
      outcome: appliedByWebhook ? "success" : "pending",
      metadata: {
        orderId: razorpay_order_id,
        paymentId: razorpay_payment_id,
        credits: topupNotes.credits,
        appliedByWebhook,
      },
    }).catch(() => {})

    return NextResponse.json(
      {
        success: true,
        applied: appliedByWebhook,
        pendingWebhook: !appliedByWebhook,
        paymentId: razorpay_payment_id,
        purpose,
        pack: topupNotes.pack,
        credits: topupNotes.credits,
        purchase: appliedByWebhook ? purchase : null,
      },
      { headers: PAYMENT_HEADERS }
    )
  }

  const subscriptionNotes = validateSubscriptionOrderNotes(notes)
  if (!subscriptionNotes) {
    logVerifyFailure(req, {
      userId: user.id,
      reason: "invalid_subscription_metadata",
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      metadata: { plan: notes.plan ?? null, billingCycle: notes.billing_cycle ?? null },
    })
    return NextResponse.json(
      { error: "Invalid or missing plan on order" },
      { status: 400, headers: PAYMENT_HEADERS }
    )
  }

  const paymentCheck = validateRazorpayPaymentConsistency({
    orderId: razorpay_order_id,
    order,
    payment,
    expectedAmountPaise: expectedAmountForSubscription(subscriptionNotes.plan, subscriptionNotes.billingCycle),
  })
  if (!paymentCheck.ok) {
    logVerifyFailure(req, {
      userId: user.id,
      reason: paymentCheck.reason,
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      metadata: {
        orderAmount: paymentCheck.orderAmount,
        paymentAmount: paymentCheck.paymentAmount,
        paymentStatus: paymentCheck.paymentStatus,
        purpose,
        plan: subscriptionNotes.plan,
        billingCycle: subscriptionNotes.billingCycle,
      },
    })
    return NextResponse.json(
      { error: "Payment does not match this subscription order" },
      { status: 400, headers: PAYMENT_HEADERS }
    )
  }

  const { data: subscription } = await admin
    .from("subscriptions")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle()

  const appliedByWebhook = subscription?.razorpay_payment_id === razorpay_payment_id

  void logBusinessEvent(req, {
    eventType: "payment.verified",
    userId: user.id,
    plan: subscriptionNotes.plan,
    billingCycle: subscriptionNotes.billingCycle,
    amountPaise: paymentCheck.amountPaise,
    outcome: appliedByWebhook ? "success" : "pending",
    metadata: { orderId: razorpay_order_id, paymentId: razorpay_payment_id, appliedByWebhook },
  }).catch(() => {})

  return NextResponse.json(
    {
      success: true,
      applied: appliedByWebhook,
      pendingWebhook: !appliedByWebhook,
      paymentId: razorpay_payment_id,
      plan: subscriptionNotes.plan,
      billingCycle: subscriptionNotes.billingCycle,
      subscription: appliedByWebhook ? subscription : null,
    },
    { headers: PAYMENT_HEADERS }
  )
}

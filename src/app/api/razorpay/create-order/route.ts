import { NextRequest, NextResponse } from "next/server"
import Razorpay from "razorpay"
import { createClient } from "@/infrastructure/db/supabase/server"
import { apiIpLimitOr429, paymentOrderLimitOr429 } from "@/core/security/api-ip-limit"
import { guardOrgApi } from "@/modules/iam/application/api-guard"
import { logBusinessEvent, logSecurityEvent } from "@/modules/master-admin/application/events"
import {
  AI_CREDIT_TOPUP_CREDITS,
  AI_CREDIT_TOPUP_PURPOSE,
  PDF_CLEAN_EXPORT_PURPOSE,
  getAiCreditTopupPricePaise,
  getPdfCleanExportAmountPaise,
  getRazorpayOrderAmountPaise,
} from "@/modules/billing/domain/razorpay-pricing"
import { getEffectivePlanForApiUser } from "@/modules/ai/application/effective-plan"
import type { BillingCycle, SubscriptionPlan } from "@/shared/types/project"
import { z } from "zod"

const PLAN_NAMES: Record<Exclude<SubscriptionPlan, "free">, Record<BillingCycle, string>> = {
  pro: {
    monthly: "Pro Plan (Monthly)",
    annual: "Pro Plan (Annual)",
  },
  premium: {
    monthly: "Premium Plan (Monthly)",
    annual: "Premium Plan (Annual)",
  },
}

const PAYMENT_HEADERS = { "Cache-Control": "private, no-store, max-age=0" } as const

const subscriptionOrderSchema = z
  .object({
    purpose: z.literal("subscription").optional(),
    plan: z.enum(["pro", "premium"]),
    billingCycle: z.enum(["monthly", "annual"]).optional(),
  })
  .strict()

const pdfExportOrderSchema = z
  .object({
    purpose: z.literal(PDF_CLEAN_EXPORT_PURPOSE),
    projectId: z.string().uuid(),
  })
  .strict()

const aiCreditTopupOrderSchema = z
  .object({
    purpose: z.literal(AI_CREDIT_TOPUP_PURPOSE),
    pack: z.literal("100k"),
  })
  .strict()

const bodySchema = z.union([pdfExportOrderSchema, aiCreditTopupOrderSchema, subscriptionOrderSchema])

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

  const paymentLimited = await paymentOrderLimitOr429(req, user.id)
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

  const keyId = process.env.RAZORPAY_KEY_ID
  const keySecret = process.env.RAZORPAY_KEY_SECRET

  if (!keyId || !keySecret) {
    void logSecurityEvent(req, {
      eventType: "payment.order_create_failure",
      severity: "high",
      outcome: "failure",
      actorUserId: user.id,
      targetUserId: user.id,
      statusCode: 500,
      metadata: { reason: "razorpay_not_configured" },
    }).catch(() => {})
    return NextResponse.json({ error: "Razorpay not configured" }, { status: 500, headers: PAYMENT_HEADERS })
  }

  const body = parsed.data
  const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret })

  if (body.purpose === AI_CREDIT_TOPUP_PURPOSE) {
    const effectivePlan = await getEffectivePlanForApiUser(supabase, user.id)
    if (effectivePlan === "free") {
      return NextResponse.json(
        { error: "AI credit top-ups are available on Pro and Premium. Upgrade to continue after Free credits." },
        { status: 402, headers: PAYMENT_HEADERS }
      )
    }

    const amount = getAiCreditTopupPricePaise()
    const order = await razorpay.orders.create({
      amount,
      currency: "INR",
      receipt: `ai_credits_${user.id.slice(0, 8)}_${Date.now()}`,
      notes: {
        user_id: user.id,
        purpose: AI_CREDIT_TOPUP_PURPOSE,
        pack: "100k",
        credits: String(AI_CREDIT_TOPUP_CREDITS),
      },
    })

    void logBusinessEvent(req, {
      eventType: "ai_credit_topup.order_created",
      userId: user.id,
      plan: effectivePlan,
      amountPaise: typeof order.amount === "number" ? order.amount : amount,
      metadata: { orderId: order.id, credits: AI_CREDIT_TOPUP_CREDITS },
    }).catch(() => {})

    return NextResponse.json(
      {
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        keyId,
        purpose: AI_CREDIT_TOPUP_PURPOSE,
        pack: "100k",
        credits: AI_CREDIT_TOPUP_CREDITS,
        planName: "100K AI Credits",
      },
      { headers: PAYMENT_HEADERS }
    )
  }

  if (body.purpose === PDF_CLEAN_EXPORT_PURPOSE) {
    const gate = await guardOrgApi(req, "project:read")
    if (!gate.ok) return gate.response

    const { data: project, error: projectError } = await gate.supabase
      .from("projects")
      .select("id, title, org_id")
      .eq("id", body.projectId)
      .eq("org_id", gate.orgId)
      .maybeSingle()

    if (projectError) {
      return NextResponse.json({ error: projectError.message }, { status: 500, headers: PAYMENT_HEADERS })
    }

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404, headers: PAYMENT_HEADERS })
    }

    const amount = getPdfCleanExportAmountPaise()
    const order = await razorpay.orders.create({
      amount,
      currency: "INR",
      receipt: `pdf_${body.projectId.slice(0, 8)}_${user.id.slice(0, 8)}_${Date.now()}`,
      notes: {
        user_id: user.id,
        purpose: PDF_CLEAN_EXPORT_PURPOSE,
        project_id: body.projectId,
        org_id: gate.orgId,
      },
    })

    void logBusinessEvent(req, {
      eventType: "pdf_export.order_created",
      userId: user.id,
      amountPaise: typeof order.amount === "number" ? order.amount : amount,
      metadata: { orderId: order.id, projectId: body.projectId, orgId: gate.orgId },
    }).catch(() => {})

    return NextResponse.json(
      {
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        keyId,
        purpose: PDF_CLEAN_EXPORT_PURPOSE,
        projectId: body.projectId,
        planName: "Clean PDF Export",
      },
      { headers: PAYMENT_HEADERS }
    )
  }

  const plan = body.plan
  const billingCycle: BillingCycle = body.billingCycle === "annual" ? "annual" : "monthly"

  if (plan !== "pro" && plan !== "premium") {
    return NextResponse.json(
      { error: "Invalid plan. Choose pro or premium." },
      { status: 400, headers: PAYMENT_HEADERS }
    )
  }

  const paidPlan = plan as Exclude<SubscriptionPlan, "free">
  const amount = getRazorpayOrderAmountPaise(paidPlan, billingCycle)

  const order = await razorpay.orders.create({
    amount,
    currency: "INR",
    receipt: `plan_${plan}_${user.id.slice(0, 8)}_${Date.now()}`,
    notes: {
      user_id: user.id,
      plan,
      billing_cycle: billingCycle,
    },
  })

  void logBusinessEvent(req, {
    eventType: "payment.order_created",
    userId: user.id,
    plan,
    billingCycle,
    amountPaise: typeof order.amount === "number" ? order.amount : amount,
    metadata: { orderId: order.id },
  }).catch(() => {})

  return NextResponse.json(
    {
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId,
      plan,
      billingCycle,
      planName: PLAN_NAMES[paidPlan][billingCycle],
    },
    { headers: PAYMENT_HEADERS }
  )
}

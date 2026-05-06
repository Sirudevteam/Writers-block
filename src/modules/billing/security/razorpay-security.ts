import crypto from "crypto"
import {
  AI_CREDIT_TOPUP_CREDITS,
  AI_CREDIT_TOPUP_PURPOSE,
  PDF_CLEAN_EXPORT_PURPOSE,
  getAiCreditTopupPricePaise,
  getPdfCleanExportAmountPaise,
  getRazorpayOrderAmountPaise,
  isPaidPlan,
} from "@/modules/billing/domain/razorpay-pricing"
import type { BillingCycle, SubscriptionPlan } from "@/shared/types/project"

type RazorpayOrderLike = {
  id?: string
  amount?: unknown
  notes?: Record<string, string> | null
}

type RazorpayPaymentLike = {
  id?: string
  order_id?: string
  status?: string
  amount?: unknown
}

type RazorpayPurpose = "subscription" | typeof PDF_CLEAN_EXPORT_PURPOSE | typeof AI_CREDIT_TOPUP_PURPOSE

type RazorpayPaymentCheckFailure =
  | "payment_order_mismatch"
  | "payment_not_captured"
  | "invalid_amount"
  | "payment_amount_mismatch"
  | "expected_amount_mismatch"

type RazorpayPaymentCheckResult =
  | { ok: true; amountPaise: number }
  | {
      ok: false
      reason: RazorpayPaymentCheckFailure
      orderAmount: number | null
      paymentAmount: number | null
      paymentStatus?: string
    }

type PdfExportOrderNotes = {
  userId: string
  orgId: string
  projectId: string
}

type SubscriptionOrderNotes = {
  userId: string
  plan: Exclude<SubscriptionPlan, "free">
  billingCycle: BillingCycle
}

type AiCreditTopupOrderNotes = {
  userId: string
  pack: "100k"
  credits: number
}

function hmacSha256Hex(secret: string, payload: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex")
}

function constantTimeEqual(actual: string | null | undefined, expected: string): boolean {
  const actualBuffer = Buffer.from(actual ?? "", "utf8")
  const expectedBuffer = Buffer.from(expected, "utf8")
  const length = Math.max(actualBuffer.length, expectedBuffer.length, 1)
  const left = Buffer.alloc(length)
  const right = Buffer.alloc(length)
  actualBuffer.copy(left)
  expectedBuffer.copy(right)
  return crypto.timingSafeEqual(left, right) && actualBuffer.length === expectedBuffer.length
}

export function verifyRazorpayCheckoutSignature(params: {
  orderId: string
  paymentId: string
  signature: string | null | undefined
  keySecret: string
}): boolean {
  const expected = hmacSha256Hex(params.keySecret, `${params.orderId}|${params.paymentId}`)
  return constantTimeEqual(params.signature, expected)
}

export function verifyRazorpayWebhookSignature(params: {
  rawBody: string
  signature: string | null | undefined
  webhookSecret: string
}): boolean {
  const expected = hmacSha256Hex(params.webhookSecret, params.rawBody)
  return constantTimeEqual(params.signature, expected)
}

export function getRazorpayOrderNotes(order: RazorpayOrderLike): Record<string, string> {
  return order.notes ?? {}
}

export function resolveRazorpayPurpose(notes: Record<string, string>): RazorpayPurpose {
  if (notes.purpose === AI_CREDIT_TOPUP_PURPOSE) return AI_CREDIT_TOPUP_PURPOSE
  return notes.purpose === PDF_CLEAN_EXPORT_PURPOSE ? PDF_CLEAN_EXPORT_PURPOSE : "subscription"
}

function paise(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value)
  return Number.isInteger(n) && n >= 0 ? n : null
}

export function validateRazorpayPaymentConsistency(params: {
  orderId: string
  order: RazorpayOrderLike
  payment: RazorpayPaymentLike
  expectedAmountPaise: number
}): RazorpayPaymentCheckResult {
  const orderAmount = paise(params.order.amount)
  const paymentAmount = paise(params.payment.amount)

  if (params.payment.order_id !== params.orderId) {
    return { ok: false, reason: "payment_order_mismatch", orderAmount, paymentAmount }
  }

  if (params.payment.status !== "captured") {
    return {
      ok: false,
      reason: "payment_not_captured",
      orderAmount,
      paymentAmount,
      paymentStatus: params.payment.status,
    }
  }

  if (orderAmount == null || paymentAmount == null) {
    return { ok: false, reason: "invalid_amount", orderAmount, paymentAmount }
  }

  if (paymentAmount !== orderAmount) {
    return { ok: false, reason: "payment_amount_mismatch", orderAmount, paymentAmount }
  }

  if (orderAmount !== params.expectedAmountPaise) {
    return { ok: false, reason: "expected_amount_mismatch", orderAmount, paymentAmount }
  }

  return { ok: true, amountPaise: paymentAmount }
}

export function validatePdfExportOrderNotes(notes: Record<string, string>): PdfExportOrderNotes | null {
  const userId = notes.user_id
  const orgId = notes.org_id
  const projectId = notes.project_id
  if (!userId || !orgId || !projectId) return null
  return { userId, orgId, projectId }
}

export function validateSubscriptionOrderNotes(notes: Record<string, string>): SubscriptionOrderNotes | null {
  const userId = notes.user_id
  const plan = notes.plan
  const billingCycle = notes.billing_cycle

  if (!userId || !plan || !isPaidPlan(plan)) return null
  if (billingCycle !== "monthly" && billingCycle !== "annual") return null

  return { userId, plan, billingCycle }
}

export function validateAiCreditTopupOrderNotes(notes: Record<string, string>): AiCreditTopupOrderNotes | null {
  const userId = notes.user_id
  const pack = notes.pack
  const credits = Number(notes.credits)
  if (!userId || pack !== "100k") return null
  if (credits !== AI_CREDIT_TOPUP_CREDITS) return null
  return { userId, pack, credits }
}

export function expectedAmountForSubscription(plan: Exclude<SubscriptionPlan, "free">, billingCycle: BillingCycle) {
  return getRazorpayOrderAmountPaise(plan, billingCycle)
}

export function expectedAmountForPdfCleanExport() {
  return getPdfCleanExportAmountPaise()
}

export function expectedAmountForAiCreditTopup() {
  return getAiCreditTopupPricePaise()
}

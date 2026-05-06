import crypto from "node:crypto"
import { describe, expect, it } from "vitest"
import { AI_CREDIT_TOPUP_CREDITS, AI_CREDIT_TOPUP_PURPOSE, PDF_CLEAN_EXPORT_PURPOSE } from "@/modules/billing/domain/razorpay-pricing"
import {
  expectedAmountForAiCreditTopup,
  expectedAmountForPdfCleanExport,
  resolveRazorpayPurpose,
  validateAiCreditTopupOrderNotes,
  validatePdfExportOrderNotes,
  validateRazorpayPaymentConsistency,
  validateSubscriptionOrderNotes,
  verifyRazorpayCheckoutSignature,
  verifyRazorpayWebhookSignature,
} from "@/modules/billing/security/razorpay-security"

function hmac(secret: string, payload: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex")
}

describe("Razorpay signature validation", () => {
  it("accepts valid checkout signatures and rejects altered signatures", () => {
    const keySecret = "test_secret"
    const orderId = "order_123"
    const paymentId = "pay_123"
    const signature = hmac(keySecret, `${orderId}|${paymentId}`)

    expect(verifyRazorpayCheckoutSignature({ orderId, paymentId, signature, keySecret })).toBe(true)
    expect(verifyRazorpayCheckoutSignature({ orderId, paymentId, signature: `${signature}00`, keySecret })).toBe(false)
    expect(verifyRazorpayCheckoutSignature({ orderId, paymentId: "pay_other", signature, keySecret })).toBe(false)
  })

  it("accepts valid webhook signatures and rejects invalid bodies", () => {
    const webhookSecret = "webhook_secret"
    const rawBody = JSON.stringify({ event: "payment.captured", created_at: 1 })
    const signature = hmac(webhookSecret, rawBody)

    expect(verifyRazorpayWebhookSignature({ rawBody, signature, webhookSecret })).toBe(true)
    expect(verifyRazorpayWebhookSignature({ rawBody: `${rawBody}\n`, signature, webhookSecret })).toBe(false)
  })
})

describe("Razorpay order validation", () => {
  it("parses subscription and PDF export purposes from order notes", () => {
    expect(resolveRazorpayPurpose({})).toBe("subscription")
    expect(resolveRazorpayPurpose({ purpose: PDF_CLEAN_EXPORT_PURPOSE })).toBe(PDF_CLEAN_EXPORT_PURPOSE)
    expect(resolveRazorpayPurpose({ purpose: AI_CREDIT_TOPUP_PURPOSE })).toBe(AI_CREDIT_TOPUP_PURPOSE)

    expect(
      validateSubscriptionOrderNotes({
        user_id: "user_1",
        plan: "pro",
        billing_cycle: "monthly",
      })
    ).toEqual({ userId: "user_1", plan: "pro", billingCycle: "monthly" })

    expect(validateSubscriptionOrderNotes({ user_id: "user_1", plan: "free", billing_cycle: "monthly" })).toBeNull()
    expect(validatePdfExportOrderNotes({ user_id: "user_1", org_id: "org_1", project_id: "project_1" })).toEqual({
      userId: "user_1",
      orgId: "org_1",
      projectId: "project_1",
    })
    expect(
      validateAiCreditTopupOrderNotes({
        user_id: "user_1",
        purpose: AI_CREDIT_TOPUP_PURPOSE,
        pack: "100k",
        credits: String(AI_CREDIT_TOPUP_CREDITS),
      })
    ).toEqual({ userId: "user_1", pack: "100k", credits: 100_000 })
  })

  it("requires captured payment, matching order id, and exact amount", () => {
    const valid = validateRazorpayPaymentConsistency({
      orderId: "order_123",
      order: { amount: 9900 },
      payment: { order_id: "order_123", status: "captured", amount: 9900 },
      expectedAmountPaise: 9900,
    })

    expect(valid).toEqual({ ok: true, amountPaise: 9900 })

    expect(
      validateRazorpayPaymentConsistency({
        orderId: "order_123",
        order: { amount: 9900 },
        payment: { order_id: "order_other", status: "captured", amount: 9900 },
        expectedAmountPaise: 9900,
      })
    ).toMatchObject({ ok: false, reason: "payment_order_mismatch" })

    expect(
      validateRazorpayPaymentConsistency({
        orderId: "order_123",
        order: { amount: 9900 },
        payment: { order_id: "order_123", status: "authorized", amount: 9900 },
        expectedAmountPaise: 9900,
      })
    ).toMatchObject({ ok: false, reason: "payment_not_captured" })

    expect(
      validateRazorpayPaymentConsistency({
        orderId: "order_123",
        order: { amount: 9900 },
        payment: { order_id: "order_123", status: "captured", amount: 9800 },
        expectedAmountPaise: 9900,
      })
    ).toMatchObject({ ok: false, reason: "payment_amount_mismatch" })

    expect(
      validateRazorpayPaymentConsistency({
        orderId: "order_123",
        order: { amount: 9900 },
        payment: { order_id: "order_123", status: "captured", amount: 9900 },
        expectedAmountPaise: 10000,
      })
    ).toMatchObject({ ok: false, reason: "expected_amount_mismatch" })
  })

  it("uses Rs 99 as the default clean PDF export amount", () => {
    expect(expectedAmountForPdfCleanExport()).toBe(9900)
  })

  it("uses Rs 99 as the default AI credit top-up amount", () => {
    expect(expectedAmountForAiCreditTopup()).toBe(9900)
  })
})

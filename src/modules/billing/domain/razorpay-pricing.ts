import type { BillingCycle, SubscriptionPlan } from "@/shared/types/project"
import {
  AI_CREDIT_TOPUP_CREDITS,
  AI_CREDIT_TOPUP_PURPOSE,
  getAiCreditTopupAmountPaise,
} from "@/modules/ai/domain/credits"

/** Server-side Razorpay order amounts (paise). Must match create-order. */
export function getRazorpayOrderAmountPaise(
  plan: Exclude<SubscriptionPlan, "free">,
  billingCycle: BillingCycle
): number {
  const pricing: Record<Exclude<SubscriptionPlan, "free">, Record<BillingCycle, number>> = {
    pro: {
      monthly: parseInt(process.env.PRO_MONTHLY_PRICE_PAISE || "119900", 10),
      annual: parseInt(process.env.PRO_ANNUAL_PRICE_PAISE || "1151000", 10),
    },
    premium: {
      monthly: parseInt(process.env.PREMIUM_MONTHLY_PRICE_PAISE || "399900", 10),
      annual: parseInt(process.env.PREMIUM_ANNUAL_PRICE_PAISE || "3839000", 10),
    },
  }
  return pricing[plan][billingCycle]
}

export function isPaidPlan(plan: string): plan is Exclude<SubscriptionPlan, "free"> {
  return plan === "pro" || plan === "premium"
}

export const PDF_CLEAN_EXPORT_PURPOSE = "pdf_clean_export" as const
export { AI_CREDIT_TOPUP_CREDITS, AI_CREDIT_TOPUP_PURPOSE }

export function getPdfCleanExportAmountPaise(): number {
  return parseInt(process.env.PDF_CLEAN_EXPORT_PRICE_PAISE || "9900", 10)
}

export function getAiCreditTopupPricePaise(): number {
  return getAiCreditTopupAmountPaise()
}

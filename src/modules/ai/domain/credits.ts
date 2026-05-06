import type { SubscriptionPlan } from "@/shared/types/project"
import type { AiTaskKind } from "@/modules/ai/domain/generation"

export type AiRoutingLabel = "Fast" | "Smart" | "Cinematic"
export type AiPlanPositioning = "Learn & Explore" | "Build & Create" | "Produce & Scale"

export type AiPlanEntitlement = {
  plan: SubscriptionPlan
  monthlyCredits: number
  dailyGenerations: number
  positioning: AiPlanPositioning
  routingLabel: AiRoutingLabel
  topUpEligible: boolean
  fairUsageApplies: boolean
}

export type AiCreditTopupPack = {
  id: "100k"
  purpose: typeof AI_CREDIT_TOPUP_PURPOSE
  credits: number
  amountPaise: number
}

export type AiCreditHistoryItem = {
  id: string
  razorpayPaymentId: string
  razorpayOrderId: string
  amountPaise: number
  creditsGranted: number
  creditsRemaining: number
  createdAt: string
}

export type AiCreditReservation = {
  id: string | null
  requiredCredits: number
  reservedCredits: number
  includedRemainingAtReservation: number
  status: "not_required" | "reserved" | "blocked" | "unavailable"
  reason?: string
}

export type AiCreditAuthorization = {
  reservation: AiCreditReservation
  topUpBalance: number
  includedCreditsUsed: number
  includedCreditsLimit: number
}

export type AiCreditSnapshot = {
  plan: SubscriptionPlan
  positioning: AiPlanPositioning
  routingLabel: AiRoutingLabel
  includedCreditsLimit: number
  includedCreditsUsed: number
  includedCreditsRemaining: number
  topUpCreditsRemaining: number
  totalCreditsRemaining: number
  resetAt: string
  topUpEligible: boolean
  topUpPack: AiCreditTopupPack
}

export const AI_CREDIT_TOPUP_PURPOSE = "ai_credit_topup" as const
export const AI_CREDIT_TOPUP_CREDITS = 100_000
const DEFAULT_AI_CREDIT_TOPUP_PRICE_PAISE = 9_900

export function getAiCreditTopupAmountPaise(): number {
  const raw = Number(process.env.AI_CREDIT_TOPUP_PRICE_PAISE)
  return Number.isInteger(raw) && raw > 0 ? raw : DEFAULT_AI_CREDIT_TOPUP_PRICE_PAISE
}

export function getAiCreditTopupPack(): AiCreditTopupPack {
  return {
    id: "100k",
    purpose: AI_CREDIT_TOPUP_PURPOSE,
    credits: AI_CREDIT_TOPUP_CREDITS,
    amountPaise: getAiCreditTopupAmountPaise(),
  }
}

export const PLAN_AI_ENTITLEMENTS: Record<SubscriptionPlan, AiPlanEntitlement> = {
  free: {
    plan: "free",
    monthlyCredits: 100_000,
    dailyGenerations: 5,
    positioning: "Learn & Explore",
    routingLabel: "Fast",
    topUpEligible: false,
    fairUsageApplies: false,
  },
  pro: {
    plan: "pro",
    monthlyCredits: 600_000,
    dailyGenerations: 50,
    positioning: "Build & Create",
    routingLabel: "Smart",
    topUpEligible: true,
    fairUsageApplies: false,
  },
  premium: {
    plan: "premium",
    monthlyCredits: 2_000_000,
    dailyGenerations: 200,
    positioning: "Produce & Scale",
    routingLabel: "Cinematic",
    topUpEligible: true,
    fairUsageApplies: true,
  },
}

const BASE_LIVE_OUTPUT_TOKEN_CAPS: Record<Exclude<AiTaskKind, "batch" | "unknown">, number> = {
  generate: 3500,
  "generate-next": 1800,
  "improve-dialogue": 1200,
  "rewrite-style": 2500,
  shots: 1000,
  "movie-references": 1000,
  documents: 4096,
}

const PREMIUM_LONG_FORM_TASKS = new Set<AiTaskKind>(["generate", "generate-next", "rewrite-style", "documents"])
const FREE_LIVE_OUTPUT_TOKEN_CAP = 1200

export function getAiPlanEntitlement(plan: SubscriptionPlan): AiPlanEntitlement {
  return PLAN_AI_ENTITLEMENTS[plan] ?? PLAN_AI_ENTITLEMENTS.free
}

export function getBaseLiveOutputTokenCap(taskKind: Exclude<AiTaskKind, "batch" | "unknown">): number {
  return BASE_LIVE_OUTPUT_TOKEN_CAPS[taskKind]
}

export function getPlanAwareLiveOutputTokenCap(
  taskKind: Exclude<AiTaskKind, "batch" | "unknown">,
  plan: SubscriptionPlan
): number {
  const base = getBaseLiveOutputTokenCap(taskKind)
  if (plan === "free") return Math.min(base, FREE_LIVE_OUTPUT_TOKEN_CAP)
  if (plan === "premium" && PREMIUM_LONG_FORM_TASKS.has(taskKind)) return base * 2
  return base
}

export function compactCredits(value: number): string {
  if (value >= 1_000_000) {
    const millions = value / 1_000_000
    return `${Number.isInteger(millions) ? millions.toFixed(0) : millions.toFixed(1)}M`
  }
  if (value >= 1_000) {
    return `${Math.round(value / 1_000)}K`
  }
  return value.toLocaleString("en-IN")
}

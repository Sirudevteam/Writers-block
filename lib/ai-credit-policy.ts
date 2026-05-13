import type { SubscriptionPlan } from "@/types/project"
import * as core from "@/lib/ai-credit-policy-core"

export type AiCreditEndpoint =
  | "generate"
  | "documents"
  | "generate-next"
  | "improve-dialogue"
  | "rewrite-style"
  | "shots"
  | "movie-references"
  | "batch-rewrite"
  | "batch-rewrite-style"
  | "rewrite-batch"

export type AiCreditSourceSnapshot = {
  monthlyLimit: number
  includedCommitted: number
  includedReserved: number
  topupGranted: number
  topupCommitted: number
  topupReserved: number
}

export type AiCreditAllocation =
  | {
      ok: true
      estimatedCredits: number
      includedCredits: number
      topupCredits: number
      includedAvailableAfter: number
      topupAvailableAfter: number
    }
  | {
      ok: false
      reason: "insufficient_credits"
      estimatedCredits: number
      includedAvailable: number
      topupAvailable: number
    }

export type AiCreditSettlement =
  | {
      status: "committed" | "failed_charged"
      chargedIncludedCredits: number
      chargedTopupCredits: number
      releasedIncludedCredits: number
      releasedTopupCredits: number
    }
  | {
      status: "released"
      chargedIncludedCredits: 0
      chargedTopupCredits: 0
      releasedIncludedCredits: number
      releasedTopupCredits: number
    }

export const PLAN_MONTHLY_AI_CREDITS = core.PLAN_MONTHLY_AI_CREDITS as Record<
  SubscriptionPlan,
  number
>

export const AI_CREDIT_ESTIMATE_BY_ENDPOINT =
  core.AI_CREDIT_ESTIMATE_BY_ENDPOINT as Record<AiCreditEndpoint, number>

export function getAiMonthlyIncludedCredits(plan: SubscriptionPlan): number {
  return core.getAiMonthlyIncludedCredits(plan)
}

export function estimateAiCredits(endpoint: string): number {
  return core.estimateAiCredits(endpoint)
}

export function isPaidOnlyAiEndpoint(endpoint: string): boolean {
  return core.isPaidOnlyAiEndpoint(endpoint)
}

export function isAiEndpointAllowedForPlan(endpoint: string, plan: SubscriptionPlan): boolean {
  return core.isAiEndpointAllowedForPlan(endpoint, plan)
}

export function allocateAiCredits(
  requestedCredits: number,
  snapshot: AiCreditSourceSnapshot
): AiCreditAllocation {
  return core.allocateAiCredits(requestedCredits, snapshot) as AiCreditAllocation
}

export function settleAiCreditAllocation(params: {
  reservedIncludedCredits: number
  reservedTopupCredits: number
  estimatedCredits: number
  actualCredits?: number
  providerStarted: boolean
  completed: boolean
}): AiCreditSettlement {
  return core.settleAiCreditAllocation(params) as AiCreditSettlement
}

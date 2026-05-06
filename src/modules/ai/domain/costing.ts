import type { SubscriptionPlan } from "@/shared/types/project"
import { PLAN_AI_ENTITLEMENTS } from "@/modules/ai/domain/credits"

export type AiProvider = "openai" | "gemini" | "anthropic"
export type AiTaskComplexity = "simple" | "standard" | "complex"
type AiUsageSource = "provider" | "estimated"
export type AiBudgetState = "ok" | "warning" | "downgrade" | "blocked" | "untracked"

export type AiModelRef = {
  provider: AiProvider
  model: string
}

export type AiTokenUsage = {
  inputTokens: number
  outputTokens: number
  cachedInputTokens?: number
  cacheCreationInputTokens?: number
  totalTokens?: number
  source: AiUsageSource
}

type AiModelPrice = {
  provider: AiProvider
  model: string
  inputUsdPer1M: number
  cachedInputUsdPer1M?: number
  outputUsdPer1M: number
  lastReviewed: string
}

export const AI_PRICING_LAST_REVIEWED = "2026-05-01"
const DEFAULT_INR_PER_USD = 95

export const PLAN_MONTHLY_TOKEN_BUDGETS: Record<
  SubscriptionPlan,
  { inputTokens: number | null; outputTokens: number | null; totalTokens: number }
> = {
  free: { inputTokens: null, outputTokens: null, totalTokens: PLAN_AI_ENTITLEMENTS.free.monthlyCredits },
  pro: { inputTokens: null, outputTokens: null, totalTokens: PLAN_AI_ENTITLEMENTS.pro.monthlyCredits },
  premium: { inputTokens: 1_250_000, outputTokens: 750_000, totalTokens: PLAN_AI_ENTITLEMENTS.premium.monthlyCredits },
}

export const AI_BUDGET_WARNING_RATIO = 0.7
export const AI_BUDGET_DOWNGRADE_RATIO = 0.85

const AI_MODEL_PRICING: Record<string, AiModelPrice> = {
  "openai:gpt-4o-mini": {
    provider: "openai",
    model: "gpt-4o-mini",
    inputUsdPer1M: 0.15,
    cachedInputUsdPer1M: 0.075,
    outputUsdPer1M: 0.6,
    lastReviewed: AI_PRICING_LAST_REVIEWED,
  },
  "openai:gpt-5.4-mini": {
    provider: "openai",
    model: "gpt-5.4-mini",
    inputUsdPer1M: 0.75,
    cachedInputUsdPer1M: 0.075,
    outputUsdPer1M: 4.5,
    lastReviewed: AI_PRICING_LAST_REVIEWED,
  },
  "openai:gpt-5.4": {
    provider: "openai",
    model: "gpt-5.4",
    inputUsdPer1M: 2.5,
    cachedInputUsdPer1M: 0.25,
    outputUsdPer1M: 15,
    lastReviewed: AI_PRICING_LAST_REVIEWED,
  },
  "gemini:gemini-2.5-flash-lite": {
    provider: "gemini",
    model: "gemini-2.5-flash-lite",
    inputUsdPer1M: 0.1,
    cachedInputUsdPer1M: 0.01,
    outputUsdPer1M: 0.4,
    lastReviewed: AI_PRICING_LAST_REVIEWED,
  },
  "gemini:gemini-2.5-flash": {
    provider: "gemini",
    model: "gemini-2.5-flash",
    inputUsdPer1M: 0.3,
    cachedInputUsdPer1M: 0.03,
    outputUsdPer1M: 2.5,
    lastReviewed: AI_PRICING_LAST_REVIEWED,
  },
  "gemini:gemini-3.1-pro-preview": {
    provider: "gemini",
    model: "gemini-3.1-pro-preview",
    inputUsdPer1M: 2,
    cachedInputUsdPer1M: 0.2,
    outputUsdPer1M: 12,
    lastReviewed: AI_PRICING_LAST_REVIEWED,
  },
  "anthropic:claude-haiku-4-5-20251001": {
    provider: "anthropic",
    model: "claude-haiku-4-5-20251001",
    inputUsdPer1M: 1,
    cachedInputUsdPer1M: 0.1,
    outputUsdPer1M: 5,
    lastReviewed: AI_PRICING_LAST_REVIEWED,
  },
  "anthropic:claude-haiku-4-5": {
    provider: "anthropic",
    model: "claude-haiku-4-5",
    inputUsdPer1M: 1,
    cachedInputUsdPer1M: 0.1,
    outputUsdPer1M: 5,
    lastReviewed: AI_PRICING_LAST_REVIEWED,
  },
  "anthropic:claude-sonnet-4-6": {
    provider: "anthropic",
    model: "claude-sonnet-4-6",
    inputUsdPer1M: 3,
    cachedInputUsdPer1M: 0.3,
    outputUsdPer1M: 15,
    lastReviewed: AI_PRICING_LAST_REVIEWED,
  },
}

export function getInrPerUsd(): number {
  const raw = Number(process.env.AI_EXCHANGE_RATE_INR_PER_USD)
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_INR_PER_USD
}

function modelKey(ref: AiModelRef): string {
  return `${ref.provider}:${ref.model}`
}

export function estimateTokens(text: string): number {
  if (!text) return 0
  return Math.max(1, Math.ceil(text.length / 3))
}

export function normalizeUsage(usage: Partial<AiTokenUsage>, fallbackText?: string): AiTokenUsage {
  const output = Math.max(0, Math.round(usage.outputTokens ?? estimateTokens(fallbackText ?? "")))
  const input = Math.max(0, Math.round(usage.inputTokens ?? 0))
  const cached = Math.max(0, Math.round(usage.cachedInputTokens ?? 0))
  const cacheCreation = Math.max(0, Math.round(usage.cacheCreationInputTokens ?? 0))
  return {
    inputTokens: input,
    outputTokens: output,
    cachedInputTokens: cached,
    cacheCreationInputTokens: cacheCreation,
    totalTokens: Math.max(0, Math.round(usage.totalTokens ?? input + output)),
    source: usage.source ?? "estimated",
  }
}

export function calculateAiCostUsd(ref: AiModelRef, usage: AiTokenUsage): number {
  const price = AI_MODEL_PRICING[modelKey(ref)]
  if (!price) return 0

  const cached = Math.min(usage.inputTokens, usage.cachedInputTokens ?? 0)
  const uncachedInput = Math.max(0, usage.inputTokens - cached)
  const cacheCreation = Math.max(0, usage.cacheCreationInputTokens ?? 0)

  const inputCost = (uncachedInput / 1_000_000) * price.inputUsdPer1M
  const cacheReadCost = (cached / 1_000_000) * (price.cachedInputUsdPer1M ?? price.inputUsdPer1M)
  const cacheWriteCost = (cacheCreation / 1_000_000) * price.inputUsdPer1M
  const outputCost = (usage.outputTokens / 1_000_000) * price.outputUsdPer1M

  return roundCost(inputCost + cacheReadCost + cacheWriteCost + outputCost)
}

export function roundCost(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000
}

export function downgradeComplexity(complexity: AiTaskComplexity): AiTaskComplexity {
  if (complexity === "complex") return "standard"
  if (complexity === "standard") return "simple"
  return "simple"
}

export function parseModelList(raw: string | undefined): AiModelRef[] {
  if (!raw) return []
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const [provider, ...modelParts] = item.split(":")
      const model = modelParts.join(":")
      if (!provider || !model) return null
      if (!["openai", "gemini", "anthropic"].includes(provider)) return null
      return { provider: provider as AiProvider, model }
    })
    .filter((item): item is AiModelRef => item !== null)
}

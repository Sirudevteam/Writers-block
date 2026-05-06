import type { SubscriptionPlan } from "@/shared/types/project"
import type { AiModelRef, AiTaskComplexity } from "@/modules/ai/domain/costing"

type AiRequestedMode = "live" | "batch"
export type AiCacheStrategy = "none" | "project_context"

type ResolveAiTaskPolicyInput = {
  endpoint: string
  plan: SubscriptionPlan
  inputSize?: number
  requestedMode?: AiRequestedMode
}

type AiTaskPolicy = {
  complexity: AiTaskComplexity
  candidateModels: AiModelRef[]
  maxTokens: number
  cacheStrategy: AiCacheStrategy
  batchEligible: boolean
  reason: string
}

const DEFAULT_MAX_TOKENS = parseInt(process.env.MAX_TOKENS || "8000", 10)

function envModel(name: string, fallback: string): string {
  return process.env[name] || fallback
}

function tierCandidates(complexity: AiTaskComplexity): AiModelRef[] {
  if (complexity === "simple") {
    return [
      { provider: "openai", model: envModel("AI_OPENAI_SIMPLE_MODEL", "gpt-4o-mini") },
      { provider: "gemini", model: envModel("AI_GEMINI_SIMPLE_MODEL", "gemini-2.5-flash") },
      { provider: "anthropic", model: envModel("AI_ANTHROPIC_SIMPLE_MODEL", "claude-haiku-4-5-20251001") },
    ]
  }

  if (complexity === "standard") {
    return [
      { provider: "openai", model: envModel("AI_OPENAI_STANDARD_MODEL", "gpt-5.4-mini") },
      { provider: "gemini", model: envModel("AI_GEMINI_STANDARD_MODEL", "gemini-3.1-flash-lite") },
      { provider: "anthropic", model: envModel("AI_ANTHROPIC_STANDARD_MODEL", "claude-haiku-4-5-20251001") },
    ]
  }

  return [
    { provider: "openai", model: envModel("AI_OPENAI_COMPLEX_MODEL", "gpt-5.4") },
    { provider: "gemini", model: envModel("AI_GEMINI_COMPLEX_MODEL", "gemini-3.1-pro-preview") },
    { provider: "anthropic", model: envModel("AI_ANTHROPIC_COMPLEX_MODEL", "claude-sonnet-4-6") },
  ]
}

function policy(
  complexity: AiTaskComplexity,
  maxTokens: number,
  cacheStrategy: AiCacheStrategy,
  batchEligible: boolean,
  reason: string
): AiTaskPolicy {
  return {
    complexity,
    candidateModels: tierCandidates(complexity),
    maxTokens,
    cacheStrategy,
    batchEligible,
    reason,
  }
}

function applyPlanRouting(plan: SubscriptionPlan, resolved: AiTaskPolicy): AiTaskPolicy {
  if (plan !== "free") return resolved
  return {
    ...resolved,
    complexity: "simple",
    candidateModels: tierCandidates("simple"),
    reason: `Free plan uses Fast drafting mode. ${resolved.reason}`,
  }
}

export function resolveAiTaskPolicy(input: ResolveAiTaskPolicyInput): AiTaskPolicy {
  const endpoint = input.endpoint.trim().toLowerCase()
  const inputSize = Math.max(0, input.inputSize ?? 0)
  const planPolicy = (resolved: AiTaskPolicy) => applyPlanRouting(input.plan, resolved)

  switch (endpoint) {
    case "shots":
    case "shot-suggestions":
    case "outline":
    case "outlines":
    case "short-idea":
    case "short-ideas":
      return planPolicy(policy("simple", 2048, "none", false, "Simple ideation routes use budget models."))

    case "movie-references":
    case "background-references":
      return planPolicy(policy("standard", 2000, "project_context", true, "Reference analysis uses balanced models and cached context."))

    case "improve-dialogue":
    case "generate-next":
    case "continuation":
    case "bulk-formatting":
      return planPolicy(policy("standard", DEFAULT_MAX_TOKENS, "project_context", true, "Moderate rewrite and continuation routes use balanced models."))

    case "rewrite-style":
    case "long-rewrite": {
      const isComplex = inputSize > 60_000
      return planPolicy(policy(
        isComplex ? "complex" : "standard",
        DEFAULT_MAX_TOKENS,
        "project_context",
        true,
        isComplex ? "Long rewrite routes use quality models." : "Moderate rewrite routes use balanced models."
      ))
    }

    case "generate":
    case "documents":
    case "full-screenplay":
    case "narrative-arc":
      if (endpoint === "documents") {
        return planPolicy(policy("complex", 4096, "project_context", false, "Documents story generation uses direct quality models."))
      }
      return planPolicy(policy("complex", DEFAULT_MAX_TOKENS, "project_context", false, "Full screenplay and narrative routes use quality models."))

    default:
      return planPolicy(policy("standard", DEFAULT_MAX_TOKENS, "project_context", true, "Unknown AI route defaults to balanced models."))
  }
}

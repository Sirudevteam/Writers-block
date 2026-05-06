import { NextResponse } from "next/server"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database, Json } from "@/infrastructure/db/types/database"
import type { SubscriptionPlan } from "@/shared/types/project"
import { createAdminClient } from "@/infrastructure/db/supabase/admin"
import {
  AI_BUDGET_DOWNGRADE_RATIO,
  AI_BUDGET_WARNING_RATIO,
  calculateAiCostUsd,
  getInrPerUsd,
  PLAN_MONTHLY_TOKEN_BUDGETS,
  roundCost,
  type AiBudgetState,
  type AiModelRef,
  type AiTaskComplexity,
  type AiTokenUsage,
} from "@/modules/ai/domain/costing"

export type AiBudgetDecision = {
  state: AiBudgetState
  tracked: boolean
  monthStart: string
  inputUsed: number
  outputUsed: number
  totalUsed: number
  inputLimit: number | null
  outputLimit: number | null
  totalLimit: number
  usageRatio: number
  costUsd: number
  costInr: number
  reason?: string
}

type AiUsageRecord = {
  userId: string
  endpoint: string
  plan: SubscriptionPlan
  provider: AiModelRef["provider"]
  model: string
  complexity: AiTaskComplexity
  originalComplexity?: AiTaskComplexity
  usage: AiTokenUsage
  costUsd: number
  latencyMs: number
  status: "success" | "failed"
  errorMessage?: string
  metadata?: Record<string, unknown>
}

class AiBudgetBlockedError extends Error {
  response: NextResponse

  constructor(response: NextResponse, message = "AI monthly credits exhausted") {
    super(message)
    this.name = "AiBudgetBlockedError"
    this.response = response
  }
}

export function isAiBudgetBlockedError(error: unknown): error is AiBudgetBlockedError {
  return error instanceof AiBudgetBlockedError
}

function getUsageAdminClient(): SupabaseClient<Database> | null {
  try {
    return createAdminClient()
  } catch {
    return null
  }
}

function failClosed(): boolean {
  if (process.env.AI_BUDGET_FAIL_OPEN === "true") return false
  return process.env.NODE_ENV === "production"
}

function currentMonthStartIso(date = new Date()): string {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)).toISOString().slice(0, 10)
}

function decisionHeaders(decision: AiBudgetDecision): HeadersInit {
  return {
    "X-AI-Budget-State": decision.state,
    "X-AI-Monthly-Usage-Percent": String(Math.round(decision.usageRatio * 100)),
    "X-AI-Monthly-Input-Used": String(decision.inputUsed),
    "X-AI-Monthly-Output-Used": String(decision.outputUsed),
    "X-AI-Monthly-Total-Used": String(decision.totalUsed),
  }
}

function calculateUsageRatio(
  plan: SubscriptionPlan,
  inputUsed: number,
  outputUsed: number,
  totalUsed: number,
  estimatedInput = 0,
  estimatedOutput = 0
): number {
  const budget = PLAN_MONTHLY_TOKEN_BUDGETS[plan]
  const projectedInput = inputUsed + estimatedInput
  const projectedOutput = outputUsed + estimatedOutput
  const projectedTotal = totalUsed + estimatedInput + estimatedOutput
  const ratios = [projectedTotal / budget.totalTokens]

  if (budget.inputTokens) ratios.push(projectedInput / budget.inputTokens)
  if (budget.outputTokens) ratios.push(projectedOutput / budget.outputTokens)

  return Math.max(...ratios)
}

function resolveState(ratio: number): AiBudgetState {
  if (ratio >= 1) return "blocked"
  if (ratio >= AI_BUDGET_DOWNGRADE_RATIO) return "downgrade"
  if (ratio >= AI_BUDGET_WARNING_RATIO) return "warning"
  return "ok"
}

export async function getAiBudgetDecision(
  userId: string,
  plan: SubscriptionPlan,
  estimatedInputTokens = 0,
  estimatedOutputTokens = 0
): Promise<AiBudgetDecision> {
  const monthStart = currentMonthStartIso()
  const budget = PLAN_MONTHLY_TOKEN_BUDGETS[plan]
  const admin = getUsageAdminClient()

  if (!admin) {
    if (failClosed()) {
      return {
        state: "blocked",
        tracked: false,
        monthStart,
        inputUsed: 0,
        outputUsed: 0,
        totalUsed: 0,
        inputLimit: budget.inputTokens,
        outputLimit: budget.outputTokens,
        totalLimit: budget.totalTokens,
        usageRatio: 1,
        costUsd: 0,
        costInr: 0,
        reason: "AI budget service is not configured.",
      }
    }

    return {
      state: "untracked",
      tracked: false,
      monthStart,
      inputUsed: 0,
      outputUsed: 0,
      totalUsed: 0,
      inputLimit: budget.inputTokens,
      outputLimit: budget.outputTokens,
      totalLimit: budget.totalTokens,
      usageRatio: 0,
      costUsd: 0,
      costInr: 0,
      reason: "AI budget service is unavailable in local development.",
    }
  }

  const { data, error } = await admin
    .from("ai_usage_monthly")
    .select("input_tokens, output_tokens, cost_usd, cost_inr")
    .eq("user_id", userId)
    .eq("month_start", monthStart)
    .maybeSingle()

  if (error) {
    if (failClosed()) {
      return {
        state: "blocked",
        tracked: false,
        monthStart,
        inputUsed: 0,
        outputUsed: 0,
        totalUsed: 0,
        inputLimit: budget.inputTokens,
        outputLimit: budget.outputTokens,
        totalLimit: budget.totalTokens,
        usageRatio: 1,
        costUsd: 0,
        costInr: 0,
        reason: "AI budget lookup failed.",
      }
    }

    return {
      state: "untracked",
      tracked: false,
      monthStart,
      inputUsed: 0,
      outputUsed: 0,
      totalUsed: 0,
      inputLimit: budget.inputTokens,
      outputLimit: budget.outputTokens,
      totalLimit: budget.totalTokens,
      usageRatio: 0,
      costUsd: 0,
      costInr: 0,
      reason: error.message,
    }
  }

  const inputUsed = Number(data?.input_tokens ?? 0)
  const outputUsed = Number(data?.output_tokens ?? 0)
  const totalUsed = inputUsed + outputUsed
  const usageRatio = calculateUsageRatio(plan, inputUsed, outputUsed, totalUsed, estimatedInputTokens, estimatedOutputTokens)
  const state = resolveState(usageRatio)

  return {
    state,
    tracked: true,
    monthStart,
    inputUsed,
    outputUsed,
    totalUsed,
    inputLimit: budget.inputTokens,
    outputLimit: budget.outputTokens,
    totalLimit: budget.totalTokens,
    usageRatio,
    costUsd: Number(data?.cost_usd ?? 0),
    costInr: Number(data?.cost_inr ?? 0),
    reason: state === "blocked" ? "Monthly AI credits exhausted." : undefined,
  }
}

export function assertAiBudgetAllowed(
  decision: AiBudgetDecision,
  options?: { topUpReserved?: boolean; reason?: string }
): void {
  if (decision.state !== "blocked") return
  if (options?.topUpReserved) return
  const resetAt = new Date(`${decision.monthStart}T00:00:00.000Z`)
  resetAt.setUTCMonth(resetAt.getUTCMonth() + 1)

  throw new AiBudgetBlockedError(
    NextResponse.json(
      {
        error: options?.reason || decision.reason || "Monthly AI credits exhausted. Upgrade, buy top-up credits, or wait for your monthly reset.",
        resetAt: resetAt.toISOString(),
      },
      { status: 429, headers: decisionHeaders(decision) }
    )
  )
}

export function aiBudgetHeaders(decision: AiBudgetDecision): HeadersInit {
  return decisionHeaders(decision)
}

export function calculateRecordCost(ref: AiModelRef, usage: AiTokenUsage): { costUsd: number; costInr: number } {
  const costUsd = calculateAiCostUsd(ref, usage)
  return {
    costUsd,
    costInr: roundCost(costUsd * getInrPerUsd()),
  }
}

export async function recordAiUsage(record: AiUsageRecord): Promise<void> {
  const admin = getUsageAdminClient()
  if (!admin) return

  const monthStart = currentMonthStartIso()
  const costInr = roundCost(record.costUsd * getInrPerUsd())
  const metadata = (record.metadata ?? {}) as Json

  const args = {
    p_user_id: record.userId,
    p_endpoint: record.endpoint,
    p_plan: record.plan,
    p_provider: record.provider,
    p_model: record.model,
    p_complexity: record.complexity,
    p_original_complexity: record.originalComplexity ?? record.complexity,
    p_input_tokens: record.usage.inputTokens,
    p_output_tokens: record.usage.outputTokens,
    p_cached_input_tokens: record.usage.cachedInputTokens ?? 0,
    p_cache_creation_input_tokens: record.usage.cacheCreationInputTokens ?? 0,
    p_total_tokens: record.usage.totalTokens ?? record.usage.inputTokens + record.usage.outputTokens,
    p_cost_usd: record.costUsd,
    p_cost_inr: costInr,
    p_latency_ms: record.latencyMs,
    p_status: record.status,
    p_usage_source: record.usage.source,
    p_error_message: record.errorMessage ?? null,
    p_metadata: metadata,
  }

  const { error } = await (admin as any).rpc("record_ai_usage", args)
  if (!error) return

  await fallbackRecordAiUsage(admin, monthStart, record, costInr, metadata).catch(() => {})
}

async function fallbackRecordAiUsage(
  admin: SupabaseClient<Database>,
  monthStart: string,
  record: AiUsageRecord,
  costInr: number,
  metadata: Json
) {
  await (admin as any).from("usage_logs").insert({
    user_id: record.userId,
    endpoint: record.endpoint,
    plan: record.plan,
    provider: record.provider,
    model: record.model,
    complexity: record.complexity,
    original_complexity: record.originalComplexity ?? record.complexity,
    input_tokens: record.usage.inputTokens,
    output_tokens: record.usage.outputTokens,
    cached_input_tokens: record.usage.cachedInputTokens ?? 0,
    cache_creation_input_tokens: record.usage.cacheCreationInputTokens ?? 0,
    total_tokens: record.usage.totalTokens ?? record.usage.inputTokens + record.usage.outputTokens,
    cost_usd: record.costUsd,
    cost_inr: costInr,
    latency_ms: record.latencyMs,
    status: record.status,
    usage_source: record.usage.source,
    error_message: record.errorMessage ?? null,
    metadata,
  })

  if (record.status !== "success") return

  const { data } = await (admin as any)
    .from("ai_usage_monthly")
    .select("input_tokens, output_tokens, cached_input_tokens, cache_creation_input_tokens, cost_usd, cost_inr, request_count")
    .eq("user_id", record.userId)
    .eq("month_start", monthStart)
    .maybeSingle()

  await (admin as any).from("ai_usage_monthly").upsert(
    {
      user_id: record.userId,
      month_start: monthStart,
      plan: record.plan,
      input_tokens: Number(data?.input_tokens ?? 0) + record.usage.inputTokens,
      output_tokens: Number(data?.output_tokens ?? 0) + record.usage.outputTokens,
      cached_input_tokens: Number(data?.cached_input_tokens ?? 0) + (record.usage.cachedInputTokens ?? 0),
      cache_creation_input_tokens:
        Number(data?.cache_creation_input_tokens ?? 0) + (record.usage.cacheCreationInputTokens ?? 0),
      cost_usd: Number(data?.cost_usd ?? 0) + record.costUsd,
      cost_inr: Number(data?.cost_inr ?? 0) + costInr,
      request_count: Number(data?.request_count ?? 0) + 1,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,month_start" }
  )
}

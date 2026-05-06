import { NextResponse } from "next/server"
import { estimateTokens } from "@/modules/ai/domain/costing"
import type { SubscriptionPlan } from "@/shared/types/project"
import { getBaseLiveOutputTokenCap, getPlanAwareLiveOutputTokenCap } from "@/modules/ai/domain/credits"

export type AiTaskKind =
  | "generate"
  | "generate-next"
  | "improve-dialogue"
  | "rewrite-style"
  | "shots"
  | "movie-references"
  | "documents"
  | "batch"
  | "unknown"

export type GenerationMode = "live" | "batch"

export type StoryContextSnapshot = {
  status: "memory" | "fallback" | "empty" | "unavailable"
  projectId: string | null
  contextText: string
  memoryChunkCount: number
  storyBibleEntryCount?: number
  tokenEstimate: number
  reason?: string
}

export type TokenGuardDecision = {
  ok: boolean
  taskKind: AiTaskKind
  requestedMode: GenerationMode
  requestedMaxTokens: number
  effectiveMaxTokens: number
  cap: number | null
  inputSize: number
  batchRequired: boolean
  reason?: string
}

export type GenerationRequest = {
  taskKind: AiTaskKind
  requestedMode: GenerationMode
  userId: string
  orgId?: string | null
  projectId?: string | null
  systemPrompt: string
  userPrompt: string
  fallbackContext?: string | null
  contextQuery?: string | null
  inputSize?: number
  maxTokens: number
}

export class AiRouteResponseError extends Error {
  response: NextResponse

  constructor(response: NextResponse, message = "AI route response") {
    super(message)
    this.name = "AiRouteResponseError"
    this.response = response
  }
}

export const LIVE_OUTPUT_TOKEN_CAPS: Record<Exclude<AiTaskKind, "batch" | "unknown">, number> = {
  generate: getBaseLiveOutputTokenCap("generate"),
  "generate-next": getBaseLiveOutputTokenCap("generate-next"),
  "improve-dialogue": getBaseLiveOutputTokenCap("improve-dialogue"),
  "rewrite-style": getBaseLiveOutputTokenCap("rewrite-style"),
  shots: getBaseLiveOutputTokenCap("shots"),
  "movie-references": getBaseLiveOutputTokenCap("movie-references"),
  documents: getBaseLiveOutputTokenCap("documents"),
}

const LIVE_BATCH_REQUIRED_INPUT_CHARS: Partial<Record<AiTaskKind, number>> = {
  "improve-dialogue": 60_000,
  "rewrite-style": 60_000,
}

export function classifyAiTaskKind(endpoint: string): AiTaskKind {
  const normalized = endpoint.trim().toLowerCase()
  if (normalized === "generate" || normalized === "full-screenplay") return "generate"
  if (normalized === "generate-next" || normalized === "continuation") return "generate-next"
  if (normalized === "improve-dialogue") return "improve-dialogue"
  if (normalized === "rewrite-style" || normalized === "long-rewrite") return "rewrite-style"
  if (normalized === "shots" || normalized === "shot-suggestions") return "shots"
  if (normalized === "movie-references" || normalized === "background-references") return "movie-references"
  if (normalized === "documents") return "documents"
  if (normalized.includes("batch")) return "batch"
  return "unknown"
}

export function resolveTokenGuard(input: {
  taskKind: AiTaskKind
  requestedMode: GenerationMode
  maxTokens: number
  inputSize?: number
  plan?: SubscriptionPlan
}): TokenGuardDecision {
  const inputSize = Math.max(0, input.inputSize ?? 0)
  const cap =
    input.taskKind in LIVE_OUTPUT_TOKEN_CAPS
      ? getPlanAwareLiveOutputTokenCap(
          input.taskKind as keyof typeof LIVE_OUTPUT_TOKEN_CAPS,
          input.plan ?? "pro"
        )
      : null
  const batchThreshold = LIVE_BATCH_REQUIRED_INPUT_CHARS[input.taskKind]
  const batchRequired = input.requestedMode === "live" && !!batchThreshold && inputSize > batchThreshold
  const effectiveMaxTokens =
    input.requestedMode === "live" && cap ? Math.min(Math.max(1, input.maxTokens), cap) : Math.max(1, input.maxTokens)

  if (batchRequired) {
    return {
      ok: false,
      taskKind: input.taskKind,
      requestedMode: input.requestedMode,
      requestedMaxTokens: input.maxTokens,
      effectiveMaxTokens,
      cap,
      inputSize,
      batchRequired: true,
      reason: "This script is too large for live generation. Queue it as a batch job.",
    }
  }

  return {
    ok: true,
    taskKind: input.taskKind,
    requestedMode: input.requestedMode,
    requestedMaxTokens: input.maxTokens,
    effectiveMaxTokens,
    cap,
    inputSize,
    batchRequired: false,
  }
}

export function tokenGuardResponse(decision: TokenGuardDecision): NextResponse {
  return NextResponse.json(
    {
      error: decision.reason || "This AI task cannot run live.",
      code: "batch_required",
      batchEndpoint: "/api/ai/batch-jobs",
      taskKind: decision.taskKind,
      inputSize: decision.inputSize,
      liveInputLimit: LIVE_BATCH_REQUIRED_INPUT_CHARS[decision.taskKind] ?? null,
    },
    { status: 409 }
  )
}

export function compactContextText(text: string, maxTokens: number): string {
  const trimmed = text.trim()
  if (!trimmed) return ""
  if (estimateTokens(trimmed) <= maxTokens) return trimmed

  const maxChars = Math.max(500, maxTokens * 3)
  return trimmed.slice(Math.max(0, trimmed.length - maxChars)).trim()
}

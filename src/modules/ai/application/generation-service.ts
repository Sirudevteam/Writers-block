import type { NextResponse } from "next/server"
import type { SubscriptionPlan } from "@/shared/types/project"
import type { AiModelRef, AiTaskComplexity } from "@/modules/ai/domain/costing"
import type { AiCacheStrategy } from "@/modules/ai/domain/task-policy"
import {
  AiRouteResponseError,
  classifyAiTaskKind,
  resolveTokenGuard,
  tokenGuardResponse,
  type AiTaskKind,
  type GenerationMode,
  type StoryContextSnapshot,
  type TokenGuardDecision,
} from "@/modules/ai/domain/generation"
import {
  createAiSseResponse,
  generateAiText,
  type AiCompletionResult,
} from "@/modules/ai/infrastructure/provider-router"
import { buildStoryContextSnapshot, storyContextPrompt } from "@/modules/story-memory/application/story-memory-service"

type GenerationBaseOptions = {
  userId: string
  plan: SubscriptionPlan
  endpoint: string
  taskKind?: AiTaskKind
  requestedMode?: GenerationMode
  complexity: AiTaskComplexity
  candidateModels?: AiModelRef[]
  requestId?: string
  orgId?: string | null
  projectId?: string | null
  cacheStrategy?: AiCacheStrategy
  cacheContext?: string
  systemPrompt: string
  userPrompt: string
  fallbackContext?: string | null
  contextQuery?: string | null
  inputSize?: number
  maxTokens: number
  temperature: number
  topP?: number
  signal?: AbortSignal
  metadata?: Record<string, unknown>
  onComplete?: (result: AiCompletionResult) => void | Promise<void>
}

type SseGenerationOptions = GenerationBaseOptions & {
  rateLimitHeaders?: HeadersInit
}

function buildAugmentedPrompt(userPrompt: string, snapshot: StoryContextSnapshot): string {
  const context = storyContextPrompt(snapshot)
  if (!context) return userPrompt
  return `${context}\n\nUSER REQUEST\n${userPrompt}`
}

async function prepareGenerationOptions<T extends GenerationBaseOptions>(
  opts: T
): Promise<T & { taskKind: AiTaskKind; maxTokens: number; userPrompt: string; metadata: Record<string, unknown>; tokenGuard: TokenGuardDecision; storyContext: StoryContextSnapshot }> {
  const taskKind = opts.taskKind ?? classifyAiTaskKind(opts.endpoint)
  const requestedMode = opts.requestedMode ?? "live"
  const tokenGuard = resolveTokenGuard({
    taskKind,
    requestedMode,
    maxTokens: opts.maxTokens,
    inputSize: opts.inputSize ?? opts.userPrompt.length,
    plan: opts.plan,
  })

  if (!tokenGuard.ok) {
    throw new AiRouteResponseError(tokenGuardResponse(tokenGuard), tokenGuard.reason)
  }

  const storyContext = await buildStoryContextSnapshot({
    userId: opts.userId,
    orgId: opts.orgId,
    projectId: opts.projectId,
    query: opts.contextQuery ?? opts.userPrompt,
    fallbackContext: opts.fallbackContext,
  })

  return {
    ...opts,
    taskKind,
    maxTokens: tokenGuard.effectiveMaxTokens,
    userPrompt: buildAugmentedPrompt(opts.userPrompt, storyContext),
    cacheContext: [opts.cacheContext, storyContext.contextText].filter(Boolean).join("\n\n"),
    metadata: {
      ...(opts.metadata ?? {}),
      generationService: {
        taskKind,
        requestedMode,
        tokenGuard: {
          requestedMaxTokens: tokenGuard.requestedMaxTokens,
          effectiveMaxTokens: tokenGuard.effectiveMaxTokens,
          cap: tokenGuard.cap,
          inputSize: tokenGuard.inputSize,
        },
        storyContext: {
          status: storyContext.status,
          projectId: storyContext.projectId,
          memoryChunkCount: storyContext.memoryChunkCount,
          storyBibleEntryCount: storyContext.storyBibleEntryCount ?? 0,
          tokenEstimate: storyContext.tokenEstimate,
          reason: storyContext.reason,
        },
      },
    },
    tokenGuard,
    storyContext,
  }
}

export async function createGenerationSseResponse(opts: SseGenerationOptions): Promise<NextResponse> {
  const prepared = await prepareGenerationOptions(opts)
  return createAiSseResponse(prepared)
}

export async function generateTextWithService(opts: GenerationBaseOptions) {
  const prepared = await prepareGenerationOptions(opts)
  return generateAiText(prepared)
}

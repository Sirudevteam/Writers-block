import { NextResponse } from "next/server"
import crypto from "crypto"
import type { SubscriptionPlan } from "@/shared/types/project"
import {
  downgradeComplexity,
  estimateTokens,
  normalizeUsage,
  parseModelList,
  type AiModelRef,
  type AiProvider,
  type AiTaskComplexity,
  type AiTokenUsage,
} from "@/modules/ai/domain/costing"
import {
  aiBudgetHeaders,
  assertAiBudgetAllowed,
  calculateRecordCost,
  getAiBudgetDecision,
  recordAiUsage,
  type AiBudgetDecision,
} from "@/modules/ai/application/usage-service"
import { resolveAiPromptCache, type AiPromptCacheResult } from "@/modules/ai/infrastructure/prompt-cache-repository"
import type { AiCacheStrategy } from "@/modules/ai/domain/task-policy"
import {
  authorizeAiCredits,
  finalizeAiCreditReservation,
  releaseAiCreditReservation,
} from "@/modules/ai/application/credit-service"
import type { AiCreditAuthorization } from "@/modules/ai/domain/credits"

type AiBaseRequest = {
  userId: string
  plan: SubscriptionPlan
  endpoint: string
  complexity: AiTaskComplexity
  candidateModels?: AiModelRef[]
  requestId?: string
  orgId?: string | null
  projectId?: string | null
  cacheStrategy?: AiCacheStrategy
  cacheContext?: string
  systemPrompt: string
  userPrompt: string
  maxTokens: number
  temperature: number
  topP?: number
  signal?: AbortSignal
  metadata?: Record<string, unknown>
  onComplete?: (result: AiCompletionResult) => void | Promise<void>
}

type StartedStream = {
  ref: AiModelRef
  usage: Partial<AiTokenUsage>
  stream: AsyncGenerator<string>
}

type TextResult = {
  text: string
  ref: AiModelRef
  usage: AiTokenUsage
  budget: AiBudgetDecision
  credits: AiCreditAuthorization
  effectiveComplexity: AiTaskComplexity
  requestId: string
  cache: AiPromptCacheResult
}

export type AiCompletionResult = TextResult

type SseResponseOptions = AiBaseRequest & {
  rateLimitHeaders?: HeadersInit
}

type SseEvent = {
  event?: string
  data: string
}

const E2E_MOCK_MODEL = "e2e-deterministic"

class AiProviderConfigurationError extends Error {
  constructor(message = "No configured AI provider is available.") {
    super(message)
    this.name = "AiProviderConfigurationError"
  }
}

class AiProviderError extends Error {
  status?: number
  provider?: AiProvider

  constructor(message: string, options?: { status?: number; provider?: AiProvider }) {
    super(message)
    this.name = "AiProviderError"
    this.status = options?.status
    this.provider = options?.provider
  }
}

function isAiProviderConfigurationError(error: unknown): error is AiProviderConfigurationError {
  return error instanceof AiProviderConfigurationError
}

function apiKeyFor(provider: AiProvider): string | undefined {
  if (provider === "openai") return process.env.OPENAI_API_KEY
  if (provider === "gemini") return process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY
  if (provider === "anthropic") return process.env.ANTHROPIC_API_KEY
  return undefined
}

function hasUsableApiKey(provider: AiProvider): boolean {
  const key = apiKeyFor(provider)
  if (!key || key.length < 12) return false
  if (provider === "anthropic" && key.includes("your_anthropic")) return false
  return true
}

function envModels(name: string): AiModelRef[] {
  return parseModelList(process.env[name])
}

function isAiProviderMockEnabled(): boolean {
  if (process.env.AI_PROVIDER_MOCK === "true") return true
  return process.env.NODE_ENV !== "production" && process.env.ENABLE_E2E_TEST_ROUTES === "true"
}

function defaultModels(complexity: AiTaskComplexity): AiModelRef[] {
  if (complexity === "simple") {
    return [
      { provider: "gemini", model: process.env.AI_GEMINI_SIMPLE_MODEL || "gemini-2.5-flash-lite" },
      { provider: "openai", model: process.env.AI_OPENAI_SIMPLE_MODEL || "gpt-4o-mini" },
      { provider: "anthropic", model: process.env.AI_ANTHROPIC_SIMPLE_MODEL || "claude-haiku-4-5-20251001" },
    ]
  }

  if (complexity === "standard") {
    return [
      { provider: "gemini", model: process.env.AI_GEMINI_STANDARD_MODEL || "gemini-2.5-flash" },
      { provider: "openai", model: process.env.AI_OPENAI_STANDARD_MODEL || "gpt-5.4-mini" },
      { provider: "anthropic", model: process.env.AI_ANTHROPIC_STANDARD_MODEL || "claude-haiku-4-5-20251001" },
    ]
  }

  const models: AiModelRef[] = [
    { provider: "openai", model: process.env.AI_OPENAI_COMPLEX_MODEL || "gpt-5.4" },
    { provider: "anthropic", model: process.env.AI_ANTHROPIC_COMPLEX_MODEL || "claude-sonnet-4-6" },
  ]

  if (process.env.AI_ENABLE_GEMINI_3_1_PRO === "true") {
    models.push({ provider: "gemini", model: process.env.AI_GEMINI_COMPLEX_MODEL || "gemini-3.1-pro-preview" })
  }

  return models
}

function configuredCandidates(
  complexity: AiTaskComplexity,
  candidateModels?: AiModelRef[]
): AiModelRef[] {
  if (isAiProviderMockEnabled()) return [{ provider: "openai", model: E2E_MOCK_MODEL }]

  const override = envModels(`AI_${complexity.toUpperCase()}_MODELS`)
  const policyModels = candidateModels?.length ? candidateModels : []
  const direct = (override.length > 0 ? override : policyModels.length > 0 ? policyModels : defaultModels(complexity)).filter((ref) =>
    hasUsableApiKey(ref.provider)
  )

  return direct
}

async function providerError(response: Response, provider: AiProvider): Promise<AiProviderError> {
  const text = await response.text().catch(() => "")
  const message = text ? text.slice(0, 500) : `${provider} returned ${response.status}`
  return new AiProviderError(message, { status: response.status, provider })
}

async function* parseSse(response: Response): AsyncGenerator<SseEvent> {
  if (!response.body) throw new AiProviderError("AI provider returned an empty stream.")
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    buffer = buffer.replace(/\r\n/g, "\n")

    let idx = buffer.indexOf("\n\n")
    while (idx >= 0) {
      const raw = buffer.slice(0, idx)
      buffer = buffer.slice(idx + 2)
      const event = parseSseBlock(raw)
      if (event) yield event
      idx = buffer.indexOf("\n\n")
    }
  }

  buffer += decoder.decode()
  buffer = buffer.replace(/\r\n/g, "\n")
  const final = parseSseBlock(buffer)
  if (final) yield final
}

function parseSseBlock(raw: string): SseEvent | null {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
  if (lines.length === 0) return null

  let event: string | undefined
  const data: string[] = []

  for (const line of lines) {
    if (line.startsWith("event:")) event = line.slice(6).trim()
    if (line.startsWith("data:")) data.push(line.slice(5).trimStart())
  }

  if (data.length === 0) return null
  return { event, data: data.join("\n") }
}

function parseOpenAiUsage(raw: any): AiTokenUsage {
  const input = Number(raw?.prompt_tokens ?? raw?.input_tokens ?? 0)
  const output = Number(raw?.completion_tokens ?? raw?.output_tokens ?? 0)
  const cached = Number(
    raw?.prompt_tokens_details?.cached_tokens ??
      raw?.input_tokens_details?.cached_tokens ??
      raw?.input_token_details?.cached_tokens ??
      0
  )

  return normalizeUsage({
    inputTokens: input,
    outputTokens: output,
    cachedInputTokens: cached,
    totalTokens: Number(raw?.total_tokens ?? input + output),
    source: "provider",
  })
}

function parseGeminiUsage(raw: any): AiTokenUsage {
  const input = Number(raw?.promptTokenCount ?? 0)
  const output = Number(raw?.candidatesTokenCount ?? 0)
  const cached = Number(raw?.cachedContentTokenCount ?? 0)

  return normalizeUsage({
    inputTokens: input,
    outputTokens: output,
    cachedInputTokens: cached,
    totalTokens: Number(raw?.totalTokenCount ?? input + output),
    source: input || output ? "provider" : "estimated",
  })
}

function parseAnthropicUsage(raw: any): AiTokenUsage {
  const input = Number(raw?.input_tokens ?? 0)
  const output = Number(raw?.output_tokens ?? 0)
  const cacheRead = Number(raw?.cache_read_input_tokens ?? 0)
  const cacheCreation = Number(raw?.cache_creation_input_tokens ?? 0)

  return normalizeUsage({
    inputTokens: input + cacheRead + cacheCreation,
    outputTokens: output,
    cachedInputTokens: cacheRead,
    cacheCreationInputTokens: cacheCreation,
    totalTokens: input + cacheRead + cacheCreation + output,
    source: input || output || cacheRead || cacheCreation ? "provider" : "estimated",
  })
}

function openAiBody(ref: AiModelRef, opts: AiBaseRequest, stream: boolean) {
  return {
    model: ref.model,
    messages: [
      { role: "system", content: opts.systemPrompt },
      { role: "user", content: opts.userPrompt },
    ],
    max_completion_tokens: opts.maxTokens,
    temperature: opts.temperature,
    top_p: opts.topP ?? 0.9,
    stream,
    ...(stream ? { stream_options: { include_usage: true } } : {}),
  }
}

async function startOpenAiStream(ref: AiModelRef, opts: AiBaseRequest): Promise<StartedStream> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKeyFor("openai")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(openAiBody(ref, opts, true)),
    signal: opts.signal,
  })

  if (!response.ok) throw await providerError(response, "openai")

  const usage: Partial<AiTokenUsage> = { source: "estimated" }
  async function* stream() {
    for await (const event of parseSse(response)) {
      if (event.data === "[DONE]") break
      const json = JSON.parse(event.data)
      const content = json?.choices?.[0]?.delta?.content
      if (content) yield content
      if (json?.usage) Object.assign(usage, parseOpenAiUsage(json.usage))
    }
  }

  return { ref, usage, stream: stream() }
}

async function runOpenAiText(ref: AiModelRef, opts: AiBaseRequest): Promise<{ text: string; usage: AiTokenUsage }> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKeyFor("openai")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(openAiBody(ref, opts, false)),
    signal: opts.signal,
  })

  if (!response.ok) throw await providerError(response, "openai")
  const json = await response.json()
  const text = json?.choices?.[0]?.message?.content ?? ""
  return { text, usage: parseOpenAiUsage(json?.usage) }
}

function geminiBody(opts: AiBaseRequest) {
  return {
    systemInstruction: { parts: [{ text: opts.systemPrompt }] },
    contents: [{ role: "user", parts: [{ text: opts.userPrompt }] }],
    generationConfig: {
      maxOutputTokens: opts.maxTokens,
      temperature: opts.temperature,
      topP: opts.topP ?? 0.9,
    },
  }
}

function geminiText(json: any): string {
  return (
    json?.candidates?.[0]?.content?.parts
      ?.map((part: any) => (typeof part?.text === "string" ? part.text : ""))
      .join("") ?? ""
  )
}

async function startGeminiStream(ref: AiModelRef, opts: AiBaseRequest): Promise<StartedStream> {
  const key = apiKeyFor("gemini")
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(ref.model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(key ?? "")}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(geminiBody(opts)),
      signal: opts.signal,
    }
  )

  if (!response.ok) throw await providerError(response, "gemini")

  const usage: Partial<AiTokenUsage> = { source: "estimated" }
  async function* stream() {
    for await (const event of parseSse(response)) {
      const json = JSON.parse(event.data)
      const content = geminiText(json)
      if (content) yield content
      if (json?.usageMetadata) Object.assign(usage, parseGeminiUsage(json.usageMetadata))
    }
  }

  return { ref, usage, stream: stream() }
}

async function runGeminiText(ref: AiModelRef, opts: AiBaseRequest): Promise<{ text: string; usage: AiTokenUsage }> {
  const key = apiKeyFor("gemini")
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(ref.model)}:generateContent?key=${encodeURIComponent(key ?? "")}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(geminiBody(opts)),
      signal: opts.signal,
    }
  )

  if (!response.ok) throw await providerError(response, "gemini")
  const json = await response.json()
  return { text: geminiText(json), usage: parseGeminiUsage(json?.usageMetadata) }
}

function shouldUseAnthropicPromptCache(opts: AiBaseRequest): boolean {
  if (opts.cacheStrategy !== "project_context") return false
  const context = opts.cacheContext ?? opts.userPrompt
  return context.length >= 2_000
}

function anthropicUserContent(opts: AiBaseRequest): string | Array<Record<string, unknown>> {
  if (!shouldUseAnthropicPromptCache(opts)) return opts.userPrompt
  return [
    {
      type: "text",
      text: opts.userPrompt,
      cache_control: { type: "ephemeral" },
    },
  ]
}

function anthropicBody(ref: AiModelRef, opts: AiBaseRequest, stream: boolean) {
  return {
    model: ref.model,
    max_tokens: opts.maxTokens,
    temperature: opts.temperature,
    system: opts.systemPrompt,
    messages: [{ role: "user", content: anthropicUserContent(opts) }],
    stream,
  }
}

function mockAiText(opts: AiBaseRequest): string {
  const contextMatch = opts.userPrompt.match(
    /(RELEVANT PROJECT MEMORY|PROJECT CONTEXT FALLBACK)\n([\s\S]*?)(?:\n\nUSER REQUEST|$)/
  )
  const contextSnippet = contextMatch?.[2]?.trim().slice(0, 700)

  return [
    "E2E MOCK SCREENPLAY",
    "",
    "INT. WRITERS ROOM - DAY",
    "",
    "The scene continues with a deterministic test response. The output is intentionally stable so CI never calls a live AI provider.",
    contextSnippet ? `\nCONTEXT USED\n${contextSnippet}` : "",
  ]
    .filter(Boolean)
    .join("\n")
}

function mockAiUsage(opts: AiBaseRequest, text: string): AiTokenUsage {
  return normalizeUsage({
    inputTokens: estimateTokens(`${opts.systemPrompt}\n${opts.userPrompt}`),
    outputTokens: estimateTokens(text),
    source: "estimated",
  })
}

async function startMockAiStream(ref: AiModelRef, opts: AiBaseRequest): Promise<StartedStream> {
  const text = mockAiText(opts)
  const usage: Partial<AiTokenUsage> = mockAiUsage(opts, text)

  async function* stream() {
    const chunkSize = 80
    for (let index = 0; index < text.length; index += chunkSize) {
      yield text.slice(index, index + chunkSize)
    }
  }

  return { ref, usage, stream: stream() }
}

async function runMockAiText(_ref: AiModelRef, opts: AiBaseRequest): Promise<{ text: string; usage: AiTokenUsage }> {
  const text = mockAiText(opts)
  return { text, usage: mockAiUsage(opts, text) }
}

async function startAnthropicStream(ref: AiModelRef, opts: AiBaseRequest): Promise<StartedStream> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKeyFor("anthropic") ?? "",
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(anthropicBody(ref, opts, true)),
    signal: opts.signal,
  })

  if (!response.ok) throw await providerError(response, "anthropic")

  const usage: Partial<AiTokenUsage> = { source: "estimated" }
  async function* stream() {
    for await (const event of parseSse(response)) {
      const json = JSON.parse(event.data)
      if (event.event === "message_start" && json?.message?.usage) {
        Object.assign(usage, parseAnthropicUsage(json.message.usage))
      }
      if (event.event === "content_block_delta" && typeof json?.delta?.text === "string") {
        yield json.delta.text
      }
      if (event.event === "message_delta" && json?.usage) {
        Object.assign(usage, {
          ...parseAnthropicUsage({
            ...usage,
            output_tokens: json.usage.output_tokens,
          }),
          inputTokens: usage.inputTokens ?? 0,
          cachedInputTokens: usage.cachedInputTokens ?? 0,
          cacheCreationInputTokens: usage.cacheCreationInputTokens ?? 0,
        })
      }
    }
  }

  return { ref, usage, stream: stream() }
}

async function runAnthropicText(ref: AiModelRef, opts: AiBaseRequest): Promise<{ text: string; usage: AiTokenUsage }> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKeyFor("anthropic") ?? "",
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(anthropicBody(ref, opts, false)),
    signal: opts.signal,
  })

  if (!response.ok) throw await providerError(response, "anthropic")
  const json = await response.json()
  const text = json?.content?.map((part: any) => (part?.type === "text" ? part.text : "")).join("") ?? ""
  return { text, usage: parseAnthropicUsage(json?.usage) }
}

async function startProviderStream(ref: AiModelRef, opts: AiBaseRequest): Promise<StartedStream> {
  if (ref.model === E2E_MOCK_MODEL) return startMockAiStream(ref, opts)
  if (ref.provider === "openai") return startOpenAiStream(ref, opts)
  if (ref.provider === "gemini") return startGeminiStream(ref, opts)
  if (ref.provider === "anthropic") return startAnthropicStream(ref, opts)
  throw new AiProviderConfigurationError(`Unsupported AI provider: ${ref.provider}`)
}

async function runProviderText(ref: AiModelRef, opts: AiBaseRequest): Promise<{ text: string; usage: AiTokenUsage }> {
  if (ref.model === E2E_MOCK_MODEL) return runMockAiText(ref, opts)
  if (ref.provider === "openai") return runOpenAiText(ref, opts)
  if (ref.provider === "gemini") return runGeminiText(ref, opts)
  if (ref.provider === "anthropic") return runAnthropicText(ref, opts)
  throw new AiProviderConfigurationError(`Unsupported AI provider: ${ref.provider}`)
}

async function chooseStartedStream(opts: AiBaseRequest, effectiveComplexity: AiTaskComplexity): Promise<StartedStream> {
  const candidates = configuredCandidates(effectiveComplexity, opts.candidateModels)
  if (candidates.length === 0) throw new AiProviderConfigurationError()

  let lastError: unknown
  for (const candidate of candidates) {
    try {
      return await startProviderStream(candidate, opts)
    } catch (error) {
      lastError = error
    }
  }

  throw lastError instanceof Error ? lastError : new AiProviderError("All AI providers failed.")
}

async function runTextWithFallback(opts: AiBaseRequest, effectiveComplexity: AiTaskComplexity) {
  const candidates = configuredCandidates(effectiveComplexity, opts.candidateModels)
  if (candidates.length === 0) throw new AiProviderConfigurationError()

  let lastError: unknown
  for (const candidate of candidates) {
    try {
      const result = await runProviderText(candidate, opts)
      return { ...result, ref: candidate }
    } catch (error) {
      lastError = error
    }
  }

  throw lastError instanceof Error ? lastError : new AiProviderError("All AI providers failed.")
}

function resolveBudgetedComplexity(
  decision: AiBudgetDecision,
  complexity: AiTaskComplexity,
  topUpReserved: boolean
): AiTaskComplexity {
  return decision.state === "downgrade" || (decision.state === "blocked" && topUpReserved)
    ? downgradeComplexity(complexity)
    : complexity
}

async function prepareBudget(opts: AiBaseRequest) {
  const estimatedInput = estimateTokens(`${opts.systemPrompt}\n${opts.userPrompt}`)
  const decision = await getAiBudgetDecision(opts.userId, opts.plan, estimatedInput, opts.maxTokens)
  const credits = await authorizeAiCredits({
    userId: opts.userId,
    plan: opts.plan,
    requestId: requestIdFor(opts),
    currentMonthlyCreditsUsed: decision.totalUsed,
    includedCreditLimit: decision.totalLimit,
    estimatedCredits: estimatedInput + opts.maxTokens,
  })
  const topUpReserved = credits.reservation.status === "reserved"

  assertAiBudgetAllowed(decision, {
    topUpReserved,
    reason: credits.reservation.reason,
  })

  if (credits.reservation.status === "blocked" || credits.reservation.status === "unavailable") {
    assertAiBudgetAllowed(
      { ...decision, state: "blocked", reason: credits.reservation.reason },
      { topUpReserved: false, reason: credits.reservation.reason }
    )
  }

  const effectiveComplexity = resolveBudgetedComplexity(decision, opts.complexity, topUpReserved)
  return { decision, credits, effectiveComplexity, estimatedInput }
}

function requestIdFor(opts: AiBaseRequest): string {
  return opts.requestId || crypto.randomUUID()
}

async function resolveRequestCache(
  opts: AiBaseRequest,
  ref: AiModelRef,
  effectiveComplexity: AiTaskComplexity
): Promise<AiPromptCacheResult> {
  return resolveAiPromptCache({
    userId: opts.userId,
    orgId: opts.orgId,
    projectId: opts.projectId,
    provider: ref.provider,
    model: ref.model,
    strategy: opts.cacheStrategy ?? "none",
    context: opts.cacheContext ?? opts.userPrompt,
    metadata: {
      endpoint: opts.endpoint,
      complexity: effectiveComplexity,
      requestId: opts.requestId,
    },
  })
}

function metadataWithAiTrace(
  opts: AiBaseRequest,
  requestId: string,
  effectiveComplexity: AiTaskComplexity,
  ref: AiModelRef,
  cache: AiPromptCacheResult,
  credits?: AiCreditAuthorization
): Record<string, unknown> {
  return {
    ...(opts.metadata ?? {}),
    requestId,
    projectId: opts.projectId ?? null,
    orgId: opts.orgId ?? null,
    provider: ref.provider,
    model: ref.model,
    effectiveComplexity,
    requestedComplexity: opts.complexity,
    cache: {
      strategy: opts.cacheStrategy ?? "none",
      contextHash: cache.contextHash,
      hit: cache.cacheHit,
      entryId: cache.cacheEntryId,
      providerCacheId: cache.providerCacheId,
    },
    aiCredits: credits
      ? {
          reservationStatus: credits.reservation.status,
          reservationId: credits.reservation.id,
          requiredTopUpCredits: credits.reservation.requiredCredits,
          reservedTopUpCredits: credits.reservation.reservedCredits,
          includedRemainingAtReservation: credits.reservation.includedRemainingAtReservation,
        }
      : undefined,
  }
}

export async function generateAiText(opts: AiBaseRequest): Promise<TextResult> {
  const requestId = requestIdFor(opts)
  const tracedOpts = { ...opts, requestId }
  const startedAt = Date.now()
  const { decision, credits, effectiveComplexity, estimatedInput } = await prepareBudget(tracedOpts)
  let selected: AiModelRef | null = null

  try {
    const result = await runTextWithFallback(tracedOpts, effectiveComplexity)
    selected = result.ref
    const cache = await resolveRequestCache(tracedOpts, result.ref, effectiveComplexity)
    const usage = normalizeUsage(result.usage, result.text)
    if (!usage.inputTokens) usage.inputTokens = estimatedInput
    const cost = calculateRecordCost(result.ref, usage)

    await recordAiUsage({
      userId: opts.userId,
      endpoint: opts.endpoint,
      plan: opts.plan,
      provider: result.ref.provider,
      model: result.ref.model,
      complexity: effectiveComplexity,
      originalComplexity: opts.complexity,
      usage,
      costUsd: cost.costUsd,
      latencyMs: Date.now() - startedAt,
      status: "success",
      metadata: metadataWithAiTrace(tracedOpts, requestId, effectiveComplexity, result.ref, cache, credits),
    })

    await finalizeAiCreditReservation({
      reservationId: credits.reservation.id,
      actualCredits: usage.totalTokens ?? usage.inputTokens + usage.outputTokens,
    })

    const completed = { text: result.text, ref: result.ref, usage, budget: decision, credits, effectiveComplexity, requestId, cache }
    await Promise.resolve(tracedOpts.onComplete?.(completed)).catch((callbackError: unknown) => {
      console.error("[ai-router] onComplete callback failed:", callbackError)
    })

    return completed
  } catch (error) {
    if (selected) {
      const cache = await resolveRequestCache(tracedOpts, selected, effectiveComplexity)
      await recordAiUsage({
        userId: opts.userId,
        endpoint: opts.endpoint,
        plan: opts.plan,
        provider: selected.provider,
        model: selected.model,
        complexity: effectiveComplexity,
        originalComplexity: opts.complexity,
        usage: normalizeUsage({ inputTokens: estimatedInput, outputTokens: 0, source: "estimated" }),
        costUsd: 0,
        latencyMs: Date.now() - startedAt,
        status: "failed",
        errorMessage: error instanceof Error ? error.message.slice(0, 500) : "Unknown AI provider error",
        metadata: metadataWithAiTrace(tracedOpts, requestId, effectiveComplexity, selected, cache, credits),
      })
    }
    await releaseAiCreditReservation(credits.reservation.id)
    throw error
  }
}

export async function createAiSseResponse(opts: SseResponseOptions): Promise<NextResponse> {
  const requestId = requestIdFor(opts)
  const tracedOpts = { ...opts, requestId }
  const startedAt = Date.now()
  const { decision, credits, effectiveComplexity, estimatedInput } = await prepareBudget(tracedOpts)
  let started: StartedStream
  try {
    started = await chooseStartedStream(tracedOpts, effectiveComplexity)
  } catch (error) {
    await releaseAiCreditReservation(credits.reservation.id)
    throw error
  }
  const cache = await resolveRequestCache(tracedOpts, started.ref, effectiveComplexity)
  const encoder = new TextEncoder()
  const budgetHeaders = aiBudgetHeaders(decision)
  let outputText = ""

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const text of started.stream) {
          outputText += text
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: text })}\n\n`))
        }

        const usage = normalizeUsage(started.usage, outputText)
        if (!usage.inputTokens) usage.inputTokens = estimatedInput
        const cost = calculateRecordCost(started.ref, usage)

        await recordAiUsage({
          userId: opts.userId,
          endpoint: opts.endpoint,
          plan: opts.plan,
          provider: started.ref.provider,
          model: started.ref.model,
          complexity: effectiveComplexity,
          originalComplexity: opts.complexity,
          usage,
          costUsd: cost.costUsd,
          latencyMs: Date.now() - startedAt,
          status: "success",
          metadata: metadataWithAiTrace(tracedOpts, requestId, effectiveComplexity, started.ref, cache, credits),
        })

        await finalizeAiCreditReservation({
          reservationId: credits.reservation.id,
          actualCredits: usage.totalTokens ?? usage.inputTokens + usage.outputTokens,
        })

        await Promise.resolve(
          tracedOpts.onComplete?.({
            text: outputText,
            ref: started.ref,
            usage,
            budget: decision,
            credits,
            effectiveComplexity,
            requestId,
            cache,
          })
        ).catch((callbackError: unknown) => {
          console.error("[ai-router] stream onComplete callback failed:", callbackError)
        })

        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`))
        controller.close()
      } catch (error) {
        await recordAiUsage({
          userId: opts.userId,
          endpoint: opts.endpoint,
          plan: opts.plan,
          provider: started.ref.provider,
          model: started.ref.model,
          complexity: effectiveComplexity,
          originalComplexity: opts.complexity,
          usage: normalizeUsage({
            inputTokens: estimatedInput,
            outputTokens: estimateTokens(outputText),
            source: "estimated",
          }),
          costUsd: 0,
          latencyMs: Date.now() - startedAt,
          status: "failed",
          errorMessage: error instanceof Error ? error.message.slice(0, 500) : "Unknown AI stream error",
          metadata: metadataWithAiTrace(tracedOpts, requestId, effectiveComplexity, started.ref, cache, credits),
        })
        await releaseAiCreditReservation(credits.reservation.id)
        controller.error(error)
      }
    },
  })

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      ...opts.rateLimitHeaders,
      ...budgetHeaders,
      "X-AI-Request-Id": requestId,
      "X-AI-Provider": started.ref.provider,
      "X-AI-Model": started.ref.model,
      "X-AI-Complexity": effectiveComplexity,
      "X-AI-Cache-Hit": cache.cacheHit ? "1" : "0",
      "X-AI-Credit-Reservation": credits.reservation.status,
    },
  })
}

export function aiRouteErrorResponse(error: unknown, fallbackMessage: string): NextResponse {
  if (error && typeof error === "object" && "response" in error && error.response instanceof NextResponse) {
    return error.response
  }

  if (isAiProviderConfigurationError(error)) {
    return NextResponse.json({ error: "Server configuration error. Please contact support." }, { status: 500 })
  }

  if (error instanceof AiProviderError && error.status === 429) {
    return NextResponse.json({ error: "AI service is busy. Please wait a moment and try again." }, { status: 503 })
  }

  const message = error instanceof Error && error.message ? error.message : fallbackMessage
  return NextResponse.json({ error: message || fallbackMessage }, { status: 500 })
}

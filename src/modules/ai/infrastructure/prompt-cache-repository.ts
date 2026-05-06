import crypto from "crypto"
import { createAdminClient } from "@/infrastructure/db/supabase/admin"
import { estimateTokens, type AiModelRef } from "@/modules/ai/domain/costing"
import type { Json } from "@/infrastructure/db/types/database"
import type { AiCacheStrategy } from "@/modules/ai/domain/task-policy"

type AiPromptCacheIntent = {
  userId: string
  orgId?: string | null
  projectId?: string | null
  provider?: AiModelRef["provider"] | null
  model?: string | null
  strategy: AiCacheStrategy
  context: string
  metadata?: Record<string, unknown>
}

export type AiPromptCacheResult = {
  contextHash: string | null
  cacheHit: boolean
  cacheEntryId: string | null
  providerCacheId: string | null
}

const EMPTY_CACHE_RESULT: AiPromptCacheResult = {
  contextHash: null,
  cacheHit: false,
  cacheEntryId: null,
  providerCacheId: null,
}

function cacheTtlHours(): number {
  const raw = Number(process.env.AI_PROMPT_CACHE_TTL_HOURS)
  return Number.isFinite(raw) && raw > 0 ? Math.min(raw, 168) : 24
}

function normalizeContext(context: string): string {
  return context.replace(/\r\n/g, "\n").replace(/[ \t]+$/gm, "").trim()
}

function hashAiPromptContext(context: string): string {
  return crypto.createHash("sha256").update(normalizeContext(context)).digest("hex")
}

function getCacheAdminClient() {
  try {
    return createAdminClient()
  } catch {
    return null
  }
}

export async function resolveAiPromptCache(intent: AiPromptCacheIntent): Promise<AiPromptCacheResult> {
  const normalized = normalizeContext(intent.context)
  const contextHash = normalized ? hashAiPromptContext(normalized) : null

  if (!contextHash) return EMPTY_CACHE_RESULT
  if (intent.strategy === "none") return { ...EMPTY_CACHE_RESULT, contextHash }
  if (!intent.projectId || !intent.provider || !intent.model || normalized.length < 2_000) {
    return { ...EMPTY_CACHE_RESULT, contextHash }
  }

  const admin = getCacheAdminClient()
  if (!admin) return { ...EMPTY_CACHE_RESULT, contextHash }

  const now = new Date().toISOString()
  const baseFilter = {
    user_id: intent.userId,
    project_id: intent.projectId,
    provider: intent.provider,
    model: intent.model,
    context_hash: contextHash,
  }

  const { data: existing, error: lookupError } = await (admin as any)
    .from("ai_prompt_cache_entries")
    .select("id, provider_cache_id, expires_at, use_count")
    .match(baseFilter)
    .maybeSingle()

  if (!lookupError && existing && (!existing.expires_at || existing.expires_at > now)) {
    const useCount = Number(existing.use_count ?? 0) + 1
    await (admin as any)
      .from("ai_prompt_cache_entries")
      .update({ use_count: useCount, last_used_at: now, updated_at: now })
      .eq("id", existing.id)
      .catch?.(() => {})

    return {
      contextHash,
      cacheHit: true,
      cacheEntryId: existing.id,
      providerCacheId: existing.provider_cache_id ?? null,
    }
  }

  const expiresAt = new Date(Date.now() + cacheTtlHours() * 60 * 60 * 1000).toISOString()
  const { data: inserted } = await (admin as any)
    .from("ai_prompt_cache_entries")
    .upsert(
      {
        ...baseFilter,
        org_id: intent.orgId ?? null,
        strategy: intent.strategy,
        token_count: estimateTokens(normalized),
        expires_at: expiresAt,
        metadata: (intent.metadata ?? {}) as Json,
        last_used_at: null,
        use_count: 0,
        updated_at: now,
      },
      { onConflict: "user_id,project_id,provider,model,context_hash" }
    )
    .select("id, provider_cache_id")
    .maybeSingle()

  return {
    contextHash,
    cacheHit: false,
    cacheEntryId: inserted?.id ?? null,
    providerCacheId: inserted?.provider_cache_id ?? null,
  }
}

import type { SupabaseClient } from "@supabase/supabase-js"
import { createAdminClient } from "@/infrastructure/db/supabase/admin"
import type { Database, Json } from "@/infrastructure/db/types/database"
import { compactContextText, type StoryContextSnapshot } from "@/modules/ai/domain/generation"
import { estimateTokens } from "@/modules/ai/domain/costing"
import {
  buildFallbackStoryContext,
  buildStoryMemoryChunks,
  hashStoryMemoryText,
  projectContentHash,
} from "@/modules/story-memory/domain/chunking"
import type { StoryMemoryChunk, StoryMemoryIndexProject } from "@/modules/story-memory/domain/types"
import { embedStoryDocuments, embedStoryQuery } from "@/modules/story-memory/infrastructure/embeddings"
import {
  getProjectMemoryStatus,
  matchProjectStoryMemory,
  replaceProjectStoryMemory,
} from "@/modules/story-memory/infrastructure/story-memory-repository"
import {
  listStoryBibleEntriesForContext,
  listStoryBibleEntriesForMemory,
  type StoryBibleContextRow,
} from "@/modules/story-bible/infrastructure/story-bible-repository"

type DbClient = SupabaseClient<Database>

export function storyMemoryTopK(): number {
  const raw = Number(process.env.STORY_MEMORY_TOP_K)
  return Number.isFinite(raw) && raw > 0 ? Math.min(Math.round(raw), 20) : 8
}

export function storyMemoryMaxContextTokens(): number {
  const raw = Number(process.env.STORY_MEMORY_MAX_CONTEXT_TOKENS)
  return Number.isFinite(raw) && raw > 0 ? Math.min(Math.round(raw), 12_000) : 3_000
}

function formatMemoryContext(matches: Awaited<ReturnType<typeof matchProjectStoryMemory>>): string {
  return matches
    .map((match, index) => {
      const heading = `${index + 1}. ${match.kind}${match.sourceAnchor ? ` - ${match.sourceAnchor}` : ""}`
      return `${heading}\n${match.content}`
    })
    .join("\n\n")
}

function compactContextFromStart(text: string, maxTokens: number): string {
  const trimmed = text.trim()
  if (!trimmed || maxTokens <= 0) return ""
  if (estimateTokens(trimmed) <= maxTokens) return trimmed
  return trimmed.slice(0, Math.max(500, maxTokens * 3)).trim()
}

function formatStoryBibleContext(entries: StoryBibleContextRow[]): string {
  if (entries.length === 0) return ""
  const pinned = entries.filter((entry) => entry.pinned)
  const unpinned = entries.filter((entry) => !entry.pinned)
  const section = (label: string, rows: StoryBibleContextRow[]) =>
    rows.length
      ? `${label}\n${rows
          .map((entry) => `[${entry.kind}] ${entry.title}\n${entry.content}`)
          .join("\n\n")}`
      : ""
  return [section("PINNED STORY BIBLE", pinned), section("STORY BIBLE", unpinned)].filter(Boolean).join("\n\n")
}

function storyBibleMemoryKind(kind: StoryBibleContextRow["kind"]): StoryMemoryChunk["kind"] {
  if (kind === "style_rule") return "continuity_note"
  return kind
}

function storyBibleMemoryChunks(entries: StoryBibleContextRow[]): StoryMemoryChunk[] {
  return entries.map((entry) => {
    const kind = storyBibleMemoryKind(entry.kind)
    const content = `Story Bible ${entry.kind}: ${entry.title}\n${entry.content}`.trim()
    return {
      kind,
      sourceHash: hashStoryMemoryText(`story_bible\n${entry.id}\n${entry.updated_at}\n${content}`),
      sourceAnchor: entry.title,
      content,
      tokenCount: estimateTokens(content),
      metadata: {
        source: "story_bible",
        storyBibleEntryId: entry.id,
        storyBibleKind: entry.kind,
        pinned: entry.pinned,
      },
    }
  })
}

function shouldSkipVectorLookup(): boolean {
  if (process.env.AI_PROVIDER_MOCK === "true") return true
  return process.env.NODE_ENV !== "production" && process.env.ENABLE_E2E_TEST_ROUTES === "true"
}

export async function buildStoryContextSnapshot(params: {
  userId: string
  orgId?: string | null
  projectId?: string | null
  query: string
  fallbackContext?: string | null
}): Promise<StoryContextSnapshot> {
  const projectId = params.projectId ?? null
  const fallback = compactContextText(params.fallbackContext ?? "", storyMemoryMaxContextTokens())

  if (!projectId || !params.orgId) {
    return {
      status: fallback ? "fallback" : "empty",
      projectId,
      contextText: fallback,
      memoryChunkCount: 0,
      tokenEstimate: estimateTokens(fallback),
      reason: "Project context is unavailable.",
    }
  }

  let admin: DbClient
  try {
    admin = createAdminClient()
  } catch {
    return {
      status: fallback ? "fallback" : "unavailable",
      projectId,
      contextText: fallback,
      memoryChunkCount: 0,
      tokenEstimate: estimateTokens(fallback),
      reason: "Story memory service is not configured.",
    }
  }

  try {
    const { data: storyBibleRows } = await listStoryBibleEntriesForContext(admin, {
      orgId: params.orgId,
      projectId,
      limit: 20,
    })
    const storyBibleEntries = (storyBibleRows ?? []) as StoryBibleContextRow[]
    const maxContextTokens = storyMemoryMaxContextTokens()
    const storyBibleText = compactContextFromStart(
      formatStoryBibleContext(storyBibleEntries),
      Math.min(1200, maxContextTokens)
    )
    const memoryBudget = Math.max(500, maxContextTokens - estimateTokens(storyBibleText))

    if (shouldSkipVectorLookup()) {
      const contextText = compactContextText([storyBibleText, fallback].filter(Boolean).join("\n\n"), maxContextTokens)
      return {
        status: contextText ? "memory" : "empty",
        projectId,
        contextText,
        memoryChunkCount: 0,
        storyBibleEntryCount: storyBibleEntries.length,
        tokenEstimate: estimateTokens(contextText),
        reason: "Vector story memory lookup skipped for deterministic AI provider mode.",
      }
    }

    const queryEmbedding = await embedStoryQuery(params.query || fallback || "screenplay context")
    const matches = await matchProjectStoryMemory({
      admin,
      userId: params.userId,
      orgId: params.orgId,
      projectId,
      queryEmbedding,
      matchCount: storyMemoryTopK(),
    })

    if (matches.length === 0) {
      const fallbackWithBible = [storyBibleText, fallback].filter(Boolean).join("\n\n")
      return {
        status: storyBibleText ? "memory" : fallback ? "fallback" : "empty",
        projectId,
        contextText: compactContextText(fallbackWithBible, maxContextTokens),
        memoryChunkCount: 0,
        storyBibleEntryCount: storyBibleEntries.length,
        tokenEstimate: estimateTokens(fallbackWithBible),
        reason: storyBibleText ? "Using Story Bible context; no relevant vector chunks found." : "No relevant story memory chunks found.",
      }
    }

    const memoryText = compactContextText(formatMemoryContext(matches), memoryBudget)
    const contextText = [storyBibleText, memoryText].filter(Boolean).join("\n\n")
    return {
      status: "memory",
      projectId,
      contextText,
      memoryChunkCount: matches.length,
      storyBibleEntryCount: storyBibleEntries.length,
      tokenEstimate: estimateTokens(contextText),
    }
  } catch (error) {
    return {
      status: fallback ? "fallback" : "unavailable",
      projectId,
      contextText: fallback,
      memoryChunkCount: 0,
      storyBibleEntryCount: 0,
      tokenEstimate: estimateTokens(fallback),
      reason: error instanceof Error ? error.message : "Story memory lookup failed.",
    }
  }
}

export function storyContextPrompt(snapshot: StoryContextSnapshot): string {
  if (!snapshot.contextText.trim()) return ""
  const label = snapshot.status === "memory" ? "RELEVANT PROJECT MEMORY" : "PROJECT CONTEXT FALLBACK"
  return `${label}\n${snapshot.contextText}`
}

export async function indexProjectStoryMemory(params: {
  admin: DbClient
  project: StoryMemoryIndexProject
}): Promise<{ contentHash: string; chunkCount: number; tokenCount: number }> {
  const contentHash = projectContentHash(params.project)
  const { data: storyBibleRows } = await listStoryBibleEntriesForMemory(params.admin, {
    orgId: params.project.org_id,
    projectId: params.project.id,
  })
  const chunks = [...buildStoryMemoryChunks(params.project), ...storyBibleMemoryChunks((storyBibleRows ?? []) as StoryBibleContextRow[])]
  const embeddings = chunks.length ? await embedStoryDocuments(chunks.map((chunk) => chunk.content)) : []

  await replaceProjectStoryMemory({
    admin: params.admin,
    userId: params.project.user_id,
    orgId: params.project.org_id,
    projectId: params.project.id,
    chunks,
    embeddings,
  })

  return {
    contentHash,
    chunkCount: chunks.length,
    tokenCount: chunks.reduce((sum, chunk) => sum + chunk.tokenCount, 0),
  }
}

export async function completeStoryMemoryJob(params: {
  admin: DbClient
  projectId: string
  contentHash: string
  metadata: Record<string, Json>
}) {
  const { error } = await params.admin.rpc("complete_story_memory_job", {
    p_project_id: params.projectId,
    p_content_hash: params.contentHash,
    p_metadata: params.metadata as Json,
  })
  if (error) throw new Error(error.message)
}

export async function failStoryMemoryJob(params: {
  admin: DbClient
  projectId: string
  error: string
}) {
  await params.admin.rpc("fail_story_memory_job", {
    p_project_id: params.projectId,
    p_error: params.error,
  })
}

export async function projectNeedsMemoryIndex(params: {
  admin: DbClient
  project: StoryMemoryIndexProject
}): Promise<boolean> {
  const contentHash = projectContentHash(params.project)
  const { data } = await getProjectMemoryStatus({ admin: params.admin, projectId: params.project.id })
  return !data || data.content_hash !== contentHash || data.status !== "ready"
}

export function fallbackContextForProject(project: Partial<StoryMemoryIndexProject>): string {
  return buildFallbackStoryContext(project)
}

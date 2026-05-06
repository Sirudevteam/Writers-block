import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database, Json } from "@/infrastructure/db/types/database"
import type { StoryMemoryChunk, StoryMemoryMatch, StoryMemoryKind } from "@/modules/story-memory/domain/types"
import { storyMemoryEmbeddingModel, vectorToSqlLiteral } from "@/modules/story-memory/infrastructure/embeddings"

type DbClient = SupabaseClient<Database>

export async function replaceProjectStoryMemory(params: {
  admin: DbClient
  userId: string
  orgId: string
  projectId: string
  chunks: StoryMemoryChunk[]
  embeddings: number[][]
}) {
  const { admin, chunks, embeddings } = params
  if (chunks.length !== embeddings.length) {
    throw new Error("Story memory chunk and embedding counts do not match.")
  }

  const { error: deleteError } = await admin.from("project_story_memory").delete().eq("project_id", params.projectId)
  if (deleteError) throw new Error(deleteError.message)

  if (chunks.length === 0) return

  const rows: Database["public"]["Tables"]["project_story_memory"]["Insert"][] = chunks.map((chunk, index) => ({
    user_id: params.userId,
    org_id: params.orgId,
    project_id: params.projectId,
    kind: chunk.kind,
    source_hash: chunk.sourceHash,
    source_anchor: chunk.sourceAnchor,
    content: chunk.content,
    embedding: vectorToSqlLiteral(embeddings[index] ?? []),
    embedding_model: storyMemoryEmbeddingModel(),
    token_count: chunk.tokenCount,
    metadata: chunk.metadata as Json,
  }))

  const { error } = await admin.from("project_story_memory").insert(rows)
  if (error) throw new Error(error.message)
}

export async function matchProjectStoryMemory(params: {
  admin: DbClient
  userId: string
  orgId: string
  projectId: string
  queryEmbedding: number[]
  kinds?: StoryMemoryKind[] | null
  matchCount: number
  threshold?: number
}): Promise<StoryMemoryMatch[]> {
  const { data, error } = await params.admin.rpc("match_project_story_memory", {
    p_query_embedding: vectorToSqlLiteral(params.queryEmbedding),
    p_user_id: params.userId,
    p_org_id: params.orgId,
    p_project_id: params.projectId,
    p_kinds: params.kinds ?? null,
    p_match_count: params.matchCount,
    p_match_threshold: params.threshold ?? 0.15,
  })

  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => ({
    id: row.id,
    kind: row.kind as StoryMemoryKind,
    sourceAnchor: row.source_anchor,
    content: row.content,
    tokenCount: row.token_count,
    metadata: row.metadata,
    similarity: Number(row.similarity ?? 0),
  }))
}

export async function getProjectMemoryStatus(params: {
  admin: DbClient
  projectId: string
}) {
  return params.admin
    .from("project_memory_status")
    .select("project_id, user_id, org_id, content_hash, status, attempts, locked_at, last_indexed_at, error_message, metadata")
    .eq("project_id", params.projectId)
    .maybeSingle()
}

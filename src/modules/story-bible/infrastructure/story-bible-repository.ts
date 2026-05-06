import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/infrastructure/db/types/database"
import type {
  StoryBibleCreateBody,
  StoryBibleUpdateBody,
} from "@/modules/story-bible/domain/schemas"
import type { StoryBibleEntry, StoryBibleKind } from "@/modules/story-bible/domain/types"

type DbClient = SupabaseClient<Database>

export function listStoryBibleEntries(
  client: DbClient,
  params: { orgId: string; projectId: string }
) {
  return client
    .from("project_story_bible_entries")
    .select("*")
    .eq("org_id", params.orgId)
    .eq("project_id", params.projectId)
    .is("deleted_at", null)
    .order("pinned", { ascending: false })
    .order("updated_at", { ascending: false })
}

export function listStoryBibleEntriesForContext(
  client: DbClient,
  params: { orgId: string; projectId: string; kinds?: StoryBibleKind[]; limit?: number }
) {
  let query = client
    .from("project_story_bible_entries")
    .select("id, kind, title, content, pinned, updated_at")
    .eq("org_id", params.orgId)
    .eq("project_id", params.projectId)
    .is("deleted_at", null)
    .order("pinned", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(params.limit ?? 20)

  if (params.kinds?.length) query = query.in("kind", params.kinds)
  return query
}

export function listStoryBibleEntriesForMemory(
  client: DbClient,
  params: { orgId: string; projectId: string }
) {
  return client
    .from("project_story_bible_entries")
    .select("id, kind, title, content, pinned, updated_at")
    .eq("org_id", params.orgId)
    .eq("project_id", params.projectId)
    .is("deleted_at", null)
    .order("pinned", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(80)
}

export function createStoryBibleEntry(
  client: DbClient,
  params: { userId: string; orgId: string; projectId: string; input: StoryBibleCreateBody }
) {
  return client
    .from("project_story_bible_entries")
    .insert({
      user_id: params.userId,
      org_id: params.orgId,
      project_id: params.projectId,
      kind: params.input.kind,
      title: params.input.title,
      content: params.input.content,
      pinned: params.input.pinned ?? false,
      source: "manual",
      metadata: {},
    })
    .select("*")
    .single()
}

export function updateStoryBibleEntry(
  client: DbClient,
  params: { orgId: string; projectId: string; entryId: string; input: StoryBibleUpdateBody }
) {
  const update: Database["public"]["Tables"]["project_story_bible_entries"]["Update"] = {}
  if (params.input.kind !== undefined) update.kind = params.input.kind
  if (params.input.title !== undefined) update.title = params.input.title
  if (params.input.content !== undefined) update.content = params.input.content
  if (params.input.pinned !== undefined) update.pinned = params.input.pinned

  return client
    .from("project_story_bible_entries")
    .update(update)
    .eq("id", params.entryId)
    .eq("org_id", params.orgId)
    .eq("project_id", params.projectId)
    .is("deleted_at", null)
    .select("*")
    .single()
}

export function softDeleteStoryBibleEntry(
  client: DbClient,
  params: { orgId: string; projectId: string; entryId: string }
) {
  return client
    .from("project_story_bible_entries")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", params.entryId)
    .eq("org_id", params.orgId)
    .eq("project_id", params.projectId)
    .is("deleted_at", null)
    .select("id")
    .single()
}

export type StoryBibleContextRow = Pick<StoryBibleEntry, "id" | "kind" | "title" | "content" | "pinned" | "updated_at">

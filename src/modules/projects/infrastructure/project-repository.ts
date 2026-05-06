import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database, Json } from "@/infrastructure/db/types/database"
import type { ProjectCreateBody, ProjectUpdateBody } from "@/modules/projects/domain/schemas"
import { PROJECT_DETAIL_COLUMNS, PROJECT_LIST_COLUMNS } from "@/modules/projects/domain/selects"
import type { ProjectCursor } from "@/modules/projects/domain/types"

type ProjectClient = SupabaseClient<Database>

export function listProjectRows(
  client: ProjectClient,
  params: { orgId: string; limit: number; cursor: ProjectCursor | null }
) {
  let query = client
    .from("projects")
    .select(PROJECT_LIST_COLUMNS)
    .eq("org_id", params.orgId)
    .order("updated_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(params.limit + 1)

  if (params.cursor) {
    query = query.or(
      `updated_at.lt.${params.cursor.ts},and(updated_at.eq.${params.cursor.ts},id.lt.${params.cursor.id})`
    )
  }

  return query
}

export function countProjectsForOrg(client: ProjectClient, orgId: string) {
  return client
    .from("projects")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
}

export function getProjectCreationUsage(client: ProjectClient, userId: string) {
  return client
    .from("project_creation_usage")
    .select("free_lifetime_created")
    .eq("user_id", userId)
    .maybeSingle()
}

export function getSubscriptionForProjectLimit(client: ProjectClient, userId: string) {
  return (client.from("subscriptions") as any)
    .select("plan, status, projects_limit")
    .eq("user_id", userId)
    .maybeSingle()
}

export function createProjectWithQuotaRpc(
  client: ProjectClient,
  params: {
    userId: string
    orgId: string
    input: ProjectCreateBody
  }
) {
  const b = params.input
  const genre = b.genre?.trim() ? b.genre.trim() : "drama"

  return (client as any).rpc("create_project_with_quota", {
    p_user_id: params.userId,
    p_org_id: params.orgId,
    p_title: b.title,
    p_description: b.description ?? null,
    p_genre: genre,
    p_characters: b.characters ?? null,
    p_location: b.location ?? null,
    p_mood: b.mood ?? null,
    p_content: b.content ?? null,
    p_status: b.status ?? "draft",
  }) as PromiseLike<{ data: Json | null; error: { code?: string; message: string } | null }>
}

export function findProjectById(
  client: ProjectClient,
  params: { projectId: string; orgId: string }
) {
  return client
    .from("projects")
    .select(PROJECT_DETAIL_COLUMNS)
    .eq("id", params.projectId)
    .eq("org_id", params.orgId)
    .single()
}

export function updateProjectRow(
  client: ProjectClient,
  params: {
    projectId: string
    orgId: string
    input: ProjectUpdateBody
  }
) {
  const updateData: Database["public"]["Tables"]["projects"]["Update"] = {}
  const b = params.input

  if (b.title !== undefined) updateData.title = b.title
  if (b.description !== undefined) updateData.description = b.description
  if (b.genre !== undefined) updateData.genre = b.genre
  if (b.characters !== undefined) updateData.characters = b.characters
  if (b.location !== undefined) updateData.location = b.location
  if (b.mood !== undefined) updateData.mood = b.mood
  if (b.content !== undefined) updateData.content = b.content
  if (b.status !== undefined) updateData.status = b.status
  updateData.updated_at = new Date().toISOString()

  return (client.from("projects") as any)
    .update(updateData)
    .eq("id", params.projectId)
    .eq("org_id", params.orgId)
    .select(PROJECT_DETAIL_COLUMNS)
    .single()
}

export function deleteProjectRow(
  client: ProjectClient,
  params: { projectId: string; orgId: string }
) {
  return client
    .from("projects")
    .delete()
    .eq("id", params.projectId)
    .eq("org_id", params.orgId)
}

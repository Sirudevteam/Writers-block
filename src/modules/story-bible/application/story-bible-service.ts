import type { SupabaseClient } from "@supabase/supabase-js"
import { AppError } from "@/core/errors/app-error"
import { logger } from "@/core/logger"
import type { Database } from "@/infrastructure/db/types/database"
import { getProject } from "@/modules/projects/application/project-service"
import { requestProjectMemoryIndex } from "@/modules/story-memory/application/story-memory-jobs"
import {
  createStoryBibleEntry,
  listStoryBibleEntries,
  softDeleteStoryBibleEntry,
  updateStoryBibleEntry,
} from "@/modules/story-bible/infrastructure/story-bible-repository"
import type {
  StoryBibleCreateBody,
  StoryBibleUpdateBody,
} from "@/modules/story-bible/domain/schemas"

type DbClient = SupabaseClient<Database>

async function queueMemoryRebuild(params: {
  supabase: DbClient
  orgId: string
  projectId: string
  reason: string
}) {
  try {
    const project = await getProject({
      supabase: params.supabase,
      orgId: params.orgId,
      projectId: params.projectId,
    })
    await requestProjectMemoryIndex({
      admin: params.supabase,
      project,
      force: true,
      reason: params.reason,
    })
  } catch (error) {
    logger.warn("[story-bible] Story memory queue failed after Story Bible edit", {
      projectId: params.projectId,
      message: error instanceof Error ? error.message : String(error),
    })
  }
}

export async function listProjectStoryBible(params: {
  supabase: DbClient
  orgId: string
  projectId: string
}) {
  const { data, error } = await listStoryBibleEntries(params.supabase, params)
  if (error) throw new AppError(error.message, 500, { cause: error })
  return data ?? []
}

export async function addProjectStoryBibleEntry(params: {
  supabase: DbClient
  userId: string
  orgId: string
  projectId: string
  input: StoryBibleCreateBody
}) {
  await getProject({ supabase: params.supabase, orgId: params.orgId, projectId: params.projectId })
  const { data, error } = await createStoryBibleEntry(params.supabase, params)
  if (error || !data) throw new AppError(error?.message ?? "Could not create Story Bible entry.", 500)
  void queueMemoryRebuild({ ...params, reason: "story_bible_created" })
  return data
}

export async function editProjectStoryBibleEntry(params: {
  supabase: DbClient
  orgId: string
  projectId: string
  entryId: string
  input: StoryBibleUpdateBody
}) {
  const { data, error } = await updateStoryBibleEntry(params.supabase, params)
  if (error || !data) throw new AppError("Story Bible entry not found.", 404, { cause: error })
  void queueMemoryRebuild({ ...params, reason: "story_bible_updated" })
  return data
}

export async function removeProjectStoryBibleEntry(params: {
  supabase: DbClient
  orgId: string
  projectId: string
  entryId: string
}) {
  const { error } = await softDeleteStoryBibleEntry(params.supabase, params)
  if (error) throw new AppError("Story Bible entry not found.", 404, { cause: error })
  void queueMemoryRebuild({ ...params, reason: "story_bible_deleted" })
}

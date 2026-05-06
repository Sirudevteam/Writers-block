import { createAdminClient } from "@/infrastructure/db/supabase/admin"
import type { StoryMemoryIndexProject } from "@/modules/story-memory/domain/types"

const PROJECT_CONTEXT_SELECT = "id, user_id, org_id, title, description, genre, characters, location, mood, content"

export async function loadProjectForAiContext(params: {
  userId: string
  projectId?: string | null
}): Promise<StoryMemoryIndexProject | null> {
  if (!params.projectId) return null
  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch {
    return null
  }

  const { data } = await admin
    .from("projects")
    .select(PROJECT_CONTEXT_SELECT)
    .eq("id", params.projectId)
    .eq("user_id", params.userId)
    .maybeSingle()

  return data ?? null
}

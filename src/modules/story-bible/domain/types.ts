import type { ProjectStoryBibleEntry } from "@/infrastructure/db/types/database"

export type StoryBibleKind = "character" | "scene" | "arc" | "continuity_note" | "style_rule"
export type StoryBibleSource = "manual" | "ai_suggested" | "imported" | "system"

export type StoryBibleEntry = ProjectStoryBibleEntry

export type StoryBibleInput = {
  kind: StoryBibleKind
  title: string
  content: string
  pinned?: boolean
}

export type ContinuityWarning = {
  code: "unknown_character" | "missing_story_bible"
  severity: "info" | "warning"
  message: string
  anchor?: string
}

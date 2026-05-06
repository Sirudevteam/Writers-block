import type { Json, Project } from "@/infrastructure/db/types/database"

export type StoryMemoryKind = "project_summary" | "character" | "scene" | "arc" | "continuity_note"

export type StoryMemoryChunk = {
  kind: StoryMemoryKind
  sourceHash: string
  sourceAnchor: string | null
  content: string
  tokenCount: number
  metadata: Record<string, Json>
}

export type StoryMemoryMatch = {
  id: string
  kind: StoryMemoryKind
  sourceAnchor: string | null
  content: string
  tokenCount: number
  metadata: Json
  similarity: number
}

export type StoryMemoryIndexProject = Pick<
  Project,
  "id" | "user_id" | "org_id" | "title" | "description" | "genre" | "characters" | "location" | "mood" | "content"
>

export type StoryMemoryJobStatus = {
  project_id: string
  user_id: string
  org_id: string
  content_hash: string
  status: "pending" | "processing" | "ready" | "failed"
}

import type { Project as DBProject, ProjectListRow } from "@/infrastructure/db/types/database"
import type { Project } from "@/shared/types/project"

export function mapDbProjectToUI(p: DBProject | ProjectListRow): Project {
  return {
    id: p.id,
    title: p.title,
    description: p.description ?? undefined,
    content: "content" in p ? (p.content ?? undefined) : undefined,
    createdAt: new Date(p.created_at),
    updatedAt: new Date(p.updated_at),
    genre: p.genre ?? undefined,
    characters: "characters" in p ? (p.characters ?? undefined) : undefined,
    location: "location" in p ? (p.location ?? undefined) : undefined,
    mood: "mood" in p ? (p.mood ?? undefined) : undefined,
  }
}

import type { ProjectListRow } from "@/infrastructure/db/types/database"
import type { ProjectCursor, ProjectListPage, ProjectQuota } from "@/modules/projects/domain/types"

export const PROJECT_PAGE_SIZE_DEFAULT = 50
const PROJECT_PAGE_SIZE_MAX = 100

function encodeProjectCursor(updatedAt: string, id: string): string {
  return Buffer.from(JSON.stringify({ ts: updatedAt, id })).toString("base64url")
}

export function decodeProjectCursor(raw: string): ProjectCursor | null {
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"))
    if (typeof parsed?.ts === "string" && typeof parsed?.id === "string") {
      return parsed
    }
  } catch {
    /* invalid cursors are treated as absent, matching the previous route behavior */
  }
  return null
}

export function resolveProjectPageSize(raw: string | null): number {
  return Math.min(
    parseInt(raw ?? String(PROJECT_PAGE_SIZE_DEFAULT), 10) || PROJECT_PAGE_SIZE_DEFAULT,
    PROJECT_PAGE_SIZE_MAX
  )
}

export function toProjectListPage(
  rows: ProjectListRow[],
  limit: number,
  quota: ProjectQuota | null = null
): ProjectListPage {
  const hasMore = rows.length > limit
  const items = hasMore ? rows.slice(0, limit) : rows
  const last = items.at(-1)
  const nextCursor =
    hasMore && last ? encodeProjectCursor(last.updated_at, last.id) : null

  return { items, nextCursor, hasMore, quota }
}

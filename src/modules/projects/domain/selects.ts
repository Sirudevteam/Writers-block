/** Supabase select string for dashboard / list views (avoids loading full screenplay bodies). */
export const PROJECT_LIST_COLUMNS =
  "id, org_id, user_id, title, description, genre, status, created_at, updated_at" as const

/** Supabase select string for editor/detail views. */
export const PROJECT_DETAIL_COLUMNS =
  "id, org_id, user_id, title, description, genre, characters, location, mood, content, status, created_at, updated_at" as const

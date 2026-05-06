/** JSON responses from Master Admin APIs should never be cached by shared caches. */
export const MASTER_ADMIN_JSON_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
} as const

/** CSV downloads from Master Admin export routes. */
export const MASTER_ADMIN_CSV_HEADERS = {
  "Content-Type": "text/csv; charset=utf-8",
  "Cache-Control": "private, no-store, max-age=0",
} as const

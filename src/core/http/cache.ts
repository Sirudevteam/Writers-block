export const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
} as const

export const PROJECT_LIST_CACHE_HEADERS = {
  "Cache-Control": "private, max-age=30, stale-while-revalidate=60",
  Vary: "Authorization",
} as const

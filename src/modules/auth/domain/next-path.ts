const DEFAULT_AUTH_REDIRECT_PATH = "/dashboard"

export function getSafeNextPath(raw: string | null | undefined): string {
  if (!raw) return DEFAULT_AUTH_REDIRECT_PATH

  const value = raw.trim()
  if (!value.startsWith("/")) return DEFAULT_AUTH_REDIRECT_PATH
  if (value.startsWith("//")) return DEFAULT_AUTH_REDIRECT_PATH

  try {
    const url = new URL(value, "http://localhost")
    if (url.origin !== "http://localhost") return DEFAULT_AUTH_REDIRECT_PATH
    return `${url.pathname}${url.search}${url.hash}` || DEFAULT_AUTH_REDIRECT_PATH
  } catch {
    return DEFAULT_AUTH_REDIRECT_PATH
  }
}

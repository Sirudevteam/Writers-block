/**
 * Validates `Origin` / `Sec-Fetch-Site` for browser-initiated auth (API routes, Server Actions).
 * Rejects obvious cross-origin POSTs when `Origin` is present and does not match the request host
 * or `NEXT_PUBLIC_SITE_URL`.
 */
export function isAllowedRequestOrigin(getHeader: (name: string) => string | null): boolean {
  const origin = getHeader("origin")
  if (!origin) {
    const site = getHeader("sec-fetch-site")
    if (site === "cross-site") return false
    return true
  }

  const hostHeader = getHeader("x-forwarded-host") ?? getHeader("host")
  if (!hostHeader) return false

  let originUrl: URL
  try {
    originUrl = new URL(origin)
  } catch {
    return false
  }

  const host = hostHeader.split(",")[0].trim()
  const hostname = host.split(":")[0]

  if (originUrl.host === host || originUrl.hostname === hostname) {
    return true
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
  if (siteUrl) {
    try {
      if (new URL(siteUrl).origin === originUrl.origin) return true
    } catch {
      /* ignore */
    }
  }

  return false
}

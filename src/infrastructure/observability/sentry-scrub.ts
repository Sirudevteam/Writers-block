import type { ErrorEvent, EventHint } from "@sentry/nextjs"

/**
 * Strip cookies and auth headers from Sentry error events (PII / defense in depth).
 */
export function scrubSentryEvent(event: ErrorEvent, _hint: EventHint): ErrorEvent | null {
  const req = event.request
  if (req?.headers && typeof req.headers === "object") {
    const headers = { ...(req.headers as Record<string, string>) }
    for (const key of Object.keys(headers)) {
      const lower = key.toLowerCase()
      if (
        lower === "authorization" ||
        lower === "cookie" ||
        lower === "set-cookie" ||
        lower === "x-api-key"
      ) {
        delete headers[key]
      }
    }
    req.headers = headers
  }
  if (event.user && typeof event.user === "object") {
    const u = { ...event.user } as Record<string, unknown>
    delete u.ip_address
    event.user = u
  }
  return event
}

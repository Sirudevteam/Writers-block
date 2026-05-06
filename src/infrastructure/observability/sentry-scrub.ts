import type { ErrorEvent, EventHint } from "@sentry/nextjs"

/**
 * Strip cookies and auth headers from Sentry error events (PII / defense in depth).
 */
const SENSITIVE_KEY = /(authorization|cookie|token|secret|password|passcode|otp|code|signature|api[-_]?key)/i

function scrubQueryString(value: string): string {
  const params = new URLSearchParams(value.startsWith("?") ? value.slice(1) : value)
  for (const key of Array.from(params.keys())) {
    if (SENSITIVE_KEY.test(key)) params.set(key, "[Filtered]")
  }
  return params.toString()
}

function scrubData(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[Filtered]"
  if (!value || typeof value !== "object") return value
  if (Array.isArray(value)) return value.map((item) => scrubData(item, depth + 1))

  const out: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SENSITIVE_KEY.test(key) ? "[Filtered]" : scrubData(item, depth + 1)
  }
  return out
}

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
  if (typeof req?.query_string === "string") {
    req.query_string = scrubQueryString(req.query_string)
  }
  if (req && "data" in req) {
    req.data = scrubData(req.data)
  }
  if (event.user && typeof event.user === "object") {
    const u = { ...event.user } as Record<string, unknown>
    delete u.ip_address
    event.user = u
  }
  return event
}

/**
 * Writers Block — Middleware WAF Engine
 *
 * A request-inspection engine that runs inside Next.js middleware (Edge Runtime).
 * Inspects URL paths, query parameters, and headers for common exploit payloads.
 *
 * Design principles:
 * - Fast path: most requests are clean → optimise for quick pass-through
 * - Short-circuit: stop checking after first match
 * - Edge-compatible: uses Web Crypto API, no Node.js-only modules
 * - Never inspects request bodies (user-authored content = false positive city)
 *
 * Configuration via environment variables:
 * - WAF_ENABLED        — Kill switch (default: "true")
 * - WAF_DRY_RUN        — Log detections but don't block (default: "true")
 * - WAF_ALLOWED_IPS    — Comma-separated IPs that bypass WAF
 * - WAF_BLOCKED_COUNTRIES — Comma-separated ISO country codes to block
 */

import { NextResponse, type NextRequest } from "next/server"
import {
  SQLI_PATTERNS,
  XSS_PATTERNS,
  PATH_TRAVERSAL_PATTERNS,
  MALICIOUS_BOT_PATTERNS,
  MAX_URL_LENGTH,
  MAX_QUERY_PARAMS,
  MAX_HEADER_VALUE_LENGTH,
  decodePayload,
  type AttackCategory,
  type PatternMatch,
} from "./waf-patterns"
import { logWafEvent } from "./waf-logger"

// ── Configuration ───────────────────────────────────────────────────────────

function isWafEnabled(): boolean {
  const v = process.env.WAF_ENABLED?.trim().toLowerCase()
  // Default enabled unless explicitly set to "false" / "0"
  return v !== "false" && v !== "0"
}

function isDryRun(): boolean {
  const v = process.env.WAF_DRY_RUN?.trim().toLowerCase()
  if (v) return v !== "false" && v !== "0"
  // Production should enforce by default; lower environments stay observation-first.
  return process.env.NODE_ENV !== "production" && process.env.VERCEL_ENV !== "production"
}

function getAllowedIps(): Set<string> {
  const raw = process.env.WAF_ALLOWED_IPS ?? ""
  return new Set(
    raw
      .split(",")
      .map((ip) => ip.trim())
      .filter(Boolean)
  )
}

function getBlockedCountries(): Set<string> {
  const raw = process.env.WAF_BLOCKED_COUNTRIES ?? ""
  return new Set(
    raw
      .split(",")
      .map((c) => c.trim().toUpperCase())
      .filter(Boolean)
  )
}

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "anonymous"
  )
}

// ── Pattern Scanning ────────────────────────────────────────────────────────

function scanPatterns(
  input: string,
  patterns: readonly RegExp[],
  category: AttackCategory
): PatternMatch | null {
  const decoded = decodePayload(input)
  for (let i = 0; i < patterns.length; i++) {
    const match = patterns[i].exec(decoded)
    if (match) {
      return {
        category,
        patternIndex: i,
        matchedSnippet: match[0].slice(0, 100),
      }
    }
  }
  return null
}

function scanMultipleInputs(
  inputs: string[],
  patterns: readonly RegExp[],
  category: AttackCategory
): PatternMatch | null {
  for (const input of inputs) {
    if (!input) continue
    const match = scanPatterns(input, patterns, category)
    if (match) return match
  }
  return null
}

// ── Core Inspection ─────────────────────────────────────────────────────────

function inspectRequest(request: NextRequest): PatternMatch | null {
  const url = new URL(request.url)
  const pathname = url.pathname
  const search = url.search
  const fullUrl = pathname + search
  const userAgent = request.headers.get("user-agent") ?? ""
  const referer = request.headers.get("referer") ?? ""

  // 1. Request shape checks (cheapest — no regex)
  if (fullUrl.length > MAX_URL_LENGTH) {
    return {
      category: "request_shape",
      patternIndex: 0,
      matchedSnippet: `URL length ${fullUrl.length} exceeds ${MAX_URL_LENGTH}`,
    }
  }

  const paramCount = Array.from(url.searchParams.keys()).length
  if (paramCount > MAX_QUERY_PARAMS) {
    return {
      category: "request_shape",
      patternIndex: 1,
      matchedSnippet: `${paramCount} query params exceeds ${MAX_QUERY_PARAMS}`,
    }
  }

  // Check for oversized headers
  const authorization = request.headers.get("authorization") ?? ""
  if (authorization.length > MAX_HEADER_VALUE_LENGTH) {
    return {
      category: "request_shape",
      patternIndex: 2,
      matchedSnippet: `Authorization header length ${authorization.length}`,
    }
  }

  // 2. Bot detection (User-Agent — cheap string match)
  const botMatch = scanPatterns(userAgent, MALICIOUS_BOT_PATTERNS, "malicious_bot")
  if (botMatch) return botMatch

  // 3. Collect all inspectable inputs
  const queryValues = Array.from(url.searchParams.values())
  const queryKeys = Array.from(url.searchParams.keys())
  const allInputs = [pathname, search, ...queryKeys, ...queryValues, referer]

  // 4. SQLi scan
  const sqliMatch = scanMultipleInputs(allInputs, SQLI_PATTERNS, "sqli")
  if (sqliMatch) return sqliMatch

  // 5. XSS scan
  const xssMatch = scanMultipleInputs(allInputs, XSS_PATTERNS, "xss")
  if (xssMatch) return xssMatch

  // 6. Path traversal scan (query params only — pathname is validated by Next.js routing)
  const traversalInputs = [...queryKeys, ...queryValues]
  const traversalMatch = traversalInputs.length > 0
    ? scanMultipleInputs(traversalInputs, PATH_TRAVERSAL_PATTERNS, "path_traversal")
    : null
  if (traversalMatch) return traversalMatch

  return null
}

// ── Blocked Response ────────────────────────────────────────────────────────

function blockedResponse(): NextResponse {
  return new NextResponse(
    JSON.stringify({
      error: "Forbidden",
      message: "Your request was blocked by our security system.",
    }),
    {
      status: 403,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    }
  )
}

function geoBlockedResponse(): NextResponse {
  return new NextResponse(
    JSON.stringify({
      error: "Forbidden",
      message: "Access from your region is not permitted.",
    }),
    {
      status: 403,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    }
  )
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Run WAF inspection on an incoming request.
 *
 * Returns `null` if the request is clean (fast path).
 * Returns a `NextResponse` (403) if the request is blocked.
 * In dry-run mode, always returns `null` but logs the detection.
 *
 * Call this as the FIRST check in middleware, before Supabase session refresh.
 */
export async function wafInspect(
  request: NextRequest
): Promise<NextResponse | null> {
  // Kill switch
  if (!isWafEnabled()) return null

  const clientIp = getClientIp(request)

  // IP allowlist bypass
  const allowedIps = getAllowedIps()
  if (allowedIps.size > 0 && allowedIps.has(clientIp)) return null

  // Geo-blocking (uses Cloudflare CF-IPCountry header)
  const blockedCountries = getBlockedCountries()
  if (blockedCountries.size > 0) {
    const country = request.headers.get("cf-ipcountry")?.toUpperCase()
    if (country && blockedCountries.has(country)) {
      // Geo-blocks are never dry-run — they're explicit policy
      void logWafEvent(
        request,
        {
          category: "request_shape",
          patternIndex: -1,
          matchedSnippet: `Geo-blocked country: ${country}`,
        },
        false
      ).catch(() => {})
      return geoBlockedResponse()
    }
  }

  // Core inspection
  const match = inspectRequest(request)
  if (!match) return null

  // Log the event (always, regardless of dry-run)
  const dryRun = isDryRun()
  void logWafEvent(request, match, dryRun).catch(() => {})

  // In dry-run mode, log but allow the request through
  if (dryRun) return null

  return blockedResponse()
}

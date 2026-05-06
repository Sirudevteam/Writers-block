/**
 * WAF Security Event Logger
 *
 * Structured logging for WAF events (blocked attacks, dry-run detections).
 * Optionally tracks per-IP attack frequency in Redis for persistent monitoring.
 *
 * Privacy: IPs are hashed with SHA-256 prefix (same pattern as src/modules/iam/application/audit.ts).
 */

import type { AttackCategory, PatternMatch } from "./waf-patterns"

interface WafEvent {
  timestamp: string
  action: "blocked" | "detected" // "detected" = dry-run mode
  category: AttackCategory
  patternIndex: number
  matchedSnippet: string
  ipHash: string
  method: string
  path: string
  userAgent: string
  /** Country code from Cloudflare CF-IPCountry header (if available). */
  country: string | null
}

// ── IP Hashing ──────────────────────────────────────────────────────────────

async function sha256HexPrefix(input: string, length = 16): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input)
  )
  const hex = Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
  return hex.slice(0, length)
}

function extractClientIp(request: Request): string {
  const headers = request.headers
  return (
    headers.get("cf-connecting-ip") || // Cloudflare (primary since hosting on CF)
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip") ||
    "anonymous"
  )
}

// ── Console Logger ──────────────────────────────────────────────────────────

function logToConsole(event: WafEvent): void {
  const prefix = event.action === "blocked" ? "🛡️ WAF BLOCKED" : "⚠️ WAF DETECTED"
  console.warn(
    `[${prefix}] ${event.category} | IP:${event.ipHash} | ${event.method} ${event.path} | pattern:${event.patternIndex} | snippet:"${event.matchedSnippet}" | UA:${event.userAgent.slice(0, 80)} | country:${event.country ?? "?"}`
  )
}

// ── Redis Counter (optional, non-blocking) ──────────────────────────────────

const REDIS_KEY_PREFIX = "waf:attacks:"
const REDIS_WINDOW_SECONDS = 3600 // 1-hour sliding window

function getUpstashRestConfig(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL?.replace(/\/+$/, "")
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  return { url, token }
}

async function runRedisCommand<T>(command: unknown[]): Promise<T | null> {
  const config = getUpstashRestConfig()
  if (!config) return null

  const response = await fetch(config.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
  })
  if (!response.ok) return null

  const body = (await response.json()) as { result?: T }
  return body.result ?? null
}

async function incrementRedisCounter(ipHash: string, category: string): Promise<void> {
  try {
    const key = `${REDIS_KEY_PREFIX}${ipHash}:${category}`
    await runRedisCommand<number>(["INCR", key])
    await runRedisCommand<number>(["EXPIRE", key, REDIS_WINDOW_SECONDS])
  } catch {
    // Non-blocking: Redis failure should not affect WAF decisions
  }
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Log a WAF security event. Non-blocking — never throws, never delays the request.
 */
export async function logWafEvent(
  request: Request,
  match: PatternMatch,
  dryRun: boolean
): Promise<void> {
  const ip = extractClientIp(request)
  const ipHash = await sha256HexPrefix(ip)

  const event: WafEvent = {
    timestamp: new Date().toISOString(),
    action: dryRun ? "detected" : "blocked",
    category: match.category,
    patternIndex: match.patternIndex,
    matchedSnippet: match.matchedSnippet.slice(0, 200),
    ipHash,
    method: request.method,
    path: new URL(request.url).pathname,
    userAgent: (request.headers.get("user-agent") ?? "").slice(0, 200),
    country: request.headers.get("cf-ipcountry") ?? null,
  }

  // Log to console (always)
  logToConsole(event)

  // Increment Redis counter (non-blocking, fire-and-forget)
  void incrementRedisCounter(ipHash, match.category).catch(() => {})
}

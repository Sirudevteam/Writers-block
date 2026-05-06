import { createHash } from "node:crypto"
import { Ratelimit } from "@upstash/ratelimit"
import { NextResponse } from "next/server"
import { getUpstashRedis } from "@/infrastructure/cache/upstash-redis"
import type { SubscriptionPlan } from "@/shared/types/project"

const redis = getUpstashRedis()

function isRedisConfigured(): boolean {
  return redis !== null
}

function isProductionRuntime(): boolean {
  return process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production"
}

/**
 * In production, AI rate limits require Upstash Redis. Without it, fail closed (503).
 * Set ALLOW_AI_WITHOUT_REDIS=1 only for emergencies / self-hosted without Redis (not recommended).
 */
export function rateLimitInfrastructureResponse(): NextResponse | null {
  if (isRedisConfigured()) return null
  if (process.env.ALLOW_AI_WITHOUT_REDIS === "1") {
    console.warn("[ratelimit] ALLOW_AI_WITHOUT_REDIS: AI routes running without Redis")
    return null
  }
  if (!isProductionRuntime()) return null
  return NextResponse.json(
    {
      error:
        "Service temporarily unavailable: rate limiting is not configured. Set Upstash Redis env vars or contact support.",
    },
    { status: 503 }
  )
}

// ── IP-based rate limiters ──────────────────────────────────────────────────

// AI generation endpoints: 10 requests/hour per IP (global guard)
const generationRatelimit = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(10, "1 h"),
      analytics: true,
      prefix: "ratelimit:generation:ip",
    })
  : null

// General API endpoints: 100 requests/minute per IP
const apiRatelimit = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(100, "1 m"),
      analytics: true,
      prefix: "ratelimit:api:ip",
    })
  : null

// Sign-in / sign-up: tighter cap to slow credential stuffing (per IP)
const authRatelimit = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(25, "15 m"),
      analytics: true,
      prefix: "ratelimit:auth:ip",
    })
  : null

// Payment order creation: tighter than generic API to slow checkout/order abuse.
const paymentOrderRatelimit = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(20, "10 m"),
      analytics: true,
      prefix: "ratelimit:payment:order",
    })
  : null

// Payment verification: allows checkout retries while blocking replay floods.
const paymentVerifyRatelimit = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(30, "10 m"),
      analytics: true,
      prefix: "ratelimit:payment:verify",
    })
  : null

// PDF exports can be expensive; cap per user/IP independently of payment.
const pdfExportRatelimit = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(20, "10 m"),
      analytics: true,
      prefix: "ratelimit:pdf:export",
    })
  : null

// AI feedback should be lightweight but protected from spam.
const aiFeedbackRatelimit = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(60, "10 m"),
      analytics: true,
      prefix: "ratelimit:ai:feedback",
    })
  : null

// Async AI batch creation is cost-bearing; keep it separate from live generation limits.
const aiBatchRatelimit = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(20, "10 m"),
      analytics: true,
      prefix: "ratelimit:ai:batch",
    })
  : null

// SCIM is machine-authenticated, but still needs throttling for bad-token floods.
const scimRatelimit = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(120, "1 m"),
      analytics: true,
      prefix: "ratelimit:scim",
    })
  : null

// Anonymous support intake is public; keep it tighter than the generic API guard.
const supportTicketRatelimit = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(10, "10 m"),
      analytics: true,
      prefix: "ratelimit:support:tickets",
    })
  : null

// ── Per-user plan-based daily rate limiters ─────────────────────────────────

// Free plan: 5 AI generations/day per user
const freeUserRatelimit = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(5, "1 d"),
      analytics: true,
      prefix: "ratelimit:user:free",
    })
  : null

// Pro plan: 50 AI generations/day per user
const proUserRatelimit = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(50, "1 d"),
      analytics: true,
      prefix: "ratelimit:user:pro",
    })
  : null

// Premium plan: 200 AI generations/day per user
const premiumUserRatelimit = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(200, "1 d"),
      analytics: true,
      prefix: "ratelimit:user:premium",
    })
  : null

// ── Fallback for development without Redis ──────────────────────────────────

const devRatelimit = {
  limit: async (_identifier: string) => ({
    success: true,
    limit: 999,
    remaining: 999,
    reset: Date.now() + 3600000,
    pending: Promise.resolve(),
  }),
}

const closedRatelimit = {
  limit: async (_identifier: string) => ({
    success: false,
    limit: 0,
    remaining: 0,
    reset: Date.now() + 300000,
    pending: Promise.resolve(),
  }),
}

function fallbackRatelimit(scope: string) {
  if (isProductionRuntime()) {
    const message =
      scope === "Auth"
        ? "Auth routes blocked because Upstash Redis is not configured"
        : `${scope} routes blocked because Upstash Redis is not configured`
    console.error(`[ratelimit] ${message}`)
    return closedRatelimit as unknown as Ratelimit
  }
  return devRatelimit as unknown as Ratelimit
}

// ── Public accessors ────────────────────────────────────────────────────────

export function getGenerationRatelimit() {
  if (!generationRatelimit) {
    console.warn("Redis not configured — using dev rate limiter (no limits enforced)")
    return devRatelimit as unknown as Ratelimit
  }
  return generationRatelimit
}

export function getApiRatelimit() {
  if (!apiRatelimit) {
    return fallbackRatelimit("API")
  }
  return apiRatelimit
}

export function getAuthRatelimit() {
  if (!authRatelimit) {
    return fallbackRatelimit("Auth")
  }
  return authRatelimit
}

export function getPaymentOrderRatelimit() {
  if (!paymentOrderRatelimit) {
    return fallbackRatelimit("Payment order")
  }
  return paymentOrderRatelimit
}

export function getPaymentVerifyRatelimit() {
  if (!paymentVerifyRatelimit) {
    return fallbackRatelimit("Payment verify")
  }
  return paymentVerifyRatelimit
}

export function getPdfExportRatelimit() {
  if (!pdfExportRatelimit) {
    return fallbackRatelimit("PDF export")
  }
  return pdfExportRatelimit
}

export function getAiFeedbackRatelimit() {
  if (!aiFeedbackRatelimit) {
    return fallbackRatelimit("AI feedback")
  }
  return aiFeedbackRatelimit
}

export function getAiBatchRatelimit() {
  if (!aiBatchRatelimit) {
    return fallbackRatelimit("AI batch")
  }
  return aiBatchRatelimit
}

export function getScimRatelimit() {
  if (!scimRatelimit) {
    return fallbackRatelimit("SCIM")
  }
  return scimRatelimit
}

export function getSupportTicketRatelimit() {
  if (!supportTicketRatelimit) {
    return fallbackRatelimit("Support ticket")
  }
  return supportTicketRatelimit
}

/**
 * Returns the per-user daily rate limiter for the given subscription plan.
 * Key should be the user ID. Expired/cancelled subscriptions should pass 'free'.
 */
export function getPlanRatelimit(plan: SubscriptionPlan) {
  if (!redis) {
    return devRatelimit as unknown as Ratelimit
  }
  switch (plan) {
    case "premium":
      return premiumUserRatelimit ?? (devRatelimit as unknown as Ratelimit)
    case "pro":
      return proUserRatelimit ?? (devRatelimit as unknown as Ratelimit)
    default:
      return freeUserRatelimit ?? (devRatelimit as unknown as Ratelimit)
  }
}

// ── Helper to extract client IP ─────────────────────────────────────────────

export function getClientIP(request: Request): string {
  const headers = request.headers
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip") ||
    headers.get("cf-connecting-ip") || // Cloudflare
    "anonymous"
  )
}

/** Tenant-friendly rate limit key helpers (prevents noisy-neighbor within orgs). */
export function orgKey(orgId: string, suffix: string): string {
  const safeOrg = orgId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64)
  const safeSuffix = suffix.replace(/[^a-zA-Z0-9:_-]/g, "").slice(0, 64)
  return `org:${safeOrg}:${safeSuffix}`
}

export function authSubjectKey(prefix: string, subject: string): string {
  const safePrefix = prefix.replace(/[^a-zA-Z0-9:_-]/g, "").slice(0, 64)
  const digest = createHash("sha256")
    .update(subject.trim().toLowerCase())
    .digest("hex")
    .slice(0, 32)
  return `${safePrefix}:${digest}`
}

import { NextRequest, NextResponse } from "next/server"
import {
  getApiRatelimit,
  getAiBatchRatelimit,
  getAiFeedbackRatelimit,
  getClientIP,
  getPaymentOrderRatelimit,
  getPaymentVerifyRatelimit,
  getPdfExportRatelimit,
  getScimRatelimit,
  getSupportTicketRatelimit,
} from "@/core/security/rate-limit"

let loggedDevRedisHint = false

type LimitResult = {
  success: boolean
  limit?: number
  reset?: number
}

type LimitClient = {
  limit(identifier: string): Promise<LimitResult>
}

function scopedKey(req: NextRequest, scope: string, userId?: string | null): string {
  const ip = getClientIP(req)
  return userId ? `${scope}:user:${userId}:ip:${ip}` : `${scope}:ip:${ip}`
}

async function limitOr429(
  limiter: LimitClient,
  identifier: string
): Promise<NextResponse | null> {
  const r = await limiter.limit(identifier)
  if (r.success) return null
  const resetSec =
    typeof r.reset === "number" && !Number.isNaN(r.reset)
      ? Math.ceil(r.reset / 1000)
      : Math.ceil(Date.now() / 1000) + 60
  return NextResponse.json(
    { error: "Too many requests. Please slow down." },
    {
      status: 429,
      headers: {
        "Cache-Control": "no-store",
        "X-RateLimit-Limit": String(r.limit ?? 0),
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": String(resetSec),
        "Retry-After": String(
          Math.max(1, Math.ceil(((typeof r.reset === "number" ? r.reset : Date.now() + 60000) - Date.now()) / 1000))
        ),
      },
    }
  )
}

function isProductionRuntime(): boolean {
  return process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production"
}

function serviceUnavailableResponse(): NextResponse {
  return NextResponse.json(
    { error: "Service temporarily unavailable: rate limiting is unavailable." },
    { status: 503, headers: { "Cache-Control": "no-store" } }
  )
}

function handleRatelimitError(e: unknown): NextResponse | null {
  const msg = e instanceof Error ? e.message : String(e)
  if (msg.includes("Dynamic server usage") || msg.includes("Could not read")) {
    throw e
  }
  if (isProductionRuntime()) {
    console.error("[api-ip-limit] Upstash Redis unreachable - blocking request (fail-closed):", msg)
    return serviceUnavailableResponse()
  }
  console.warn("[api-ip-limit] Upstash Redis unreachable - allowing request in non-production:", msg)
  if (process.env.NODE_ENV !== "production" && !loggedDevRedisHint) {
    loggedDevRedisHint = true
    console.warn(
      "[api-ip-limit] Local dev: remove UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN from .env.local to use the in-memory limiter (no HTTP). Or fix Upstash URL/token/network."
    )
  }
  return null
}

/**
 * 100 req/min per IP (when Redis is configured). First line of defense on hot API routes.
 * Returns 429 or null if OK.
 * In production, Upstash/Redis network errors fail closed.
 */
export async function apiIpLimitOr429(req: NextRequest): Promise<NextResponse | null> {
  try {
    return limitOr429(getApiRatelimit() as unknown as LimitClient, getClientIP(req))
  } catch (e) {
    return handleRatelimitError(e)
  }
}

export async function paymentOrderLimitOr429(
  req: NextRequest,
  userId?: string | null
): Promise<NextResponse | null> {
  try {
    return limitOr429(getPaymentOrderRatelimit() as unknown as LimitClient, scopedKey(req, "payment-order", userId))
  } catch (e) {
    return handleRatelimitError(e)
  }
}

export async function paymentVerifyLimitOr429(
  req: NextRequest,
  userId?: string | null
): Promise<NextResponse | null> {
  try {
    return limitOr429(getPaymentVerifyRatelimit() as unknown as LimitClient, scopedKey(req, "payment-verify", userId))
  } catch (e) {
    return handleRatelimitError(e)
  }
}

export async function pdfExportLimitOr429(
  req: NextRequest,
  userId?: string | null
): Promise<NextResponse | null> {
  try {
    return limitOr429(getPdfExportRatelimit() as unknown as LimitClient, scopedKey(req, "pdf-export", userId))
  } catch (e) {
    return handleRatelimitError(e)
  }
}

export async function aiFeedbackLimitOr429(
  req: NextRequest,
  userId?: string | null
): Promise<NextResponse | null> {
  try {
    return limitOr429(getAiFeedbackRatelimit() as unknown as LimitClient, scopedKey(req, "ai-feedback", userId))
  } catch (e) {
    return handleRatelimitError(e)
  }
}

export async function aiBatchLimitOr429(
  req: NextRequest,
  userId?: string | null
): Promise<NextResponse | null> {
  try {
    return limitOr429(getAiBatchRatelimit() as unknown as LimitClient, scopedKey(req, "ai-batch", userId))
  } catch (e) {
    return handleRatelimitError(e)
  }
}

export async function scimLimitOr429(
  req: NextRequest,
  orgId: string
): Promise<NextResponse | null> {
  try {
    const safeOrgId = orgId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64)
    return limitOr429(getScimRatelimit() as unknown as LimitClient, scopedKey(req, `scim:${safeOrgId}`))
  } catch (e) {
    return handleRatelimitError(e)
  }
}

export async function supportTicketLimitOr429(req: NextRequest): Promise<NextResponse | null> {
  try {
    return limitOr429(getSupportTicketRatelimit() as unknown as LimitClient, scopedKey(req, "support-ticket"))
  } catch (e) {
    return handleRatelimitError(e)
  }
}

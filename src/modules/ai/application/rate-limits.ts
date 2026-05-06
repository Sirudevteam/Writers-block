import { NextResponse } from "next/server"
import {
  getClientIP,
  getGenerationRatelimit,
  getPlanRatelimit,
  rateLimitInfrastructureResponse,
} from "@/core/security/rate-limit"
import { PLAN_DAILY_LIMITS, type SubscriptionPlan } from "@/shared/types/project"

type PlanQuotaAfterSuccess = {
  limit: number
  remaining: number
  reset: number
}

type AiRateLimitResult =
  | { ok: true; planQuota: PlanQuotaAfterSuccess }
  | { ok: false; response: NextResponse }

/** Shared IP + per-plan daily limits for all AI endpoints. */
export async function runAiRateLimits(
  req: Request,
  effectivePlan: SubscriptionPlan,
  userId: string,
  options?: { emailVerified?: boolean }
): Promise<AiRateLimitResult> {
  // Block unverified accounts to prevent spam abuse of the free tier
  if (options?.emailVerified === false) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Please verify your email address before using AI features." },
        { status: 403 }
      ),
    }
  }

  const infra = rateLimitInfrastructureResponse()
  if (infra) return { ok: false, response: infra }

  const ip = getClientIP(req)
  const ipResult = await getGenerationRatelimit().limit(ip)
  if (!ipResult.success) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "Rate limit exceeded. Please try again later.",
          resetAt: new Date(ipResult.reset).toISOString(),
        },
        {
          status: 429,
          headers: {
            "X-RateLimit-Limit": String(ipResult.limit),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": String(Math.ceil(ipResult.reset / 1000)),
            "Retry-After": String(Math.ceil((ipResult.reset - Date.now()) / 1000)),
          },
        }
      ),
    }
  }

  const planResult = await getPlanRatelimit(effectivePlan).limit(userId)
  if (!planResult.success) {
    const dailyCap = PLAN_DAILY_LIMITS[effectivePlan]
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: `Daily generation limit reached for your ${effectivePlan} plan (${dailyCap}/day). Upgrade to generate more.`,
          resetAt: new Date(planResult.reset).toISOString(),
        },
        {
          status: 429,
          headers: {
            "X-RateLimit-Limit": String(planResult.limit),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": String(Math.ceil(planResult.reset / 1000)),
            "Retry-After": String(Math.ceil((planResult.reset - Date.now()) / 1000)),
          },
        }
      ),
    }
  }

  return {
    ok: true,
    planQuota: {
      limit: planResult.limit,
      remaining: planResult.remaining,
      reset: planResult.reset,
    },
  }
}

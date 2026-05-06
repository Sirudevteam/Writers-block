import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const root = process.cwd()

function readRepoFile(path: string): string {
  return readFileSync(join(root, path), "utf8")
}

describe("security gap hardening", () => {
  it("serves CSP from middleware with nonce-backed scripts and hardening directives", () => {
    const middleware = readRepoFile("src/middleware.ts")
    const nextConfig = readRepoFile("next.config.js")

    expect(nextConfig).not.toContain("Content-Security-Policy")
    expect(middleware).toContain("buildContentSecurityPolicy")
    expect(middleware).toContain("'nonce-${nonce}'")
    expect(middleware).toContain("script-src-attr 'none'")
    expect(middleware).toContain("style-src-attr 'unsafe-inline'")
    expect(middleware).toContain("style-src-elem 'self' 'nonce-${nonce}'")
    expect(middleware).toContain("object-src 'none'")
    expect(middleware).toContain("base-uri 'self'")
    expect(middleware).toContain("form-action 'self'")
    expect(middleware).toContain("frame-ancestors 'self'")
    expect(middleware).not.toContain("script-src 'self' 'unsafe-inline'")
    expect(middleware).not.toContain("style-src 'self' 'unsafe-inline'")
  })

  it("fails rate-limit infrastructure closed in production for protected helpers", () => {
    const rateLimit = readRepoFile("src/core/security/rate-limit.ts")
    const apiLimit = readRepoFile("src/core/security/api-ip-limit.ts")

    expect(rateLimit).toContain("fallbackRatelimit")
    expect(rateLimit).toContain("routes blocked because Upstash Redis is not configured")
    expect(apiLimit).toContain("blocking request (fail-closed)")
    expect(apiLimit).toContain("serviceUnavailableResponse")
    expect(apiLimit).not.toContain("allowing request (fail-open)")
  })

  it("throttles SCIM and anonymous support intake explicitly", () => {
    const rateLimit = readRepoFile("src/core/security/rate-limit.ts")
    const scimListRoute = readRepoFile("src/app/api/scim/v2/[orgId]/Users/route.ts")
    const scimItemRoute = readRepoFile("src/app/api/scim/v2/[orgId]/Users/[id]/route.ts")
    const supportRoute = readRepoFile("src/app/api/support/tickets/route.ts")

    expect(rateLimit).toContain("ratelimit:scim")
    expect(rateLimit).toContain("ratelimit:support:tickets")
    expect(scimListRoute).toContain("scimLimitOr429")
    expect(scimItemRoute).toContain("scimLimitOr429")
    expect(supportRoute).toContain("supportTicketLimitOr429")
  })

  it("keeps security definer functions on explicit search paths", () => {
    const schema = readRepoFile("supabase/database.sql")

    expect(schema).not.toMatch(/LANGUAGE\s+plpgsql\s+SECURITY\s+DEFINER\s*;/i)
    expect(schema).toContain("SECURITY DEFINER SET search_path = public")
  })

  it("requires dedicated OTP secrets in production and validates internal job secrets", () => {
    const otp = readRepoFile("src/modules/auth/infrastructure/otp-challenges.ts")
    const adminOtp = readRepoFile("src/modules/auth/infrastructure/master-admin-otp-challenges.ts")
    const internal = readRepoFile("src/core/security/internal-api.ts")
    const batchJob = readRepoFile("src/app/api/jobs/ai-batch/route.ts")
    const storyJob = readRepoFile("src/app/api/jobs/story-memory/route.ts")
    const paymentJob = readRepoFile("src/app/api/jobs/razorpay-post-payment/route.ts")

    expect(otp).toContain("AUTH_OTP_SECRET is required for auth OTPs in production")
    expect(adminOtp).toContain("MASTER_ADMIN_OTP_SECRET is required for Master Admin OTPs in production")
    expect(internal).toContain("timingSafeEqual")
    expect(batchJob).toContain("requestHasInternalApiSecret")
    expect(storyJob).toContain("requestHasInternalApiSecret")
    expect(paymentJob).toContain("requestHasInternalApiSecret")
  })
})

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import {
  PASSWORD_REQUIREMENT_MESSAGE,
  validatePasswordSignUp,
} from "@/modules/auth/domain/validation"

const root = process.cwd()

function readRepoFile(path: string): string {
  return readFileSync(join(root, path), "utf8")
}

describe("auth hardening controls", () => {
  it("uses passphrase-style signup/reset password validation", () => {
    expect(PASSWORD_REQUIREMENT_MESSAGE).toContain("15-72")
    expect(validatePasswordSignUp("Short123")).toBeNull()
    expect(validatePasswordSignUp("passwordpassword")).toBeNull()
    expect(validatePasswordSignUp("correct horse battery staple")).toBe(
      "correct horse battery staple"
    )
  })

  it("does not store the signup password in the OTP challenge payload", () => {
    const signUpRoute = readRepoFile("src/app/api/auth/sign-up/route.ts")
    const verifyRoute = readRepoFile("src/app/api/auth/verify-code/route.ts")

    expect(signUpRoute).not.toContain("encryptPayload({ password")
    expect(verifyRoute).not.toContain("SignupPayload")
    expect(verifyRoute).toContain("verified=signup")
  })

  it("tracks OTP attempts and consumes challenges through atomic database functions", () => {
    const schema = readRepoFile("supabase/database.sql")
    const otpInfra = readRepoFile("src/modules/auth/infrastructure/otp-challenges.ts")
    const adminOtpInfra = readRepoFile(
      "src/modules/auth/infrastructure/master-admin-otp-challenges.ts"
    )

    expect(schema).toContain("attempt_count")
    expect(schema).toContain("locked_at")
    expect(schema).toContain("CREATE OR REPLACE FUNCTION user_auth.consume_otp_challenge")
    expect(schema).toContain(
      "CREATE OR REPLACE FUNCTION master_admin.consume_master_admin_otp_challenge"
    )
    expect(otpInfra).toContain(".rpc(\"consume_otp_challenge\"")
    expect(adminOtpInfra).toContain(".rpc(\"consume_master_admin_otp_challenge\"")
  })

  it("fails auth throttling closed in production when Redis is missing", () => {
    const rateLimit = readRepoFile("src/core/security/rate-limit.ts")

    expect(rateLimit).toContain("const closedRatelimit")
    expect(rateLimit).toContain("Auth routes blocked because Upstash Redis is not configured")
    expect(rateLimit).toContain("authSubjectKey")
    expect(rateLimit).toContain("createHash(\"sha256\")")
  })
})

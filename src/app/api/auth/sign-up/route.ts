import { type NextRequest } from "next/server"
import { z } from "zod"
import { authApiJson } from "@/modules/auth/application/auth-api-json"
import { maskEmail } from "@/modules/auth/domain/mask-email"
import { isAllowedRequestOrigin } from "@/modules/auth/security/request-origin"
import {
  isSupabaseAuthRateLimitError,
  isSupabaseAuthUnavailableError,
  mapSupabaseAuthError,
} from "@/modules/auth/domain/safe-errors"
import { createOtpChallenge } from "@/modules/auth/infrastructure/otp-challenges"
import {
  PASSWORD_REQUIREMENT_MESSAGE,
  validateDisplayName,
  validateEmail,
  validatePasswordSignUp,
} from "@/modules/auth/domain/validation"
import { sendAuthOtpEmail } from "@/infrastructure/email/email-service"
import { logBusinessEvent, logSecurityEvent } from "@/modules/master-admin/application/events"
import { recordSignupRiskEvent } from "@/modules/master-admin/application/fraud"
import { authSubjectKey, getAuthRatelimit, getClientIP } from "@/core/security/rate-limit"
import { createAdminClient } from "@/infrastructure/db/supabase/admin"
import { isPasswordAuthDisabledForEmail } from "@/modules/iam/application/sso-policy"

export const dynamic = "force-dynamic"

const bodySchema = z.object({
  email: z.string().min(1).max(254),
  password: z.string().min(1).max(72),
  fullName: z.string().min(1).max(100),
  termsAccepted: z.literal(true),
})

function getOtpChallengeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  const lowerMessage = message.toLowerCase()
  if (
    lowerMessage.includes("invalid schema: user_auth") ||
    lowerMessage.includes("permission denied for schema user_auth") ||
    lowerMessage.includes("otp_challenges") ||
    message.includes("PGRST106") ||
    message.includes("PGRST205")
  ) {
    return process.env.NODE_ENV === "production"
      ? "Could not create your signup code. Please try again."
      : "Missing database table user_auth.otp_challenges. Run supabase/database.sql in your Supabase SQL Editor, expose the user_auth schema in Supabase API settings, then restart the dev server."
  }
  return "Could not create your signup code. Please try again."
}

function getSignupUnavailableMessage(): string {
  return process.env.NODE_ENV === "production"
    ? "Sign-up is temporarily unavailable. Please try again later."
    : "Supabase is unreachable. Check NEXT_PUBLIC_SUPABASE_URL in .env.local, verify the project is active, then restart the dev server."
}

export async function POST(request: NextRequest) {
  if (!isAllowedRequestOrigin((name) => request.headers.get(name))) {
    void logSecurityEvent(request, {
      eventType: "auth.signup_origin_forbidden",
      severity: "medium",
      outcome: "blocked",
      statusCode: 403,
    }).catch(() => {})
    return authApiJson({ error: "Forbidden" }, 403)
  }

  const ip = getClientIP(request)
  const rl = await getAuthRatelimit().limit(`signup:${ip}`)
  if (!rl.success) {
    void logSecurityEvent(request, {
      eventType: "auth.signup_rate_limited",
      severity: "medium",
      outcome: "blocked",
      statusCode: 429,
    }).catch(() => {})
    return authApiJson(
      { error: "Too many sign-up attempts. Wait a few minutes and try again." },
      429
    )
  }

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return authApiJson({ error: "Invalid request" }, 400)
  }

  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) {
    return authApiJson({ error: "Invalid input" }, 400)
  }

  const fullName = validateDisplayName(parsed.data.fullName)
  const email = validateEmail(parsed.data.email)
  const password = validatePasswordSignUp(parsed.data.password)

  if (!fullName) {
    return authApiJson(
      { error: "Enter a display name (1-100 characters). Angle brackets are not allowed." },
      400
    )
  }
  if (!email) {
    return authApiJson({ error: "Enter a valid email address." }, 400)
  }
  if (!password) {
    return authApiJson(
      { error: PASSWORD_REQUIREMENT_MESSAGE },
      400
    )
  }

  const accountRl = await getAuthRatelimit().limit(authSubjectKey("signup-email", email))
  if (!accountRl.success) {
    void logSecurityEvent(request, {
      eventType: "auth.signup_account_rate_limited",
      severity: "medium",
      outcome: "blocked",
      statusCode: 429,
    }).catch(() => {})
    return authApiJson(
      { error: "Too many sign-up attempts. Wait a few minutes and try again." },
      429
    )
  }

  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch (error) {
    console.error("[auth/sign-up] Supabase admin client is not configured", error)
    return authApiJson(
      { ok: false, error: getSignupUnavailableMessage() },
      503
    )
  }

  if (await isPasswordAuthDisabledForEmail(admin as any, email)) {
    void logSecurityEvent(request, {
      eventType: "auth.signup_sso_required",
      severity: "medium",
      outcome: "blocked",
      statusCode: 403,
      metadata: { domain: email.split("@")[1] ?? null },
    }).catch(() => {})
    return authApiJson(
      { ok: false, error: "This organization requires SSO sign-in.", code: "sso_required" },
      403
    )
  }

  let createdUser: Awaited<ReturnType<typeof admin.auth.admin.createUser>>
  try {
    createdUser = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: false,
      user_metadata: { full_name: fullName },
    })
  } catch (error) {
    console.error("[auth/sign-up] Supabase createUser request failed", error)
    void logSecurityEvent(request, {
      eventType: "auth.signup_provider_unavailable",
      severity: "medium",
      outcome: "failure",
      statusCode: 503,
    }).catch(() => {})
    return authApiJson(
      { ok: false, error: getSignupUnavailableMessage() },
      503
    )
  }

  const { data, error } = createdUser

  if (error) {
    const providerUnavailable = isSupabaseAuthUnavailableError(error)
    const status = providerUnavailable
      ? 503
      : isSupabaseAuthRateLimitError(error.message)
        ? 429
        : 200
    void logSecurityEvent(request, {
      eventType: providerUnavailable
        ? "auth.signup_provider_unavailable"
        : "auth.signup_failure",
      severity: status === 429 || status === 503 ? "medium" : "low",
      outcome: "failure",
      statusCode: status,
      metadata: { providerStatus: status },
    }).catch(() => {})
    return authApiJson(
      {
        ok: false,
        error: providerUnavailable
          ? getSignupUnavailableMessage()
          : mapSupabaseAuthError(error.message),
      },
      status
    )
  }

  if (!data.user?.id) {
    return authApiJson({ error: "Could not create your account. Please try again." }, 500)
  }

  let code: string
  try {
    code = await createOtpChallenge(admin, {
      email,
      purpose: "signup",
      userId: data.user.id,
    })
  } catch (error) {
    console.error("[auth/sign-up] Failed to create signup OTP challenge", error)
    await admin.auth.admin.deleteUser(data.user.id).catch((deleteError) => {
      console.error("[auth/sign-up] Failed to roll back user after OTP failure", deleteError)
    })
    return authApiJson(
      { ok: false, error: getOtpChallengeErrorMessage(error) },
      500
    )
  }

  const sent = await sendAuthOtpEmail(email, code, "signup")

  if (!sent && process.env.NODE_ENV === "production") {
    await admin.auth.admin.deleteUser(data.user.id).catch((deleteError) => {
      console.error("[auth/sign-up] Failed to roll back user after email failure", deleteError)
    })
    return authApiJson(
      { ok: false, error: "We could not send your signup code. Please try again." },
      502
    )
  }

  await recordSignupRiskEvent(admin, request, data.user.id, email).catch((error) => {
    console.error("[auth/sign-up] Failed to record signup risk event", error)
  })
  void logBusinessEvent(request, {
    eventType: "signup.created",
    userId: data.user.id,
  }).catch(() => {})

  return authApiJson(
    {
      ok: true,
      needsSignupCode: true,
      email,
      maskedEmail: maskEmail(email),
    },
    200
  )
}

import { type NextRequest } from "next/server"
import { z } from "zod"
import { authApiJson } from "@/modules/auth/application/auth-api-json"
import { createOtpChallenge } from "@/modules/auth/infrastructure/otp-challenges"
import { isAllowedRequestOrigin } from "@/modules/auth/security/request-origin"
import { validateEmail } from "@/modules/auth/domain/validation"
import { sendAuthOtpEmail } from "@/infrastructure/email/email-service"
import { logSecurityEvent } from "@/modules/master-admin/application/events"
import { authSubjectKey, getAuthRatelimit, getClientIP } from "@/core/security/rate-limit"
import { createAdminClient } from "@/infrastructure/db/supabase/admin"

export const dynamic = "force-dynamic"

const bodySchema = z.object({
  email: z.string().min(1).max(254),
})

export async function POST(request: NextRequest) {
  if (!isAllowedRequestOrigin((name) => request.headers.get(name))) {
    void logSecurityEvent(request, {
      eventType: "auth.password_reset_origin_forbidden",
      severity: "medium",
      outcome: "blocked",
      statusCode: 403,
    }).catch(() => {})
    return authApiJson({ error: "Forbidden" }, 403)
  }

  const ip = getClientIP(request)
  const rl = await getAuthRatelimit().limit(`password-reset:${ip}`)
  if (!rl.success) {
    void logSecurityEvent(request, {
      eventType: "auth.password_reset_rate_limited",
      severity: "medium",
      outcome: "blocked",
      statusCode: 429,
    }).catch(() => {})
    return authApiJson(
      { error: "Too many password reset attempts. Wait a few minutes and try again." },
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

  const email = validateEmail(parsed.data.email)
  if (!email) {
    return authApiJson({ error: "Enter a valid email address." }, 400)
  }

  const accountRl = await getAuthRatelimit().limit(
    authSubjectKey("password-reset-email", email)
  )
  if (!accountRl.success) {
    void logSecurityEvent(request, {
      eventType: "auth.password_reset_account_rate_limited",
      severity: "medium",
      outcome: "blocked",
      statusCode: 429,
    }).catch(() => {})
    return authApiJson(
      { error: "Too many password reset attempts. Wait a few minutes and try again." },
      429
    )
  }

  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch (error) {
    console.error("[request-password-reset] Supabase admin client is not configured", error)
    return authApiJson({ ok: true }, 200)
  }

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id,email")
    .eq("email", email)
    .maybeSingle()

  if (profileError) {
    console.error("[request-password-reset] Failed to look up profile", profileError)
    return authApiJson({ ok: true }, 200)
  }

  // Avoid account enumeration: non-existent accounts still receive the same response.
  if (!profile?.id) {
    return authApiJson({ ok: true }, 200)
  }

  try {
    const code = await createOtpChallenge(admin, {
      email,
      purpose: "password_reset",
      userId: profile.id,
    })
    await sendAuthOtpEmail(email, code, "password_reset")
    void logSecurityEvent(request, {
      eventType: "auth.password_reset_requested",
      severity: "low",
      outcome: "success",
      targetUserId: profile.id,
    }).catch(() => {})
  } catch (error) {
    console.error("[request-password-reset] Failed to create or send reset challenge", error)
  }

  return authApiJson({ ok: true }, 200)
}

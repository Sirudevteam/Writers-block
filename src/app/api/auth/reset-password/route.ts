import { revalidatePath } from "next/cache"
import { type NextRequest } from "next/server"
import { z } from "zod"
import { authApiJson } from "@/modules/auth/application/auth-api-json"
import { consumeOtpChallenge } from "@/modules/auth/infrastructure/otp-challenges"
import { isAllowedRequestOrigin } from "@/modules/auth/security/request-origin"
import { mapSupabaseAuthError } from "@/modules/auth/domain/safe-errors"
import {
  PASSWORD_REQUIREMENT_MESSAGE,
  validateEmail,
  validatePasswordSignUp,
} from "@/modules/auth/domain/validation"
import { logSecurityEvent } from "@/modules/master-admin/application/events"
import { authSubjectKey, getAuthRatelimit, getClientIP } from "@/core/security/rate-limit"
import { createAdminClient } from "@/infrastructure/db/supabase/admin"

export const dynamic = "force-dynamic"

const bodySchema = z.object({
  email: z.string().min(1).max(254),
  code: z.string().regex(/^\d{6}$/),
  password: z.string().min(1).max(72),
})

async function revokeExistingSessions(
  admin: ReturnType<typeof createAdminClient>,
  userId: string
) {
  const table = (admin as any).schema("master_admin").from("user_account_controls")
  const now = new Date().toISOString()
  const { data, error } = await table
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  if (data?.user_id) {
    const { error: updateError } = await table
      .update({ revoked_sessions_at: now })
      .eq("user_id", userId)
    if (updateError) throw new Error(updateError.message)
    return
  }

  const { error: insertError } = await table.insert({
    user_id: userId,
    status: "active",
    revoked_sessions_at: now,
  })
  if (insertError) throw new Error(insertError.message)
}

export async function POST(request: NextRequest) {
  if (!isAllowedRequestOrigin((name) => request.headers.get(name))) {
    void logSecurityEvent(request, {
      eventType: "auth.password_reset_complete_origin_forbidden",
      severity: "medium",
      outcome: "blocked",
      statusCode: 403,
    }).catch(() => {})
    return authApiJson({ error: "Forbidden" }, 403)
  }

  const ip = getClientIP(request)
  const rl = await getAuthRatelimit().limit(`reset-password:${ip}`)
  if (!rl.success) {
    void logSecurityEvent(request, {
      eventType: "auth.password_reset_complete_rate_limited",
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

  const password = validatePasswordSignUp(parsed.data.password)
  if (!password) {
    return authApiJson(
      { error: PASSWORD_REQUIREMENT_MESSAGE },
      400
    )
  }

  const accountRl = await getAuthRatelimit().limit(
    authSubjectKey("reset-password-email", email)
  )
  if (!accountRl.success) {
    void logSecurityEvent(request, {
      eventType: "auth.password_reset_complete_account_rate_limited",
      severity: "medium",
      outcome: "blocked",
      statusCode: 429,
    }).catch(() => {})
    return authApiJson(
      { error: "Too many password reset attempts. Wait a few minutes and try again." },
      429
    )
  }

  const admin = createAdminClient()
  const challenge = await consumeOtpChallenge(admin, {
    email,
    purpose: "password_reset",
    code: parsed.data.code,
  })

  if (!challenge) {
    void logSecurityEvent(request, {
      eventType: "auth.otp_failure",
      severity: "medium",
      outcome: "failure",
      statusCode: 400,
      metadata: { mode: "password_reset" },
    }).catch(() => {})
    return authApiJson(
      { error: "Invalid or expired password reset code. Request a new code and try again." },
      400
    )
  }

  try {
    await revokeExistingSessions(admin, challenge.userId)
  } catch (error) {
    console.error("[reset-password] Failed to revoke existing sessions", error)
    return authApiJson(
      { error: "We could not revoke existing sessions. Please try again." },
      500
    )
  }

  const { error } = await admin.auth.admin.updateUserById(challenge.userId, {
    password,
  })

  if (error) {
    void logSecurityEvent(request, {
      eventType: "auth.password_reset_failure",
      severity: "medium",
      outcome: "failure",
      targetUserId: challenge.userId,
      statusCode: 400,
    }).catch(() => {})
    return authApiJson({ error: mapSupabaseAuthError(error.message) }, 400)
  }

  void logSecurityEvent(request, {
    eventType: "auth.password_reset_success",
    severity: "medium",
    outcome: "success",
    targetUserId: challenge.userId,
  }).catch(() => {})

  revalidatePath("/", "layout")
  return authApiJson({ ok: true }, 200)
}

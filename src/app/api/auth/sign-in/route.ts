import { cookies } from "next/headers"
import { type NextRequest } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { z } from "zod"
import type { Database } from "@/infrastructure/db/types/database"
import { authApiJson } from "@/modules/auth/application/auth-api-json"
import { maskEmail } from "@/modules/auth/domain/mask-email"
import { isAllowedRequestOrigin } from "@/modules/auth/security/request-origin"
import { mapSupabaseAuthError } from "@/modules/auth/domain/safe-errors"
import { createOtpChallenge, encryptPayload } from "@/modules/auth/infrastructure/otp-challenges"
import { validateEmail, validatePasswordSignIn } from "@/modules/auth/domain/validation"
import { sendAuthOtpEmail } from "@/infrastructure/email/email-service"
import { logSecurityEvent } from "@/modules/master-admin/application/events"
import { authSubjectKey, getAuthRatelimit, getClientIP } from "@/core/security/rate-limit"
import { createAdminClient } from "@/infrastructure/db/supabase/admin"
import { isPasswordAuthDisabledForEmail } from "@/modules/iam/application/sso-policy"

export const dynamic = "force-dynamic"

const bodySchema = z.object({
  email: z.string().min(1).max(254),
  password: z.string().min(1).max(72),
})

export async function POST(request: NextRequest) {
  if (!isAllowedRequestOrigin((name) => request.headers.get(name))) {
    void logSecurityEvent(request, {
      eventType: "auth.signin_origin_forbidden",
      severity: "medium",
      outcome: "blocked",
      statusCode: 403,
    }).catch(() => {})
    return authApiJson({ error: "Forbidden" }, 403)
  }

  const ip = getClientIP(request)
  const rl = await getAuthRatelimit().limit(`signin:${ip}`)
  if (!rl.success) {
    void logSecurityEvent(request, {
      eventType: "auth.signin_rate_limited",
      severity: "medium",
      outcome: "blocked",
      statusCode: 429,
    }).catch(() => {})
    return authApiJson(
      { error: "Too many sign-in attempts. Wait a few minutes and try again." },
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
  const password = validatePasswordSignIn(parsed.data.password)
  if (!email || !password) {
    return authApiJson({ error: "Invalid email or password." }, 400)
  }

  const accountRl = await getAuthRatelimit().limit(authSubjectKey("signin-email", email))
  if (!accountRl.success) {
    void logSecurityEvent(request, {
      eventType: "auth.signin_account_rate_limited",
      severity: "medium",
      outcome: "blocked",
      statusCode: 429,
    }).catch(() => {})
    return authApiJson(
      { error: "Too many sign-in attempts. Wait a few minutes and try again." },
      429
    )
  }

  const admin = createAdminClient()
  if (await isPasswordAuthDisabledForEmail(admin as any, email)) {
    void logSecurityEvent(request, {
      eventType: "auth.signin_sso_required",
      severity: "medium",
      outcome: "blocked",
      statusCode: 403,
      metadata: { domain: email.split("@")[1] ?? null },
    }).catch(() => {})
    return authApiJson(
      { error: "This organization requires SSO sign-in.", code: "sso_required" },
      403
    )
  }

  const cookieStore = await cookies()
  const cookiesToApply: Array<{ name: string; value: string; options?: any }> = []
  const respond = (data: unknown, status: number) => {
    const response = authApiJson(data, status)
    cookiesToApply.forEach(({ name, value, options }) => {
      response.cookies.set(name, value, options)
    })
    return response
  }

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookiesToApply.push({ name, value, options })
          })
        },
      },
    }
  )

  const { data, error: passwordError } = await supabase.auth.signInWithPassword({ email, password })
  if (passwordError) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[auth/sign-in] Supabase password auth failed", {
        message: passwordError.message,
        name: passwordError.name,
        status: passwordError.status,
      })
    }
    void logSecurityEvent(request, {
      eventType: "auth.signin_failure",
      severity: "medium",
      outcome: "failure",
      statusCode: 401,
    }).catch(() => {})
    return respond({ error: mapSupabaseAuthError(passwordError.message) }, 401)
  }

  if (!data.user?.id || !data.session?.access_token || !data.session?.refresh_token) {
    return respond({ error: "We could not start sign-in. Please try again." }, 500)
  }

  // Password auth creates a Supabase session. Store it server-side and send
  // Writers Block's own OTP; the browser receives cookies only after OTP verify.
  cookiesToApply.length = 0

  const code = await createOtpChallenge(admin, {
    email,
    purpose: "signin",
    userId: data.user.id,
    encryptedPayload: encryptPayload({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    }),
  })
  const sent = await sendAuthOtpEmail(email, code, "signin")

  if (!sent && process.env.NODE_ENV === "production") {
    void logSecurityEvent(request, {
      eventType: "auth.signin_otp_send_failure",
      severity: "medium",
      outcome: "failure",
      targetUserId: data.user.id,
      statusCode: 502,
    }).catch(() => {})
    return respond({ error: "We could not send your sign-in code. Please try again." }, 502)
  }

  return respond({ ok: true, needsOtp: true, email, maskedEmail: maskEmail(email) }, 200)
}

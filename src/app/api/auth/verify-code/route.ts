import { revalidatePath } from "next/cache"
import { cookies } from "next/headers"
import { type NextRequest } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { z } from "zod"
import type { Database } from "@/infrastructure/db/types/database"
import { authApiJson } from "@/modules/auth/application/auth-api-json"
import { getSafeNextPath } from "@/modules/auth/domain/next-path"
import { consumeMasterAdminOtpChallenge } from "@/modules/auth/infrastructure/master-admin-otp-challenges"
import { consumeOtpChallenge } from "@/modules/auth/infrastructure/otp-challenges"
import { isAllowedRequestOrigin } from "@/modules/auth/security/request-origin"
import { validateEmail } from "@/modules/auth/domain/validation"
import { logBusinessEvent, logSecurityEvent } from "@/modules/master-admin/application/events"
import { markSignupRiskVerified } from "@/modules/master-admin/application/fraud"
import { authSubjectKey, getAuthRatelimit, getClientIP } from "@/core/security/rate-limit"
import { createAdminClient } from "@/infrastructure/db/supabase/admin"

export const dynamic = "force-dynamic"

const bodySchema = z.object({
  email: z.string().min(1).max(254),
  token: z.string().regex(/^\d{6}$/),
  mode: z.enum(["signup", "signin", "master-admin"]).optional(),
  next: z.string().max(512).optional(),
})

function getOtpErrorMessage(message: string): string {
  const m = message.toLowerCase()
  if (
    m.includes("expired") ||
    m.includes("invalid token") ||
    m.includes("token has expired") ||
    m.includes("otp")
  ) {
    return "Invalid or expired verification code. Request a new code and try again."
  }
  if (m.includes("too many")) {
    return "Too many attempts. Please wait a few minutes and try again."
  }
  return "We could not verify that code. Try again or request a new one."
}

type SigninPayload = { access_token: string; refresh_token: string }

function isSigninPayload(payload: unknown): payload is SigninPayload {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "access_token" in payload &&
    "refresh_token" in payload &&
    typeof (payload as { access_token?: unknown }).access_token === "string" &&
    typeof (payload as { refresh_token?: unknown }).refresh_token === "string"
  )
}

export async function POST(request: NextRequest) {
  if (!isAllowedRequestOrigin((name) => request.headers.get(name))) {
    void logSecurityEvent(request, {
      eventType: "auth.otp_origin_forbidden",
      severity: "medium",
      outcome: "blocked",
      statusCode: 403,
    }).catch(() => {})
    return authApiJson({ error: "Forbidden" }, 403)
  }

  const ip = getClientIP(request)
  const rl = await getAuthRatelimit().limit(`verify-code:${ip}`)
  if (!rl.success) {
    void logSecurityEvent(request, {
      eventType: "auth.otp_rate_limited",
      severity: "medium",
      outcome: "blocked",
      statusCode: 429,
    }).catch(() => {})
    return authApiJson(
      { error: "Too many verification attempts. Wait a few minutes and try again." },
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
  const mode = parsed.data.mode ?? "signup"
  const userAuthPurpose =
    mode === "signin"
      ? "signin"
      : "signup"
  const requestedNext = getSafeNextPath(parsed.data.next)
  const safeNext =
    mode === "master-admin" && !requestedNext.startsWith("/master-admin")
      ? "/master-admin"
      : requestedNext
  if (!email) {
    return authApiJson({ error: "Enter a valid email address." }, 400)
  }

  const accountRl = await getAuthRatelimit().limit(
    authSubjectKey(`verify-code-email:${mode}`, email)
  )
  if (!accountRl.success) {
    void logSecurityEvent(request, {
      eventType: "auth.otp_account_rate_limited",
      severity: "medium",
      outcome: "blocked",
      statusCode: 429,
      metadata: { mode },
    }).catch(() => {})
    return authApiJson(
      { error: "Too many verification attempts. Wait a few minutes and try again." },
      429
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

  const admin = createAdminClient()
  const challenge =
    mode === "master-admin"
      ? await consumeMasterAdminOtpChallenge<{ access_token: string; refresh_token: string }>(admin, {
          email,
          code: parsed.data.token,
        })
      : await consumeOtpChallenge<
          | { access_token: string; refresh_token: string }
        >(admin, {
          email,
          purpose: userAuthPurpose,
          code: parsed.data.token,
        })

  if (!challenge) {
    void logSecurityEvent(request, {
      eventType: "auth.otp_failure",
      severity: "medium",
      outcome: "failure",
      statusCode: 400,
      metadata: { mode },
    }).catch(() => {})
    return respond({ error: getOtpErrorMessage("invalid otp") }, 400)
  }

  if (mode === "signup") {
    const { error: confirmError } = await admin.auth.admin.updateUserById(challenge.userId, {
      email_confirm: true,
    })
    if (confirmError) {
      return respond({ error: "We could not confirm your account. Please try again." }, 500)
    }

    await markSignupRiskVerified(admin, challenge.userId).catch((error) => {
      console.error("[auth/verify-code] Failed to mark signup risk event verified", error)
    })
    void logBusinessEvent(request, {
      eventType: "signup.verified",
      userId: challenge.userId,
    }).catch(() => {})
    return respond(
      {
        ok: true,
        redirectTo: `/signin?verified=signup&next=${encodeURIComponent(safeNext)}`,
      },
      200
    )
  } else {
    if (!isSigninPayload(challenge.payload)) {
      return respond({ error: "We could not complete sign-in. Please try again." }, 500)
    }

    const { data, error } = await supabase.auth.setSession({
      access_token: challenge.payload.access_token,
      refresh_token: challenge.payload.refresh_token,
    })
    if (error || !data.session) {
      return respond(
        { error: "We could not start your session after verification. Please sign in again." },
        500
      )
    }
    void logSecurityEvent(request, {
      eventType: mode === "master-admin" ? "auth.master_admin_signin_success" : "auth.signin_success",
      severity: mode === "master-admin" ? "medium" : "low",
      outcome: "success",
      actorUserId: challenge.userId,
      targetUserId: challenge.userId,
      metadata: { mode },
    }).catch(() => {})
  }

  revalidatePath("/", "layout")
  return respond({ ok: true, redirectTo: safeNext }, 200)
}

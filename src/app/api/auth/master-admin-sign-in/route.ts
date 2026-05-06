import { cookies } from "next/headers"
import { type NextRequest } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { z } from "zod"
import type { Database } from "@/infrastructure/db/types/database"
import { authApiJson } from "@/modules/auth/application/auth-api-json"
import {
  createMasterAdminOtpChallenge,
  encryptMasterAdminOtpPayload,
} from "@/modules/auth/infrastructure/master-admin-otp-challenges"
import { isAllowedRequestOrigin } from "@/modules/auth/security/request-origin"
import { mapSupabaseAuthError } from "@/modules/auth/domain/safe-errors"
import { validateEmail, validatePasswordSignIn } from "@/modules/auth/domain/validation"
import { sendMasterAdminOtpEmail } from "@/infrastructure/email/email-service"
import { authSubjectKey, getAuthRatelimit, getClientIP } from "@/core/security/rate-limit"
import { createAdminClient } from "@/infrastructure/db/supabase/admin"

export const dynamic = "force-dynamic"

const bodySchema = z.object({
  email: z.string().min(1).max(254),
  password: z.string().min(1).max(72),
})

async function isMasterAdminUser(userId: string): Promise<boolean> {
  const admin = createAdminClient()
  const { data, error } = await (admin as any)
    .schema("master_admin")
    .from("users")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle()

  if (error) {
    console.error("[master-admin-sign-in] privilege check failed", error)
    return false
  }

  return Boolean(data)
}

export async function POST(request: NextRequest) {
  if (!isAllowedRequestOrigin((name) => request.headers.get(name))) {
    return authApiJson({ error: "Forbidden" }, 403)
  }

  const ip = getClientIP(request)
  const rl = await getAuthRatelimit().limit(`master-admin-signin:${ip}`)
  if (!rl.success) {
    return authApiJson(
      { error: "Too many Master Admin sign-in attempts. Wait a few minutes and try again." },
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

  const accountRl = await getAuthRatelimit().limit(
    authSubjectKey("master-admin-signin-email", email)
  )
  if (!accountRl.success) {
    return authApiJson(
      { error: "Too many Master Admin sign-in attempts. Wait a few minutes and try again." },
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

  const { data, error: passwordError } = await supabase.auth.signInWithPassword({ email, password })
  if (passwordError) {
    return respond({ error: mapSupabaseAuthError(passwordError.message) }, 401)
  }

  if (!data.user?.id || !data.session?.access_token || !data.session?.refresh_token) {
    return respond({ error: "We could not start Master Admin sign-in. Please try again." }, 500)
  }

  cookiesToApply.length = 0

  if (!(await isMasterAdminUser(data.user.id))) {
    return respond({ error: "Master Admin access is not enabled for this account." }, 403)
  }

  const admin = createAdminClient()
  const code = await createMasterAdminOtpChallenge(admin, {
    email,
    userId: data.user.id,
    encryptedPayload: encryptMasterAdminOtpPayload({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    }),
  })
  const sent = await sendMasterAdminOtpEmail(email, code)

  if (!sent && process.env.NODE_ENV === "production") {
    return respond({ error: "We could not send your Master Admin code. Please try again." }, 502)
  }

  return respond({ ok: true, needsOtp: true, email }, 200)
}

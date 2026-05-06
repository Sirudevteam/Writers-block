import { type NextRequest } from "next/server"
import { z } from "zod"
import { authApiJson } from "@/modules/auth/application/auth-api-json"
import { createOtpChallenge } from "@/modules/auth/infrastructure/otp-challenges"
import { isAllowedRequestOrigin } from "@/modules/auth/security/request-origin"
import { validateEmail } from "@/modules/auth/domain/validation"
import { sendAuthOtpEmail } from "@/infrastructure/email/email-service"
import { authSubjectKey, getAuthRatelimit, getClientIP } from "@/core/security/rate-limit"
import { createAdminClient } from "@/infrastructure/db/supabase/admin"

export const dynamic = "force-dynamic"

const bodySchema = z.object({
  email: z.string().min(1).max(254),
})

/**
 * POST /api/auth/resend-signup-code
 *
 * Resends the app-owned signup code. This deliberately avoids Supabase's
 * hosted Confirm signup email template.
 */
export async function POST(request: NextRequest) {
  if (!isAllowedRequestOrigin((name) => request.headers.get(name))) {
    return authApiJson({ error: "Forbidden" }, 403)
  }

  const ip = getClientIP(request)
  const rl = await getAuthRatelimit().limit(`resend-signup-code:${ip}`)
  if (!rl.success) {
    return authApiJson(
      { error: "Too many attempts. Please wait a few minutes." },
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
    authSubjectKey("resend-signup-code-email", email)
  )
  if (!accountRl.success) {
    return authApiJson(
      { error: "Too many attempts. Please wait a few minutes." },
      429
    )
  }

  const admin = createAdminClient()
  const { data } = await (admin as any)
    .schema("user_auth")
    .from("otp_challenges")
    .select("user_id,encrypted_payload")
    .eq("email", email)
    .eq("purpose", "signup")
    .is("consumed_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (data?.user_id && data?.encrypted_payload) {
    const code = await createOtpChallenge(admin, {
      email,
      purpose: "signup",
      userId: data.user_id,
      encryptedPayload: data.encrypted_payload,
    })
    const sent = await sendAuthOtpEmail(email, code, "signup")
    if (!sent && process.env.NODE_ENV === "production") {
      return authApiJson({ error: "We could not resend your signup code. Please try again." }, 502)
    }
  }

  return authApiJson({ ok: true }, 200)
}

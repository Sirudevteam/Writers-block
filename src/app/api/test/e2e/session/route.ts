import { cookies } from "next/headers"
import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { z } from "zod"
import type { Database } from "@/infrastructure/db/types/database"
import { createAdminClient } from "@/infrastructure/db/supabase/admin"
import { E2E_TEST_HEADERS, requireE2eTestAccess } from "../_shared"
import { PLAN_LIMITS } from "@/shared/types/project"

export const dynamic = "force-dynamic"

const bodySchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(72),
  fullName: z.string().trim().min(1).max(120).optional(),
  plan: z.enum(["free", "pro", "premium"]).optional().default("free"),
})

export async function POST(request: NextRequest) {
  const denied = requireE2eTestAccess(request)
  if (denied) return denied

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400, headers: E2E_TEST_HEADERS })
  }

  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400, headers: E2E_TEST_HEADERS })
  }

  const { email, password, fullName, plan } = parsed.data
  const admin = createAdminClient()
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName ?? "E2E Writer" },
  })

  if (created.error || !created.data.user?.id) {
    return NextResponse.json(
      { error: created.error?.message ?? "Could not create E2E user" },
      { status: created.error?.message.toLowerCase().includes("already") ? 409 : 500, headers: E2E_TEST_HEADERS }
    )
  }

  const userId = created.data.user.id
  await admin.from("profiles").upsert({
    id: userId,
    email,
    full_name: fullName ?? "E2E Writer",
  })
  await admin.from("subscriptions").upsert(
    {
      user_id: userId,
      plan,
      projects_limit: PLAN_LIMITS[plan],
      status: "active",
      current_period_start: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  )

  const cookieStore = await cookies()
  const cookiesToApply: Array<{ name: string; value: string; options?: any }> = []
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

  const signedIn = await supabase.auth.signInWithPassword({ email, password })
  if (signedIn.error || !signedIn.data.session) {
    return NextResponse.json(
      { error: signedIn.error?.message ?? "Could not start E2E session" },
      { status: 500, headers: E2E_TEST_HEADERS }
    )
  }

  const response = NextResponse.json({ ok: true, userId, email, plan }, { headers: E2E_TEST_HEADERS })
  cookiesToApply.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
  return response
}

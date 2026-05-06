import { cookies } from "next/headers"
import { type NextRequest } from "next/server"
import { createServerClient } from "@supabase/ssr"
import type { Database } from "@/infrastructure/db/types/database"
import { authApiJson } from "@/modules/auth/application/auth-api-json"
import { isAllowedRequestOrigin } from "@/modules/auth/security/request-origin"

export const dynamic = "force-dynamic"

const ACTIVE_ORG_COOKIE = "wb_active_org"

export async function POST(request: NextRequest) {
  if (!isAllowedRequestOrigin((name) => request.headers.get(name))) {
    return authApiJson({ error: "Forbidden" }, 403)
  }

  const cookieStore = await cookies()
  const cookiesToApply: Array<{ name: string; value: string; options?: any }> = []
  const respond = (data: unknown, status: number) => {
    const response = authApiJson(data, status)
    cookiesToApply.forEach(({ name, value, options }) => {
      response.cookies.set(name, value, options)
    })
    response.cookies.set(ACTIVE_ORG_COOKIE, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 0,
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

  // Use local sign-out here so logout never blocks on Supabase's remote
  // refresh-token revocation call. The browser is navigating away; clearing
  // cookie storage is the critical path.
  const { error } = await supabase.auth.signOut({ scope: "local" })
  if (error) {
    console.warn("[auth/sign-out] Local sign-out failed; expiring app cookies", error)
    return respond({ ok: true, localSignOut: false }, 200)
  }

  return respond({ ok: true }, 200)
}

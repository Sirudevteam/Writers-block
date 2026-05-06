import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/infrastructure/db/supabase/server"
import { requireOrgPermission, resolveActiveOrgContext } from "@/modules/iam/application/guard"
import type { Permission } from "@/modules/iam/domain/permissions"
import { assertIamAal2Ok } from "@/modules/iam/application/mfa"
import { createAdminClient } from "@/infrastructure/db/supabase/admin"

export const IAM_JSON_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
} as const

function requiresAal2(permission: Permission | undefined): boolean {
  return (
    permission === "org:member:manage" ||
    permission === "org:member:invite" ||
    permission === "org:security:manage" ||
    permission === "billing:manage" ||
    permission === "audit:read"
  )
}

function parseJwtIat(accessToken: string | undefined | null): number | null {
  if (!accessToken || !accessToken.includes(".")) return null
  try {
    const payload = accessToken.split(".")[1]
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { iat?: unknown }
    return typeof decoded.iat === "number" ? decoded.iat : null
  } catch {
    return null
  }
}

function authProviderFromUser(user: { app_metadata?: Record<string, unknown> }): string | null {
  const provider = user.app_metadata?.provider
  return typeof provider === "string" ? provider.toLowerCase() : null
}

export async function guardOrgApi(
  _req: NextRequest,
  permission?: Permission
): Promise<
  | {
      ok: true
      supabase: ReturnType<typeof createAdminClient>
      userId: string
      userEmail: string | null
      orgId: string
      role: string
    }
  | { ok: false; response: NextResponse }
> {
  const authSupabase = await createClient()
  const {
    data: { user },
  } = await authSupabase.auth.getUser()

  if (!user?.id) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: IAM_JSON_HEADERS }),
    }
  }

  let sensitiveAal2Checked = false
  if (permission && requiresAal2(permission)) {
    const mfa = await assertIamAal2Ok(authSupabase as any)
    sensitiveAal2Checked = true
    if (!mfa.ok) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: mfa.message, code: mfa.code },
          { status: 403, headers: IAM_JSON_HEADERS }
        ),
      }
    }
  }

  let supabase: ReturnType<typeof createAdminClient>
  try {
    supabase = createAdminClient()
  } catch (e) {
    console.error("[iam/api-guard] Service role client is not configured", e)
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Server auth is not configured" },
        { status: 503, headers: IAM_JSON_HEADERS }
      ),
    }
  }

  try {
    const ctx = permission
      ? await requireOrgPermission(supabase as any, user.id, permission)
      : await resolveActiveOrgContext(supabase as any, user.id)
    if (!ctx) {
      return {
        ok: false,
        response: NextResponse.json({ error: "Organization context missing" }, { status: 400, headers: IAM_JSON_HEADERS }),
      }
    }

    const { data: policy } = await (supabase.from("organization_security_policies") as any)
      .select("require_mfa, require_sso, disable_password_login, session_duration_minutes")
      .eq("org_id", ctx.orgId)
      .maybeSingle()

    if (policy?.require_mfa && !sensitiveAal2Checked) {
      const mfa = await assertIamAal2Ok(authSupabase as any)
      if (!mfa.ok) {
        return {
          ok: false,
          response: NextResponse.json(
            { error: mfa.message, code: mfa.code },
            { status: 403, headers: IAM_JSON_HEADERS }
          ),
        }
      }
    }

    const provider = authProviderFromUser(user)
    if ((policy?.require_sso || policy?.disable_password_login) && provider === "email") {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "This organization requires SSO sign-in", code: "sso_required" },
          { status: 403, headers: IAM_JSON_HEADERS }
        ),
      }
    }

    if (policy?.session_duration_minutes) {
      const {
        data: { session },
      } = await authSupabase.auth.getSession()
      const iat = parseJwtIat(session?.access_token)
      if (iat && Date.now() - iat * 1000 > policy.session_duration_minutes * 60 * 1000) {
        return {
          ok: false,
          response: NextResponse.json(
            { error: "Session duration exceeded. Sign in again.", code: "session_duration_expired" },
            { status: 401, headers: IAM_JSON_HEADERS }
          ),
        }
      }
    }

    return {
      ok: true,
      supabase,
      userId: user.id,
      userEmail: user.email ?? null,
      orgId: ctx.orgId,
      role: ctx.role,
    }
  } catch (e) {
    const code = e instanceof Error ? e.message : "forbidden"
    const status = code === "org_context_missing" ? 400 : 403
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status, headers: IAM_JSON_HEADERS }) }
  }
}

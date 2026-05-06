import { cookies } from "next/headers"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/infrastructure/db/types/database"
import type { Permission } from "@/modules/iam/domain/permissions"
import { roleHasPermission } from "@/modules/iam/domain/permissions"
import { getUserRoleForOrg, resolveDefaultOrgId } from "@/modules/iam/application/org-context"

const ACTIVE_ORG_COOKIE = "wb_active_org"

type OrgContext = {
  orgId: string
  role: "owner" | "admin" | "member" | "billing"
}

export async function resolveActiveOrgContext(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<OrgContext | null> {
  const store = await cookies()
  const requested = store.get(ACTIVE_ORG_COOKIE)?.value
  if (requested) {
    const role = await getUserRoleForOrg(supabase, userId, requested)
    if (role) return { orgId: requested, role }
  }

  const fallback = await resolveDefaultOrgId(supabase, userId)
  if (!fallback) return null
  return { orgId: fallback.orgId, role: fallback.role }
}

export async function requireOrgPermission(
  supabase: SupabaseClient<Database>,
  userId: string,
  permission: Permission
): Promise<OrgContext> {
  const ctx = await resolveActiveOrgContext(supabase, userId)
  if (!ctx) {
    throw new Error("org_context_missing")
  }
  if (!roleHasPermission(ctx.role, permission)) {
    throw new Error("forbidden")
  }
  return ctx
}

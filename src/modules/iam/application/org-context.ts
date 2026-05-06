import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database, OrganizationMember } from "@/infrastructure/db/types/database"

export type OrgMembership = Pick<OrganizationMember, "org_id" | "role"> & {
  org: { id: string; name: string; slug: string; kind: "personal" | "team" }
}

/**
 * Returns organizations the current user belongs to.
 * Uses RLS: requires a user-scoped Supabase client (cookie session).
 */
export async function listUserOrganizations(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<OrgMembership[]> {
  const { data, error } = await supabase
    .from("organization_members")
    .select("org_id, role, org:organizations(id, name, slug, kind)")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })

  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as OrgMembership[]
}

/**
 * Picks a default org for a user. For now we prefer their personal org (created on signup),
 * otherwise the first org membership. This keeps the app functional before adding a UI org switcher.
 */
export async function resolveDefaultOrgId(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<{ orgId: string; role: OrganizationMember["role"] } | null> {
  const memberships = await listUserOrganizations(supabase, userId)
  if (memberships.length === 0) return null
  const personal = memberships.find((m) => m.org.kind === "personal")
  const chosen = personal ?? memberships[0]
  return { orgId: chosen.org_id, role: chosen.role }
}

export async function getUserRoleForOrg(
  supabase: SupabaseClient<Database>,
  userId: string,
  orgId: string
): Promise<OrganizationMember["role"] | null> {
  const { data, error } = await supabase
    .from("organization_members")
    .select("role")
    .eq("user_id", userId)
    .eq("org_id", orgId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return (data?.role as OrganizationMember["role"] | undefined) ?? null
}

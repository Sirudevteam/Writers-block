import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { getServerAuthUser } from "@/infrastructure/db/supabase/server-auth"
import { resolveActiveOrgContext } from "@/modules/iam/application/guard"
import { roleHasPermission } from "@/modules/iam/domain/permissions"
import { listUserOrganizations } from "@/modules/iam/application/org-context"
import { OrgSwitcher } from "@/modules/organizations/presentation/components/org-switcher"
import { OrgMembersTable } from "@/modules/organizations/presentation/components/members-table"

export const metadata: Metadata = {
  title: "Organization",
}

export default async function OrgSettingsPage() {
  const auth = await getServerAuthUser()
  if (!auth) redirect("/signin?next=/dashboard/org")

  const ctx = await resolveActiveOrgContext(auth.supabase as any, auth.user.id)
  if (!ctx) {
    return (
      <div className="rounded-xl border border-white/10 bg-[#111] p-6 text-white/70">
        No organization context for this account.
      </div>
    )
  }

  const memberships = await listUserOrganizations(auth.supabase as any, auth.user.id)
  const canManage = roleHasPermission(ctx.role, "org:member:manage")

  const { data: members, error } = await auth.supabase
    .from("organization_members")
    .select("user_id, role, created_at, profile:profiles(email, full_name)")
    .eq("org_id", ctx.orgId)
    .order("created_at", { ascending: true })

  if (error) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-red-200">
        Failed to load org members: <span className="font-mono text-sm">{error.message}</span>
      </div>
    )
  }

  return (
    <div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Organization</h1>
          <p className="mt-2 text-sm text-white/55">
            Manage your organization context and membership. Active org is stored in a secure cookie.
          </p>
        </div>
      </div>

      <div className="mt-6">
        <OrgSwitcher memberships={memberships} activeOrgId={ctx.orgId} />
      </div>

      <div className="mt-8">
        <OrgMembersTable
          orgId={ctx.orgId}
          currentUserId={auth.user.id}
          canManage={canManage}
          initialMembers={(members ?? []) as any}
        />
      </div>
    </div>
  )
}

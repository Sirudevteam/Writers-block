import { redirect } from "next/navigation"
import { DashboardClient } from "@/app/dashboard/dashboard-client"
import { createAdminClient } from "@/infrastructure/db/supabase/admin"
import { getServerAuthUser } from "@/infrastructure/db/supabase/server-auth"
import { requireOrgPermission } from "@/modules/iam/application/guard"
import { listProjects } from "@/modules/projects/application/project-service"
import { PROJECT_PAGE_SIZE_DEFAULT } from "@/modules/projects/application/pagination"

export const dynamic = "force-dynamic"

export default async function DashboardPage() {
  const auth = await getServerAuthUser()

  if (!auth) {
    redirect("/signin")
  }

  const admin = createAdminClient()
  const org = await requireOrgPermission(admin, auth.user.id, "project:read")

  const [profileResult, subscriptionResult, initialProjectsPage] = await Promise.all([
    admin.from("profiles").select("*").eq("id", auth.user.id).maybeSingle(),
    admin.from("subscriptions").select("*").eq("user_id", auth.user.id).maybeSingle(),
    listProjects({
      supabase: admin,
      userId: auth.user.id,
      orgId: org.orgId,
      limit: PROJECT_PAGE_SIZE_DEFAULT,
      cursor: null,
    }),
  ])

  if (profileResult.error) {
    throw new Error(profileResult.error.message)
  }
  if (subscriptionResult.error) {
    throw new Error(subscriptionResult.error.message)
  }

  return (
    <DashboardClient
      profile={profileResult.data ?? null}
      subscription={subscriptionResult.data ?? null}
      initialProjectsPage={initialProjectsPage}
    />
  )
}

import { redirect } from "next/navigation"
import { getServerAuthUser } from "@/infrastructure/db/supabase/server-auth"
import { userHasAdminPrivileges } from "@/modules/master-admin/security/admin-privileges"
import { DashboardSidebar } from "@/modules/dashboard/presentation/components/dashboard-sidebar"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const auth = await getServerAuthUser()

  if (!auth) {
    redirect("/signin")
  }

  const isOperator = await userHasAdminPrivileges(auth.user.id)

  return (
    <div className="flex min-h-[100dvh] min-h-screen overflow-x-hidden bg-[#0a0a0a]">
      <DashboardSidebar isOperator={isOperator} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

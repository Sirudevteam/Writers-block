import { redirect } from "next/navigation"
import { createClient } from "@/infrastructure/db/supabase/server"
import { userHasAdminPrivileges } from "@/modules/master-admin/security/admin-privileges"
import { assertMasterAdminAal2Ok } from "@/modules/master-admin/security/mfa"

/**
 * Server-only guard for Master Admin pages. Middleware already enforces host + session;
 * this re-checks `master_admin.users` and optional AAL2 before any sensitive UI.
 */
export async function requireMasterAdminSession() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user?.id || !(await userHasAdminPrivileges(user.id))) {
    redirect("/dashboard")
  }

  const mfa = await assertMasterAdminAal2Ok(supabase)
  if (!mfa.ok) {
    redirect("/signin?error=mfa_required")
  }

  return { user, supabase }
}

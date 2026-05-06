import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/infrastructure/db/supabase/server"
import { userHasAdminPrivileges } from "@/modules/master-admin/security/admin-privileges"
import { isRequestHostAllowedForMasterAdmin } from "@/modules/master-admin/security/admin-host"
import { assertMasterAdminAal2Ok } from "@/modules/master-admin/security/mfa"
import { MASTER_ADMIN_JSON_HEADERS } from "@/modules/master-admin/application/http"

export async function guardMasterAdminApi(req: NextRequest): Promise<
  { ok: true } | { ok: false; response: NextResponse }
> {
  if (!isRequestHostAllowedForMasterAdmin(req.headers.get("host"))) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Not Found" },
        { status: 404, headers: MASTER_ADMIN_JSON_HEADERS }
      ),
    }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user?.id) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: MASTER_ADMIN_JSON_HEADERS }
      ),
    }
  }

  if (!(await userHasAdminPrivileges(user.id))) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Forbidden" },
        { status: 403, headers: MASTER_ADMIN_JSON_HEADERS }
      ),
    }
  }

  const mfa = await assertMasterAdminAal2Ok(supabase)
  if (!mfa.ok) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: mfa.message, code: mfa.code },
        { status: 403, headers: MASTER_ADMIN_JSON_HEADERS }
      ),
    }
  }

  return { ok: true }
}

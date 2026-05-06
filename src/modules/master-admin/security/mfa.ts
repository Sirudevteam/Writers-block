import type { SupabaseClient } from "@supabase/supabase-js"
import { parseJwtAal } from "@/modules/auth/domain/jwt-aal"

function isProductionRuntime(): boolean {
  return process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production"
}

/**
 * Production defaults to requiring JWT `aal: aal2` for Master Admin.
 * Local/staging deployments can opt in with `REQUIRE_AAL2_FOR_MASTER_ADMIN=1`.
 * Production break-glass can explicitly set the flag to `0|false|no`.
 */
function isAal2RequiredForMasterAdmin(): boolean {
  const v = process.env.REQUIRE_AAL2_FOR_MASTER_ADMIN?.trim().toLowerCase()
  if (v === "0" || v === "false" || v === "no") return false
  if (v === "1" || v === "true" || v === "yes") return true
  return isProductionRuntime()
}

type MasterAdminMfaResult =
  | { ok: true }
  | { ok: false; message: string; code: "aal2_required" }

export async function assertMasterAdminAal2Ok(
  supabase: SupabaseClient
): Promise<MasterAdminMfaResult> {
  if (!isAal2RequiredForMasterAdmin()) {
    return { ok: true }
  }

  const {
    data: { session },
  } = await supabase.auth.getSession()

  const aal = parseJwtAal(session?.access_token)
  if (aal === "aal2") {
    return { ok: true }
  }

  return {
    ok: false,
    message:
      "Multi-factor authentication is required for Master Admin. Sign out, sign in again, and complete your MFA challenge.",
    code: "aal2_required",
  }
}

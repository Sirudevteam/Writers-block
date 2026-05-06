import type { SupabaseClient } from "@supabase/supabase-js"
import { parseJwtAal } from "@/modules/auth/domain/jwt-aal"

function isProductionRuntime(): boolean {
  return process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production"
}

function isAal2RequiredForIamAdmin(): boolean {
  const v = process.env.REQUIRE_AAL2_FOR_IAM_ADMIN?.trim().toLowerCase()
  if (v === "0" || v === "false" || v === "no") return false
  if (v === "1" || v === "true" || v === "yes") return true
  return isProductionRuntime()
}

type IamMfaResult =
  | { ok: true }
  | { ok: false; message: string; code: "aal2_required" }

export async function assertIamAal2Ok(supabase: SupabaseClient): Promise<IamMfaResult> {
  if (!isAal2RequiredForIamAdmin()) return { ok: true }
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const aal = parseJwtAal(session?.access_token)
  if (aal === "aal2") return { ok: true }
  return {
    ok: false,
    code: "aal2_required",
    message:
      "Multi-factor authentication is required for this action. Sign out, sign in again, and complete your MFA challenge.",
  }
}

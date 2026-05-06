import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/infrastructure/db/supabase/server"
import { createAdminClient } from "@/infrastructure/db/supabase/admin"
import { IAM_JSON_HEADERS } from "@/modules/iam/application/api-guard"

export const dynamic = "force-dynamic"

export async function POST(_req: NextRequest) {
  const auth = await createClient()
  const {
    data: { user },
  } = await auth.auth.getUser()
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: IAM_JSON_HEADERS })
  }

  const admin = createAdminClient()
  const revokedAt = new Date().toISOString()
  const { error } = await (admin as any).schema("master_admin").from("user_account_controls").upsert(
    {
      user_id: user.id,
      status: "active",
      reason: "User revoked all sessions",
      revoked_sessions_at: revokedAt,
    },
    { onConflict: "user_id" }
  )

  if (error) {
    return NextResponse.json({ error: "Failed to revoke sessions" }, { status: 500, headers: IAM_JSON_HEADERS })
  }

  await auth.auth.signOut({ scope: "global" }).catch(() => {})
  return NextResponse.json({ ok: true, revokedAt }, { headers: IAM_JSON_HEADERS })
}

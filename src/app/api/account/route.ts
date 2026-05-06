import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/infrastructure/db/supabase/server"
import { createAdminClient } from "@/infrastructure/db/supabase/admin"
import { IAM_JSON_HEADERS } from "@/modules/iam/application/api-guard"

export const dynamic = "force-dynamic"

const deleteSchema = z.object({
  reason: z.string().trim().max(1000).optional(),
}).optional()

export async function DELETE(req: NextRequest) {
  const auth = await createClient()
  const {
    data: { user },
  } = await auth.auth.getUser()
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: IAM_JSON_HEADERS })
  }

  const parsed = deleteSchema.safeParse(await req.json().catch(() => undefined))
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid deletion request" }, { status: 400, headers: IAM_JSON_HEADERS })
  }

  const admin = createAdminClient()
  const { data: memberships, error } = await (admin.from("organization_members") as any)
    .select("org_id, role, organization:organizations(id, name)")
    .eq("user_id", user.id)

  if (error) {
    return NextResponse.json({ error: "Failed to validate account ownership" }, { status: 500, headers: IAM_JSON_HEADERS })
  }

  const blockers: Array<Record<string, unknown>> = []
  for (const member of memberships ?? []) {
    if (member.role !== "owner") continue
    const { count } = await admin
      .from("organization_members")
      .select("user_id", { count: "exact", head: true })
      .eq("org_id", member.org_id)
      .eq("role", "owner")
    if ((count ?? 0) <= 1) {
      blockers.push({ orgId: member.org_id, organization: member.organization })
    }
  }

  const status = blockers.length ? "blocked" : "requested"
  const { data, error: insertError } = await (admin.from("account_deletion_requests") as any)
    .insert({
      user_id: user.id,
      status,
      reason: parsed.data?.reason ?? null,
      blocking_orgs: blockers,
    })
    .select("*")
    .single()

  if (insertError || !data) {
    return NextResponse.json({ error: "Failed to create deletion request" }, { status: 500, headers: IAM_JSON_HEADERS })
  }

  if (blockers.length) {
    return NextResponse.json(
      { error: "Transfer ownership before deleting this account", deletionRequest: data, blockingOrgs: blockers },
      { status: 409, headers: IAM_JSON_HEADERS }
    )
  }

  await (admin as any).schema("master_admin").from("user_account_controls").upsert(
    {
      user_id: user.id,
      status: "active",
      reason: "Account deletion requested",
      revoked_sessions_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  )

  return NextResponse.json({ ok: true, deletionRequest: data }, { status: 202, headers: IAM_JSON_HEADERS })
}

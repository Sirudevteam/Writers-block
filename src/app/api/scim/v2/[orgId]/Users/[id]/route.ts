import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createAdminClient } from "@/infrastructure/db/supabase/admin"
import { scimUserResponse, validateScimBearer } from "@/modules/iam/application/scim"
import { scimLimitOr429 } from "@/core/security/api-ip-limit"

export const dynamic = "force-dynamic"

const paramsSchema = z.object({ orgId: z.string().uuid(), id: z.string().uuid() })
const patchSchema = z.object({
  externalId: z.string().max(200).optional(),
  userName: z.string().email().max(320).optional(),
  displayName: z.string().max(200).optional(),
  active: z.boolean().optional(),
  role: z.enum(["admin", "member", "billing"]).optional(),
  Operations: z.array(z.object({
    op: z.string(),
    path: z.string().optional(),
    value: z.unknown().optional(),
  })).optional(),
})

async function revokeUserSessions(admin: ReturnType<typeof createAdminClient>, userId: string, reason: string) {
  await (admin as any).schema("master_admin").from("user_account_controls").upsert(
    {
      user_id: userId,
      status: "active",
      reason,
      revoked_sessions_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  )
}

async function syncMembership(admin: ReturnType<typeof createAdminClient>, orgId: string, row: any) {
  const userId = row.user_id
  if (!userId) return row

  if (!row.active) {
    await admin.from("organization_members").delete().eq("org_id", orgId).eq("user_id", userId)
    await revokeUserSessions(admin, userId, "SCIM deprovisioned")
    return row
  }

  const { data: existing } = await admin
    .from("organization_members")
    .select("role")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .maybeSingle()

  if (!existing) {
    await admin.from("organization_members").insert({ org_id: orgId, user_id: userId, role: row.role })
  } else if (existing.role !== "owner") {
    await admin.from("organization_members").update({ role: row.role }).eq("org_id", orgId).eq("user_id", userId)
  }

  return row
}

function valuesFromPatch(payload: z.infer<typeof patchSchema>) {
  const out: Record<string, unknown> = {}
  if (payload.userName) out.user_name = payload.userName.trim().toLowerCase()
  if (payload.displayName) out.display_name = payload.displayName
  if (payload.externalId) out.external_id = payload.externalId
  if (payload.active !== undefined) out.active = payload.active
  if (payload.role) out.role = payload.role

  for (const op of payload.Operations ?? []) {
    const path = op.path?.toLowerCase()
    if (path === "active" && typeof op.value === "boolean") out.active = op.value
    if (path === "displayname" && typeof op.value === "string") out.display_name = op.value
    if (path === "username" && typeof op.value === "string") out.user_name = op.value.trim().toLowerCase()
  }
  return out
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string; id: string }> }
) {
  const parsedParams = paramsSchema.safeParse(await params)
  if (!parsedParams.success) return NextResponse.json({ detail: "Invalid SCIM id" }, { status: 400 })

  const tooMany = await scimLimitOr429(req, parsedParams.data.orgId)
  if (tooMany) return tooMany

  const admin = createAdminClient()
  const auth = await validateScimBearer(admin as any, parsedParams.data.orgId, req.headers.get("authorization"))
  if (!auth.ok) return NextResponse.json({ detail: auth.error }, { status: auth.status })

  const { data, error } = await (admin.from("scim_provisioned_users") as any)
    .select("*")
    .eq("org_id", parsedParams.data.orgId)
    .eq("id", parsedParams.data.id)
    .maybeSingle()

  if (error) return NextResponse.json({ detail: "Failed to load SCIM user" }, { status: 500 })
  if (!data) return NextResponse.json({ detail: "SCIM user not found" }, { status: 404 })
  return NextResponse.json(scimUserResponse(data))
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string; id: string }> }
) {
  const parsedParams = paramsSchema.safeParse(await params)
  if (!parsedParams.success) return NextResponse.json({ detail: "Invalid SCIM id" }, { status: 400 })

  const tooMany = await scimLimitOr429(req, parsedParams.data.orgId)
  if (tooMany) return tooMany

  const admin = createAdminClient()
  const auth = await validateScimBearer(admin as any, parsedParams.data.orgId, req.headers.get("authorization"))
  if (!auth.ok) return NextResponse.json({ detail: auth.error }, { status: auth.status })

  const parsed = patchSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ detail: "Invalid SCIM patch payload" }, { status: 400 })

  const changes = valuesFromPatch(parsed.data)
  if (Object.keys(changes).length === 0) {
    return NextResponse.json({ detail: "No supported SCIM changes" }, { status: 400 })
  }

  const { data, error } = await (admin.from("scim_provisioned_users") as any)
    .update({ ...changes, raw_payload: parsed.data, updated_at: new Date().toISOString() })
    .eq("org_id", parsedParams.data.orgId)
    .eq("id", parsedParams.data.id)
    .select("*")
    .maybeSingle()

  if (error) return NextResponse.json({ detail: "Failed to update SCIM user" }, { status: 500 })
  if (!data) return NextResponse.json({ detail: "SCIM user not found" }, { status: 404 })

  const synced = await syncMembership(admin, parsedParams.data.orgId, data)
  return NextResponse.json(scimUserResponse(synced))
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string; id: string }> }
) {
  const parsedParams = paramsSchema.safeParse(await params)
  if (!parsedParams.success) return NextResponse.json({ detail: "Invalid SCIM id" }, { status: 400 })

  const tooMany = await scimLimitOr429(req, parsedParams.data.orgId)
  if (tooMany) return tooMany

  const admin = createAdminClient()
  const auth = await validateScimBearer(admin as any, parsedParams.data.orgId, req.headers.get("authorization"))
  if (!auth.ok) return NextResponse.json({ detail: auth.error }, { status: auth.status })

  const { data, error } = await (admin.from("scim_provisioned_users") as any)
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq("org_id", parsedParams.data.orgId)
    .eq("id", parsedParams.data.id)
    .select("*")
    .maybeSingle()

  if (error) return NextResponse.json({ detail: "Failed to deprovision SCIM user" }, { status: 500 })
  if (!data) return NextResponse.json({ detail: "SCIM user not found" }, { status: 404 })

  await syncMembership(admin, parsedParams.data.orgId, data)
  return new NextResponse(null, { status: 204 })
}

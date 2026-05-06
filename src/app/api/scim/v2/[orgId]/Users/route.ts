import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createAdminClient } from "@/infrastructure/db/supabase/admin"
import { scimUserResponse, validateScimBearer } from "@/modules/iam/application/scim"

export const dynamic = "force-dynamic"

const paramsSchema = z.object({ orgId: z.string().uuid() })
const scimUserSchema = z.object({
  externalId: z.string().max(200).optional(),
  userName: z.string().email().max(320),
  displayName: z.string().max(200).optional(),
  active: z.boolean().default(true),
  role: z.enum(["admin", "member", "billing"]).default("member"),
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
  const { data: profile } = await admin
    .from("profiles")
    .select("id")
    .eq("email", row.user_name)
    .maybeSingle()

  if (!profile?.id) return row

  if (!row.active) {
    await admin.from("organization_members").delete().eq("org_id", orgId).eq("user_id", profile.id)
    await revokeUserSessions(admin, profile.id, "SCIM deprovisioned")
  } else {
    const { data: existing } = await admin
      .from("organization_members")
      .select("role")
      .eq("org_id", orgId)
      .eq("user_id", profile.id)
      .maybeSingle()

    if (existing?.role === "owner") {
      // SCIM intentionally cannot demote owners.
    } else if (existing) {
      await admin.from("organization_members").update({ role: row.role }).eq("org_id", orgId).eq("user_id", profile.id)
    } else {
      await admin.from("organization_members").insert({ org_id: orgId, user_id: profile.id, role: row.role })
    }
  }

  const { data: updated } = await (admin.from("scim_provisioned_users") as any)
    .update({ user_id: profile.id })
    .eq("id", row.id)
    .select("*")
    .single()
  return updated ?? row
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const parsedParams = paramsSchema.safeParse(await params)
  if (!parsedParams.success) {
    return NextResponse.json({ detail: "Invalid organization id" }, { status: 400 })
  }

  const admin = createAdminClient()
  const auth = await validateScimBearer(admin as any, parsedParams.data.orgId, req.headers.get("authorization"))
  if (!auth.ok) {
    return NextResponse.json({ detail: auth.error }, { status: auth.status })
  }

  const url = new URL(req.url)
  const filter = url.searchParams.get("filter")
  const userNameMatch = filter ? /^userName\s+eq\s+"([^"]+)"$/i.exec(filter) : null

  let query = (admin.from("scim_provisioned_users") as any)
    .select("*")
    .eq("org_id", parsedParams.data.orgId)
    .order("created_at", { ascending: true })
    .limit(Math.min(Number(url.searchParams.get("count") ?? 100), 200))

  if (userNameMatch?.[1]) {
    query = query.eq("user_name", userNameMatch[1].trim().toLowerCase())
  }

  const { data, error } = await query
  if (error) {
    return NextResponse.json({ detail: "Failed to list SCIM users" }, { status: 500 })
  }

  const resources = (data ?? []).map(scimUserResponse)
  return NextResponse.json({
    schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
    totalResults: resources.length,
    Resources: resources,
    startIndex: 1,
    itemsPerPage: resources.length,
  })
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const parsedParams = paramsSchema.safeParse(await params)
  if (!parsedParams.success) {
    return NextResponse.json({ detail: "Invalid organization id" }, { status: 400 })
  }

  const admin = createAdminClient()
  const auth = await validateScimBearer(admin as any, parsedParams.data.orgId, req.headers.get("authorization"))
  if (!auth.ok) {
    return NextResponse.json({ detail: auth.error }, { status: auth.status })
  }

  const parsed = scimUserSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ detail: "Invalid SCIM user payload" }, { status: 400 })
  }

  const now = new Date().toISOString()
  const { data, error } = await (admin.from("scim_provisioned_users") as any)
    .upsert(
      {
        org_id: parsedParams.data.orgId,
        external_id: parsed.data.externalId ?? parsed.data.userName,
        user_name: parsed.data.userName.trim().toLowerCase(),
        display_name: parsed.data.displayName ?? parsed.data.userName,
        role: parsed.data.role,
        active: parsed.data.active,
        raw_payload: parsed.data,
        updated_at: now,
      },
      { onConflict: "org_id,user_name" }
    )
    .select("*")
    .single()

  if (error || !data) {
    return NextResponse.json({ detail: "Failed to create SCIM user" }, { status: 500 })
  }

  const synced = await syncMembership(admin, parsedParams.data.orgId, data)
  return NextResponse.json(scimUserResponse(synced), { status: 201 })
}

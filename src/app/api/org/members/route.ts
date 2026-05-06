import { NextRequest, NextResponse } from "next/server"
import type { SupabaseClient } from "@supabase/supabase-js"
import { z } from "zod"
import { isAllowedRequestOrigin } from "@/modules/auth/security/request-origin"
import { guardOrgApi, IAM_JSON_HEADERS } from "@/modules/iam/application/api-guard"
import { logIamAudit } from "@/modules/iam/application/audit"
import { getApiRatelimit, orgKey } from "@/core/security/rate-limit"
import type { Database, OrganizationMember } from "@/infrastructure/db/types/database"

export const dynamic = "force-dynamic"

type OrgRole = OrganizationMember["role"]

async function getMemberSafetySnapshot(
  supabase: SupabaseClient<Database>,
  orgId: string,
  targetUserId: string
): Promise<
  | {
      ok: true
      targetRole: OrgRole
      ownerCount: number
    }
  | {
      ok: false
      response: NextResponse
    }
> {
  const { data, error } = await supabase
    .from("organization_members")
    .select("user_id, role")
    .eq("org_id", orgId)

  if (error) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Failed to validate member safety" },
        { status: 500, headers: IAM_JSON_HEADERS }
      ),
    }
  }

  const members = data ?? []
  const target = members.find((member) => member.user_id === targetUserId)
  if (!target) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Member not found" },
        { status: 404, headers: IAM_JSON_HEADERS }
      ),
    }
  }

  return {
    ok: true,
    targetRole: target.role as OrgRole,
    ownerCount: members.filter((member) => member.role === "owner").length,
  }
}

export async function GET(req: NextRequest) {
  const gate = await guardOrgApi(req, "org:member:read")
  if (!gate.ok) return gate.response

  const { supabase, orgId } = gate
  const { data, error } = await supabase
    .from("organization_members")
    .select("user_id, role, created_at, profile:profiles(email, full_name)")
    .eq("org_id", orgId)
    .order("created_at", { ascending: true })

  if (error) {
    return NextResponse.json({ error: "Failed to load members" }, { status: 500, headers: IAM_JSON_HEADERS })
  }

  return NextResponse.json({ ok: true, orgId, members: data ?? [] }, { headers: IAM_JSON_HEADERS })
}

const patchSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(["owner", "admin", "member", "billing"]),
})

export async function PATCH(req: NextRequest) {
  if (!isAllowedRequestOrigin((name) => req.headers.get(name))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: IAM_JSON_HEADERS })
  }
  const gate = await guardOrgApi(req, "org:member:manage")
  if (!gate.ok) return gate.response

  const rl = await getApiRatelimit().limit(orgKey(gate.orgId, "org:members:manage"))
  if (!rl.success) {
    return NextResponse.json({ error: "Too many requests. Please slow down." }, { status: 429, headers: IAM_JSON_HEADERS })
  }

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400, headers: IAM_JSON_HEADERS })
  }
  const parsed = patchSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400, headers: IAM_JSON_HEADERS })
  }

  const { supabase, userId: actorUserId, orgId } = gate
  const safety = await getMemberSafetySnapshot(supabase, orgId, parsed.data.userId)
  if (!safety.ok) return safety.response

  if (actorUserId === parsed.data.userId && safety.targetRole !== parsed.data.role) {
    void logIamAudit(req, {
      actorUserId,
      orgId,
      action: "org.member.role_update_blocked",
      targetType: "user",
      targetId: parsed.data.userId,
      metadata: { reason: "self_role_change", requestedRole: parsed.data.role },
    }).catch(() => {})

    return NextResponse.json(
      { error: "You cannot change your own role" },
      { status: 403, headers: IAM_JSON_HEADERS }
    )
  }

  if (
    safety.targetRole === "owner" &&
    parsed.data.role !== "owner" &&
    safety.ownerCount <= 1
  ) {
    void logIamAudit(req, {
      actorUserId,
      orgId,
      action: "org.member.role_update_blocked",
      targetType: "user",
      targetId: parsed.data.userId,
      metadata: { reason: "last_owner", requestedRole: parsed.data.role },
    }).catch(() => {})

    return NextResponse.json(
      { error: "An organization must have at least one owner" },
      { status: 403, headers: IAM_JSON_HEADERS }
    )
  }

  const { error } = await supabase
    .from("organization_members")
    .update({ role: parsed.data.role })
    .eq("org_id", orgId)
    .eq("user_id", parsed.data.userId)

  if (error) {
    return NextResponse.json({ error: "Failed to update member" }, { status: 500, headers: IAM_JSON_HEADERS })
  }

  void logIamAudit(req, {
    actorUserId,
    orgId,
    action: "org.member.role_updated",
    targetType: "user",
    targetId: parsed.data.userId,
    metadata: { role: parsed.data.role },
  }).catch(() => {})

  return NextResponse.json({ ok: true }, { headers: IAM_JSON_HEADERS })
}

const deleteSchema = z.object({
  userId: z.string().uuid(),
})

export async function DELETE(req: NextRequest) {
  if (!isAllowedRequestOrigin((name) => req.headers.get(name))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: IAM_JSON_HEADERS })
  }
  const gate = await guardOrgApi(req, "org:member:manage")
  if (!gate.ok) return gate.response

  const rl = await getApiRatelimit().limit(orgKey(gate.orgId, "org:members:manage"))
  if (!rl.success) {
    return NextResponse.json({ error: "Too many requests. Please slow down." }, { status: 429, headers: IAM_JSON_HEADERS })
  }

  const url = new URL(req.url)
  const parsed = deleteSchema.safeParse({ userId: url.searchParams.get("userId") })
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400, headers: IAM_JSON_HEADERS })
  }

  const { supabase, userId: actorUserId, orgId } = gate
  const safety = await getMemberSafetySnapshot(supabase, orgId, parsed.data.userId)
  if (!safety.ok) return safety.response

  if (actorUserId === parsed.data.userId) {
    void logIamAudit(req, {
      actorUserId,
      orgId,
      action: "org.member.remove_blocked",
      targetType: "user",
      targetId: parsed.data.userId,
      metadata: { reason: "self_removal" },
    }).catch(() => {})

    return NextResponse.json(
      { error: "You cannot remove yourself from the organization" },
      { status: 403, headers: IAM_JSON_HEADERS }
    )
  }

  if (safety.targetRole === "owner" && safety.ownerCount <= 1) {
    void logIamAudit(req, {
      actorUserId,
      orgId,
      action: "org.member.remove_blocked",
      targetType: "user",
      targetId: parsed.data.userId,
      metadata: { reason: "last_owner" },
    }).catch(() => {})

    return NextResponse.json(
      { error: "An organization must have at least one owner" },
      { status: 403, headers: IAM_JSON_HEADERS }
    )
  }

  const { error } = await supabase
    .from("organization_members")
    .delete()
    .eq("org_id", orgId)
    .eq("user_id", parsed.data.userId)

  if (error) {
    return NextResponse.json({ error: "Failed to remove member" }, { status: 500, headers: IAM_JSON_HEADERS })
  }

  void logIamAudit(req, {
    actorUserId,
    orgId,
    action: "org.member.removed",
    targetType: "user",
    targetId: parsed.data.userId,
  }).catch(() => {})

  return NextResponse.json({ ok: true }, { headers: IAM_JSON_HEADERS })
}

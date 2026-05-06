import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { isAllowedRequestOrigin } from "@/modules/auth/security/request-origin"
import { guardOrgApi, IAM_JSON_HEADERS } from "@/modules/iam/application/api-guard"
import { logIamAudit } from "@/modules/iam/application/audit"
import {
  generateInviteToken,
  hashInviteToken,
  inviteAcceptUrl,
  inviteExpiryFromNow,
} from "@/modules/iam/application/invites"
import { sendOrgInviteEmail } from "@/infrastructure/email/email-service"

export const dynamic = "force-dynamic"

const paramsSchema = z.object({ id: z.string().uuid() })
const patchSchema = z.object({
  action: z.enum(["resend"]),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isAllowedRequestOrigin((name) => req.headers.get(name))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: IAM_JSON_HEADERS })
  }
  const gate = await guardOrgApi(req, "org:member:invite")
  if (!gate.ok) return gate.response

  const parsedParams = paramsSchema.safeParse(await params)
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid invite id" }, { status: 400, headers: IAM_JSON_HEADERS })
  }
  const body = patchSchema.safeParse(await req.json().catch(() => null))
  if (!body.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400, headers: IAM_JSON_HEADERS })
  }

  const { data: existing } = await (gate.supabase.from("organization_invites") as any)
    .select("id, email, role, accepted_at, revoked_at, resend_count")
    .eq("org_id", gate.orgId)
    .eq("id", parsedParams.data.id)
    .maybeSingle()

  if (!existing) {
    return NextResponse.json({ error: "Invite not found" }, { status: 404, headers: IAM_JSON_HEADERS })
  }
  if (existing.accepted_at || existing.revoked_at) {
    return NextResponse.json({ error: "Invite is no longer active" }, { status: 409, headers: IAM_JSON_HEADERS })
  }

  const token = generateInviteToken()
  const expiresAt = inviteExpiryFromNow()
  const { data: invite, error } = await (gate.supabase.from("organization_invites") as any)
    .update({
      token_hash: hashInviteToken(token),
      expires_at: expiresAt,
      resend_count: (existing.resend_count ?? 0) + 1,
      last_sent_at: new Date().toISOString(),
    })
    .eq("org_id", gate.orgId)
    .eq("id", existing.id)
    .select("id, email, role, expires_at, resend_count, last_sent_at")
    .single()

  if (error || !invite) {
    return NextResponse.json({ error: "Failed to resend invite" }, { status: 500, headers: IAM_JSON_HEADERS })
  }

  const { data: org } = await gate.supabase.from("organizations").select("name").eq("id", gate.orgId).maybeSingle()
  void sendOrgInviteEmail({
    email: invite.email,
    orgName: org?.name ?? "your organization",
    inviterEmail: gate.userEmail,
    acceptUrl: inviteAcceptUrl(token),
    role: invite.role,
    expiresAt,
  }).catch(() => {})

  void logIamAudit(req, {
    actorUserId: gate.userId,
    orgId: gate.orgId,
    action: "org.invite.resent",
    targetType: "invite",
    targetId: invite.id,
    metadata: { email: invite.email },
  }).catch(() => {})

  return NextResponse.json({ ok: true, invite, acceptUrl: process.env.NODE_ENV === "production" ? undefined : inviteAcceptUrl(token) }, { headers: IAM_JSON_HEADERS })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isAllowedRequestOrigin((name) => req.headers.get(name))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: IAM_JSON_HEADERS })
  }
  const gate = await guardOrgApi(req, "org:member:invite")
  if (!gate.ok) return gate.response

  const parsedParams = paramsSchema.safeParse(await params)
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid invite id" }, { status: 400, headers: IAM_JSON_HEADERS })
  }

  const { data: invite, error } = await (gate.supabase.from("organization_invites") as any)
    .update({
      revoked_at: new Date().toISOString(),
      revoked_by: gate.userId,
    })
    .eq("org_id", gate.orgId)
    .eq("id", parsedParams.data.id)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .select("id, email")
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: "Failed to revoke invite" }, { status: 500, headers: IAM_JSON_HEADERS })
  }
  if (!invite) {
    return NextResponse.json({ error: "Invite not found or already closed" }, { status: 404, headers: IAM_JSON_HEADERS })
  }

  void logIamAudit(req, {
    actorUserId: gate.userId,
    orgId: gate.orgId,
    action: "org.invite.revoked",
    targetType: "invite",
    targetId: invite.id,
    metadata: { email: invite.email },
  }).catch(() => {})

  return NextResponse.json({ ok: true }, { headers: IAM_JSON_HEADERS })
}

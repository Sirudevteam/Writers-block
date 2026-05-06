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
  normalizeInviteEmail,
} from "@/modules/iam/application/invites"
import { getApiRatelimit, orgKey } from "@/core/security/rate-limit"
import { sendOrgInviteEmail } from "@/infrastructure/email/email-service"

export const dynamic = "force-dynamic"

const inviteCreateSchema = z.object({
  email: z.string().email().max(320),
  role: z.enum(["admin", "member", "billing"]).default("member"),
})

export async function GET(req: NextRequest) {
  const gate = await guardOrgApi(req, "org:member:read")
  if (!gate.ok) return gate.response

  const { data, error } = await (gate.supabase.from("organization_invites") as any)
    .select("id, org_id, email, role, invited_by, created_at, expires_at, accepted_at, accepted_by, revoked_at, revoked_by, resend_count, last_sent_at")
    .eq("org_id", gate.orgId)
    .order("created_at", { ascending: false })
    .limit(100)

  if (error) {
    return NextResponse.json({ error: "Failed to load invitations" }, { status: 500, headers: IAM_JSON_HEADERS })
  }

  return NextResponse.json({ ok: true, orgId: gate.orgId, invites: data ?? [] }, { headers: IAM_JSON_HEADERS })
}

export async function POST(req: NextRequest) {
  if (!isAllowedRequestOrigin((name) => req.headers.get(name))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: IAM_JSON_HEADERS })
  }
  const gate = await guardOrgApi(req, "org:member:invite")
  if (!gate.ok) return gate.response

  const rl = await getApiRatelimit().limit(orgKey(gate.orgId, "org:invites:create"))
  if (!rl.success) {
    return NextResponse.json({ error: "Too many invite attempts. Please slow down." }, { status: 429, headers: IAM_JSON_HEADERS })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400, headers: IAM_JSON_HEADERS })
  }
  const parsed = inviteCreateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid invite input" }, { status: 400, headers: IAM_JSON_HEADERS })
  }

  const email = normalizeInviteEmail(parsed.data.email)
  const token = generateInviteToken()
  const expiresAt = inviteExpiryFromNow()

  const { data: org } = await gate.supabase
    .from("organizations")
    .select("name")
    .eq("id", gate.orgId)
    .maybeSingle()

  const { data: invitedProfile } = await gate.supabase
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle()

  const { data: existingMember } = invitedProfile
    ? await gate.supabase
        .from("organization_members")
        .select("user_id")
        .eq("org_id", gate.orgId)
        .eq("user_id", invitedProfile.id)
        .maybeSingle()
    : { data: null }

  if (existingMember) {
    return NextResponse.json({ error: "This user is already a member" }, { status: 409, headers: IAM_JSON_HEADERS })
  }

  const { data: existingInvite } = await (gate.supabase.from("organization_invites") as any)
    .select("id")
    .eq("org_id", gate.orgId)
    .eq("email", email)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle()

  if (existingInvite) {
    return NextResponse.json({ error: "An active invite already exists for this email" }, { status: 409, headers: IAM_JSON_HEADERS })
  }

  const { data: invite, error } = await (gate.supabase.from("organization_invites") as any)
    .insert({
      org_id: gate.orgId,
      email,
      role: parsed.data.role,
      token_hash: hashInviteToken(token),
      invited_by: gate.userId,
      expires_at: expiresAt,
      last_sent_at: new Date().toISOString(),
    })
    .select("id, org_id, email, role, created_at, expires_at, accepted_at, revoked_at, resend_count, last_sent_at")
    .single()

  if (error || !invite) {
    return NextResponse.json({ error: "Failed to create invitation" }, { status: 500, headers: IAM_JSON_HEADERS })
  }

  void sendOrgInviteEmail({
    email,
    orgName: org?.name ?? "your organization",
    inviterEmail: gate.userEmail,
    acceptUrl: inviteAcceptUrl(token),
    role: parsed.data.role,
    expiresAt,
  }).catch(() => {})

  void logIamAudit(req, {
    actorUserId: gate.userId,
    orgId: gate.orgId,
    action: "org.invite.created",
    targetType: "invite",
    targetId: invite.id,
    metadata: { email, role: parsed.data.role },
  }).catch(() => {})

  return NextResponse.json({ ok: true, invite, acceptUrl: process.env.NODE_ENV === "production" ? undefined : inviteAcceptUrl(token) }, { status: 201, headers: IAM_JSON_HEADERS })
}

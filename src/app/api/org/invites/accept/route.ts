import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/infrastructure/db/supabase/server"
import { createAdminClient } from "@/infrastructure/db/supabase/admin"
import { IAM_JSON_HEADERS } from "@/modules/iam/application/api-guard"
import { logIamAudit } from "@/modules/iam/application/audit"
import { hashInviteToken, normalizeInviteEmail } from "@/modules/iam/application/invites"

export const dynamic = "force-dynamic"

const acceptSchema = z.object({
  token: z.string().min(32).max(512),
})

export async function POST(req: NextRequest) {
  const auth = await createClient()
  const {
    data: { user },
  } = await auth.auth.getUser()

  if (!user?.id || !user.email) {
    return NextResponse.json({ error: "Sign in with the invited email to accept this invite" }, { status: 401, headers: IAM_JSON_HEADERS })
  }

  const body = acceptSchema.safeParse(await req.json().catch(() => null))
  if (!body.success) {
    return NextResponse.json({ error: "Invalid invite token" }, { status: 400, headers: IAM_JSON_HEADERS })
  }

  const supabase = createAdminClient()
  const { data: invite, error } = await (supabase.from("organization_invites") as any)
    .select("id, org_id, email, role, expires_at, accepted_at, revoked_at")
    .eq("token_hash", hashInviteToken(body.data.token))
    .is("accepted_at", null)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: "Invite lookup failed" }, { status: 500, headers: IAM_JSON_HEADERS })
  }
  if (!invite) {
    return NextResponse.json({ error: "Invite is invalid, expired, or revoked" }, { status: 404, headers: IAM_JSON_HEADERS })
  }
  if (normalizeInviteEmail(user.email) !== normalizeInviteEmail(invite.email)) {
    return NextResponse.json({ error: "This invite belongs to a different email address" }, { status: 403, headers: IAM_JSON_HEADERS })
  }

  const { data: existingMember } = await supabase
    .from("organization_members")
    .select("role")
    .eq("org_id", invite.org_id)
    .eq("user_id", user.id)
    .maybeSingle()

  if (!existingMember) {
    const { error: memberError } = await supabase.from("organization_members").insert({
      org_id: invite.org_id,
      user_id: user.id,
      role: invite.role,
    })
    if (memberError) {
      return NextResponse.json({ error: "Failed to add organization membership" }, { status: 500, headers: IAM_JSON_HEADERS })
    }
  }

  await (supabase.from("organization_invites") as any)
    .update({
      accepted_at: new Date().toISOString(),
      accepted_by: user.id,
    })
    .eq("id", invite.id)

  void logIamAudit(req, {
    actorUserId: user.id,
    orgId: invite.org_id,
    action: "org.invite.accepted",
    targetType: "invite",
    targetId: invite.id,
    metadata: { email: invite.email, role: invite.role },
  }).catch(() => {})

  return NextResponse.json({ ok: true, orgId: invite.org_id, role: existingMember?.role ?? invite.role }, { headers: IAM_JSON_HEADERS })
}

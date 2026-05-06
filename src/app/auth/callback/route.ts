import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/infrastructure/db/supabase/server"
import { createAdminClient } from "@/infrastructure/db/supabase/admin"
import { getSafeNextPath } from "@/modules/auth/domain/next-path"
import { logIamAudit } from "@/modules/iam/application/audit"
import { normalizeInviteEmail } from "@/modules/iam/application/invites"

export const dynamic = "force-dynamic"

function emailDomain(email: string | null | undefined): string | null {
  const at = email?.lastIndexOf("@") ?? -1
  return at > 0 ? email!.slice(at + 1).trim().toLowerCase() : null
}

async function enforceSsoOrgJoin(req: NextRequest, userId: string, email: string | null): Promise<string | null> {
  const domain = emailDomain(email)
  if (!email || !domain) return null

  const admin = createAdminClient()
  const normalizedEmail = normalizeInviteEmail(email)

  const { data: invite } = await (admin.from("organization_invites") as any)
    .select("id, org_id, email, role")
    .eq("email", normalizedEmail)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle()

  if (invite) {
    const { data: existingMember } = await admin
      .from("organization_members")
      .select("org_id")
      .eq("org_id", invite.org_id)
      .eq("user_id", userId)
      .maybeSingle()

    if (!existingMember) {
      await admin.from("organization_members").insert({
        org_id: invite.org_id,
        user_id: userId,
        role: invite.role,
      })
    }
    await (admin.from("organization_invites") as any)
      .update({ accepted_at: new Date().toISOString(), accepted_by: userId })
      .eq("id", invite.id)

    void logIamAudit(req, {
      actorUserId: userId,
      orgId: invite.org_id,
      action: "org.sso_join.invite_accepted",
      targetType: "invite",
      targetId: invite.id,
      metadata: { email: normalizedEmail },
    }).catch(() => {})
    return invite.org_id
  }

  const { data: policies } = await (admin.from("organization_security_policies") as any)
    .select("org_id, sso_domains, verified_domains, sso_join_policy")

  const policy = (policies ?? []).find((row: any) => {
    const domains = new Set([...(row.sso_domains ?? []), ...(row.verified_domains ?? [])])
    return domains.has(domain)
  })
  if (!policy || policy.sso_join_policy !== "invite_or_domain") {
    return null
  }

  const { data: existingMember } = await admin
    .from("organization_members")
    .select("org_id")
    .eq("org_id", policy.org_id)
    .eq("user_id", userId)
    .maybeSingle()

  if (!existingMember) {
    await admin.from("organization_members").insert({
      org_id: policy.org_id,
      user_id: userId,
      role: "member",
    })
    void logIamAudit(req, {
      actorUserId: userId,
      orgId: policy.org_id,
      action: "org.sso_join.domain_member_created",
      targetType: "user",
      targetId: userId,
      metadata: { domain },
    }).catch(() => {})
  }

  return policy.org_id
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const code = url.searchParams.get("code")
  const next = getSafeNextPath(url.searchParams.get("next"))
  const redirectUrl = new URL(next, req.url)

  if (!code) {
    redirectUrl.pathname = "/signin"
    redirectUrl.searchParams.set("error", "missing_code")
    return NextResponse.redirect(redirectUrl)
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    const failed = new URL("/signin", req.url)
    failed.searchParams.set("error", "sso_callback_failed")
    return NextResponse.redirect(failed)
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const response = NextResponse.redirect(redirectUrl)
  if (user?.id) {
    const orgId = await enforceSsoOrgJoin(req, user.id, user.email ?? null).catch(() => null)
    if (orgId) {
      response.cookies.set("wb_active_org", orgId, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
      })
    }
  }

  return response
}

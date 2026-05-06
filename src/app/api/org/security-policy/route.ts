import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { isAllowedRequestOrigin } from "@/modules/auth/security/request-origin"
import { guardOrgApi, IAM_JSON_HEADERS } from "@/modules/iam/application/api-guard"
import { logIamAudit } from "@/modules/iam/application/audit"
import { generateScimToken, hashScimToken } from "@/modules/iam/application/scim"

export const dynamic = "force-dynamic"

const domainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9.-]+\.[a-z]{2,}$/)
  .max(253)

const patchSchema = z.object({
  allowedDomains: z.array(domainSchema).max(25).optional(),
  verifiedDomains: z.array(domainSchema).max(25).optional(),
  requireMfa: z.boolean().optional(),
  requireSso: z.boolean().optional(),
  disablePasswordLogin: z.boolean().optional(),
  sessionDurationMinutes: z.number().int().min(15).max(43200).optional(),
  ssoProviderId: z.string().trim().max(200).nullable().optional(),
  ssoDomains: z.array(domainSchema).max(25).optional(),
  ssoJoinPolicy: z.enum(["invite_or_domain", "invite_only"]).optional(),
  scimEnabled: z.boolean().optional(),
  rotateScimToken: z.boolean().optional(),
})

const defaultPolicy = {
  allowed_domains: [],
  verified_domains: [],
  require_mfa: false,
  require_sso: false,
  disable_password_login: false,
  session_duration_minutes: 43200,
  sso_provider_id: null,
  sso_domains: [],
  sso_join_policy: "invite_or_domain",
  scim_enabled: false,
  scim_token_last_rotated_at: null,
}

export async function GET(req: NextRequest) {
  const gate = await guardOrgApi(req, "org:security:read")
  if (!gate.ok) return gate.response

  const { data, error } = await (gate.supabase.from("organization_security_policies") as any)
    .select("org_id, allowed_domains, verified_domains, require_mfa, require_sso, disable_password_login, session_duration_minutes, sso_provider_id, sso_domains, sso_join_policy, scim_enabled, scim_token_last_rotated_at, created_at, updated_at")
    .eq("org_id", gate.orgId)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: "Failed to load security policy" }, { status: 500, headers: IAM_JSON_HEADERS })
  }

  return NextResponse.json({ ok: true, orgId: gate.orgId, policy: data ?? { org_id: gate.orgId, ...defaultPolicy } }, { headers: IAM_JSON_HEADERS })
}

export async function PATCH(req: NextRequest) {
  if (!isAllowedRequestOrigin((name) => req.headers.get(name))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: IAM_JSON_HEADERS })
  }
  const gate = await guardOrgApi(req, "org:security:manage")
  if (!gate.ok) return gate.response

  const parsed = patchSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid security policy input" }, { status: 400, headers: IAM_JSON_HEADERS })
  }

  const row: Record<string, unknown> = {
    org_id: gate.orgId,
    updated_at: new Date().toISOString(),
  }
  if (parsed.data.allowedDomains !== undefined) row.allowed_domains = Array.from(new Set(parsed.data.allowedDomains))
  if (parsed.data.verifiedDomains !== undefined) row.verified_domains = Array.from(new Set(parsed.data.verifiedDomains))
  if (parsed.data.requireMfa !== undefined) row.require_mfa = parsed.data.requireMfa
  if (parsed.data.requireSso !== undefined) row.require_sso = parsed.data.requireSso
  if (parsed.data.disablePasswordLogin !== undefined) row.disable_password_login = parsed.data.disablePasswordLogin
  if (parsed.data.sessionDurationMinutes !== undefined) row.session_duration_minutes = parsed.data.sessionDurationMinutes
  if (parsed.data.ssoProviderId !== undefined) row.sso_provider_id = parsed.data.ssoProviderId || null
  if (parsed.data.ssoDomains !== undefined) row.sso_domains = Array.from(new Set(parsed.data.ssoDomains))
  if (parsed.data.ssoJoinPolicy !== undefined) row.sso_join_policy = parsed.data.ssoJoinPolicy
  if (parsed.data.scimEnabled !== undefined) row.scim_enabled = parsed.data.scimEnabled

  let scimToken: string | undefined
  if (parsed.data.rotateScimToken) {
    scimToken = generateScimToken()
    row.scim_token_hash = hashScimToken(scimToken)
    row.scim_enabled = true
    row.scim_token_last_rotated_at = new Date().toISOString()
  }

  const { data, error } = await (gate.supabase.from("organization_security_policies") as any)
    .upsert(row, { onConflict: "org_id" })
    .select("org_id, allowed_domains, verified_domains, require_mfa, require_sso, disable_password_login, session_duration_minutes, sso_provider_id, sso_domains, sso_join_policy, scim_enabled, scim_token_last_rotated_at, created_at, updated_at")
    .single()

  if (error || !data) {
    return NextResponse.json({ error: "Failed to update security policy" }, { status: 500, headers: IAM_JSON_HEADERS })
  }

  void logIamAudit(req, {
    actorUserId: gate.userId,
    orgId: gate.orgId,
    action: parsed.data.rotateScimToken ? "org.security_policy.updated_scim_rotated" : "org.security_policy.updated",
    targetType: "organization_security_policy",
    targetId: gate.orgId,
    metadata: {
      changed: Object.keys(row).filter((key) => key !== "org_id" && key !== "updated_at" && key !== "scim_token_hash"),
    },
  }).catch(() => {})

  return NextResponse.json({ ok: true, policy: data, scimToken }, { headers: IAM_JSON_HEADERS })
}

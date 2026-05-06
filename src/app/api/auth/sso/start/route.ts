import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/infrastructure/db/supabase/server"
import { createAdminClient } from "@/infrastructure/db/supabase/admin"
import { isAllowedRequestOrigin } from "@/modules/auth/security/request-origin"
import { getSafeNextPath } from "@/modules/auth/domain/next-path"

export const dynamic = "force-dynamic"

const startSchema = z.object({
  email: z.string().email().optional(),
  domain: z.string().trim().toLowerCase().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/).optional(),
  next: z.string().optional(),
}).refine((value) => value.email || value.domain, {
  message: "email or domain is required",
})

function emailDomain(email: string | undefined): string | null {
  const at = email?.lastIndexOf("@") ?? -1
  return at > 0 ? email!.slice(at + 1).trim().toLowerCase() : null
}

export async function POST(req: NextRequest) {
  if (!isAllowedRequestOrigin((name) => req.headers.get(name))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const parsed = startSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid SSO start request" }, { status: 400 })
  }

  const domain = parsed.data.domain ?? emailDomain(parsed.data.email)
  if (!domain) {
    return NextResponse.json({ error: "Domain is required" }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: policies, error } = await (admin.from("organization_security_policies") as any)
    .select("org_id, require_sso, sso_provider_id, sso_domains, verified_domains")

  if (error) {
    return NextResponse.json({ error: "SSO policy lookup failed" }, { status: 500 })
  }

  const policy = (policies ?? []).find((row: any) => {
    const domains = new Set([...(row.sso_domains ?? []), ...(row.verified_domains ?? [])])
    return domains.has(domain)
  })
  if (!policy) {
    return NextResponse.json({ error: "SSO is not configured for this domain" }, { status: 404 })
  }

  const supabase = await createClient()
  const next = getSafeNextPath(parsed.data.next)
  const callback = new URL("/auth/callback", req.url)
  callback.searchParams.set("next", next)

  const ssoParams: Record<string, unknown> = {
    options: { redirectTo: callback.toString() },
  }
  if (policy.sso_provider_id) {
    ssoParams.providerId = policy.sso_provider_id
  } else {
    ssoParams.domain = domain
  }

  const { data, error: ssoError } = await (supabase.auth as any).signInWithSSO(ssoParams)
  if (ssoError || !data?.url) {
    return NextResponse.json({ error: "Failed to start SSO" }, { status: 500 })
  }

  return NextResponse.json({ ok: true, url: data.url })
}

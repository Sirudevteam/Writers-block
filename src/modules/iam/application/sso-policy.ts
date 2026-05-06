import type { SupabaseClient } from "@supabase/supabase-js"

function domainFromEmail(email: string): string | null {
  const at = email.lastIndexOf("@")
  return at > 0 ? email.slice(at + 1).trim().toLowerCase() : null
}

export async function isPasswordAuthDisabledForEmail(
  supabase: SupabaseClient<any>,
  email: string
): Promise<boolean> {
  const domain = domainFromEmail(email)
  if (!domain) return false

  const { data, error } = await supabase
    .from("organization_security_policies")
    .select("require_sso, disable_password_login, sso_domains, verified_domains")

  if (error) return false
  return (data ?? []).some((policy: any) => {
    if (!policy.require_sso && !policy.disable_password_login) return false
    const domains = new Set([...(policy.sso_domains ?? []), ...(policy.verified_domains ?? [])])
    return domains.has(domain)
  })
}

/**
 * Read Supabase Auth JWT `aal` claim (Authenticator Assurance Level).
 * `aal2` indicates MFA was satisfied for this session.
 * Safe for Edge (uses atob only).
 */
export function parseJwtAal(
  accessToken: string | undefined | null
): "aal1" | "aal2" | null {
  if (!accessToken || typeof accessToken !== "string" || !accessToken.includes(".")) {
    return null
  }
  try {
    const parts = accessToken.split(".")
    const payload = parts[1]
    if (!payload) return null
    const b64 = payload.replace(/-/g, "+").replace(/_/g, "/")
    const pad = (4 - (b64.length % 4)) % 4
    const padded = b64 + "=".repeat(pad)
    const json = JSON.parse(atob(padded)) as { aal?: string }
    if (json.aal === "aal2" || json.aal === "aal1") return json.aal
    return null
  } catch {
    return null
  }
}

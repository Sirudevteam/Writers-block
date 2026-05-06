/**
 * Host allowlist for Master Admin routes (`/master-admin`, `/api/master-admin`).
 * See docs/admin-operators.md for deployment notes.
 * Set `ADMIN_HOSTS` to comma-separated host:port values (e.g. `admin.writersblock.siru.ai,localhost:3000`).
 * If unset or empty, Master Admin routes are denied (fail closed).
 */
function normalizeHost(host: string): string {
  return host.trim().toLowerCase()
}

function parseAdminHosts(): string[] {
  const raw = process.env.ADMIN_HOSTS ?? ""
  return raw
    .split(",")
    .map((h) => normalizeHost(h))
    .filter(Boolean)
}

export function isMasterAdminPath(pathname: string): boolean {
  return pathname.startsWith("/master-admin") || pathname.startsWith("/api/master-admin")
}

/** `hostHeader` should be the raw `Host` request header (may include port). */
export function isRequestHostAllowedForMasterAdmin(hostHeader: string | null): boolean {
  if (!hostHeader) return false
  const host = normalizeHost(hostHeader.split(",")[0].trim())
  const allowed = parseAdminHosts()
  if (allowed.length === 0) return false
  return allowed.includes(host)
}

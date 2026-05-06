export type ApiRoutePolicy = "non-api" | "public" | "machine" | "master-admin" | "protected"

const ACTIVE_AUTH_PAGE_PATHS = new Set([
  "/signin",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/verify-code",
])

function hasPathPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`)
}

export function isActiveAuthPage(pathname: string): boolean {
  return ACTIVE_AUTH_PAGE_PATHS.has(pathname)
}

export function classifyApiRoute(pathname: string): ApiRoutePolicy {
  if (!hasPathPrefix(pathname, "/api")) return "non-api"
  if (hasPathPrefix(pathname, "/api/master-admin")) return "master-admin"
  if (hasPathPrefix(pathname, "/api/auth")) return "public"
  if (pathname === "/api/support/tickets") return "public"
  if (hasPathPrefix(pathname, "/api/scim")) return "machine"
  if (hasPathPrefix(pathname, "/api/test/e2e")) return "machine"
  if (pathname === "/api/razorpay/webhook") return "machine"
  if (hasPathPrefix(pathname, "/api/cron")) return "machine"
  if (hasPathPrefix(pathname, "/api/jobs")) return "machine"
  return "protected"
}

export function isProtectedApiRoute(pathname: string): boolean {
  return classifyApiRoute(pathname) === "protected"
}

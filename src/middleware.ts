import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"
import { getSafeNextPath } from "@/modules/auth/domain/next-path"
import { userHasAdminPrivileges } from "@/modules/master-admin/security/admin-privileges"
import {
  isMasterAdminPath,
  isRequestHostAllowedForMasterAdmin,
} from "@/modules/master-admin/security/admin-host"
import { assertMasterAdminAal2Ok } from "@/modules/master-admin/security/mfa"
import { logMasterAdminAuditFromRequest } from "@/modules/master-admin/application/audit-log"
import { assertUserAccountAccess } from "@/modules/master-admin/application/account-controls"
import { logSecurityEvent } from "@/modules/master-admin/application/events"
import { MASTER_ADMIN_JSON_HEADERS } from "@/modules/master-admin/application/http"
import { classifyApiRoute, isActiveAuthPage } from "@/core/security/api-route-policy"
import { wafInspect } from "@/core/security/waf"
import { applySecurityHeaders, validateCsrf } from "@/core/security/api-security"

function getRequestId(request: NextRequest): string {
  const existing = request.headers.get("x-request-id")
  if (existing && /^[a-zA-Z0-9._:-]{1,128}$/.test(existing)) {
    return existing
  }
  return crypto.randomUUID()
}

export async function middleware(request: NextRequest) {
  const requestId = getRequestId(request)
  const withSecurityHeaders = (response: NextResponse) => {
    response.headers.set("X-Request-ID", requestId)
    return applySecurityHeaders(response)
  }
  const { pathname, search } = request.nextUrl
  const hostHeader = request.headers.get("host")
  const apiRoutePolicy = classifyApiRoute(pathname)
  const isGeneralApi =
    apiRoutePolicy === "public" ||
    apiRoutePolicy === "machine" ||
    apiRoutePolicy === "protected"
  const isProtectedApi = apiRoutePolicy === "protected"

  if (
    request.method === "POST" &&
    request.headers.has("next-action") &&
    isActiveAuthPage(pathname)
  ) {
    return withSecurityHeaders(NextResponse.redirect(request.nextUrl, 303))
  }

  // WAF: first line of defense (runs before any auth/session logic).
  const wafResponse = await wafInspect(request)
  if (wafResponse) {
    void logSecurityEvent(request, {
      eventType: "waf.blocked",
      severity: "high",
      outcome: "blocked",
      statusCode: wafResponse.status,
    }).catch(() => {})
    return withSecurityHeaders(wafResponse)
  }

  const csrfResponse = validateCsrf(request, {
    skipPaths: ["/api/razorpay/webhook", "/api/cron", "/api/jobs", "/api/test/e2e", "/api/scim"],
  })
  if (csrfResponse) {
    void logSecurityEvent(request, {
      eventType: "csrf.blocked",
      severity: "high",
      outcome: "blocked",
      statusCode: csrfResponse.status,
    }).catch(() => {})
    return withSecurityHeaders(csrfResponse)
  }

  let supabaseResponse = NextResponse.next({ request })
  const preserveSupabaseCookies = (response: NextResponse) => {
    supabaseResponse.cookies.getAll().forEach(({ name, value, ...options }) => {
      response.cookies.set(name, value, options)
    })
    return response
  }
  const finalizeResponse = (response: NextResponse) =>
    withSecurityHeaders(preserveSupabaseCookies(response))

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh session. MUST be called before checking user.
  const {
    data: { user },
  } = await supabase.auth.getUser()
  let accessToken: string | null = null
  if (user) {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    accessToken = session?.access_token ?? null
  }

  // Master Admin: host allowlist + auth + master_admin_users row (fail closed if host not allowed).
  if (isMasterAdminPath(pathname)) {
    if (!isRequestHostAllowedForMasterAdmin(hostHeader)) {
      void logSecurityEvent(request, {
        eventType: "master_admin.host_denied",
        severity: "high",
        outcome: "blocked",
        actorUserId: user?.id ?? null,
        statusCode: 404,
      }).catch(() => {})
      return finalizeResponse(new NextResponse(null, { status: 404 }))
    }
    if (pathname === "/master-admin/signin") {
      if (!user) {
        return withSecurityHeaders(supabaseResponse)
      }
      if (await userHasAdminPrivileges(user.id)) {
        return finalizeResponse(NextResponse.redirect(new URL("/master-admin", request.url)))
      }
      return finalizeResponse(NextResponse.redirect(new URL("/dashboard", request.url)))
    }
    if (!user) {
      void logSecurityEvent(request, {
        eventType: "master_admin.unauthorized",
        severity: "medium",
        outcome: "failure",
        statusCode: 401,
      }).catch(() => {})
      if (pathname.startsWith("/api/")) {
        return finalizeResponse(
          NextResponse.json(
            { error: "Unauthorized" },
            { status: 401, headers: MASTER_ADMIN_JSON_HEADERS }
          )
        )
      }
      const signInUrl = new URL("/master-admin/signin", request.url)
      signInUrl.searchParams.set("next", getSafeNextPath(`${pathname}${search}`))
      return finalizeResponse(NextResponse.redirect(signInUrl))
    }
    const allowed = await userHasAdminPrivileges(user.id)
    if (!allowed) {
      void logSecurityEvent(request, {
        eventType: "master_admin.forbidden",
        severity: "high",
        outcome: "blocked",
        actorUserId: user.id,
        statusCode: 403,
      }).catch(() => {})
      if (pathname.startsWith("/api/")) {
        return finalizeResponse(
          NextResponse.json(
            { error: "Forbidden" },
            { status: 403, headers: MASTER_ADMIN_JSON_HEADERS }
          )
        )
      }
      return finalizeResponse(NextResponse.redirect(new URL("/dashboard", request.url)))
    }

    const mfa = await assertMasterAdminAal2Ok(supabase)
    if (!mfa.ok) {
      void logSecurityEvent(request, {
        eventType: "master_admin.mfa_required",
        severity: "high",
        outcome: "blocked",
        actorUserId: user.id,
        statusCode: 403,
        metadata: { code: mfa.code },
      }).catch(() => {})
      if (pathname.startsWith("/api/")) {
        return finalizeResponse(
          NextResponse.json(
            { error: mfa.message, code: mfa.code },
            { status: 403, headers: MASTER_ADMIN_JSON_HEADERS }
          )
        )
      }
      const signInUrl = new URL("/master-admin/signin", request.url)
      signInUrl.searchParams.set("next", getSafeNextPath(`${pathname}${search}`))
      signInUrl.searchParams.set("error", "mfa_required")
      return finalizeResponse(NextResponse.redirect(signInUrl))
    }

    void logMasterAdminAuditFromRequest(request, user.id).catch(() => {
      /* non-blocking; avoid failing requests if audit insert fails */
    })
  }

  if (isProtectedApi && !user) {
    void logSecurityEvent(request, {
      eventType: "api.unauthorized",
      severity: "medium",
      outcome: "failure",
      statusCode: 401,
    }).catch(() => {})
    return finalizeResponse(
      NextResponse.json(
        { error: "Unauthorized" },
        {
          status: 401,
          headers: { "Cache-Control": "private, no-store, max-age=0" },
        }
      )
    )
  }

  // In-app admin dashboard: hide route from all non-admin users (404, not a soft redirect to /dashboard).
  if (pathname === "/dashboard/admin" || pathname.startsWith("/dashboard/admin/")) {
    if (user && !(await userHasAdminPrivileges(user.id))) {
      void logSecurityEvent(request, {
        eventType: "dashboard_admin.forbidden",
        severity: "medium",
        outcome: "blocked",
        actorUserId: user.id,
        statusCode: 404,
      }).catch(() => {})
      return finalizeResponse(new NextResponse(null, { status: 404 }))
    }
  }

  const accountProtected =
    isProtectedApi ||
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/editor")

  if (user && accountProtected) {
    const access = await assertUserAccountAccess(user.id, accessToken)
    if (!access.ok) {
      void logSecurityEvent(request, {
        eventType: access.code === "account_suspended" ? "account.suspended_request_blocked" : "account.revoked_session_blocked",
        severity: access.code === "account_suspended" ? "high" : "medium",
        outcome: "blocked",
        actorUserId: user.id,
        targetUserId: user.id,
        statusCode: access.code === "session_revoked" ? 401 : 403,
      }).catch(() => {})

      if (isGeneralApi) {
        return finalizeResponse(
          NextResponse.json(
            { error: access.message, code: access.code },
            { status: access.code === "session_revoked" ? 401 : 403, headers: { "Cache-Control": "private, no-store, max-age=0" } }
          )
        )
      }

      if (access.code === "session_revoked") {
        const signInUrl = new URL("/signin", request.url)
        signInUrl.searchParams.set("next", getSafeNextPath(`${pathname}${search}`))
        signInUrl.searchParams.set("error", "session_revoked")
        return finalizeResponse(NextResponse.redirect(signInUrl))
      }

      return finalizeResponse(
        new NextResponse(access.message, {
          status: 403,
          headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, no-store, max-age=0" },
        })
      )
    }
  }

  // Protected app surfaces (cookie session validated above via getUser).
  if (!user && (pathname.startsWith("/dashboard") || pathname.startsWith("/editor"))) {
    const signInUrl = new URL("/signin", request.url)
    signInUrl.searchParams.set("next", getSafeNextPath(`${pathname}${search}`))
    return finalizeResponse(NextResponse.redirect(signInUrl))
  }

  if (isGeneralApi) {
    return withSecurityHeaders(supabaseResponse)
  }

  // Redirect authenticated users away from auth pages (honor safe ?next= like post-sign-in flow).
  if (
    user &&
    isActiveAuthPage(pathname)
  ) {
    const destination = getSafeNextPath(request.nextUrl.searchParams.get("next"))
    return finalizeResponse(NextResponse.redirect(new URL(destination, request.url)))
  }

  return withSecurityHeaders(supabaseResponse)
}

export const config = {
  matcher: [
    "/dashboard",
    "/editor",
    "/dashboard/:path*",
    "/editor/:path*",
    "/signin",
    "/signup",
    "/forgot-password",
    "/reset-password",
    "/verify-code",
    "/master-admin",
    "/master-admin/:path*",
    "/api/:path*",
  ],
}

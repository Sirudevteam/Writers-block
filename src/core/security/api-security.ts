/**
 * API security utilities used by middleware.
 */

import { NextRequest, NextResponse } from "next/server"

function getAllowedOrigins(): string[] {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"
  const origins = [siteUrl]

  if (process.env.NODE_ENV !== "production") {
    origins.push("http://localhost:3000", "http://127.0.0.1:3000")
  }

  return origins
}

function validateOrigin(request: NextRequest): string | null {
  const origin = request.headers.get("origin")
  if (!origin) return null

  return getAllowedOrigins().includes(origin) ? origin : null
}

const CSRF_SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"])

export function validateCsrf(
  request: NextRequest,
  opts: { skipPaths?: string[] } = {}
): NextResponse | null {
  if (CSRF_SAFE_METHODS.has(request.method)) return null

  const pathname = new URL(request.url).pathname
  if (opts.skipPaths?.some((p) => pathname.startsWith(p))) return null

  const fetchSite = request.headers.get("sec-fetch-site")
  if (fetchSite === "same-origin" || fetchSite === "same-site") return null

  if (validateOrigin(request)) return null

  console.warn(
    `[csrf] Blocked cross-origin state-changing request: ${request.method} ${pathname}`
  )

  return NextResponse.json(
    { error: "Cross-origin request blocked" },
    {
      status: 403,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "application/json",
      },
    }
  )
}

const ADDITIONAL_SECURITY_HEADERS: Record<string, string> = {
  "Permissions-Policy":
    "camera=(), microphone=(), geolocation=(), payment=(self), usb=(), bluetooth=(), serial=(), midi=()",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  "X-Permitted-Cross-Domain-Policies": "none",
} as const

export function applySecurityHeaders(response: NextResponse): NextResponse {
  for (const [key, value] of Object.entries(ADDITIONAL_SECURITY_HEADERS)) {
    response.headers.set(key, value)
  }
  return response
}

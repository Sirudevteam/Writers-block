import { NextRequest, NextResponse } from "next/server"

export const E2E_TEST_HEADERS = {
  "Cache-Control": "no-store",
} as const

export function e2eTestRoutesEnabled(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.ENABLE_E2E_TEST_ROUTES === "true"
}

export function requireE2eTestAccess(request: NextRequest): NextResponse | null {
  if (!e2eTestRoutesEnabled()) {
    return new NextResponse(null, { status: 404, headers: E2E_TEST_HEADERS })
  }

  const expectedSecret = process.env.E2E_TEST_SECRET
  if (!expectedSecret) {
    return NextResponse.json(
      { error: "E2E test secret is not configured" },
      { status: 503, headers: E2E_TEST_HEADERS }
    )
  }

  const actualSecret = request.headers.get("x-e2e-test-secret")
  if (actualSecret !== expectedSecret) {
    return NextResponse.json(
      { error: "Invalid E2E test secret" },
      { status: 401, headers: E2E_TEST_HEADERS }
    )
  }

  return null
}

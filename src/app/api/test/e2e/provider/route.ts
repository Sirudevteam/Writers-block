import { NextRequest, NextResponse } from "next/server"
import { E2E_TEST_HEADERS, requireE2eTestAccess } from "../_shared"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const denied = requireE2eTestAccess(request)
  if (denied) return denied

  return NextResponse.json(
    {
      ok: true,
      mockProviderEnabled:
        process.env.AI_PROVIDER_MOCK === "true" ||
        (process.env.NODE_ENV !== "production" && process.env.ENABLE_E2E_TEST_ROUTES === "true"),
      model: "e2e-deterministic",
    },
    { headers: E2E_TEST_HEADERS }
  )
}

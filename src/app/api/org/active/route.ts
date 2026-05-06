import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { z } from "zod"
import { createClient } from "@/infrastructure/db/supabase/server"
import { isAllowedRequestOrigin } from "@/modules/auth/security/request-origin"
import { IAM_JSON_HEADERS } from "@/modules/iam/application/api-guard"

export const dynamic = "force-dynamic"

const bodySchema = z.object({
  orgId: z.string().uuid(),
})

export async function POST(req: NextRequest) {
  if (!isAllowedRequestOrigin((name) => req.headers.get(name))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: IAM_JSON_HEADERS })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: IAM_JSON_HEADERS })
  }

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400, headers: IAM_JSON_HEADERS })
  }
  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400, headers: IAM_JSON_HEADERS })
  }

  const { data, error } = await supabase
    .from("organization_members")
    .select("org_id")
    .eq("user_id", user.id)
    .eq("org_id", parsed.data.orgId)
    .maybeSingle()
  if (error) {
    return NextResponse.json({ error: "Failed to set org" }, { status: 500, headers: IAM_JSON_HEADERS })
  }
  if (!data?.org_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: IAM_JSON_HEADERS })
  }

  const store = await cookies()
  store.set("wb_active_org", parsed.data.orgId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  })

  return NextResponse.json({ ok: true }, { headers: IAM_JSON_HEADERS })
}

import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/infrastructure/db/supabase/server"
import { createAdminClient } from "@/infrastructure/db/supabase/admin"
import { IAM_JSON_HEADERS } from "@/modules/iam/application/api-guard"

export const dynamic = "force-dynamic"

const consentSchema = z.object({
  document: z.enum(["terms", "privacy", "refund_policy", "fair_usage"]),
  version: z.string().trim().min(1).max(40),
})

export async function POST(req: NextRequest) {
  const auth = await createClient()
  const {
    data: { user },
  } = await auth.auth.getUser()
  if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: IAM_JSON_HEADERS })

  const parsed = consentSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Invalid consent input" }, { status: 400, headers: IAM_JSON_HEADERS })

  const admin = createAdminClient()
  const { data, error } = await (admin.from("user_consents") as any)
    .insert({
      user_id: user.id,
      document: parsed.data.document,
      version: parsed.data.version,
    })
    .select("*")
    .single()

  if (error || !data) return NextResponse.json({ error: "Failed to record consent" }, { status: 500, headers: IAM_JSON_HEADERS })
  return NextResponse.json({ ok: true, consent: data }, { headers: IAM_JSON_HEADERS })
}

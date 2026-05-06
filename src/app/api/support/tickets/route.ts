import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/infrastructure/db/supabase/server"
import { createAdminClient } from "@/infrastructure/db/supabase/admin"
import { isAllowedRequestOrigin } from "@/modules/auth/security/request-origin"
import { supportTicketLimitOr429 } from "@/core/security/api-ip-limit"

export const dynamic = "force-dynamic"

const ticketSchema = z.object({
  email: z.string().email().max(320).optional(),
  category: z.enum(["billing", "ai_output", "export_issue", "account_recovery", "other"]),
  subject: z.string().trim().min(1).max(200),
  message: z.string().trim().min(1).max(5000),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

export async function GET() {
  const auth = await createClient()
  const {
    data: { user },
  } = await auth.auth.getUser()
  if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const admin = createAdminClient()
  const { data, error } = await (admin.from("support_tickets") as any)
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100)

  if (error) return NextResponse.json({ error: "Failed to load tickets" }, { status: 500 })
  return NextResponse.json({ ok: true, tickets: data ?? [] })
}

export async function POST(req: NextRequest) {
  if (!isAllowedRequestOrigin((name) => req.headers.get(name))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const tooMany = await supportTicketLimitOr429(req)
  if (tooMany) return tooMany

  const parsed = ticketSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Invalid support ticket input" }, { status: 400 })

  const auth = await createClient()
  const {
    data: { user },
  } = await auth.auth.getUser()

  const email = parsed.data.email ?? user?.email ?? null
  if (!email) return NextResponse.json({ error: "Email is required" }, { status: 400 })

  const admin = createAdminClient()
  const { data, error } = await (admin.from("support_tickets") as any)
    .insert({
      user_id: user?.id ?? null,
      email,
      category: parsed.data.category,
      subject: parsed.data.subject,
      message: parsed.data.message,
      metadata: parsed.data.metadata ?? {},
    })
    .select("id, category, subject, status, created_at")
    .single()

  if (error || !data) return NextResponse.json({ error: "Failed to create support ticket" }, { status: 500 })
  return NextResponse.json({ ok: true, ticket: data }, { status: 201 })
}

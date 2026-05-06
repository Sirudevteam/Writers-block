import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@/infrastructure/db/supabase/server"
import { logBusinessEvent } from "@/modules/master-admin/application/events"

export const dynamic = "force-dynamic"

const HEADERS = { "Cache-Control": "private, no-store, max-age=0" } as const

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: HEADERS })
  }

  void logBusinessEvent(req, {
    eventType: "subscription.page_viewed",
    userId: user.id,
  }).catch(() => {})

  return NextResponse.json({ ok: true }, { headers: HEADERS })
}

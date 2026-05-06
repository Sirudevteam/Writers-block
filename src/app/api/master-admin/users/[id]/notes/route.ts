import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { createClient } from "@/infrastructure/db/supabase/server"
import { guardMasterAdminApi } from "@/modules/master-admin/security/api-guard"
import { MASTER_ADMIN_JSON_HEADERS } from "@/modules/master-admin/application/http"
import { createUserNote } from "@/modules/master-admin/application/account-controls"
import { logIamAudit } from "@/modules/iam/application/audit"

export const dynamic = "force-dynamic"

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const bodySchema = z.object({
  note: z.string().trim().min(1).max(2000),
})

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await guardMasterAdminApi(req)
  if (!gate.ok) return gate.response

  const { id } = await params

  if (!UUID_RE.test(id)) {
    return NextResponse.json(
      { error: "Invalid user id" },
      { status: 400, headers: MASTER_ADMIN_JSON_HEADERS }
    )
  }

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json(
      { error: "Invalid request" },
      { status: 400, headers: MASTER_ADMIN_JSON_HEADERS }
    )
  }

  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input" },
      { status: 400, headers: MASTER_ADMIN_JSON_HEADERS }
    )
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user?.id) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: MASTER_ADMIN_JSON_HEADERS }
    )
  }

  try {
    const row = await createUserNote(req, {
      targetUserId: id,
      authorUserId: user.id,
      note: parsed.data.note,
    })

    void logIamAudit(req, {
      actorUserId: user.id,
      orgId: null,
      action: "platform.user_note.create",
      targetType: "user",
      targetId: id,
      metadata: {},
    }).catch(() => {})

    return NextResponse.json({ row }, { headers: MASTER_ADMIN_JSON_HEADERS })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to create note"
    return NextResponse.json(
      { error: message },
      { status: 500, headers: MASTER_ADMIN_JSON_HEADERS }
    )
  }
}

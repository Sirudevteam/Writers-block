import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { guardOrgApi } from "@/modules/iam/application/api-guard"
import { NO_STORE_HEADERS } from "@/core/http/cache"
import { projectIdParamSchema } from "@/modules/projects/domain/schemas"

export const dynamic = "force-dynamic"

const paramsSchema = z.object({
  id: projectIdParamSchema.shape.id,
  commentId: z.string().uuid(),
})
const patchSchema = z.object({
  body: z.string().trim().min(1).max(4000).optional(),
  status: z.enum(["open", "resolved"]).optional(),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; commentId: string }> }
) {
  const gate = await guardOrgApi(req, "project:write")
  if (!gate.ok) return gate.response

  const parsedParams = paramsSchema.safeParse(await params)
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid comment id" }, { status: 400, headers: NO_STORE_HEADERS })
  }

  const parsed = patchSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success || (!parsed.data.body && !parsed.data.status)) {
    return NextResponse.json({ error: "Invalid comment update" }, { status: 400, headers: NO_STORE_HEADERS })
  }

  const changes: Record<string, unknown> = {}
  if (parsed.data.body) changes.body = parsed.data.body
  if (parsed.data.status) {
    changes.status = parsed.data.status
    changes.resolved_at = parsed.data.status === "resolved" ? new Date().toISOString() : null
    changes.resolved_by = parsed.data.status === "resolved" ? gate.userId : null
  }

  const { data, error } = await (gate.supabase.from("project_comments") as any)
    .update(changes)
    .eq("project_id", parsedParams.data.id)
    .eq("org_id", gate.orgId)
    .eq("id", parsedParams.data.commentId)
    .select("*")
    .maybeSingle()

  if (error) return NextResponse.json({ error: "Failed to update comment" }, { status: 500, headers: NO_STORE_HEADERS })
  if (!data) return NextResponse.json({ error: "Comment not found" }, { status: 404, headers: NO_STORE_HEADERS })

  await (gate.supabase.from("project_activity_events") as any).insert({
    project_id: parsedParams.data.id,
    org_id: gate.orgId,
    actor_user_id: gate.userId,
    event_type: parsed.data.status === "resolved" ? "comment.resolved" : parsed.data.status === "open" ? "comment.reopened" : "comment.updated",
    target_type: "project_comment",
    target_id: data.id,
    metadata: { status: data.status },
  })

  return NextResponse.json({ ok: true, comment: data }, { headers: NO_STORE_HEADERS })
}

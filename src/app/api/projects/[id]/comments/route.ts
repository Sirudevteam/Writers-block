import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { guardOrgApi } from "@/modules/iam/application/api-guard"
import { NO_STORE_HEADERS } from "@/core/http/cache"
import { projectIdParamSchema } from "@/modules/projects/domain/schemas"

export const dynamic = "force-dynamic"

const createSchema = z.object({
  body: z.string().trim().min(1).max(4000),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

function parseProjectId(params: { id: string }) {
  const parsed = projectIdParamSchema.safeParse(params)
  return parsed.success ? parsed.data.id : null
}

async function projectExists(supabase: any, orgId: string, projectId: string) {
  const { data, error } = await supabase
    .from("projects")
    .select("id, org_id")
    .eq("id", projectId)
    .eq("org_id", orgId)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await guardOrgApi(req, "project:read")
  if (!gate.ok) return gate.response

  const projectId = parseProjectId(await params)
  if (!projectId) return NextResponse.json({ error: "Invalid project id" }, { status: 400, headers: NO_STORE_HEADERS })

  if (!(await projectExists(gate.supabase as any, gate.orgId, projectId))) {
    return NextResponse.json({ error: "Project not found" }, { status: 404, headers: NO_STORE_HEADERS })
  }

  const { data, error } = await (gate.supabase.from("project_comments") as any)
    .select("*, author:profiles(email, full_name)")
    .eq("project_id", projectId)
    .eq("org_id", gate.orgId)
    .order("created_at", { ascending: true })
    .limit(200)

  if (error) return NextResponse.json({ error: "Failed to load comments" }, { status: 500, headers: NO_STORE_HEADERS })
  return NextResponse.json({ ok: true, comments: data ?? [] }, { headers: NO_STORE_HEADERS })
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await guardOrgApi(req, "project:read")
  if (!gate.ok) return gate.response

  const projectId = parseProjectId(await params)
  if (!projectId) return NextResponse.json({ error: "Invalid project id" }, { status: 400, headers: NO_STORE_HEADERS })

  if (!(await projectExists(gate.supabase as any, gate.orgId, projectId))) {
    return NextResponse.json({ error: "Project not found" }, { status: 404, headers: NO_STORE_HEADERS })
  }

  const parsed = createSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid comment input" }, { status: 400, headers: NO_STORE_HEADERS })
  }

  const { data, error } = await (gate.supabase.from("project_comments") as any)
    .insert({
      project_id: projectId,
      org_id: gate.orgId,
      user_id: gate.userId,
      body: parsed.data.body,
      metadata: parsed.data.metadata ?? {},
    })
    .select("*")
    .single()

  if (error || !data) {
    return NextResponse.json({ error: "Failed to create comment" }, { status: 500, headers: NO_STORE_HEADERS })
  }

  await (gate.supabase.from("project_activity_events") as any).insert({
    project_id: projectId,
    org_id: gate.orgId,
    actor_user_id: gate.userId,
    event_type: "comment.created",
    target_type: "project_comment",
    target_id: data.id,
    metadata: { status: data.status },
  })

  return NextResponse.json({ ok: true, comment: data }, { status: 201, headers: NO_STORE_HEADERS })
}

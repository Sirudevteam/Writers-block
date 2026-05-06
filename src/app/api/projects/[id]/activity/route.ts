import { NextRequest, NextResponse } from "next/server"
import { guardOrgApi } from "@/modules/iam/application/api-guard"
import { NO_STORE_HEADERS } from "@/core/http/cache"
import { projectIdParamSchema } from "@/modules/projects/domain/schemas"

export const dynamic = "force-dynamic"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await guardOrgApi(req, "project:read")
  if (!gate.ok) return gate.response

  const parsed = projectIdParamSchema.safeParse(await params)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid project id" }, { status: 400, headers: NO_STORE_HEADERS })
  }

  const { data: project } = await gate.supabase
    .from("projects")
    .select("id")
    .eq("id", parsed.data.id)
    .eq("org_id", gate.orgId)
    .maybeSingle()
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404, headers: NO_STORE_HEADERS })
  }

  const { data, error } = await (gate.supabase.from("project_activity_events") as any)
    .select("*, actor:profiles(email, full_name)")
    .eq("project_id", parsed.data.id)
    .eq("org_id", gate.orgId)
    .order("created_at", { ascending: false })
    .limit(100)

  if (error) return NextResponse.json({ error: "Failed to load activity" }, { status: 500, headers: NO_STORE_HEADERS })
  return NextResponse.json({ ok: true, activity: data ?? [] }, { headers: NO_STORE_HEADERS })
}

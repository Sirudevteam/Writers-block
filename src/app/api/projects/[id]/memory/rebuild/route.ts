import { type NextRequest, NextResponse } from "next/server"
import { NO_STORE_HEADERS } from "@/core/http/cache"
import { jsonError } from "@/core/http/json"
import { zodErrorMessage } from "@/core/http/validation"
import { apiIpLimitOr429 } from "@/core/security/api-ip-limit"
import { guardOrgApi } from "@/modules/iam/application/api-guard"
import { logBusinessEvent } from "@/modules/master-admin/application/events"
import { getProject } from "@/modules/projects/application/project-service"
import { projectIdParamSchema } from "@/modules/projects/domain/schemas"
import { requestProjectMemoryIndex } from "@/modules/story-memory/application/story-memory-jobs"

export const dynamic = "force-dynamic"

function parseProjectId(params: { id: string }) {
  const parsed = projectIdParamSchema.safeParse(params)
  if (!parsed.success) {
    return { ok: false as const, response: jsonError(zodErrorMessage(parsed.error), 400, NO_STORE_HEADERS) }
  }
  return { ok: true as const, projectId: parsed.data.id }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tooMany = await apiIpLimitOr429(request)
  if (tooMany) return tooMany

  const gate = await guardOrgApi(request, "project:write")
  if (!gate.ok) return gate.response

  const id = parseProjectId(await params)
  if (!id.ok) return id.response

  const project = await getProject({
    supabase: gate.supabase,
    orgId: gate.orgId,
    projectId: id.projectId,
  })

  const queued = await requestProjectMemoryIndex({
    admin: gate.supabase,
    project,
    force: true,
    reason: "manual_rebuild",
  })

  void logBusinessEvent(request, {
    eventType: "story_memory.rebuild_requested",
    userId: gate.userId,
    outcome: queued.queued ? "success" : "pending",
    metadata: {
      projectId: project.id,
      orgId: gate.orgId,
      qstash: queued.queued,
      qstashReason: queued.queueReason,
    },
  }).catch(() => {})

  return NextResponse.json(queued, { status: queued.queued ? 202 : 200, headers: NO_STORE_HEADERS })
}

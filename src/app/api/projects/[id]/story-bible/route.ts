import { type NextRequest, NextResponse } from "next/server"
import { AppError, toHttpErrorShape } from "@/core/errors/app-error"
import { NO_STORE_HEADERS } from "@/core/http/cache"
import { jsonError } from "@/core/http/json"
import { parseJsonRequest, zodErrorMessage } from "@/core/http/validation"
import { logger } from "@/core/logger"
import { apiIpLimitOr429 } from "@/core/security/api-ip-limit"
import { guardOrgApi } from "@/modules/iam/application/api-guard"
import { projectIdParamSchema } from "@/modules/projects/domain/schemas"
import {
  addProjectStoryBibleEntry,
  listProjectStoryBible,
} from "@/modules/story-bible/application/story-bible-service"
import { storyBibleCreateSchema } from "@/modules/story-bible/domain/schemas"
import { getProjectMemoryStatus } from "@/modules/story-memory/infrastructure/story-memory-repository"

function storyBibleErrorResponse(error: unknown) {
  if (!(error instanceof AppError)) {
    logger.error("[api/projects/:id/story-bible] Unexpected route error", {
      message: error instanceof Error ? error.message : String(error),
    })
  }
  const httpError = toHttpErrorShape(error)
  return jsonError(httpError.message, httpError.status, NO_STORE_HEADERS)
}

function parseProjectId(params: { id: string }) {
  const parsed = projectIdParamSchema.safeParse(params)
  if (!parsed.success) {
    return { ok: false as const, response: jsonError(zodErrorMessage(parsed.error), 400, NO_STORE_HEADERS) }
  }
  return { ok: true as const, projectId: parsed.data.id }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tooMany = await apiIpLimitOr429(request)
  if (tooMany) return tooMany

  const gate = await guardOrgApi(request, "project:read")
  if (!gate.ok) return gate.response

  const id = parseProjectId(await params)
  if (!id.ok) return id.response

  try {
    const [entries, memoryStatus] = await Promise.all([
      listProjectStoryBible({
        supabase: gate.supabase,
        orgId: gate.orgId,
        projectId: id.projectId,
      }),
      getProjectMemoryStatus({ admin: gate.supabase, projectId: id.projectId }),
    ])

    return NextResponse.json(
      {
        entries,
        memoryStatus: memoryStatus.data ?? null,
      },
      { headers: NO_STORE_HEADERS }
    )
  } catch (error) {
    return storyBibleErrorResponse(error)
  }
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

  const parsed = await parseJsonRequest(request, storyBibleCreateSchema)
  if (!parsed.ok) return jsonError(parsed.error, parsed.status, NO_STORE_HEADERS)

  try {
    const entry = await addProjectStoryBibleEntry({
      supabase: gate.supabase,
      userId: gate.userId,
      orgId: gate.orgId,
      projectId: id.projectId,
      input: parsed.data,
    })

    return NextResponse.json({ entry }, { status: 201, headers: NO_STORE_HEADERS })
  } catch (error) {
    return storyBibleErrorResponse(error)
  }
}

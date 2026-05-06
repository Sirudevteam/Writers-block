import { type NextRequest, NextResponse } from "next/server"
import { AppError, toHttpErrorShape } from "@/core/errors/app-error"
import { NO_STORE_HEADERS } from "@/core/http/cache"
import { jsonError } from "@/core/http/json"
import { parseJsonRequest, zodErrorMessage } from "@/core/http/validation"
import { logger } from "@/core/logger"
import { apiIpLimitOr429 } from "@/core/security/api-ip-limit"
import { guardOrgApi } from "@/modules/iam/application/api-guard"
import {
  deleteProject,
  getProject,
  updateProject,
} from "@/modules/projects/application/project-service"
import {
  projectIdParamSchema,
  projectUpdateBodySchema,
} from "@/modules/projects/domain/schemas"
import { requestProjectMemoryIndex } from "@/modules/story-memory/application/story-memory-jobs"

function projectErrorResponse(error: unknown, headers?: HeadersInit) {
  if (!(error instanceof AppError)) {
    logger.error("[api/projects/:id] Unexpected route error", {
      message: error instanceof Error ? error.message : String(error),
    })
  }
  const httpError = toHttpErrorShape(error)
  return jsonError(httpError.message, httpError.status, headers)
}

function parseProjectId(params: { id: string }) {
  const parsed = projectIdParamSchema.safeParse(params)
  if (!parsed.success) {
    return { ok: false as const, response: jsonError(zodErrorMessage(parsed.error), 400, NO_STORE_HEADERS) }
  }
  return { ok: true as const, projectId: parsed.data.id }
}

// GET /api/projects/[id]
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
    const project = await getProject({
      supabase: gate.supabase,
      orgId: gate.orgId,
      projectId: id.projectId,
    })

    return NextResponse.json(project, { headers: NO_STORE_HEADERS })
  } catch (error) {
    return projectErrorResponse(error, NO_STORE_HEADERS)
  }
}

// PUT /api/projects/[id] - update a project.
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tooMany = await apiIpLimitOr429(request)
  if (tooMany) return tooMany

  const gate = await guardOrgApi(request, "project:write")
  if (!gate.ok) return gate.response

  const id = parseProjectId(await params)
  if (!id.ok) return id.response

  const parsed = await parseJsonRequest(request, projectUpdateBodySchema)
  if (!parsed.ok) {
    return jsonError(parsed.error, parsed.status, NO_STORE_HEADERS)
  }

  try {
    const project = await updateProject({
      supabase: gate.supabase,
      orgId: gate.orgId,
      projectId: id.projectId,
      input: parsed.data,
    })

    if (
      parsed.data.content !== undefined ||
      parsed.data.characters !== undefined ||
      parsed.data.description !== undefined ||
      parsed.data.genre !== undefined ||
      parsed.data.location !== undefined ||
      parsed.data.mood !== undefined ||
      parsed.data.title !== undefined
    ) {
      void requestProjectMemoryIndex({
        admin: gate.supabase,
        project,
        reason: "project_updated",
      }).catch((error) => {
        logger.warn("[api/projects/:id] Story memory queue failed after update", {
          projectId: project.id,
          message: error instanceof Error ? error.message : String(error),
        })
      })
    }

    return NextResponse.json(project, { headers: NO_STORE_HEADERS })
  } catch (error) {
    return projectErrorResponse(error, NO_STORE_HEADERS)
  }
}

// DELETE /api/projects/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tooMany = await apiIpLimitOr429(request)
  if (tooMany) return tooMany

  const gate = await guardOrgApi(request, "project:write")
  if (!gate.ok) return gate.response

  const id = parseProjectId(await params)
  if (!id.ok) return id.response

  try {
    await deleteProject({
      supabase: gate.supabase,
      orgId: gate.orgId,
      projectId: id.projectId,
    })

    return NextResponse.json({ success: true }, { headers: NO_STORE_HEADERS })
  } catch (error) {
    return projectErrorResponse(error, NO_STORE_HEADERS)
  }
}

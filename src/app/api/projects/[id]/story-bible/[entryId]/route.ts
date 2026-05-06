import { type NextRequest, NextResponse } from "next/server"
import { AppError, toHttpErrorShape } from "@/core/errors/app-error"
import { NO_STORE_HEADERS } from "@/core/http/cache"
import { jsonError } from "@/core/http/json"
import { parseJsonRequest, zodErrorMessage } from "@/core/http/validation"
import { logger } from "@/core/logger"
import { apiIpLimitOr429 } from "@/core/security/api-ip-limit"
import { guardOrgApi } from "@/modules/iam/application/api-guard"
import {
  editProjectStoryBibleEntry,
  removeProjectStoryBibleEntry,
} from "@/modules/story-bible/application/story-bible-service"
import {
  storyBibleEntryIdParamSchema,
  storyBibleUpdateSchema,
} from "@/modules/story-bible/domain/schemas"

function storyBibleErrorResponse(error: unknown) {
  if (!(error instanceof AppError)) {
    logger.error("[api/projects/:id/story-bible/:entryId] Unexpected route error", {
      message: error instanceof Error ? error.message : String(error),
    })
  }
  const httpError = toHttpErrorShape(error)
  return jsonError(httpError.message, httpError.status, NO_STORE_HEADERS)
}

function parseParams(params: { id: string; entryId: string }) {
  const parsed = storyBibleEntryIdParamSchema.safeParse(params)
  if (!parsed.success) {
    return { ok: false as const, response: jsonError(zodErrorMessage(parsed.error), 400, NO_STORE_HEADERS) }
  }
  return { ok: true as const, projectId: parsed.data.id, entryId: parsed.data.entryId }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; entryId: string }> }
) {
  const tooMany = await apiIpLimitOr429(request)
  if (tooMany) return tooMany

  const gate = await guardOrgApi(request, "project:write")
  if (!gate.ok) return gate.response

  const ids = parseParams(await params)
  if (!ids.ok) return ids.response

  const parsed = await parseJsonRequest(request, storyBibleUpdateSchema)
  if (!parsed.ok) return jsonError(parsed.error, parsed.status, NO_STORE_HEADERS)

  try {
    const entry = await editProjectStoryBibleEntry({
      supabase: gate.supabase,
      orgId: gate.orgId,
      projectId: ids.projectId,
      entryId: ids.entryId,
      input: parsed.data,
    })
    return NextResponse.json({ entry }, { headers: NO_STORE_HEADERS })
  } catch (error) {
    return storyBibleErrorResponse(error)
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; entryId: string }> }
) {
  const tooMany = await apiIpLimitOr429(request)
  if (tooMany) return tooMany

  const gate = await guardOrgApi(request, "project:write")
  if (!gate.ok) return gate.response

  const ids = parseParams(await params)
  if (!ids.ok) return ids.response

  try {
    await removeProjectStoryBibleEntry({
      supabase: gate.supabase,
      orgId: gate.orgId,
      projectId: ids.projectId,
      entryId: ids.entryId,
    })
    return NextResponse.json({ success: true }, { headers: NO_STORE_HEADERS })
  } catch (error) {
    return storyBibleErrorResponse(error)
  }
}

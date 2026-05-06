import { type NextRequest, NextResponse } from "next/server"
import { AppError, toHttpErrorShape } from "@/core/errors/app-error"
import { PROJECT_LIST_CACHE_HEADERS, NO_STORE_HEADERS } from "@/core/http/cache"
import { jsonError } from "@/core/http/json"
import { parseJsonRequest } from "@/core/http/validation"
import { logger } from "@/core/logger"
import { apiIpLimitOr429 } from "@/core/security/api-ip-limit"
import { guardOrgApi } from "@/modules/iam/application/api-guard"
import { logBusinessEvent } from "@/modules/master-admin/application/events"
import {
  decodeProjectCursor,
  resolveProjectPageSize,
} from "@/modules/projects/application/pagination"
import {
  createProject,
  getProject,
  listProjects,
} from "@/modules/projects/application/project-service"
import { projectCreateBodySchema } from "@/modules/projects/domain/schemas"
import { requestProjectMemoryIndex } from "@/modules/story-memory/application/story-memory-jobs"

export const dynamic = "force-dynamic"

function projectErrorResponse(error: unknown, headers?: HeadersInit) {
  if (!(error instanceof AppError)) {
    logger.error("[api/projects] Unexpected route error", {
      message: error instanceof Error ? error.message : String(error),
    })
  }
  const httpError = toHttpErrorShape(error)
  return jsonError(httpError.message, httpError.status, headers)
}

// GET /api/projects - cursor-paginated list for the authenticated user's active org.
// Query params: ?limit=50&cursor=<base64>
// Response: { items: ProjectListRow[], nextCursor: string | null, hasMore: boolean, quota: ProjectQuota }
export async function GET(request: NextRequest) {
  const tooMany = await apiIpLimitOr429(request)
  if (tooMany) return tooMany

  const gate = await guardOrgApi(request, "project:read")
  if (!gate.ok) return gate.response

  const params = request.nextUrl.searchParams
  const limit = resolveProjectPageSize(params.get("limit"))
  const cursorRaw = params.get("cursor")
  const cursor = cursorRaw ? decodeProjectCursor(cursorRaw) : null

  try {
    const page = await listProjects({
      supabase: gate.supabase,
      userId: gate.userId,
      orgId: gate.orgId,
      limit,
      cursor,
    })

    return NextResponse.json(page, { headers: PROJECT_LIST_CACHE_HEADERS })
  } catch (error) {
    return projectErrorResponse(error)
  }
}

// POST /api/projects - create a new project in the authenticated user's active org.
export async function POST(request: NextRequest) {
  const tooMany = await apiIpLimitOr429(request)
  if (tooMany) return tooMany

  const gate = await guardOrgApi(request, "project:write")
  if (!gate.ok) return gate.response

  const parsed = await parseJsonRequest(request, projectCreateBodySchema)
  if (!parsed.ok) {
    return jsonError(parsed.error, parsed.status)
  }

  try {
    const result = await createProject({
      supabase: gate.supabase,
      userId: gate.userId,
      orgId: gate.orgId,
      input: parsed.data,
    })

    void logBusinessEvent(request, {
      eventType: "project.created",
      userId: gate.userId,
      plan: result.quota.plan,
      metadata: { orgId: gate.orgId, projectId: result.project.id },
    }).catch(() => {})

    if (parsed.data.content?.trim()) {
      void getProject({
        supabase: gate.supabase,
        orgId: gate.orgId,
        projectId: result.project.id,
      })
        .then((project) =>
          requestProjectMemoryIndex({
            admin: gate.supabase,
            project,
            reason: "project_created",
          })
        )
        .catch((error) => {
          logger.warn("[api/projects] Story memory queue failed after create", {
            projectId: result.project.id,
            message: error instanceof Error ? error.message : String(error),
          })
        })
    }

    return NextResponse.json(result, {
      status: 201,
      headers: NO_STORE_HEADERS,
    })
  } catch (error) {
    return projectErrorResponse(error, NO_STORE_HEADERS)
  }
}

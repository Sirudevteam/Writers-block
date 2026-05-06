import type { PostgrestError } from "@supabase/supabase-js"
import { AppError } from "@/core/errors/app-error"
import { logger } from "@/core/logger"
import { getEffectivePlan, getEffectiveProjectsLimit } from "@/modules/billing/domain/subscription"
import type { ProjectCreateBody, ProjectUpdateBody } from "@/modules/projects/domain/schemas"
import type {
  ProjectCreateResult,
  ProjectCursor,
  ProjectDbClient,
  ProjectDetail,
  ProjectListPage,
  ProjectQuota,
} from "@/modules/projects/domain/types"
import { toProjectListPage } from "@/modules/projects/application/pagination"
import {
  countProjectsForOrg,
  createProjectWithQuotaRpc,
  deleteProjectRow,
  findProjectById,
  getProjectCreationUsage,
  getSubscriptionForProjectLimit,
  listProjectRows,
  updateProjectRow,
} from "@/modules/projects/infrastructure/project-repository"

const FREE_LIFETIME_PROJECT_LIMIT = 3
const FREE_LIFETIME_BLOCKED_MESSAGE =
  "Free plan includes 3 lifetime project creations. Deleting projects does not restore credits."

function throwProjectDataError(
  context: string,
  error: PostgrestError,
  status = 500
): never {
  logger.error(context, { code: error.code, message: error.message })
  throw new AppError(error.message, status, {
    code: error.code,
    expose: true,
    cause: error,
  })
}

export async function listProjects(params: {
  supabase: ProjectDbClient
  userId: string
  orgId: string
  limit: number
  cursor: ProjectCursor | null
}): Promise<ProjectListPage> {
  const [listResult, quota] = await Promise.all([
    listProjectRows(params.supabase, params),
    getProjectQuota({
      supabase: params.supabase,
      userId: params.userId,
      orgId: params.orgId,
    }),
  ])

  if (listResult.error) {
    throwProjectDataError("[projects/list] Supabase query failed", listResult.error)
  }

  return toProjectListPage(listResult.data ?? [], params.limit, quota)
}

async function getProjectQuota(params: {
  supabase: ProjectDbClient
  userId: string
  orgId: string
}): Promise<ProjectQuota> {
  const [subscriptionResult, countResult, usageResult] = await Promise.all([
    getSubscriptionForProjectLimit(params.supabase, params.userId),
    countProjectsForOrg(params.supabase, params.orgId),
    getProjectCreationUsage(params.supabase, params.userId),
  ])

  if (subscriptionResult.error) {
    throwProjectDataError(
      "[projects/quota] Subscription lookup failed",
      subscriptionResult.error
    )
  }
  if (countResult.error) {
    throwProjectDataError("[projects/quota] Project count failed", countResult.error)
  }
  if (usageResult.error) {
    throwProjectDataError("[projects/quota] Project creation usage lookup failed", usageResult.error)
  }

  const plan = getEffectivePlan(subscriptionResult.data)
  const activeLimit = getEffectiveProjectsLimit(subscriptionResult.data)
  const activeUsed = countResult.count ?? 0
  const freeLifetimeUsed = Math.max(0, usageResult.data?.free_lifetime_created ?? 0)
  const freeLifetimeLimit = FREE_LIFETIME_PROJECT_LIMIT

  let blockedReason: string | null = null
  if (plan === "free" && freeLifetimeUsed >= freeLifetimeLimit) {
    blockedReason = FREE_LIFETIME_BLOCKED_MESSAGE
  } else if (activeUsed >= activeLimit) {
    blockedReason = "Project limit reached. Please upgrade your plan."
  }

  return {
    plan,
    activeUsed,
    activeLimit,
    freeLifetimeUsed,
    freeLifetimeLimit,
    canCreate: blockedReason === null,
    blockedReason,
  }
}

export async function createProject(params: {
  supabase: ProjectDbClient
  userId: string
  orgId: string
  input: ProjectCreateBody
}): Promise<ProjectCreateResult> {
  const { data, error } = await createProjectWithQuotaRpc(params.supabase, params)
  if (error) {
    if (error.message.includes("free_project_lifetime_limit_reached")) {
      throw new AppError(FREE_LIFETIME_BLOCKED_MESSAGE, 403)
    }
    if (error.message.includes("project_limit_reached")) {
      throw new AppError("Project limit reached. Please upgrade your plan.", 403)
    }
    throwProjectDataError("[projects/create] Insert failed", error as PostgrestError)
  }

  const project = data && typeof data === "object" && !Array.isArray(data) ? (data as any).project : null
  if (!project || typeof project !== "object") {
    throw new AppError("Project creation failed", 500)
  }

  const quota = await getProjectQuota({
    supabase: params.supabase,
    userId: params.userId,
    orgId: params.orgId,
  })

  return { project, quota }
}

export async function getProject(params: {
  supabase: ProjectDbClient
  orgId: string
  projectId: string
}): Promise<ProjectDetail> {
  const { data, error } = await findProjectById(params.supabase, params)

  if (error || !data) {
    throw new AppError("Project not found", 404, { cause: error })
  }

  return data
}

export async function updateProject(params: {
  supabase: ProjectDbClient
  orgId: string
  projectId: string
  input: ProjectUpdateBody
}): Promise<ProjectDetail> {
  const { data, error } = await updateProjectRow(params.supabase, params)

  if (error) {
    throwProjectDataError("[projects/update] Update failed", error)
  }

  return data
}

export async function deleteProject(params: {
  supabase: ProjectDbClient
  orgId: string
  projectId: string
}): Promise<void> {
  const { error } = await deleteProjectRow(params.supabase, params)

  if (error) {
    throwProjectDataError("[projects/delete] Delete failed", error)
  }
}

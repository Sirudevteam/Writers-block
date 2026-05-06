import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database, Project, ProjectListRow } from "@/infrastructure/db/types/database"
import type { SubscriptionPlan } from "@/shared/types/project"

export type ProjectDbClient = SupabaseClient<Database>

export type ProjectCursor = {
  ts: string
  id: string
}

export type ProjectListPage = {
  items: ProjectListRow[]
  nextCursor: string | null
  hasMore: boolean
  quota: ProjectQuota | null
}

export type ProjectDetail = Project

export type ProjectQuota = {
  plan: SubscriptionPlan
  activeUsed: number
  activeLimit: number
  freeLifetimeUsed: number
  freeLifetimeLimit: number
  canCreate: boolean
  blockedReason: string | null
}

export type ProjectCreateResult = {
  project: ProjectListRow
  quota: ProjectQuota
}

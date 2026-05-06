import { Client } from "@upstash/qstash"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database, Json } from "@/infrastructure/db/types/database"
import { projectContentHash } from "@/modules/story-memory/domain/chunking"
import type { StoryMemoryIndexProject } from "@/modules/story-memory/domain/types"
import { getProjectMemoryStatus } from "@/modules/story-memory/infrastructure/story-memory-repository"

type DbClient = SupabaseClient<Database>

let client: Client | null | undefined

function getQstashClient(): Client | null {
  if (client !== undefined) return client
  const token = process.env.QSTASH_TOKEN
  client = token ? new Client({ token }) : null
  return client
}

function getPublicBaseUrl(): string | null {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  return raw ? raw.replace(/\/+$/, "") : null
}

export function getStoryMemoryJobUrl(): string | null {
  const base = getPublicBaseUrl()
  return base ? `${base}/api/jobs/story-memory` : null
}

export async function enqueueStoryMemoryJob(projectId: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  const qstash = getQstashClient()
  const url = getStoryMemoryJobUrl()
  if (!qstash || !url || !process.env.QSTASH_CURRENT_SIGNING_KEY || !process.env.QSTASH_NEXT_SIGNING_KEY) {
    return { ok: false, reason: "QStash is not configured" }
  }

  await qstash.publishJSON({
    url,
    body: { projectId },
    retries: 5,
    retryDelay: "min(60000, pow(2, retried) * 1000)",
    contentBasedDeduplication: true,
  })

  return { ok: true }
}

export async function markProjectMemoryPending(params: {
  admin: DbClient
  project: StoryMemoryIndexProject
  force?: boolean
  reason?: string
}): Promise<{ changed: boolean; contentHash: string }> {
  const contentHash = projectContentHash(params.project)
  const existing = await getProjectMemoryStatus({ admin: params.admin, projectId: params.project.id })

  if (
    !params.force &&
    existing.data?.content_hash === contentHash &&
    (existing.data.status === "ready" || existing.data.status === "pending" || existing.data.status === "processing")
  ) {
    return { changed: false, contentHash }
  }

  const { error } = await params.admin.from("project_memory_status").upsert(
    {
      project_id: params.project.id,
      user_id: params.project.user_id,
      org_id: params.project.org_id,
      content_hash: contentHash,
      status: "pending",
      attempts: 0,
      locked_at: null,
      error_message: null,
      metadata: { reason: params.reason ?? "project_changed" } as Json,
    },
    { onConflict: "project_id" }
  )
  if (error) throw new Error(error.message)

  return { changed: true, contentHash }
}

export async function requestProjectMemoryIndex(params: {
  admin: DbClient
  project: StoryMemoryIndexProject
  force?: boolean
  reason?: string
}): Promise<{ queued: boolean; changed: boolean; contentHash: string; queueReason: string | null }> {
  const pending = await markProjectMemoryPending(params)
  if (!pending.changed && !params.force) {
    return { queued: false, changed: false, contentHash: pending.contentHash, queueReason: null }
  }

  const enqueue = await enqueueStoryMemoryJob(params.project.id)
  return {
    queued: enqueue.ok,
    changed: pending.changed,
    contentHash: pending.contentHash,
    queueReason: enqueue.ok ? null : enqueue.reason,
  }
}

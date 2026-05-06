import { NextRequest, NextResponse } from "next/server"
import { Receiver } from "@upstash/qstash"
import { z } from "zod"
import { createAdminClient } from "@/infrastructure/db/supabase/admin"
import { getStoryMemoryJobUrl } from "@/modules/story-memory/application/story-memory-jobs"
import {
  completeStoryMemoryJob,
  failStoryMemoryJob,
  indexProjectStoryMemory,
} from "@/modules/story-memory/application/story-memory-service"
import { logBusinessEvent } from "@/modules/master-admin/application/events"
import { requestHasInternalApiSecret, requestHasSecret } from "@/core/security/internal-api"
import type { Json } from "@/infrastructure/db/types/database"
import type { StoryMemoryIndexProject } from "@/modules/story-memory/domain/types"

export const dynamic = "force-dynamic"

const jobRequestSchema = z
  .object({
    projectId: z.string().uuid().optional(),
  })
  .strict()

function receiverFromEnv(): Receiver | null {
  const currentSigningKey = process.env.QSTASH_CURRENT_SIGNING_KEY
  const nextSigningKey = process.env.QSTASH_NEXT_SIGNING_KEY
  if (!currentSigningKey || !nextSigningKey) return null
  return new Receiver({ currentSigningKey, nextSigningKey })
}

async function verifyJobRequest(req: NextRequest, rawBody: string): Promise<boolean> {
  const secret = process.env.STORY_MEMORY_JOB_SECRET || process.env.AI_BATCH_JOB_SECRET
  if (requestHasSecret(req, secret, "x-story-memory-job-secret")) return true
  if (requestHasInternalApiSecret(req)) return true

  const receiver = receiverFromEnv()
  const url = getStoryMemoryJobUrl()
  const signature = req.headers.get("upstash-signature")
  if (!receiver || !url || !signature) return false

  try {
    return await receiver.verify({ signature, body: rawBody, url })
  } catch {
    return false
  }
}

async function claimStoryMemoryJob(admin: ReturnType<typeof createAdminClient>, projectId?: string) {
  const { data, error } = await admin.rpc("claim_story_memory_job", {
    p_project_id: projectId ?? null,
  })
  if (error) throw new Error(error.message)
  return data as {
    status: "claimed" | "none"
    memoryStatus?: { project_id: string; user_id: string; org_id: string; content_hash: string }
    project?: StoryMemoryIndexProject
  }
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const verified = await verifyJobRequest(req, rawBody)
  if (!verified) {
    return NextResponse.json({ error: "Invalid story memory job signature" }, { status: 401 })
  }

  let rawPayload: unknown = {}
  if (rawBody.trim()) {
    try {
      rawPayload = JSON.parse(rawBody)
    } catch {
      return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 })
    }
  }

  const parsed = jobRequestSchema.safeParse(rawPayload)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid job payload" }, { status: 400 })
  }

  const admin = createAdminClient()
  const claimed = await claimStoryMemoryJob(admin, parsed.data.projectId)
  if (claimed.status === "none" || !claimed.project || !claimed.memoryStatus) {
    return NextResponse.json({ ok: true, skipped: "no_claimable_job" })
  }

  const project = claimed.project
  try {
    const result = await indexProjectStoryMemory({ admin, project })
    await completeStoryMemoryJob({
      admin,
      projectId: project.id,
      contentHash: result.contentHash,
      metadata: {
        chunkCount: result.chunkCount,
        tokenCount: result.tokenCount,
      } as Record<string, Json>,
    })

    void logBusinessEvent(req, {
      eventType: "story_memory.completed",
      userId: project.user_id,
      outcome: "success",
      metadata: {
        projectId: project.id,
        orgId: project.org_id,
        chunkCount: result.chunkCount,
        tokenCount: result.tokenCount,
      },
    }).catch(() => {})

    return NextResponse.json({ ok: true, projectId: project.id, chunkCount: result.chunkCount })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Story memory indexing failed"
    await failStoryMemoryJob({ admin, projectId: project.id, error: message })
    void logBusinessEvent(req, {
      eventType: "story_memory.failed",
      userId: project.user_id,
      outcome: "failure",
      metadata: { projectId: project.id, orgId: project.org_id, error: message.slice(0, 500) },
    }).catch(() => {})
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

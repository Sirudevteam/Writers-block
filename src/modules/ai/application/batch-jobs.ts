import crypto from "crypto"
import { Client } from "@upstash/qstash"
import { z } from "zod"

let client: Client | null | undefined

const AI_BATCH_ENDPOINTS = [
  "movie-references",
  "background-references",
  "bulk-formatting",
  "long-rewrite",
  "rewrite-style",
  "improve-dialogue",
  "generate-next",
] as const

export const aiBatchJobPayloadSchema = z
  .object({
    endpoint: z.enum(AI_BATCH_ENDPOINTS),
    projectId: z.string().uuid().optional().nullable(),
    payload: z.record(z.string(), z.unknown()).default({}),
  })
  .strict()

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

export function getAiBatchJobUrl(): string | null {
  const base = getPublicBaseUrl()
  return base ? `${base}/api/jobs/ai-batch` : null
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))
  return `{${entries.map(([key, val]) => `${JSON.stringify(key)}:${stableJson(val)}`).join(",")}}`
}

export function hashAiBatchRequest(userId: string, endpoint: string, projectId: string | null, payload: unknown): string {
  return crypto
    .createHash("sha256")
    .update(stableJson({ userId, endpoint, projectId, payload }))
    .digest("hex")
}

export async function enqueueAiBatchJob(jobId: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  const qstash = getQstashClient()
  const url = getAiBatchJobUrl()
  if (!qstash || !url || !process.env.QSTASH_CURRENT_SIGNING_KEY || !process.env.QSTASH_NEXT_SIGNING_KEY) {
    return { ok: false, reason: "QStash is not configured" }
  }

  await qstash.publishJSON({
    url,
    body: { jobId },
    retries: 5,
    retryDelay: "min(60000, pow(2, retried) * 1000)",
    contentBasedDeduplication: true,
  })

  return { ok: true }
}

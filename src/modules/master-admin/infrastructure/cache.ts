import { getUpstashRedis } from "@/infrastructure/cache/upstash-redis"

const PREFIX = "cache:master-admin:v1"
const TTL_SEC = 30

function keyFor(parts: string[]) {
  return [PREFIX, ...parts.map((p) => p.replace(/[^a-zA-Z0-9:._?=&/-]/g, "_").slice(0, 240))].join(":")
}

async function getCachedMasterAdminJson<T>(parts: string[]): Promise<T | null> {
  const redis = getUpstashRedis()
  if (!redis) return null
  const raw = await redis.get<string>(keyFor(parts))
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

async function setCachedMasterAdminJson(parts: string[], value: unknown): Promise<void> {
  const redis = getUpstashRedis()
  if (!redis) return
  await redis.set(keyFor(parts), JSON.stringify(value), { ex: TTL_SEC })
}

export async function withMasterAdminCache<T>(
  parts: string[],
  load: () => Promise<T>
): Promise<T> {
  try {
    const cached = await getCachedMasterAdminJson<T>(parts)
    if (cached) return cached
  } catch (e) {
    console.warn("[master-admin-cache] read failed:", e instanceof Error ? e.message : String(e))
  }

  const value = await load()

  try {
    await setCachedMasterAdminJson(parts, value)
  } catch (e) {
    console.warn("[master-admin-cache] write failed:", e instanceof Error ? e.message : String(e))
  }

  return value
}

import { getUpstashRedis } from "@/infrastructure/cache/upstash-redis"

const PREFIX = "cache:sub:v1"
const NONE_SENTINEL = "__none__"
const TTL_SEC = 60

function cacheKey(userId: string) {
  return `${PREFIX}:${userId}`
}

type CachedSubscriptionEntitlement = { plan: string; status: string }
type SubscriptionCacheLookup = CachedSubscriptionEntitlement | null | "miss"

/**
 * After middleware session refresh, `getSession` + this cache can avoid repeated
 * `subscriptions` reads for AI routes (60s TTL; invalidated on successful payment).
 */
export async function getCachedSubscriptionEntitlement(
  userId: string
): Promise<SubscriptionCacheLookup> {
  const r = getUpstashRedis()
  if (!r) return "miss"

  const raw = await r.get<string>(cacheKey(userId))
  if (raw === null) return "miss"
  if (raw === NONE_SENTINEL) return null
  try {
    return JSON.parse(raw) as CachedSubscriptionEntitlement
  } catch {
    return "miss"
  }
}

export async function setCachedSubscriptionEntitlement(
  userId: string,
  row: { plan: string; status: string } | null
): Promise<void> {
  const r = getUpstashRedis()
  if (!r) return
  if (row == null) {
    await r.set(cacheKey(userId), NONE_SENTINEL, { ex: TTL_SEC })
  } else {
    await r.set(cacheKey(userId), JSON.stringify({ plan: row.plan, status: row.status }), { ex: TTL_SEC })
  }
}

export async function invalidateSubscriptionPlanCache(userId: string): Promise<void> {
  const r = getUpstashRedis()
  if (!r) return
  await r.del(cacheKey(userId))
}

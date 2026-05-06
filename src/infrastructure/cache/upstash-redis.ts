import { Redis } from "@upstash/redis"

let client: Redis | null | undefined

/**
 * Single Upstash REST client for rate limiting, subscription plan cache, etc.
 * Returns null when env is not set (e.g. local dev without Redis).
 */
export function getUpstashRedis(): Redis | null {
  if (client !== undefined) {
    return client
  }
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) {
    client = null
    return client
  }
  client = new Redis({ url, token })
  return client
}

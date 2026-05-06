import { createHash, timingSafeEqual } from "node:crypto"
import type { NextRequest } from "next/server"

function secretDigest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest()
}

export function constantTimeSecretEquals(actual: string | null | undefined, expected: string | null | undefined): boolean {
  if (!actual || !expected) return false
  return timingSafeEqual(secretDigest(actual), secretDigest(expected))
}

export function bearerTokenFromRequest(req: NextRequest): string | null {
  const header = req.headers.get("authorization")
  if (!header) return null
  const match = /^Bearer\s+(.+)$/i.exec(header)
  return match?.[1]?.trim() || null
}

export function requestHasSecret(req: NextRequest, secret: string | undefined, headerName: string): boolean {
  if (!secret) return false
  return (
    constantTimeSecretEquals(bearerTokenFromRequest(req), secret) ||
    constantTimeSecretEquals(req.headers.get(headerName), secret)
  )
}

export function requestHasInternalApiSecret(req: NextRequest): boolean {
  return requestHasSecret(req, process.env.INTERNAL_API_SECRET, "x-internal-api-secret")
}

import type { NextRequest } from "next/server"
import { createServiceRoleSupabase } from "@/modules/master-admin/security/admin-privileges"

async function sha256HexPrefix(input: string, maxLen: number): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input))
  const hex = Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
  return hex.slice(0, maxLen)
}

function clientIpFromRequest(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    request.headers.get("cf-connecting-ip") ||
    "anonymous"
  )
}

/**
 * Fire-and-forget audit row after a successful Master Admin gate (middleware).
 * Uses Web Crypto (Edge-safe). Skips if service role is unavailable.
 */
export async function logMasterAdminAuditFromRequest(
  request: NextRequest,
  userId: string
): Promise<void> {
  const admin = createServiceRoleSupabase()
  if (!admin) return

  const pathname = request.nextUrl.pathname
  const search = request.nextUrl.search
  const route = `${pathname}${search}`.slice(0, 2048)
  const host = request.headers.get("host")?.slice(0, 255) ?? null
  const ip = clientIpFromRequest(request)
  const ipHash =
    ip && ip !== "anonymous" ? await sha256HexPrefix(ip, 48) : null

  const row = {
    user_id: userId,
    method: request.method.slice(0, 16),
    route,
    host,
    ip_hash: ipHash,
  }

  await (admin as any).schema("master_admin").from("audit_log").insert(row)
}

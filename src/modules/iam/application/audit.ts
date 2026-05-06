import type { NextRequest } from "next/server"
import { createServiceRoleSupabase } from "@/modules/master-admin/security/admin-privileges"
import type { Database } from "@/infrastructure/db/types/database"

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

export async function logIamAudit(
  req: NextRequest,
  params: {
    actorUserId: string
    orgId: string | null
    action: string
    targetType: string
    targetId: string
    metadata?: Record<string, unknown>
  }
): Promise<void> {
  const admin = createServiceRoleSupabase()
  if (!admin) return

  const ip = clientIpFromRequest(req)
  const ipHash = ip && ip !== "anonymous" ? await sha256HexPrefix(ip, 48) : null

  const row: Database["public"]["Tables"]["iam_audit_log"]["Insert"] = {
    actor_user_id: params.actorUserId,
    org_id: params.orgId,
    action: params.action.slice(0, 120),
    target_type: params.targetType.slice(0, 80),
    target_id: params.targetId.slice(0, 200),
    ip_hash: ipHash,
    metadata: (params.metadata ?? {}) as any,
  }

  await (admin.from("iam_audit_log") as any).insert(row)
}

import { createHash, randomUUID, timingSafeEqual } from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"

export type ScimAuthResult =
  | { ok: true; orgId: string }
  | { ok: false; status: 401 | 403 | 404; error: string }

export function hashScimToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex")
}

export function generateScimToken(): string {
  return `wb_scim_${randomUUID().replace(/-/g, "")}${randomUUID().replace(/-/g, "")}`
}

function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, "hex")
  const right = Buffer.from(b, "hex")
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

export function bearerTokenFromHeader(value: string | null): string | null {
  if (!value) return null
  const match = /^Bearer\s+(.+)$/i.exec(value.trim())
  return match?.[1]?.trim() || null
}

export async function validateScimBearer(
  supabase: SupabaseClient<any>,
  orgId: string,
  authorizationHeader: string | null
): Promise<ScimAuthResult> {
  const bearer = bearerTokenFromHeader(authorizationHeader)
  if (!bearer) {
    return { ok: false, status: 401, error: "Missing SCIM bearer token" }
  }

  const { data, error } = await supabase
    .from("organization_security_policies")
    .select("org_id, scim_enabled, scim_token_hash")
    .eq("org_id", orgId)
    .maybeSingle()

  if (error) {
    return { ok: false, status: 403, error: "SCIM policy lookup failed" }
  }
  if (!data) {
    return { ok: false, status: 404, error: "SCIM organization not found" }
  }
  if (!data.scim_enabled || !data.scim_token_hash) {
    return { ok: false, status: 403, error: "SCIM is not enabled for this organization" }
  }

  const incomingHash = hashScimToken(bearer)
  if (!constantTimeEquals(incomingHash, data.scim_token_hash)) {
    return { ok: false, status: 401, error: "Invalid SCIM bearer token" }
  }

  return { ok: true, orgId }
}

export function scimUserResponse(row: any) {
  return {
    schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
    id: row.id,
    externalId: row.external_id ?? undefined,
    userName: row.user_name,
    displayName: row.display_name ?? row.user_name,
    active: Boolean(row.active),
    meta: {
      resourceType: "User",
      created: row.created_at,
      lastModified: row.updated_at,
    },
  }
}

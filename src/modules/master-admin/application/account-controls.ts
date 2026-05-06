import type { NextRequest } from "next/server"
import { createServiceRoleSupabase } from "@/modules/master-admin/security/admin-privileges"
import { logSecurityEvent } from "@/modules/master-admin/application/events"
import type { Database } from "@/infrastructure/db/types/database"

type AccountControlStatus =
  Database["master_admin"]["Tables"]["user_account_controls"]["Row"]["status"]
type UserAccountControlRow =
  Database["master_admin"]["Tables"]["user_account_controls"]["Row"]
type UserNoteRow = Database["master_admin"]["Tables"]["user_notes"]["Row"]

function masterAdminSchema(admin: ReturnType<typeof createServiceRoleSupabase>) {
  return (admin as any).schema("master_admin")
}

function parseJwtIat(accessToken: string | undefined | null): number | null {
  if (!accessToken || !accessToken.includes(".")) return null
  try {
    const payload = accessToken.split(".")[1]
    if (!payload) return null
    const b64 = payload.replace(/-/g, "+").replace(/_/g, "/")
    const pad = (4 - (b64.length % 4)) % 4
    const json = JSON.parse(atob(b64 + "=".repeat(pad))) as { iat?: unknown }
    return typeof json.iat === "number" ? json.iat : null
  } catch {
    return null
  }
}

async function getUserAccountControl(
  userId: string
): Promise<UserAccountControlRow | null> {
  const admin = createServiceRoleSupabase()
  if (!admin) return null
  const { data, error } = await masterAdminSchema(admin)
    .from("user_account_controls")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return (data ?? null) as UserAccountControlRow | null
}

export async function assertUserAccountAccess(
  userId: string,
  accessToken?: string | null
): Promise<{ ok: true } | { ok: false; code: "account_suspended" | "session_revoked"; message: string }> {
  const control = await getUserAccountControl(userId)
  if (!control) return { ok: true }

  if (control.status === "suspended") {
    return {
      ok: false,
      code: "account_suspended",
      message: "This account is suspended. Contact support if you believe this is a mistake.",
    }
  }

  if (control.revoked_sessions_at) {
    const iat = parseJwtIat(accessToken)
    const revokedAtSeconds = Math.floor(new Date(control.revoked_sessions_at).getTime() / 1000)
    if (!iat || iat < revokedAtSeconds) {
      return {
        ok: false,
        code: "session_revoked",
        message: "Your session has expired. Please sign in again.",
      }
    }
  }

  return { ok: true }
}

export async function setUserAccountControl(
  req: NextRequest,
  params: {
    targetUserId: string
    actorUserId: string
    status: AccountControlStatus
    reason?: string | null
    note?: string | null
    revokeSessions?: boolean
  }
): Promise<UserAccountControlRow> {
  const admin = createServiceRoleSupabase()
  if (!admin) throw new Error("Service role is not configured")

  const now = new Date().toISOString()
  const row: Database["master_admin"]["Tables"]["user_account_controls"]["Insert"] = {
    user_id: params.targetUserId,
    status: params.status,
    reason: params.reason?.trim().slice(0, 200) || null,
    note: params.note?.trim().slice(0, 2000) || null,
    actor_user_id: params.actorUserId,
    suspended_at: params.status === "suspended" ? now : null,
    reinstated_at: params.status === "active" ? now : null,
    revoked_sessions_at: params.revokeSessions ? now : undefined,
  }

  const { data, error } = await masterAdminSchema(admin)
    .from("user_account_controls")
    .upsert(row, { onConflict: "user_id" })
    .select("*")
    .single()
  if (error) throw new Error(error.message)

  void logSecurityEvent(req, {
    eventType:
      params.status === "suspended"
        ? "account.suspended"
        : params.revokeSessions
          ? "account.sessions_revoked"
          : "account.status_updated",
    severity: params.status === "suspended" ? "high" : "medium",
    outcome: "success",
    actorUserId: params.actorUserId,
    targetUserId: params.targetUserId,
    metadata: {
      status: params.status,
      reason: row.reason,
      revokeSessions: Boolean(params.revokeSessions),
    },
  }).catch(() => {})

  return data as UserAccountControlRow
}

export async function createUserNote(
  req: NextRequest,
  params: {
    targetUserId: string
    authorUserId: string
    note: string
  }
): Promise<UserNoteRow> {
  const admin = createServiceRoleSupabase()
  if (!admin) throw new Error("Service role is not configured")

  const { data, error } = await masterAdminSchema(admin)
    .from("user_notes")
    .insert({
      target_user_id: params.targetUserId,
      author_user_id: params.authorUserId,
      note: params.note.trim().slice(0, 2000),
    })
    .select("*")
    .single()
  if (error) throw new Error(error.message)

  void logSecurityEvent(req, {
    eventType: "account.note_created",
    severity: "low",
    outcome: "success",
    actorUserId: params.authorUserId,
    targetUserId: params.targetUserId,
  }).catch(() => {})

  return data as UserNoteRow
}

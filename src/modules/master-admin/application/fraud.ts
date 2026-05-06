import type { SupabaseClient } from "@supabase/supabase-js"
import type { NextRequest } from "next/server"
import type { Database } from "@/infrastructure/db/types/database"
import { getClientIP } from "@/core/security/rate-limit"

type SignupRiskLevel = "low" | "medium" | "high"
type SignupRiskReviewStatus =
  | "not_required"
  | "open"
  | "reviewed_safe"
  | "confirmed_abuse"

type SignupRiskReason =
  | "same_ip_24h"
  | "same_ip_device_24h"
  | "same_ip_7d"
  | "same_ip_email_domain_7d"

type SignupRiskReasonDetail = {
  code: SignupRiskReason
  message: string
  count: number
  window: "24h" | "7d"
}

type SignupRiskEventRow = Database["master_admin"]["Tables"]["signup_risk_events"]["Row"]

type SignupRiskContext = {
  sameIp24h: number
  sameIpDevice24h: number
  sameIp7d: number
  sameIpEmailDomain7d: number
}

type SignupRiskScore = {
  score: number
  level: SignupRiskLevel
  reviewStatus: SignupRiskReviewStatus
  reasons: SignupRiskReasonDetail[]
}

function masterAdminSchema(admin: SupabaseClient<Database>) {
  return (admin as any).schema("master_admin")
}

function emailDomain(email: string): string {
  return email.split("@").at(-1)?.trim().toLowerCase().slice(0, 120) || "unknown"
}

function riskLevel(score: number): SignupRiskLevel {
  if (score >= 60) return "high"
  if (score >= 40) return "medium"
  return "low"
}

function scoreSignupRisk(ctx: SignupRiskContext): SignupRiskScore {
  const reasons: SignupRiskReasonDetail[] = []
  let score = 0

  if (ctx.sameIp24h >= 3) {
    score += 45
    reasons.push({
      code: "same_ip_24h",
      message: `${ctx.sameIp24h} signups from this hashed IP in 24h`,
      count: ctx.sameIp24h,
      window: "24h",
    })
  }

  if (ctx.sameIpDevice24h >= 2) {
    score += 45
    reasons.push({
      code: "same_ip_device_24h",
      message: `${ctx.sameIpDevice24h} signups from the same hashed IP and device in 24h`,
      count: ctx.sameIpDevice24h,
      window: "24h",
    })
  }

  if (ctx.sameIp7d >= 5) {
    score += 45
    reasons.push({
      code: "same_ip_7d",
      message: `${ctx.sameIp7d} signups from this hashed IP in 7d`,
      count: ctx.sameIp7d,
      window: "7d",
    })
  }

  if (ctx.sameIpEmailDomain7d >= 3) {
    score += 40
    reasons.push({
      code: "same_ip_email_domain_7d",
      message: `${ctx.sameIpEmailDomain7d} signups using this email domain from the same hashed IP in 7d`,
      count: ctx.sameIpEmailDomain7d,
      window: "7d",
    })
  }

  const boundedScore = Math.min(100, score)
  const level = riskLevel(boundedScore)
  return {
    score: boundedScore,
    level,
    reviewStatus: boundedScore >= 40 ? "open" : "not_required",
    reasons,
  }
}

function getHashSecret(): string | null {
  const secret = process.env.FRAUD_SIGNAL_HASH_SECRET?.trim()
  return secret && secret.length >= 16 ? secret : null
}

async function hmacSha256Hex(secret: string, namespace: string, value: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  )
  const signature = await crypto.subtle.sign("HMAC", key, enc.encode(`${namespace}:${value}`))
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

async function hashSignal(namespace: string, value: string | null): Promise<string | null> {
  if (!value) return null
  const secret = getHashSecret()
  if (!secret) return null
  return hmacSha256Hex(secret, namespace, value)
}

function countryFromRequest(request: NextRequest): string | null {
  const country = request.headers.get("cf-ipcountry")?.trim().toUpperCase()
  return country && /^[A-Z]{2}$/.test(country) ? country : null
}

async function promoteRelatedEvents(
  admin: SupabaseClient<Database>,
  relatedRows: SignupRiskEventRow[],
  score: SignupRiskScore
) {
  if (score.score < 40 || relatedRows.length === 0) return

  const reasonJson = score.reasons as unknown as Database["public"]["Tables"]["iam_audit_log"]["Insert"]["metadata"]
  const updates = relatedRows
    .filter((row) => row.review_status === "not_required" && row.risk_score < 40)
    .map((row) =>
      masterAdminSchema(admin)
        .from("signup_risk_events")
        .update({
          risk_score: Math.max(40, Math.min(score.score, 60)),
          risk_level: "medium",
          risk_reasons: reasonJson,
          review_status: "open",
        })
        .eq("id", row.id)
    )

  const results = await Promise.all(updates)
  for (const result of results) {
    if (result.error) throw new Error(result.error.message)
  }
}

export async function recordSignupRiskEvent(
  admin: SupabaseClient<Database>,
  request: NextRequest,
  userId: string,
  email: string
): Promise<void> {
  if (!getHashSecret()) {
    console.warn("[fraud] FRAUD_SIGNAL_HASH_SECRET is missing or too short; signup risk event skipped")
    return
  }

  const now = new Date()
  const from24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
  const from7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const ip = getClientIP(request)
  const userAgent = request.headers.get("user-agent")?.trim().slice(0, 500) || null
  const ipHash = ip && ip !== "anonymous" ? await hashSignal("ip", ip) : null
  const userAgentHash = userAgent ? await hashSignal("ua", userAgent) : null
  const domain = emailDomain(email)

  let relatedRows: SignupRiskEventRow[] = []
  if (ipHash) {
    const { data, error } = await masterAdminSchema(admin)
      .from("signup_risk_events")
      .select("*")
      .eq("ip_hash", ipHash)
      .gte("created_at", from7d)
      .order("created_at", { ascending: false })
      .limit(200)

    if (error) throw new Error(error.message)
    relatedRows = (data ?? []) as SignupRiskEventRow[]
  }

  const sameIp24h = ipHash ? relatedRows.filter((r) => r.created_at >= from24h).length + 1 : 0
  const sameIpDevice24h =
    ipHash && userAgentHash
      ? relatedRows.filter((r) => r.created_at >= from24h && r.user_agent_hash === userAgentHash).length + 1
      : 0
  const sameIp7d = ipHash ? relatedRows.length + 1 : 0
  const sameIpEmailDomain7d = ipHash
    ? relatedRows.filter((r) => r.email_domain === domain).length + 1
    : 0

  const risk = scoreSignupRisk({
    sameIp24h,
    sameIpDevice24h,
    sameIp7d,
    sameIpEmailDomain7d,
  })

  const riskReasons = risk.reasons as unknown as Database["public"]["Tables"]["iam_audit_log"]["Insert"]["metadata"]

  const { error } = await masterAdminSchema(admin)
    .from("signup_risk_events")
    .upsert(
      {
        user_id: userId,
        email_domain: domain,
        ip_hash: ipHash,
        user_agent_hash: userAgentHash,
        country: countryFromRequest(request),
        risk_score: risk.score,
        risk_level: risk.level,
        risk_reasons: riskReasons,
        review_status: risk.reviewStatus,
      },
      { onConflict: "user_id" }
    )

  if (error) throw new Error(error.message)
  await promoteRelatedEvents(admin, relatedRows, risk)
}

export async function markSignupRiskVerified(
  admin: SupabaseClient<Database>,
  userId: string
): Promise<void> {
  const { error } = await masterAdminSchema(admin)
    .from("signup_risk_events")
    .update({ verified_at: new Date().toISOString() })
    .eq("user_id", userId)

  if (error) throw new Error(error.message)
}

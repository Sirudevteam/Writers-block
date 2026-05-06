import type { NextRequest } from "next/server"
import { createServiceRoleSupabase } from "@/modules/master-admin/security/admin-privileges"
import type { Database, Json } from "@/infrastructure/db/types/database"

type SecurityEventSeverity = Database["master_admin"]["Tables"]["security_events"]["Row"]["severity"]
type SecurityEventOutcome = Database["master_admin"]["Tables"]["security_events"]["Row"]["outcome"]
type SecurityEventReviewStatus = Database["master_admin"]["Tables"]["security_events"]["Row"]["review_status"]
type BusinessEventOutcome = Database["master_admin"]["Tables"]["business_events"]["Row"]["outcome"]

type RequestSignals = {
  method: string | null
  route: string | null
  ipHash: string | null
  userAgentHash: string | null
  country: string | null
}

function masterAdminSchema(admin: ReturnType<typeof createServiceRoleSupabase>) {
  return (admin as any).schema("master_admin")
}

function hashSecret(): string | null {
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
  const secret = hashSecret()
  if (!secret) return null
  return hmacSha256Hex(secret, namespace, value)
}

function clientIpFromRequest(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    req.headers.get("cf-connecting-ip") ||
    "anonymous"
  )
}

async function signalsFromRequest(req?: NextRequest): Promise<RequestSignals> {
  if (!req) {
    return { method: null, route: null, ipHash: null, userAgentHash: null, country: null }
  }

  const ip = clientIpFromRequest(req)
  const userAgent = req.headers.get("user-agent")?.trim().slice(0, 500) || null
  const pathname = req.nextUrl?.pathname ?? new URL(req.url).pathname
  const search = req.nextUrl?.search ?? new URL(req.url).search

  return {
    method: req.method.slice(0, 16),
    route: `${pathname}${search}`.slice(0, 2048),
    ipHash: ip && ip !== "anonymous" ? await hashSignal("ip", ip) : null,
    userAgentHash: await hashSignal("ua", userAgent),
    country: req.headers.get("cf-ipcountry")?.trim().toUpperCase().slice(0, 2) || null,
  }
}

function defaultSecurityReviewStatus(
  severity: SecurityEventSeverity,
  outcome: SecurityEventOutcome
): SecurityEventReviewStatus {
  if (severity === "high" || severity === "critical" || outcome === "blocked") return "open"
  return "not_required"
}

export async function logSecurityEvent(
  req: NextRequest | undefined,
  params: {
    eventType: string
    severity?: SecurityEventSeverity
    outcome?: SecurityEventOutcome
    actorUserId?: string | null
    targetUserId?: string | null
    statusCode?: number | null
    reviewStatus?: SecurityEventReviewStatus
    metadata?: Record<string, unknown>
  }
): Promise<void> {
  const admin = createServiceRoleSupabase()
  if (!admin) return

  const severity = params.severity ?? "low"
  const outcome = params.outcome ?? "info"
  const signals = await signalsFromRequest(req)

  const row: Database["master_admin"]["Tables"]["security_events"]["Insert"] = {
    event_type: params.eventType.slice(0, 160),
    severity,
    outcome,
    review_status: params.reviewStatus ?? defaultSecurityReviewStatus(severity, outcome),
    actor_user_id: params.actorUserId ?? null,
    target_user_id: params.targetUserId ?? null,
    method: signals.method,
    route: signals.route,
    status_code: params.statusCode ?? null,
    ip_hash: signals.ipHash,
    user_agent_hash: signals.userAgentHash,
    country: signals.country,
    metadata: (params.metadata ?? {}) as Json,
  }

  const { error } = await masterAdminSchema(admin).from("security_events").insert(row)
  if (error) throw new Error(error.message)
}

export async function logBusinessEvent(
  req: NextRequest | undefined,
  params: {
    eventType: string
    userId?: string | null
    outcome?: BusinessEventOutcome
    plan?: string | null
    billingCycle?: string | null
    amountPaise?: number | null
    metadata?: Record<string, unknown>
  }
): Promise<void> {
  const admin = createServiceRoleSupabase()
  if (!admin) return

  const signals = await signalsFromRequest(req)
  const row: Database["master_admin"]["Tables"]["business_events"]["Insert"] = {
    event_type: params.eventType.slice(0, 160),
    user_id: params.userId ?? null,
    outcome: params.outcome ?? "success",
    plan: params.plan ?? null,
    billing_cycle: params.billingCycle ?? null,
    amount_paise: params.amountPaise ?? null,
    route: signals.route,
    ip_hash: signals.ipHash,
    user_agent_hash: signals.userAgentHash,
    country: signals.country,
    metadata: (params.metadata ?? {}) as Json,
  }

  const { error } = await masterAdminSchema(admin).from("business_events").insert(row)
  if (error) throw new Error(error.message)
}

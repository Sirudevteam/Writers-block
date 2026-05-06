import type { SupabaseClient } from "@supabase/supabase-js"
import type {
  AiCreditReservationRow,
  AiCreditTopupPurchase,
  Database,
  PdfExportPurchase,
  RazorpayPayment,
} from "@/infrastructure/db/types/database"
import { MASTER_ADMIN_EXPORT_MAX_ROWS, MASTER_ADMIN_PAGE_SIZE } from "@/modules/master-admin/domain/date-range"
import { getRazorpayOrderAmountPaise, isPaidPlan } from "@/modules/billing/domain/razorpay-pricing"
import type { BillingCycle } from "@/shared/types/project"

type AdminProfileRow = Database["public"]["Tables"]["profiles"]["Row"]
type AdminSubscriptionRow = Database["public"]["Tables"]["subscriptions"]["Row"]
type MasterAdminUserRow = Database["master_admin"]["Tables"]["users"]["Row"]
type SignupRiskEventRow = Database["master_admin"]["Tables"]["signup_risk_events"]["Row"]
type SecurityEventRow = Database["master_admin"]["Tables"]["security_events"]["Row"]
type BusinessEventRow = Database["master_admin"]["Tables"]["business_events"]["Row"]
type UserAccountControlRow = Database["master_admin"]["Tables"]["user_account_controls"]["Row"]
type UserNoteRow = Database["master_admin"]["Tables"]["user_notes"]["Row"]

type SignupRiskLevel = SignupRiskEventRow["risk_level"]
type SignupRiskReviewStatus = SignupRiskEventRow["review_status"]
type SignupRiskEventWithUser = SignupRiskEventRow & {
  user_email: string | null
  user_full_name: string | null
}
type SignupRiskFilters = {
  reviewStatus?: SignupRiskReviewStatus
  riskLevel?: SignupRiskLevel
  ipHash?: string
}
type SecurityEventWithUsers = SecurityEventRow & {
  actor_email: string | null
  target_email: string | null
}
type BusinessEventWithUser = BusinessEventRow & {
  user_email: string | null
}
type SecurityEventFilters = {
  eventType?: string
  severity?: SecurityEventRow["severity"]
  outcome?: SecurityEventRow["outcome"]
  reviewStatus?: SecurityEventRow["review_status"]
  actorUserId?: string
  targetUserId?: string
}

type ProfileWithSubscription = AdminProfileRow & {
  subscription: Pick<
    AdminSubscriptionRow,
    "plan" | "status" | "billing_cycle" | "updated_at"
  > | null
}

function masterAdminSchema(admin: SupabaseClient<Database>) {
  return (admin as any).schema("master_admin")
}

/** Operator auth user ids (platform admins); excluded from customer-facing lists/metrics. */
export async function fetchMasterAdminUserIds(admin: SupabaseClient<Database>): Promise<string[]> {
  const { data, error } = await masterAdminSchema(admin).from("users").select("user_id")
  if (error) throw new Error(error.message)
  return ((data ?? []) as Pick<MasterAdminUserRow, "user_id">[]).map((r) => r.user_id)
}

/** PostgREST `not.in` parenthesized list for UUIDs */
export function notInTuple(ids: string[]): string | null {
  if (ids.length === 0) return null
  return `(${ids.join(",")})`
}

const SIGNUP_RISK_LEVELS = new Set<SignupRiskLevel>(["low", "medium", "high"])
const SIGNUP_RISK_REVIEW_STATUSES = new Set<SignupRiskReviewStatus>([
  "not_required",
  "open",
  "reviewed_safe",
  "confirmed_abuse",
])
const SECURITY_SEVERITIES = new Set<SecurityEventRow["severity"]>(["low", "medium", "high", "critical"])
const SECURITY_OUTCOMES = new Set<SecurityEventRow["outcome"]>(["success", "failure", "blocked", "info"])
const SECURITY_REVIEW_STATUSES = new Set<SecurityEventRow["review_status"]>([
  "not_required",
  "open",
  "acknowledged",
  "resolved",
  "ignored",
])
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function parseSignupRiskLevel(raw: unknown): SignupRiskLevel | undefined {
  return typeof raw === "string" && SIGNUP_RISK_LEVELS.has(raw as SignupRiskLevel)
    ? (raw as SignupRiskLevel)
    : undefined
}

export function parseSignupRiskReviewStatus(raw: unknown): SignupRiskReviewStatus | undefined {
  return typeof raw === "string" && SIGNUP_RISK_REVIEW_STATUSES.has(raw as SignupRiskReviewStatus)
    ? (raw as SignupRiskReviewStatus)
    : undefined
}

export function parseSignupRiskIpHash(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined
  const v = raw.trim().toLowerCase()
  return /^[a-f0-9]{32,128}$/.test(v) ? v.slice(0, 128) : undefined
}

export function parseSecuritySeverity(raw: unknown): SecurityEventRow["severity"] | undefined {
  return typeof raw === "string" && SECURITY_SEVERITIES.has(raw as SecurityEventRow["severity"])
    ? (raw as SecurityEventRow["severity"])
    : undefined
}

export function parseSecurityOutcome(raw: unknown): SecurityEventRow["outcome"] | undefined {
  return typeof raw === "string" && SECURITY_OUTCOMES.has(raw as SecurityEventRow["outcome"])
    ? (raw as SecurityEventRow["outcome"])
    : undefined
}

export function parseSecurityReviewStatus(raw: unknown): SecurityEventRow["review_status"] | undefined {
  return typeof raw === "string" && SECURITY_REVIEW_STATUSES.has(raw as SecurityEventRow["review_status"])
    ? (raw as SecurityEventRow["review_status"])
    : undefined
}

export function parseSecurityEventType(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined
  const v = raw.trim().slice(0, 160)
  return /^[a-z0-9._:-]+$/i.test(v) ? v : undefined
}

export function parseUuid(raw: unknown): string | undefined {
  return typeof raw === "string" && UUID_RE.test(raw) ? raw : undefined
}

export async function fetchProfilesInRange(
  admin: SupabaseClient<Database>,
  fromIso: string,
  toIso: string,
  page: number,
  searchEmail?: string
): Promise<{ rows: ProfileWithSubscription[]; total: number }> {
  const start = (page - 1) * MASTER_ADMIN_PAGE_SIZE
  const end = start + MASTER_ADMIN_PAGE_SIZE - 1

  const excludeIds = await fetchMasterAdminUserIds(admin)
  const excludeTuple = notInTuple(excludeIds)

  let q = admin
    .from("profiles")
    .select("id, email, full_name, avatar_url, bio, created_at, updated_at", { count: "exact" })
    .gte("created_at", fromIso)
    .lte("created_at", toIso)

  if (excludeTuple) {
    q = q.not("id", "in", excludeTuple)
  }

  if (searchEmail && searchEmail.trim()) {
    const v = searchEmail.trim().slice(0, 120)
    q = q.ilike("email", `%${v}%`)
  }

  const { data: profiles, error, count } = await q.order("created_at", { ascending: false }).range(start, end)

  if (error) throw new Error(error.message)

  const ids = (profiles ?? []).map((p) => p.id)
  if (ids.length === 0) {
    return { rows: [], total: count ?? 0 }
  }

  const { data: subs, error: subErr } = await admin
    .from("subscriptions")
    .select("user_id, plan, status, billing_cycle, updated_at")
    .in("user_id", ids)

  if (subErr) throw new Error(subErr.message)

  const latestByUser = new Map<
    string,
    Pick<AdminSubscriptionRow, "plan" | "status" | "billing_cycle" | "updated_at">
  >()
  for (const s of subs ?? []) {
    const prev = latestByUser.get(s.user_id)
    if (!prev || new Date(s.updated_at).getTime() > new Date(prev.updated_at).getTime()) {
      latestByUser.set(s.user_id, {
        plan: s.plan,
        status: s.status,
        billing_cycle: s.billing_cycle,
        updated_at: s.updated_at,
      })
    }
  }

  const rows: ProfileWithSubscription[] = (profiles ?? []).map((p) => ({
    ...p,
    subscription: latestByUser.get(p.id) ?? null,
  }))

  return { rows, total: count ?? 0 }
}

function applySignupRiskFilters(query: any, filters?: SignupRiskFilters) {
  let q = query
  if (filters?.reviewStatus) {
    q = q.eq("review_status", filters.reviewStatus)
  }
  if (filters?.riskLevel) {
    q = q.eq("risk_level", filters.riskLevel)
  }
  if (filters?.ipHash) {
    q = q.eq("ip_hash", filters.ipHash)
  }
  return q
}

async function enrichSignupRiskRows(
  admin: SupabaseClient<Database>,
  rows: SignupRiskEventRow[]
): Promise<SignupRiskEventWithUser[]> {
  const ids = Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean)))
  const profiles = await profileSummariesForIds(admin, ids)
  return rows.map((r) => {
    const p = profiles.get(r.user_id)
    return {
      ...r,
      user_email: p?.email ?? null,
      user_full_name: p?.full_name ?? null,
    }
  })
}

export async function fetchSignupRiskEventsInRange(
  admin: SupabaseClient<Database>,
  fromIso: string,
  toIso: string,
  page: number,
  filters?: SignupRiskFilters
): Promise<{ rows: SignupRiskEventWithUser[]; total: number }> {
  const start = (page - 1) * MASTER_ADMIN_PAGE_SIZE
  const end = start + MASTER_ADMIN_PAGE_SIZE - 1

  const base = masterAdminSchema(admin)
    .from("signup_risk_events")
    .select("*", { count: "exact" })
    .gte("created_at", fromIso)
    .lte("created_at", toIso)

  const { data, error, count } = await applySignupRiskFilters(base, filters)
    .order("risk_score", { ascending: false })
    .order("created_at", { ascending: false })
    .range(start, end)

  if (error) throw new Error(error.message)
  const rows = await enrichSignupRiskRows(admin, (data ?? []) as SignupRiskEventRow[])
  return { rows, total: count ?? 0 }
}

async function countSignupRiskEvents(
  admin: SupabaseClient<Database>,
  fromIso: string,
  toIso: string,
  filters?: SignupRiskFilters
): Promise<number> {
  const base = masterAdminSchema(admin)
    .from("signup_risk_events")
    .select("id", { count: "exact", head: true })
    .gte("created_at", fromIso)
    .lte("created_at", toIso)
  const { count, error } = await applySignupRiskFilters(base, filters)
  if (error) throw new Error(error.message)
  return count ?? 0
}

export async function fetchSignupRiskSummary(
  admin: SupabaseClient<Database>,
  fromIso: string,
  toIso: string
): Promise<{ total: number; open: number; openHigh: number; openMedium: number }> {
  const [total, open, openHigh, openMedium] = await Promise.all([
    countSignupRiskEvents(admin, fromIso, toIso),
    countSignupRiskEvents(admin, fromIso, toIso, { reviewStatus: "open" }),
    countSignupRiskEvents(admin, fromIso, toIso, { reviewStatus: "open", riskLevel: "high" }),
    countSignupRiskEvents(admin, fromIso, toIso, { reviewStatus: "open", riskLevel: "medium" }),
  ])
  return { total, open, openHigh, openMedium }
}

export async function fetchSignupRiskExport(
  admin: SupabaseClient<Database>,
  fromIso: string,
  toIso: string,
  filters?: SignupRiskFilters
): Promise<SignupRiskEventWithUser[]> {
  const base = masterAdminSchema(admin)
    .from("signup_risk_events")
    .select("*")
    .gte("created_at", fromIso)
    .lte("created_at", toIso)

  const { data, error } = await applySignupRiskFilters(base, filters)
    .order("risk_score", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(MASTER_ADMIN_EXPORT_MAX_ROWS)

  if (error) throw new Error(error.message)
  return enrichSignupRiskRows(admin, (data ?? []) as SignupRiskEventRow[])
}

async function fetchSignupRiskCluster(
  admin: SupabaseClient<Database>,
  ipHash: string,
  limit = 25
): Promise<SignupRiskEventWithUser[]> {
  const { data, error } = await masterAdminSchema(admin)
    .from("signup_risk_events")
    .select("*")
    .eq("ip_hash", ipHash)
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(50, limit)))

  if (error) throw new Error(error.message)
  return enrichSignupRiskRows(admin, (data ?? []) as SignupRiskEventRow[])
}

export async function updateSignupRiskReview(
  admin: SupabaseClient<Database>,
  eventId: string,
  reviewerUserId: string,
  reviewStatus: SignupRiskReviewStatus,
  reviewNote: string | null
): Promise<SignupRiskEventWithUser | null> {
  const { data, error } = await masterAdminSchema(admin)
    .from("signup_risk_events")
    .update({
      review_status: reviewStatus,
      reviewed_by: reviewerUserId,
      reviewed_at: new Date().toISOString(),
      review_note: reviewNote,
    })
    .eq("id", eventId)
    .select("*")
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) return null
  const [row] = await enrichSignupRiskRows(admin, [data as SignupRiskEventRow])
  return row ?? null
}

function applySecurityEventFilters(query: any, filters?: SecurityEventFilters) {
  let q = query
  if (filters?.eventType) q = q.eq("event_type", filters.eventType)
  if (filters?.severity) q = q.eq("severity", filters.severity)
  if (filters?.outcome) q = q.eq("outcome", filters.outcome)
  if (filters?.reviewStatus) q = q.eq("review_status", filters.reviewStatus)
  if (filters?.actorUserId) q = q.eq("actor_user_id", filters.actorUserId)
  if (filters?.targetUserId) q = q.eq("target_user_id", filters.targetUserId)
  return q
}

async function enrichSecurityEventRows(
  admin: SupabaseClient<Database>,
  rows: SecurityEventRow[]
): Promise<SecurityEventWithUsers[]> {
  const ids = Array.from(
    new Set(rows.flatMap((r) => [r.actor_user_id, r.target_user_id]).filter(Boolean))
  ) as string[]
  const profiles = await profileSummariesForIds(admin, ids)
  return rows.map((r) => ({
    ...r,
    actor_email: r.actor_user_id ? profiles.get(r.actor_user_id)?.email ?? null : null,
    target_email: r.target_user_id ? profiles.get(r.target_user_id)?.email ?? null : null,
  }))
}

export async function fetchSecurityEventsInRange(
  admin: SupabaseClient<Database>,
  fromIso: string,
  toIso: string,
  page: number,
  filters?: SecurityEventFilters
): Promise<{ rows: SecurityEventWithUsers[]; total: number }> {
  const start = (page - 1) * MASTER_ADMIN_PAGE_SIZE
  const end = start + MASTER_ADMIN_PAGE_SIZE - 1
  const base = masterAdminSchema(admin)
    .from("security_events")
    .select("*", { count: "exact" })
    .gte("created_at", fromIso)
    .lte("created_at", toIso)

  const { data, error, count } = await applySecurityEventFilters(base, filters)
    .order("created_at", { ascending: false })
    .range(start, end)
  if (error) throw new Error(error.message)
  return {
    rows: await enrichSecurityEventRows(admin, (data ?? []) as SecurityEventRow[]),
    total: count ?? 0,
  }
}

export async function fetchSecurityEventsExport(
  admin: SupabaseClient<Database>,
  fromIso: string,
  toIso: string,
  filters?: SecurityEventFilters
): Promise<SecurityEventWithUsers[]> {
  const base = masterAdminSchema(admin)
    .from("security_events")
    .select("*")
    .gte("created_at", fromIso)
    .lte("created_at", toIso)

  const { data, error } = await applySecurityEventFilters(base, filters)
    .order("created_at", { ascending: false })
    .limit(MASTER_ADMIN_EXPORT_MAX_ROWS)
  if (error) throw new Error(error.message)
  return enrichSecurityEventRows(admin, (data ?? []) as SecurityEventRow[])
}

export async function updateSecurityEventReview(
  admin: SupabaseClient<Database>,
  eventId: string,
  reviewerUserId: string,
  reviewStatus: SecurityEventRow["review_status"],
  reviewNote: string | null
): Promise<SecurityEventWithUsers | null> {
  const { data, error } = await masterAdminSchema(admin)
    .from("security_events")
    .update({
      review_status: reviewStatus,
      reviewed_by: reviewerUserId,
      reviewed_at: new Date().toISOString(),
      review_note: reviewNote,
    })
    .eq("id", eventId)
    .select("*")
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null
  const [row] = await enrichSecurityEventRows(admin, [data as SecurityEventRow])
  return row ?? null
}

async function countSecurityEvents(
  admin: SupabaseClient<Database>,
  fromIso: string,
  toIso: string,
  filters?: SecurityEventFilters
): Promise<number> {
  const base = masterAdminSchema(admin)
    .from("security_events")
    .select("id", { count: "exact", head: true })
    .gte("created_at", fromIso)
    .lte("created_at", toIso)
  const { count, error } = await applySecurityEventFilters(base, filters)
  if (error) throw new Error(error.message)
  return count ?? 0
}

export async function fetchSecurityEventSummary(
  admin: SupabaseClient<Database>,
  fromIso: string,
  toIso: string
): Promise<{ total: number; open: number; blocked: number; failures: number; highOrCritical: number }> {
  const [total, open, blocked, failures, high, critical] = await Promise.all([
    countSecurityEvents(admin, fromIso, toIso),
    countSecurityEvents(admin, fromIso, toIso, { reviewStatus: "open" }),
    countSecurityEvents(admin, fromIso, toIso, { outcome: "blocked" }),
    countSecurityEvents(admin, fromIso, toIso, { outcome: "failure" }),
    countSecurityEvents(admin, fromIso, toIso, { severity: "high" }),
    countSecurityEvents(admin, fromIso, toIso, { severity: "critical" }),
  ])
  return { total, open, blocked, failures, highOrCritical: high + critical }
}

async function enrichBusinessEventRows(
  admin: SupabaseClient<Database>,
  rows: BusinessEventRow[]
): Promise<BusinessEventWithUser[]> {
  const ids = Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean))) as string[]
  const profiles = await profileSummariesForIds(admin, ids)
  return rows.map((r) => ({
    ...r,
    user_email: r.user_id ? profiles.get(r.user_id)?.email ?? null : null,
  }))
}

export async function fetchBusinessEventsInRange(
  admin: SupabaseClient<Database>,
  fromIso: string,
  toIso: string,
  page: number
): Promise<{ rows: BusinessEventWithUser[]; total: number }> {
  const start = (page - 1) * MASTER_ADMIN_PAGE_SIZE
  const end = start + MASTER_ADMIN_PAGE_SIZE - 1
  const { data, error, count } = await masterAdminSchema(admin)
    .from("business_events")
    .select("*", { count: "exact" })
    .gte("created_at", fromIso)
    .lte("created_at", toIso)
    .order("created_at", { ascending: false })
    .range(start, end)
  if (error) throw new Error(error.message)
  return {
    rows: await enrichBusinessEventRows(admin, (data ?? []) as BusinessEventRow[]),
    total: count ?? 0,
  }
}

export async function fetchBusinessEventsExport(
  admin: SupabaseClient<Database>,
  fromIso: string,
  toIso: string
): Promise<BusinessEventWithUser[]> {
  const { data, error } = await masterAdminSchema(admin)
    .from("business_events")
    .select("*")
    .gte("created_at", fromIso)
    .lte("created_at", toIso)
    .order("created_at", { ascending: false })
    .limit(MASTER_ADMIN_EXPORT_MAX_ROWS)
  if (error) throw new Error(error.message)
  return enrichBusinessEventRows(admin, (data ?? []) as BusinessEventRow[])
}

type BusinessFunnelStep = {
  eventType: string
  label: string
  events: number
  users: number
}

const BUSINESS_FUNNEL_STEPS: Array<{ eventType: string; label: string }> = [
  { eventType: "signup.created", label: "Signup created" },
  { eventType: "signup.verified", label: "Signup verified" },
  { eventType: "project.created", label: "First project" },
  { eventType: "ai.generation", label: "First AI generation" },
  { eventType: "payment.order_created", label: "Payment started" },
  { eventType: "payment.verified", label: "Payment verified" },
  { eventType: "payment.webhook_applied", label: "Payment success" },
]

export async function fetchBusinessFunnel(
  admin: SupabaseClient<Database>,
  fromIso: string,
  toIso: string
): Promise<{ steps: BusinessFunnelStep[]; totalEvents: number }> {
  const rows = await adminRpc<Array<{ event_type: string; events: number; users: number }>>(
    admin,
    "admin_business_funnel_counts",
    {
      p_from: fromIso,
      p_to: toIso,
      p_event_types: BUSINESS_FUNNEL_STEPS.map((s) => s.eventType),
    }
  )
  const byType = new Map(
    (rows ?? []).map((row) => [
      row.event_type,
      {
        events: Number(row.events) || 0,
        users: Number(row.users) || 0,
      },
    ])
  )

  return {
    totalEvents: Array.from(byType.values()).reduce((sum, row) => sum + row.events, 0),
    steps: BUSINESS_FUNNEL_STEPS.map((step) => {
      const bucket = byType.get(step.eventType)
      return {
        ...step,
        events: bucket?.events ?? 0,
        users: bucket?.users ?? 0,
      }
    }),
  }
}

export async function fetchPaymentOpsSummary(
  admin: SupabaseClient<Database>,
  fromIso: string,
  toIso: string
): Promise<{
  verifyFailures: number
  webhookFailures: number
  duplicateWebhooks: number
  pendingOrders: number
  delayedWebhookOrders: number
  pdfExportPurchases: number
  pdfExportConsumed: number
  pdfExportReplayBlocks: number
}> {
  const [
    verifyFailuresResult,
    webhookFailuresResult,
    duplicateWebhooksResult,
    pdfExportPurchasesResult,
    pdfExportConsumedResult,
    pdfExportReplayBlocksResult,
    business,
  ] =
    await Promise.all([
      masterAdminSchema(admin)
        .from("security_events")
        .select("id", { count: "exact", head: true })
        .eq("event_type", "payment.verify_failure")
        .gte("created_at", fromIso)
        .lte("created_at", toIso),
      masterAdminSchema(admin)
        .from("security_events")
        .select("id", { count: "exact", head: true })
        .eq("event_type", "payment.webhook_failure")
        .gte("created_at", fromIso)
        .lte("created_at", toIso),
      masterAdminSchema(admin)
        .from("business_events")
        .select("id", { count: "exact", head: true })
        .eq("event_type", "payment.webhook_duplicate")
        .gte("created_at", fromIso)
        .lte("created_at", toIso),
      admin
        .from("pdf_export_purchases")
        .select("id", { count: "exact", head: true })
        .gte("created_at", fromIso)
        .lte("created_at", toIso),
      admin
        .from("pdf_export_purchases")
        .select("id", { count: "exact", head: true })
        .not("consumed_at", "is", null)
        .gte("created_at", fromIso)
        .lte("created_at", toIso),
      masterAdminSchema(admin)
        .from("security_events")
        .select("id", { count: "exact", head: true })
        .eq("event_type", "payment.pdf_export_consume_failure")
        .eq("outcome", "blocked")
        .gte("created_at", fromIso)
        .lte("created_at", toIso),
      adminRpc<{ pending_orders: number; delayed_webhook_orders: number }>(
        admin,
        "admin_payment_ops_order_counts",
        { p_from: fromIso, p_to: toIso }
      ),
    ])

  if (verifyFailuresResult.error) throw new Error(verifyFailuresResult.error.message)
  if (webhookFailuresResult.error) throw new Error(webhookFailuresResult.error.message)
  if (duplicateWebhooksResult.error) throw new Error(duplicateWebhooksResult.error.message)
  if (pdfExportPurchasesResult.error) throw new Error(pdfExportPurchasesResult.error.message)
  if (pdfExportConsumedResult.error) throw new Error(pdfExportConsumedResult.error.message)
  if (pdfExportReplayBlocksResult.error) throw new Error(pdfExportReplayBlocksResult.error.message)

  return {
    verifyFailures: verifyFailuresResult.count ?? 0,
    webhookFailures: webhookFailuresResult.count ?? 0,
    duplicateWebhooks: duplicateWebhooksResult.count ?? 0,
    pendingOrders: Number(business.pending_orders) || 0,
    delayedWebhookOrders: Number(business.delayed_webhook_orders) || 0,
    pdfExportPurchases: pdfExportPurchasesResult.count ?? 0,
    pdfExportConsumed: pdfExportConsumedResult.count ?? 0,
    pdfExportReplayBlocks: pdfExportReplayBlocksResult.count ?? 0,
  }
}

export async function fetchSubscriptionsInRange(
  admin: SupabaseClient<Database>,
  fromIso: string,
  toIso: string,
  page: number,
  filters?: { status?: string; plan?: string; billing_cycle?: string; user_id?: string }
): Promise<{ rows: AdminSubscriptionRow[]; total: number }> {
  const start = (page - 1) * MASTER_ADMIN_PAGE_SIZE
  const end = start + MASTER_ADMIN_PAGE_SIZE - 1

  let q = admin
    .from("subscriptions")
    .select("*", { count: "exact" })
    .gte("updated_at", fromIso)
    .lte("updated_at", toIso)

  if (filters?.status && ["active", "cancelled", "expired"].includes(filters.status)) {
    q = q.eq("status", filters.status as "active" | "cancelled" | "expired")
  }
  if (filters?.plan && ["free", "pro", "premium"].includes(filters.plan)) {
    q = q.eq("plan", filters.plan as "free" | "pro" | "premium")
  }
  if (filters?.billing_cycle && ["monthly", "annual"].includes(filters.billing_cycle)) {
    q = q.eq("billing_cycle", filters.billing_cycle as "monthly" | "annual")
  }
  if (filters?.user_id) {
    q = q.eq("user_id", filters.user_id)
  }

  const { data, error, count } = await q
    .order("updated_at", { ascending: false })
    .range(start, end)

  if (error) throw new Error(error.message)
  return { rows: (data ?? []) as AdminSubscriptionRow[], total: count ?? 0 }
}

type UsageDayBucket = { day: string; count: number }

async function adminRpc<T>(
  admin: SupabaseClient<Database>,
  name: string,
  args: Record<string, unknown>
): Promise<T> {
  const { data, error } = await (admin as any).rpc(name, args)
  if (error) throw new Error(error.message)
  return data as T
}

function addDays(d: Date, days: number) {
  return new Date(d.getTime() + days * 24 * 60 * 60 * 1000)
}

type DayBucket = { day: string; count: number }

export async function fetchUsageDailyBuckets(
  admin: SupabaseClient<Database>,
  fromIso: string,
  toIso: string
): Promise<{ buckets: UsageDayBucket[]; totalInRange: number; truncated: boolean }> {
  const result = await adminRpc<{
    buckets: UsageDayBucket[]
    totalInRange: number
    truncated: boolean
  }>(admin, "admin_usage_daily_buckets", { p_from: fromIso, p_to: toIso })

  return {
    buckets: result.buckets ?? [],
    totalInRange: Number(result.totalInRange) || 0,
    truncated: Boolean(result.truncated),
  }
}

export async function fetchUsageEndpointBreakdown(
  admin: SupabaseClient<Database>,
  fromIso: string,
  toIso: string,
  cap = 5000
): Promise<{ byEndpoint: Record<string, number>; truncated: boolean }> {
  const limit = Math.max(200, Math.min(10_000, cap))
  const result = await adminRpc<{
    byEndpoint: Record<string, number>
    truncated: boolean
  }>(admin, "admin_usage_endpoint_breakdown", {
    p_from: fromIso,
    p_to: toIso,
    p_limit: limit,
  })
  return { byEndpoint: result.byEndpoint ?? {}, truncated: Boolean(result.truncated) }
}

export async function fetchSignupDailyBuckets(
  admin: SupabaseClient<Database>,
  fromIso: string,
  toIso: string
): Promise<{ buckets: DayBucket[]; totalInRange: number; truncated: boolean }> {
  const excludeIds = await fetchMasterAdminUserIds(admin)
  const result = await adminRpc<{
    buckets: DayBucket[]
    totalInRange: number
    truncated: boolean
  }>(admin, "admin_signup_daily_buckets", {
    p_from: fromIso,
    p_to: toIso,
    p_excluded_user_ids: excludeIds,
  })

  return {
    buckets: result.buckets ?? [],
    totalInRange: Number(result.totalInRange) || 0,
    truncated: Boolean(result.truncated),
  }
}

type UpcomingRenewalRow = Pick<
  AdminSubscriptionRow,
  "user_id" | "plan" | "status" | "billing_cycle" | "current_period_end" | "updated_at"
>

export async function fetchUpcomingRenewals(
  admin: SupabaseClient<Database>,
  nowIso: string,
  days: number
): Promise<{ rows: UpcomingRenewalRow[]; truncated: boolean }> {
  const toIso = addDays(new Date(nowIso), Math.max(1, Math.min(60, days))).toISOString()

  const { data, error } = await admin
    .from("subscriptions")
    .select("user_id, plan, status, billing_cycle, current_period_end, updated_at")
    .gte("current_period_end", nowIso)
    .lte("current_period_end", toIso)
    .order("current_period_end", { ascending: true })
    .limit(50)

  if (error) throw new Error(error.message)
  return { rows: (data ?? []) as UpcomingRenewalRow[], truncated: (data?.length ?? 0) >= 50 }
}

type TopUserUsageRow = {
  user_id: string
  count: number
  email?: string
  full_name?: string | null
}

export async function fetchTopUsersByUsage(
  admin: SupabaseClient<Database>,
  fromIso: string,
  toIso: string,
  limit: number
): Promise<{ rows: TopUserUsageRow[]; truncated: boolean }> {
  const adminIds = await fetchMasterAdminUserIds(admin)
  const topN = Math.max(3, Math.min(50, limit))
  const result = await adminRpc<{
    rows: TopUserUsageRow[]
    truncated: boolean
  }>(admin, "admin_top_users_by_usage", {
    p_from: fromIso,
    p_to: toIso,
    p_limit: topN,
    p_excluded_user_ids: adminIds,
  })

  return { rows: result.rows ?? [], truncated: Boolean(result.truncated) }
}

type MrrDayBucket = { day: string; mrrInr: number; activePaid: number }

function perSubMrrInr(plan: string, billing_cycle: string | null) {
  if (!isPaidPlan(plan)) return 0
  const cycle: BillingCycle = billing_cycle === "annual" ? "annual" : "monthly"
  const paise = getRazorpayOrderAmountPaise(plan, cycle)
  return cycle === "annual" ? Math.round(paise / 12 / 100) : Math.round(paise / 100)
}

export async function fetchMrrDailyBuckets(
  admin: SupabaseClient<Database>,
  fromIso: string,
  toIso: string
): Promise<{ buckets: MrrDayBucket[]; truncated: boolean }> {
  const rows = await adminRpc<
    Array<{ day: string; plan: string; status: string; billing_cycle: string | null; cnt: number }>
  >(admin, "admin_mrr_daily_groups", { p_from: fromIso, p_to: toIso })

  const map = new Map<string, { mrrInr: number; activePaid: number }>()
  for (const s of rows ?? []) {
    const day = s.day
    const prev = map.get(day) ?? { mrrInr: 0, activePaid: 0 }
    if (s.status === "active" && isPaidPlan(s.plan)) {
      const count = Number(s.cnt) || 0
      prev.activePaid += count
      prev.mrrInr += perSubMrrInr(s.plan, s.billing_cycle) * count
    }
    map.set(day, prev)
  }

  const buckets = Array.from(map.entries())
    .map(([day, v]) => ({ day, ...v }))
    .sort((a, b) => a.day.localeCompare(b.day))

  return { buckets, truncated: false }
}

type AiCostTotals = {
  requests: number
  failedRequests: number
  inputTokens: number
  outputTokens: number
  cachedInputTokens: number
  totalTokens: number
  costUsd: number
  costInr: number
  avgLatencyMs: number | null
}

type AiCostGroup = AiCostTotals & {
  key: string
  label: string
  provider?: string | null
  model?: string | null
}

type AiFeedbackGroup = {
  key: string
  provider: string | null
  model: string | null
  endpoint: string
  positive: number
  negative: number
  scorePct: number | null
}

type AiFeedbackSummary = {
  total: number
  positive: number
  negative: number
  byModel: AiFeedbackGroup[]
}

type AiCostSummary = {
  totals: AiCostTotals
  byPlan: AiCostGroup[]
  byEndpoint: AiCostGroup[]
  byModel: AiCostGroup[]
  byComplexity: AiCostGroup[]
  feedback: AiFeedbackSummary
  actualMrrInr: number
  grossMarginPct: number | null
  projectedMonthlyCostUsd: number
  projectedMonthlyCostInr: number
  hardAlertUsd: number
  truncated: boolean
}

type AiCostUsageRow = Pick<
  Database["public"]["Tables"]["usage_logs"]["Row"],
  | "endpoint"
  | "plan"
  | "provider"
  | "model"
  | "complexity"
  | "input_tokens"
  | "output_tokens"
  | "cached_input_tokens"
  | "total_tokens"
  | "cost_usd"
  | "cost_inr"
  | "latency_ms"
  | "status"
>

type AiFeedbackRow = Pick<
  Database["public"]["Tables"]["ai_generation_feedback"]["Row"],
  "endpoint" | "provider" | "model" | "rating"
>

function emptyAiCostTotals(): AiCostTotals {
  return {
    requests: 0,
    failedRequests: 0,
    inputTokens: 0,
    outputTokens: 0,
    cachedInputTokens: 0,
    totalTokens: 0,
    costUsd: 0,
    costInr: 0,
    avgLatencyMs: null,
  }
}

function addAiCostRow(total: AiCostTotals & { latencySum?: number; latencyCount?: number }, row: AiCostUsageRow) {
  total.requests += 1
  if (row.status === "failed") total.failedRequests += 1
  total.inputTokens += Number(row.input_tokens ?? 0)
  total.outputTokens += Number(row.output_tokens ?? 0)
  total.cachedInputTokens += Number(row.cached_input_tokens ?? 0)
  total.totalTokens += Number(row.total_tokens ?? 0)
  total.costUsd += Number(row.cost_usd ?? 0)
  total.costInr += Number(row.cost_inr ?? 0)
  if (typeof row.latency_ms === "number") {
    total.latencySum = (total.latencySum ?? 0) + row.latency_ms
    total.latencyCount = (total.latencyCount ?? 0) + 1
  }
}

function finalizeAiCostTotals(total: AiCostTotals & { latencySum?: number; latencyCount?: number }): AiCostTotals {
  return {
    requests: total.requests,
    failedRequests: total.failedRequests,
    inputTokens: total.inputTokens,
    outputTokens: total.outputTokens,
    cachedInputTokens: total.cachedInputTokens,
    totalTokens: total.totalTokens,
    costUsd: Math.round(total.costUsd * 100) / 100,
    costInr: Math.round(total.costInr),
    avgLatencyMs: total.latencyCount ? Math.round((total.latencySum ?? 0) / total.latencyCount) : null,
  }
}

function groupedAiCosts(rows: AiCostUsageRow[], keyFor: (row: AiCostUsageRow) => AiCostGroup): AiCostGroup[] {
  const map = new Map<string, AiCostGroup & { latencySum?: number; latencyCount?: number }>()
  for (const row of rows) {
    const seed = keyFor(row)
    const current = map.get(seed.key) ?? { ...seed, ...emptyAiCostTotals() }
    addAiCostRow(current, row)
    map.set(seed.key, current)
  }

  return Array.from(map.values())
    .map((group) => ({ ...group, ...finalizeAiCostTotals(group) }))
    .sort((a, b) => b.costUsd - a.costUsd || b.requests - a.requests)
}

function summarizeAiFeedback(rows: AiFeedbackRow[]): AiFeedbackSummary {
  const map = new Map<string, AiFeedbackGroup>()
  let positive = 0
  let negative = 0

  for (const row of rows) {
    if (row.rating === 1) positive += 1
    if (row.rating === -1) negative += 1
    const key = `${row.endpoint}:${row.provider ?? "unknown"}:${row.model ?? "unknown"}`
    const current =
      map.get(key) ??
      ({
        key,
        endpoint: row.endpoint,
        provider: row.provider,
        model: row.model,
        positive: 0,
        negative: 0,
        scorePct: null,
      } satisfies AiFeedbackGroup)
    if (row.rating === 1) current.positive += 1
    if (row.rating === -1) current.negative += 1
    const total = current.positive + current.negative
    current.scorePct = total ? Math.round((current.positive / total) * 1000) / 10 : null
    map.set(key, current)
  }

  return {
    total: positive + negative,
    positive,
    negative,
    byModel: Array.from(map.values()).sort(
      (a, b) => b.positive + b.negative - (a.positive + a.negative) || (b.scorePct ?? 0) - (a.scorePct ?? 0)
    ),
  }
}

export async function fetchAiCostSummary(
  admin: SupabaseClient<Database>,
  fromIso: string,
  toIso: string
): Promise<AiCostSummary> {
  const cap = 10_000
  const [usageResult, subscriptionsResult, feedbackResult] = await Promise.all([
    admin
      .from("usage_logs")
      .select(
        "endpoint, plan, provider, model, complexity, input_tokens, output_tokens, cached_input_tokens, total_tokens, cost_usd, cost_inr, latency_ms, status"
      )
      .gte("created_at", fromIso)
      .lte("created_at", toIso)
      .order("created_at", { ascending: false })
      .limit(cap),
    admin.from("subscriptions").select("plan, status, billing_cycle"),
    admin
      .from("ai_generation_feedback")
      .select("endpoint, provider, model, rating")
      .gte("created_at", fromIso)
      .lte("created_at", toIso)
      .order("created_at", { ascending: false })
      .limit(cap),
  ])

  if (usageResult.error) throw new Error(usageResult.error.message)
  if (subscriptionsResult.error) throw new Error(subscriptionsResult.error.message)
  if (feedbackResult.error) throw new Error(feedbackResult.error.message)

  const rows = (usageResult.data ?? []) as AiCostUsageRow[]
  const feedbackRows = (feedbackResult.data ?? []) as AiFeedbackRow[]
  const totalsDraft = emptyAiCostTotals() as AiCostTotals & { latencySum?: number; latencyCount?: number }
  for (const row of rows) addAiCostRow(totalsDraft, row)
  const totals = finalizeAiCostTotals(totalsDraft)

  const actualMrrInr = (subscriptionsResult.data ?? []).reduce((sum, sub) => {
    if (sub.status !== "active" || !isPaidPlan(sub.plan)) return sum
    return sum + perSubMrrInr(sub.plan, sub.billing_cycle)
  }, 0)

  const rangeMs = Math.max(1, new Date(toIso).getTime() - new Date(fromIso).getTime())
  const rangeDays = Math.max(1, rangeMs / (24 * 60 * 60 * 1000))
  const projectedMonthlyCostUsd = Math.round(totals.costUsd * (30 / rangeDays) * 100) / 100
  const projectedMonthlyCostInr = Math.round(totals.costInr * (30 / rangeDays))

  return {
    totals,
    byPlan: groupedAiCosts(rows, (row) => ({
      key: row.plan ?? "unknown",
      label: row.plan ?? "unknown",
      ...emptyAiCostTotals(),
    })),
    byEndpoint: groupedAiCosts(rows, (row) => ({
      key: row.endpoint,
      label: row.endpoint,
      ...emptyAiCostTotals(),
    })),
    byModel: groupedAiCosts(rows, (row) => ({
      key: `${row.provider ?? "unknown"}:${row.model ?? "unknown"}`,
      label: row.model ?? "unknown",
      provider: row.provider,
      model: row.model,
      ...emptyAiCostTotals(),
    })),
    byComplexity: groupedAiCosts(rows, (row) => ({
      key: row.complexity,
      label: row.complexity,
      ...emptyAiCostTotals(),
    })),
    feedback: summarizeAiFeedback(feedbackRows),
    actualMrrInr,
    grossMarginPct: actualMrrInr > 0 ? Math.round(((actualMrrInr - projectedMonthlyCostInr) / actualMrrInr) * 1000) / 10 : null,
    projectedMonthlyCostUsd,
    projectedMonthlyCostInr,
    hardAlertUsd: 300,
    truncated: rows.length >= cap,
  }
}

type MasterAdminAuditRow = {
  id: number
  created_at: string
  user_id: string | null
  method: string
  route: string
  host: string | null
  ip_hash: string | null
  operator_email: string | null
}
type MasterAdminAuditLogRow = Omit<MasterAdminAuditRow, "operator_email">

export async function fetchMasterAdminAuditInRange(
  admin: SupabaseClient<Database>,
  fromIso: string,
  toIso: string,
  page: number
): Promise<{ rows: MasterAdminAuditRow[]; total: number }> {
  const start = (page - 1) * MASTER_ADMIN_PAGE_SIZE
  const end = start + MASTER_ADMIN_PAGE_SIZE - 1

  const { data: logs, error, count } = await masterAdminSchema(admin)
    .from("audit_log")
    .select("*", { count: "exact" })
    .gte("created_at", fromIso)
    .lte("created_at", toIso)
    .order("created_at", { ascending: false })
    .range(start, end)

  if (error) throw new Error(error.message)

  const logRows = (logs ?? []) as MasterAdminAuditLogRow[]
  const ids = Array.from(new Set(logRows.map((r) => r.user_id).filter(Boolean))) as string[]
  const emailById = new Map<string, string>()
  if (ids.length > 0) {
    const { data: profs, error: pErr } = await admin.from("profiles").select("id, email").in("id", ids)
    if (pErr) throw new Error(pErr.message)
    for (const p of profs ?? []) emailById.set(p.id, p.email)
  }

  const rows: MasterAdminAuditRow[] = logRows.map((r) => ({
    ...r,
    operator_email: r.user_id ? emailById.get(r.user_id) ?? null : null,
  }))

  return { rows, total: count ?? 0 }
}

type RazorpayPaymentEnriched = RazorpayPayment & { user_email: string | null }
type PdfExportPurchaseEnriched = PdfExportPurchase & {
  user_email: string | null
  project_title: string | null
}
type AiCreditTopupPurchaseEnriched = AiCreditTopupPurchase & { user_email: string | null }
type AiCreditReservationEnriched = AiCreditReservationRow & { user_email: string | null }

export async function fetchRazorpayPaymentsInRange(
  admin: SupabaseClient<Database>,
  fromIso: string,
  toIso: string,
  page: number
): Promise<{ rows: RazorpayPaymentEnriched[]; total: number }> {
  const start = (page - 1) * MASTER_ADMIN_PAGE_SIZE
  const end = start + MASTER_ADMIN_PAGE_SIZE - 1

  const { data: payments, error, count } = await admin
    .from("razorpay_payments")
    .select("*", { count: "exact" })
    .gte("created_at", fromIso)
    .lte("created_at", toIso)
    .order("created_at", { ascending: false })
    .range(start, end)

  if (error) throw new Error(error.message)

  const ids = Array.from(new Set((payments ?? []).map((p) => p.user_id)))
  const emailById = new Map<string, string>()
  if (ids.length > 0) {
    const { data: profs, error: pErr } = await admin.from("profiles").select("id, email").in("id", ids)
    if (pErr) throw new Error(pErr.message)
    for (const p of profs ?? []) emailById.set(p.id, p.email)
  }

  const rows: RazorpayPaymentEnriched[] = (payments ?? []).map((p) => ({
    ...p,
    user_email: emailById.get(p.user_id) ?? null,
  }))

  return { rows, total: count ?? 0 }
}

async function enrichPdfExportPurchases(
  admin: SupabaseClient<Database>,
  purchases: PdfExportPurchase[]
): Promise<PdfExportPurchaseEnriched[]> {
  const userIds = Array.from(new Set(purchases.map((p) => p.user_id)))
  const projectIds = Array.from(new Set(purchases.map((p) => p.project_id)))
  const emailById = await profileEmailsForIds(admin, userIds)
  const titleById = new Map<string, string>()

  if (projectIds.length > 0) {
    const { data: projects, error } = await admin.from("projects").select("id, title").in("id", projectIds)
    if (error) throw new Error(error.message)
    for (const project of projects ?? []) titleById.set(project.id, project.title)
  }

  return purchases.map((purchase) => ({
    ...purchase,
    user_email: emailById.get(purchase.user_id) ?? null,
    project_title: titleById.get(purchase.project_id) ?? null,
  }))
}

export async function fetchPdfExportPurchasesInRange(
  admin: SupabaseClient<Database>,
  fromIso: string,
  toIso: string,
  page: number
): Promise<{ rows: PdfExportPurchaseEnriched[]; total: number }> {
  const start = (page - 1) * MASTER_ADMIN_PAGE_SIZE
  const end = start + MASTER_ADMIN_PAGE_SIZE - 1

  const { data: purchases, error, count } = await admin
    .from("pdf_export_purchases")
    .select("*", { count: "exact" })
    .gte("created_at", fromIso)
    .lte("created_at", toIso)
    .order("created_at", { ascending: false })
    .range(start, end)

  if (error) throw new Error(error.message)

  return {
    rows: await enrichPdfExportPurchases(admin, (purchases ?? []) as PdfExportPurchase[]),
    total: count ?? 0,
  }
}

export async function fetchAiCreditTopupsInRange(
  admin: SupabaseClient<Database>,
  fromIso: string,
  toIso: string,
  page: number
): Promise<{ rows: AiCreditTopupPurchaseEnriched[]; total: number }> {
  const start = (page - 1) * MASTER_ADMIN_PAGE_SIZE
  const end = start + MASTER_ADMIN_PAGE_SIZE - 1

  const { data, error, count } = await admin
    .from("ai_credit_topup_purchases")
    .select("*", { count: "exact" })
    .gte("created_at", fromIso)
    .lte("created_at", toIso)
    .order("created_at", { ascending: false })
    .range(start, end)

  if (error) throw new Error(error.message)

  const purchases = (data ?? []) as AiCreditTopupPurchase[]
  const emailById = await profileEmailsForIds(admin, Array.from(new Set(purchases.map((row) => row.user_id))))
  return {
    rows: purchases.map((row) => ({ ...row, user_email: emailById.get(row.user_id) ?? null })),
    total: count ?? 0,
  }
}

export async function fetchAiCreditReservationsInRange(
  admin: SupabaseClient<Database>,
  fromIso: string,
  toIso: string,
  page: number
): Promise<{ rows: AiCreditReservationEnriched[]; total: number }> {
  const start = (page - 1) * MASTER_ADMIN_PAGE_SIZE
  const end = start + MASTER_ADMIN_PAGE_SIZE - 1

  const { data, error, count } = await admin
    .from("ai_credit_reservations")
    .select("*", { count: "exact" })
    .gte("created_at", fromIso)
    .lte("created_at", toIso)
    .order("created_at", { ascending: false })
    .range(start, end)

  if (error) throw new Error(error.message)

  const reservations = (data ?? []) as AiCreditReservationRow[]
  const emailById = await profileEmailsForIds(admin, Array.from(new Set(reservations.map((row) => row.user_id))))
  return {
    rows: reservations.map((row) => ({ ...row, user_email: emailById.get(row.user_id) ?? null })),
    total: count ?? 0,
  }
}

export async function fetchAiCreditOpsSummary(
  admin: SupabaseClient<Database>,
  fromIso: string,
  toIso: string
): Promise<{ topups: number; reserved: number; pendingReservations: number; expiredPendingReservations: number }> {
  const now = new Date().toISOString()
  const [topups, reserved, pending, expired] = await Promise.all([
    admin
      .from("ai_credit_topup_purchases")
      .select("id", { count: "exact", head: true })
      .gte("created_at", fromIso)
      .lte("created_at", toIso),
    admin
      .from("ai_credit_reservations")
      .select("id", { count: "exact", head: true })
      .gte("created_at", fromIso)
      .lte("created_at", toIso),
    admin
      .from("ai_credit_reservations")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending")
      .gte("created_at", fromIso)
      .lte("created_at", toIso),
    admin
      .from("ai_credit_reservations")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending")
      .lt("expires_at", now),
  ])

  for (const result of [topups, reserved, pending, expired]) {
    if (result.error) throw new Error(result.error.message)
  }

  return {
    topups: topups.count ?? 0,
    reserved: reserved.count ?? 0,
    pendingReservations: pending.count ?? 0,
    expiredPendingReservations: expired.count ?? 0,
  }
}

type User360Bundle = {
  profile: AdminProfileRow | null
  isPlatformOperator: boolean
  subscription: AdminSubscriptionRow | null
  projectCount: number
  recentPayments: RazorpayPayment[]
  recentUsage: Pick<Database["public"]["Tables"]["usage_logs"]["Row"], "id" | "endpoint" | "plan" | "created_at">[]
  signupRiskEvents: SignupRiskEventWithUser[]
  signupRiskCluster: SignupRiskEventWithUser[]
  accountControl: UserAccountControlRow | null
  userNotes: Array<UserNoteRow & { author_email: string | null }>
  recentSecurityEvents: SecurityEventWithUsers[]
  recentBusinessEvents: BusinessEventWithUser[]
}

export async function fetchUser360(
  admin: SupabaseClient<Database>,
  userId: string
): Promise<User360Bundle | null> {
  const [
    profileResult,
    opResult,
    subResult,
    projectCountResult,
    paymentsResult,
    usageResult,
    signupRiskResult,
    accountControlResult,
    notesResult,
    securityEventsResult,
    businessEventsResult,
  ] = await Promise.all([
    admin.from("profiles").select("*").eq("id", userId).maybeSingle(),
    masterAdminSchema(admin).from("users").select("user_id").eq("user_id", userId).maybeSingle(),
    admin
      .from("subscriptions")
      .select("*")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(1),
    admin.from("projects").select("*", { count: "exact", head: true }).eq("user_id", userId),
    admin
      .from("razorpay_payments")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(25),
    admin
      .from("usage_logs")
      .select("id, endpoint, plan, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(25),
    masterAdminSchema(admin)
      .from("signup_risk_events")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(10),
    masterAdminSchema(admin)
      .from("user_account_controls")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle(),
    masterAdminSchema(admin)
      .from("user_notes")
      .select("*")
      .eq("target_user_id", userId)
      .order("created_at", { ascending: false })
      .limit(25),
    masterAdminSchema(admin)
      .from("security_events")
      .select("*")
      .or(`actor_user_id.eq.${userId},target_user_id.eq.${userId}`)
      .order("created_at", { ascending: false })
      .limit(25),
    masterAdminSchema(admin)
      .from("business_events")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(25),
  ])

  if (profileResult.error) throw new Error(profileResult.error.message)
  if (opResult.error) throw new Error(opResult.error.message)
  if (subResult.error) throw new Error(subResult.error.message)
  if (projectCountResult.error) throw new Error(projectCountResult.error.message)
  if (paymentsResult.error) throw new Error(paymentsResult.error.message)
  if (usageResult.error) throw new Error(usageResult.error.message)
  if (signupRiskResult.error) throw new Error(signupRiskResult.error.message)
  if (accountControlResult.error) throw new Error(accountControlResult.error.message)
  if (notesResult.error) throw new Error(notesResult.error.message)
  if (securityEventsResult.error) throw new Error(securityEventsResult.error.message)
  if (businessEventsResult.error) throw new Error(businessEventsResult.error.message)

  const profile = profileResult.data
  const isPlatformOperator = !!opResult.data
  const subscription = subResult.data?.[0] ?? null
  const projectCount = projectCountResult.count ?? 0
  const recentPayments = paymentsResult.data ?? []
  const recentUsage = usageResult.data ?? []
  const signupRiskEvents = await enrichSignupRiskRows(admin, (signupRiskResult.data ?? []) as SignupRiskEventRow[])
  const primaryIpHash = signupRiskEvents.find((r) => r.ip_hash)?.ip_hash
  const signupRiskCluster = primaryIpHash ? await fetchSignupRiskCluster(admin, primaryIpHash, 10) : []
  const accountControl = (accountControlResult.data ?? null) as UserAccountControlRow | null
  const notes = (notesResult.data ?? []) as UserNoteRow[]
  const noteAuthorIds = Array.from(new Set(notes.map((n) => n.author_user_id).filter(Boolean))) as string[]
  const noteAuthors = await profileSummariesForIds(admin, noteAuthorIds)
  const userNotes = notes.map((n) => ({
    ...n,
    author_email: n.author_user_id ? noteAuthors.get(n.author_user_id)?.email ?? null : null,
  }))
  const recentSecurityEvents = await enrichSecurityEventRows(
    admin,
    (securityEventsResult.data ?? []) as SecurityEventRow[]
  )
  const recentBusinessEvents = await enrichBusinessEventRows(
    admin,
    (businessEventsResult.data ?? []) as BusinessEventRow[]
  )

  const touches =
    !!profile ||
    isPlatformOperator ||
    !!subscription ||
    projectCount > 0 ||
    recentPayments.length > 0 ||
    recentUsage.length > 0 ||
    signupRiskEvents.length > 0 ||
    !!accountControl ||
    userNotes.length > 0 ||
    recentSecurityEvents.length > 0 ||
    recentBusinessEvents.length > 0

  if (!touches) return null

  return {
    profile,
    isPlatformOperator,
    subscription,
    projectCount,
    recentPayments,
    recentUsage,
    signupRiskEvents,
    signupRiskCluster,
    accountControl,
    userNotes,
    recentSecurityEvents,
    recentBusinessEvents,
  }
}

async function profileEmailsForIds(
  admin: SupabaseClient<Database>,
  ids: string[]
): Promise<Map<string, string>> {
  const emailById = new Map<string, string>()
  if (ids.length === 0) return emailById
  const { data: profs, error } = await admin.from("profiles").select("id, email").in("id", ids)
  if (error) throw new Error(error.message)
  for (const p of profs ?? []) emailById.set(p.id, p.email)
  return emailById
}

async function profileSummariesForIds(
  admin: SupabaseClient<Database>,
  ids: string[]
): Promise<Map<string, { email: string; full_name: string | null }>> {
  const byId = new Map<string, { email: string; full_name: string | null }>()
  if (ids.length === 0) return byId
  const { data: profs, error } = await admin.from("profiles").select("id, email, full_name").in("id", ids)
  if (error) throw new Error(error.message)
  for (const p of profs ?? []) byId.set(p.id, { email: p.email, full_name: p.full_name })
  return byId
}

/** Bounded slice for CSV export (newest first). */
export async function fetchMasterAdminAuditExport(
  admin: SupabaseClient<Database>,
  fromIso: string,
  toIso: string
): Promise<MasterAdminAuditRow[]> {
  const { data: logs, error } = await masterAdminSchema(admin)
    .from("audit_log")
    .select("*")
    .gte("created_at", fromIso)
    .lte("created_at", toIso)
    .order("created_at", { ascending: false })
    .limit(MASTER_ADMIN_EXPORT_MAX_ROWS)

  if (error) throw new Error(error.message)

  const logRows = (logs ?? []) as MasterAdminAuditLogRow[]
  const ids = Array.from(new Set(logRows.map((r) => r.user_id).filter(Boolean))) as string[]
  const emailById = await profileEmailsForIds(admin, ids)

  return logRows.map((r) => ({
    ...r,
    operator_email: r.user_id ? emailById.get(r.user_id) ?? null : null,
  }))
}

export async function fetchRazorpayPaymentsExport(
  admin: SupabaseClient<Database>,
  fromIso: string,
  toIso: string
): Promise<RazorpayPaymentEnriched[]> {
  const { data: payments, error } = await admin
    .from("razorpay_payments")
    .select("*")
    .gte("created_at", fromIso)
    .lte("created_at", toIso)
    .order("created_at", { ascending: false })
    .limit(MASTER_ADMIN_EXPORT_MAX_ROWS)

  if (error) throw new Error(error.message)

  const ids = Array.from(new Set((payments ?? []).map((p) => p.user_id)))
  const emailById = await profileEmailsForIds(admin, ids)

  return (payments ?? []).map((p) => ({
    ...p,
    user_email: emailById.get(p.user_id) ?? null,
  }))
}

export async function fetchPdfExportPurchasesExport(
  admin: SupabaseClient<Database>,
  fromIso: string,
  toIso: string
): Promise<PdfExportPurchaseEnriched[]> {
  const { data: purchases, error } = await admin
    .from("pdf_export_purchases")
    .select("*")
    .gte("created_at", fromIso)
    .lte("created_at", toIso)
    .order("created_at", { ascending: false })
    .limit(MASTER_ADMIN_EXPORT_MAX_ROWS)

  if (error) throw new Error(error.message)

  return enrichPdfExportPurchases(admin, (purchases ?? []) as PdfExportPurchase[])
}

export async function fetchProfilesExport(
  admin: SupabaseClient<Database>,
  fromIso: string,
  toIso: string,
  searchEmail?: string
): Promise<ProfileWithSubscription[]> {
  const excludeIds = await fetchMasterAdminUserIds(admin)
  const excludeTuple = notInTuple(excludeIds)

  let q = admin
    .from("profiles")
    .select("id, email, full_name, avatar_url, bio, created_at, updated_at")
    .gte("created_at", fromIso)
    .lte("created_at", toIso)

  if (excludeTuple) {
    q = q.not("id", "in", excludeTuple)
  }

  if (searchEmail && searchEmail.trim()) {
    const v = searchEmail.trim().slice(0, 120)
    q = q.ilike("email", `%${v}%`)
  }

  const { data: profiles, error } = await q
    .order("created_at", { ascending: false })
    .limit(MASTER_ADMIN_EXPORT_MAX_ROWS)

  if (error) throw new Error(error.message)

  const ids = (profiles ?? []).map((p) => p.id)
  if (ids.length === 0) return []

  const { data: subs, error: subErr } = await admin
    .from("subscriptions")
    .select("user_id, plan, status, billing_cycle, updated_at")
    .in("user_id", ids)

  if (subErr) throw new Error(subErr.message)

  const latestByUser = new Map<
    string,
    Pick<AdminSubscriptionRow, "plan" | "status" | "billing_cycle" | "updated_at">
  >()
  for (const s of subs ?? []) {
    const prev = latestByUser.get(s.user_id)
    if (!prev || new Date(s.updated_at).getTime() > new Date(prev.updated_at).getTime()) {
      latestByUser.set(s.user_id, {
        plan: s.plan,
        status: s.status,
        billing_cycle: s.billing_cycle,
        updated_at: s.updated_at,
      })
    }
  }

  return (profiles ?? []).map((p) => ({
    ...p,
    subscription: latestByUser.get(p.id) ?? null,
  }))
}

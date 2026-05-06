import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/infrastructure/db/types/database"
import { fetchMasterAdminUserIds, notInTuple } from "@/modules/master-admin/infrastructure/admin-queries"
import { getRazorpayOrderAmountPaise, isPaidPlan } from "@/modules/billing/domain/razorpay-pricing"
import type { BillingCycle } from "@/shared/types/project"

/** Rows scanned for endpoint/plan breakdown (totals use full counts). */
const USAGE_BREAKDOWN_SAMPLE = 500

export interface AdminStats {
  overview: {
    totalUsers: number
    totalProjects: number
    activeSubscribers: number
    mrr: number
  }
  /** Counts subscriptions with `status === "active"` only, by plan. */
  plans: Record<string, number>
  usage: {
    total: number
    last24h: number
    byEndpoint: Record<string, number>
    byPlan: Record<string, number>
    breakdownSampleSize: number
  }
  recentPayments: Array<{
    plan: string
    billing_cycle: string
    razorpay_payment_id: string
    updated_at: string
  }>
}

interface SubscriptionGroupRow {
  plan: string
  status: string
  billing_cycle: string
  cnt: number
}

function parseSubscriptionGroups(data: unknown): SubscriptionGroupRow[] {
  if (!Array.isArray(data)) return []
  const out: SubscriptionGroupRow[] = []
  for (const row of data) {
    if (!row || typeof row !== "object") continue
    const r = row as Record<string, unknown>
    const plan = typeof r.plan === "string" ? r.plan : ""
    const status = typeof r.status === "string" ? r.status : ""
    const billing_cycle =
      typeof r.billing_cycle === "string" ? r.billing_cycle : "monthly"
    const cnt =
      typeof r.cnt === "number"
        ? r.cnt
        : typeof r.cnt === "string"
          ? parseInt(r.cnt, 10)
          : Number(r.cnt)
    if (!Number.isFinite(cnt)) continue
    out.push({ plan, status, billing_cycle, cnt })
  }
  return out
}

function mrrInrFromGroups(groups: SubscriptionGroupRow[]): number {
  let mrr = 0
  for (const g of groups) {
    if (g.status !== "active" || !isPaidPlan(g.plan)) continue
    const cycle: BillingCycle = g.billing_cycle === "annual" ? "annual" : "monthly"
    const paise = getRazorpayOrderAmountPaise(g.plan, cycle)
    const perSub =
      cycle === "annual" ? Math.round(paise / 12 / 100) : Math.round(paise / 100)
    mrr += perSub * g.cnt
  }
  return mrr
}

function planBreakdownFromGroups(groups: SubscriptionGroupRow[]): Record<string, number> {
  const acc: Record<string, number> = { free: 0, pro: 0, premium: 0 }
  for (const g of groups) {
    if (g.status !== "active") continue
    const p = g.plan
    if (p === "free" || p === "pro" || p === "premium") {
      acc[p] = (acc[p] ?? 0) + g.cnt
    }
  }
  return acc
}

function activePaidSubscriberCount(groups: SubscriptionGroupRow[]): number {
  let n = 0
  for (const g of groups) {
    if (g.status !== "active" || g.plan === "free") continue
    n += g.cnt
  }
  return n
}

function rowsToGroups(
  subs: Array<{ plan: string; status: string; billing_cycle: string | null }>
): SubscriptionGroupRow[] {
  const map = new Map<string, number>()
  for (const s of subs) {
    const bc = s.billing_cycle === "annual" ? "annual" : "monthly"
    const key = `${s.plan}\0${s.status}\0${bc}`
    map.set(key, (map.get(key) ?? 0) + 1)
  }
  const out: SubscriptionGroupRow[] = []
  map.forEach((cnt, key) => {
    const [plan, status, billing_cycle] = key.split("\0")
    out.push({ plan, status, billing_cycle, cnt })
  })
  return out
}

export async function computeAdminStats(
  adminSupabase: SupabaseClient<Database>
): Promise<AdminStats> {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const operatorIds = await fetchMasterAdminUserIds(adminSupabase)
  const operatorTuple = notInTuple(operatorIds)

  let profilesCountQ = adminSupabase.from("profiles").select("id", { count: "exact", head: true })
  if (operatorTuple) profilesCountQ = profilesCountQ.not("id", "in", operatorTuple)

  const [
    profilesRes,
    projectsRes,
    subGroupsRes,
    usageTotalRes,
    usage24hRes,
    usageSampleRes,
    recentPaymentsRes,
  ] = await Promise.all([
    profilesCountQ,
    adminSupabase.from("projects").select("id", { count: "exact", head: true }),
    adminSupabase.rpc("admin_subscription_group_counts"),
    adminSupabase.from("usage_logs").select("id", { count: "exact", head: true }),
    adminSupabase
      .from("usage_logs")
      .select("id", { count: "exact", head: true })
      .gte("created_at", yesterday),
    adminSupabase
      .from("usage_logs")
      .select("endpoint, plan")
      .order("created_at", { ascending: false })
      .limit(USAGE_BREAKDOWN_SAMPLE),
    adminSupabase
      .from("subscriptions")
      .select("plan, billing_cycle, razorpay_payment_id, updated_at")
      .not("razorpay_payment_id", "is", null)
      .order("updated_at", { ascending: false })
      .limit(20),
  ])

  let groups: SubscriptionGroupRow[]
  if (subGroupsRes.error) {
    const { data: subsFallback, error: fbErr } = await adminSupabase
      .from("subscriptions")
      .select("plan, status, billing_cycle")
    if (fbErr) throw new Error(fbErr.message)
    groups = rowsToGroups(subsFallback ?? [])
  } else {
    groups = parseSubscriptionGroups(subGroupsRes.data)
  }

  const errs = [
    profilesRes.error,
    projectsRes.error,
    usageTotalRes.error,
    usage24hRes.error,
    usageSampleRes.error,
    recentPaymentsRes.error,
  ].filter(Boolean)
  if (errs.length > 0) {
    throw new Error(errs[0]!.message)
  }
  const usageSample = usageSampleRes.data ?? []

  const usageByEndpoint = usageSample.reduce<Record<string, number>>((acc, u) => {
    acc[u.endpoint] = (acc[u.endpoint] ?? 0) + 1
    return acc
  }, {})
  const usageByPlan = usageSample.reduce<Record<string, number>>((acc, u) => {
    acc[u.plan] = (acc[u.plan] ?? 0) + 1
    return acc
  }, {})

  const payments = (recentPaymentsRes.data ?? [])
    .filter((p) => p.razorpay_payment_id)
    .map((p) => ({
      plan: p.plan,
      billing_cycle: p.billing_cycle ?? "monthly",
      razorpay_payment_id: p.razorpay_payment_id as string,
      updated_at: p.updated_at,
    }))

  return {
    overview: {
      totalUsers: profilesRes.count ?? 0,
      totalProjects: projectsRes.count ?? 0,
      activeSubscribers: activePaidSubscriberCount(groups),
      mrr: mrrInrFromGroups(groups),
    },
    plans: planBreakdownFromGroups(groups),
    usage: {
      total: usageTotalRes.count ?? 0,
      last24h: usage24hRes.count ?? 0,
      byEndpoint: usageByEndpoint,
      byPlan: usageByPlan,
      breakdownSampleSize: USAGE_BREAKDOWN_SAMPLE,
    },
    recentPayments: payments,
  }
}

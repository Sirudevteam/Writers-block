/**
 * Subscription expiry cron job
 *
 * Called daily by Vercel Cron (configured in vercel.json):
 *   Schedule: "0 9 * * *" (9 AM UTC daily)
 *   URL: /api/cron/check-subscriptions
 *
 * What it does:
 * 1. Finds subscriptions expiring in 7 days → sends warning email
 * 2. Finds expired subscriptions → downgrades to free plan
 *
 * Protected by CRON_SECRET env var (set in Vercel project settings).
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { sendExpiryWarning } from "@/infrastructure/email/email-service"
import { logBusinessEvent } from "@/modules/master-admin/application/events"
import { PLAN_LIMITS } from "@/shared/types/project"

// Never statically render — this route requires live DB access
export const dynamic = "force-dynamic"

function isProductionRuntime(): boolean {
  return (
    process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production"
  )
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET?.trim()

  if (isProductionRuntime()) {
    if (!cronSecret) {
      return NextResponse.json(
        {
          error:
            "Cron is not configured: set CRON_SECRET in the deployment environment.",
        },
        { status: 503 }
      )
    }
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
  } else if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    return NextResponse.json(
      { error: "Server misconfiguration: missing Supabase service credentials." },
      { status: 503 }
    )
  }

  const adminSupabase = createClient(url, serviceKey)

  const now = new Date()

  let warned = 0
  let expired = 0
  let dunningDowngraded = 0
  let pruned = 0
  let fraudPruned = 0
  let securityPruned = 0
  let businessPruned = 0
  const errors: string[] = []

  // ── 1. Find subscriptions expiring in 6-8 days (send warning) ────────────
  const warningWindowStart = new Date(now.getTime() + 6 * 24 * 60 * 60 * 1000).toISOString()
  const warningWindowEnd = new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000).toISOString()

  const { data: expiringSoon } = await adminSupabase
    .from("subscriptions")
    .select("user_id, plan, current_period_end, expiry_warning_sent_at")
    .in("status", ["active", "trialing"])
    .neq("plan", "free")
    .is("expiry_warning_sent_at", null)
    .gte("current_period_end", warningWindowStart)
    .lte("current_period_end", warningWindowEnd)

  for (const sub of expiringSoon ?? []) {
    try {
      const { data: profile } = await adminSupabase
        .from("profiles")
        .select("email")
        .eq("id", sub.user_id)
        .single()

      if (profile?.email && sub.current_period_end) {
        const expiryDate = new Date(sub.current_period_end)
        const daysLeft = Math.ceil((expiryDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
        await sendExpiryWarning(profile.email, sub.plan, daysLeft, expiryDate)
        await adminSupabase
          .from("subscriptions")
          .update({ expiry_warning_sent_at: now.toISOString() })
          .eq("user_id", sub.user_id)
        warned++
      }
    } catch (err: any) {
      errors.push(`Warning email failed for user ${sub.user_id}: ${err.message}`)
    }
  }

  // ── 2. Find expired subscriptions and downgrade to free ───────────────────
  const { data: expiredSubs } = await adminSupabase
    .from("subscriptions")
    .select("user_id, plan")
    .eq("status", "active")
    .neq("plan", "free")
    .lt("current_period_end", now.toISOString())

  for (const sub of expiredSubs ?? []) {
    try {
      await adminSupabase
        .from("subscriptions")
        .update({
          status: "expired",
          plan: "free",
          projects_limit: PLAN_LIMITS.free,
          billing_cycle: "monthly",
          expiry_warning_sent_at: null,
        })
        .eq("user_id", sub.user_id)

      // Record expiry in subscription_events for billing history
      adminSupabase
        .from("subscription_events" as any)
        .insert({
          user_id: sub.user_id,
          event_type: "expired",
          from_plan: sub.plan,
          to_plan: "free",
        })
        .then(() => {}, (e: Error) => console.error("[cron] subscription_events insert failed:", e.message))

      void logBusinessEvent(req, {
        eventType: "subscription.expired",
        userId: sub.user_id,
        plan: "free",
        metadata: { fromPlan: sub.plan },
      }).catch(() => {})

      expired++
    } catch (err: any) {
      errors.push(`Expiry downgrade failed for user ${sub.user_id}: ${err.message}`)
    }
  }

  // ── 3. Prune usage_logs older than 90 days ────────────────────────────────
  const pruneThreshold = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString()
  try {
    const { count } = await adminSupabase
      .from("usage_logs")
      .delete({ count: "exact" })
      .lt("created_at", pruneThreshold)
    pruned = count ?? 0
  } catch (err: any) {
    errors.push(`usage_logs pruning failed: ${err.message}`)
  }

  const { data: pastDueSubs } = await adminSupabase
    .from("subscriptions")
    .select("user_id, plan, grace_period_end")
    .eq("status", "past_due")
    .neq("plan", "free")
    .lt("grace_period_end", now.toISOString())

  for (const sub of pastDueSubs ?? []) {
    try {
      await adminSupabase
        .from("subscriptions")
        .update({
          status: "expired",
          plan: "free",
          projects_limit: PLAN_LIMITS.free,
          billing_cycle: "monthly",
          grace_period_end: null,
          expiry_warning_sent_at: null,
          last_webhook_event: "subscription.dunning_grace_expired",
        } as any)
        .eq("user_id", sub.user_id)

      adminSupabase
        .from("subscription_events" as any)
        .insert({
          user_id: sub.user_id,
          event_type: "expired",
          from_plan: sub.plan,
          to_plan: "free",
        })
        .then(() => {}, (e: Error) => console.error("[cron] subscription_events dunning insert failed:", e.message))

      dunningDowngraded++
    } catch (err: any) {
      errors.push(`Dunning downgrade failed for user ${sub.user_id}: ${err.message}`)
    }
  }

  // ── 4. Prune signup risk events older than 180 days ───────────────────────
  const fraudPruneThreshold = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000).toISOString()
  try {
    const { count } = await (adminSupabase as any)
      .schema("master_admin")
      .from("signup_risk_events")
      .delete({ count: "exact" })
      .lt("created_at", fraudPruneThreshold)
    fraudPruned = count ?? 0
  } catch (err: any) {
    errors.push(`signup_risk_events pruning failed: ${err.message}`)
  }

  const securityPruneThreshold = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString()
  try {
    const { count } = await (adminSupabase as any)
      .schema("master_admin")
      .from("security_events")
      .delete({ count: "exact" })
      .lt("created_at", securityPruneThreshold)
    securityPruned = count ?? 0
  } catch (err: any) {
    errors.push(`security_events pruning failed: ${err.message}`)
  }

  const businessPruneThreshold = new Date(now.getTime() - 730 * 24 * 60 * 60 * 1000).toISOString()
  try {
    const { count } = await (adminSupabase as any)
      .schema("master_admin")
      .from("business_events")
      .delete({ count: "exact" })
      .lt("created_at", businessPruneThreshold)
    businessPruned = count ?? 0
  } catch (err: any) {
    errors.push(`business_events pruning failed: ${err.message}`)
  }

  console.log(
    `[cron] check-subscriptions: warned=${warned} expired=${expired} dunningDowngraded=${dunningDowngraded} pruned=${pruned} fraudPruned=${fraudPruned} securityPruned=${securityPruned} businessPruned=${businessPruned} errors=${errors.length}`
  )

  return NextResponse.json({
    success: true,
    warned,
    expired,
    dunningDowngraded,
    pruned,
    fraudPruned,
    securityPruned,
    businessPruned,
    errors: errors.length > 0 ? errors : undefined,
    runAt: now.toISOString(),
  })
}

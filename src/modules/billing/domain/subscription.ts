import type { Subscription as DbSubscription } from "@/infrastructure/db/types/database"
import type { Subscription as UISubscription } from "@/shared/types/project"
import { PLAN_LIMITS, type SubscriptionPlan } from "@/shared/types/project"

type SubscriptionEntitlementRow = Pick<DbSubscription, "plan" | "status"> & {
  grace_period_end?: string | null
}

function hasPaidEntitlement(subscription: SubscriptionEntitlementRow): boolean {
  if (subscription.status === "active" || subscription.status === "trialing") {
    return true
  }
  if (subscription.status === "past_due" && subscription.grace_period_end) {
    return new Date(subscription.grace_period_end).getTime() > Date.now()
  }
  return false
}

/**
 * Webhook-driven billing status is the source of truth.
 * Active/trialing are paid; past_due keeps paid entitlements only during grace.
 */
export function getEffectivePlan(
  subscription: SubscriptionEntitlementRow | null | undefined
): SubscriptionPlan {
  if (!subscription || !hasPaidEntitlement(subscription)) {
    return "free"
  }
  return subscription.plan
}

export function getEffectiveProjectsLimit(
  subscription:
    | (Pick<DbSubscription, "plan" | "status" | "projects_limit"> & { grace_period_end?: string | null })
    | null
    | undefined
): number {
  if (!subscription || !hasPaidEntitlement(subscription)) {
    return PLAN_LIMITS.free
  }
  const n = subscription.projects_limit
  if (typeof n === "number" && n >= 0) {
    return n
  }
  return PLAN_LIMITS[subscription.plan] ?? PLAN_LIMITS.free
}

/** Subscription panel + dashboard: consistent plan name and limits vs AI usage. */
export function toUISubscription(
  dbSub: DbSubscription | null,
  projectsUsed: number
): UISubscription {
  const plan = getEffectivePlan(dbSub)
  const projectsLimit = getEffectiveProjectsLimit(dbSub)
  return {
    plan,
    projectsLimit,
    projectsUsed,
    expiresAt:
      dbSub && hasPaidEntitlement(dbSub) && dbSub.current_period_end
        ? new Date(dbSub.current_period_end)
        : undefined,
  }
}

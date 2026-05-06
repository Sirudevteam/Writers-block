import type { SupabaseClient } from "@supabase/supabase-js"
import { getEffectivePlan } from "@/modules/billing/domain/subscription"
import type { SubscriptionPlan } from "@/shared/types/project"
import type { Subscription as DbSubscription } from "@/infrastructure/db/types/database"
import {
  getCachedSubscriptionEntitlement,
  setCachedSubscriptionEntitlement,
} from "@/modules/billing/infrastructure/subscription-plan-cache"
import type { Database } from "@/infrastructure/db/types/database"

/**
 * Resolves the effective plan for AI rate limits, using a short Redis cache
 * to reduce hot-path reads to `subscriptions` under load.
 */
export async function getEffectivePlanForApiUser(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<SubscriptionPlan> {
  const cached = await getCachedSubscriptionEntitlement(userId)
  if (cached !== "miss") {
    if (cached === null) {
      return getEffectivePlan(null)
    }
    return getEffectivePlan({
      plan: cached.plan,
      status: cached.status,
    } as Pick<DbSubscription, "plan" | "status">)
  }

  const { data: subscription } = await (supabase.from("subscriptions") as any)
    .select("plan, status")
    .eq("user_id", userId)
    .maybeSingle()

  await setCachedSubscriptionEntitlement(
    userId,
    subscription ? { plan: subscription.plan, status: subscription.status } : null
  )
  return getEffectivePlan(subscription ?? null)
}

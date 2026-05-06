export interface Project {
  id: string
  title: string
  description?: string
  content?: string
  createdAt: Date
  updatedAt: Date
  genre?: string
  characters?: string
  location?: string
  mood?: string
}

export type SubscriptionPlan = "free" | "pro" | "premium"

export interface Subscription {
  plan: SubscriptionPlan
  projectsLimit: number
  projectsUsed: number
  expiresAt?: Date
}

/** At or above this projects_limit, UI treats the account as unlimited. */
const UNLIMITED_PROJECTS_THRESHOLD = 500_000

export function isUnlimitedProjectLimit(n: number): boolean {
  return n >= UNLIMITED_PROJECTS_THRESHOLD
}

export const PLAN_LIMITS: Record<SubscriptionPlan, number> = {
  free: 3,
  pro: 25,
  /** Matches DB: premium subscribers get 999,999 (effectively unlimited). */
  premium: 999_999,
}

export const PLAN_NAMES: Record<SubscriptionPlan, string> = {
  free: "Free",
  pro: "Pro",
  premium: "Premium",
}

// Per-user daily generation limits by plan
export const PLAN_DAILY_LIMITS: Record<SubscriptionPlan, number> = {
  free: 5,
  pro: 50,
  premium: 200,
}

export type BillingCycle = "monthly" | "annual"

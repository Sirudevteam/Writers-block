import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/infrastructure/db/types/database"
import { createAdminClient } from "@/infrastructure/db/supabase/admin"
import type { SubscriptionPlan } from "@/shared/types/project"
import {
  getAiCreditTopupPack,
  getAiPlanEntitlement,
  type AiCreditAuthorization,
  type AiCreditHistoryItem,
  type AiCreditReservation,
  type AiCreditSnapshot,
} from "@/modules/ai/domain/credits"

type AdminClient = SupabaseClient<Database>

type ReservationRpcRow = {
  status?: string
  reservation_id?: string | null
  required_credits?: number
  reserved_credits?: number
  included_remaining_at_reservation?: number
  available_credits?: number
  reason?: string
}

function getCreditsAdminClient(): AdminClient | null {
  try {
    return createAdminClient()
  } catch {
    return null
  }
}

function currentMonthStartIso(date = new Date()): string {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)).toISOString().slice(0, 10)
}

function nextMonthStartIso(date = new Date()): string {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1)).toISOString()
}

function emptyReservation(status: AiCreditReservation["status"], reason?: string): AiCreditReservation {
  return {
    id: null,
    requiredCredits: 0,
    reservedCredits: 0,
    includedRemainingAtReservation: 0,
    status,
    reason,
  }
}

export async function getAiCreditSnapshot(params: {
  userId: string
  plan: SubscriptionPlan
}): Promise<AiCreditSnapshot> {
  const entitlement = getAiPlanEntitlement(params.plan)
  const pack = getAiCreditTopupPack()
  const admin = getCreditsAdminClient()
  const monthStart = currentMonthStartIso()
  let includedCreditsUsed = 0
  let topUpCreditsRemaining = 0

  if (admin) {
    const { data: monthly } = await admin
      .from("ai_usage_monthly")
      .select("input_tokens, output_tokens")
      .eq("user_id", params.userId)
      .eq("month_start", monthStart)
      .maybeSingle()

    includedCreditsUsed = Number(monthly?.input_tokens ?? 0) + Number(monthly?.output_tokens ?? 0)

    const { data: topUps } = await (admin as any)
      .from("ai_credit_topup_purchases")
      .select("credits_remaining")
      .eq("user_id", params.userId)

    topUpCreditsRemaining = Array.isArray(topUps)
      ? topUps.reduce((sum, row) => sum + Math.max(0, Number(row?.credits_remaining ?? 0)), 0)
      : 0
  }

  const includedCreditsRemaining = Math.max(0, entitlement.monthlyCredits - includedCreditsUsed)

  return {
    plan: params.plan,
    positioning: entitlement.positioning,
    routingLabel: entitlement.routingLabel,
    includedCreditsLimit: entitlement.monthlyCredits,
    includedCreditsUsed,
    includedCreditsRemaining,
    topUpCreditsRemaining,
    totalCreditsRemaining: includedCreditsRemaining + topUpCreditsRemaining,
    resetAt: nextMonthStartIso(),
    topUpEligible: entitlement.topUpEligible,
    topUpPack: pack,
  }
}

export async function listAiCreditHistory(params: {
  userId: string
  limit?: number
}): Promise<AiCreditHistoryItem[]> {
  const admin = getCreditsAdminClient()
  if (!admin) return []

  const { data, error } = await (admin as any)
    .from("ai_credit_topup_purchases")
    .select("id, razorpay_payment_id, razorpay_order_id, amount_paise, credits_granted, credits_remaining, created_at")
    .eq("user_id", params.userId)
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(params.limit ?? 20, 100)))

  if (error || !Array.isArray(data)) return []

  return data.map((row) => ({
    id: String(row.id),
    razorpayPaymentId: String(row.razorpay_payment_id ?? ""),
    razorpayOrderId: String(row.razorpay_order_id ?? ""),
    amountPaise: Number(row.amount_paise ?? 0),
    creditsGranted: Number(row.credits_granted ?? 0),
    creditsRemaining: Number(row.credits_remaining ?? 0),
    createdAt: String(row.created_at ?? ""),
  }))
}

export async function authorizeAiCredits(params: {
  userId: string
  plan: SubscriptionPlan
  requestId: string
  currentMonthlyCreditsUsed: number
  includedCreditLimit: number
  estimatedCredits: number
}): Promise<AiCreditAuthorization> {
  const includedRemaining = Math.max(0, params.includedCreditLimit - params.currentMonthlyCreditsUsed)
  const requiredTopUpCredits = Math.max(
    0,
    params.currentMonthlyCreditsUsed + params.estimatedCredits - params.includedCreditLimit
  )
  const snapshot = await getAiCreditSnapshot({ userId: params.userId, plan: params.plan })

  if (requiredTopUpCredits <= 0) {
    return {
      reservation: {
        ...emptyReservation("not_required"),
        includedRemainingAtReservation: includedRemaining,
      },
      topUpBalance: snapshot.topUpCreditsRemaining,
      includedCreditsUsed: params.currentMonthlyCreditsUsed,
      includedCreditsLimit: params.includedCreditLimit,
    }
  }

  const entitlement = getAiPlanEntitlement(params.plan)
  if (!entitlement.topUpEligible) {
    return {
      reservation: {
        ...emptyReservation(
          "blocked",
          "Monthly AI credits exhausted. Upgrade to Pro or Premium to continue with paid top-ups."
        ),
        requiredCredits: requiredTopUpCredits,
        includedRemainingAtReservation: includedRemaining,
      },
      topUpBalance: snapshot.topUpCreditsRemaining,
      includedCreditsUsed: params.currentMonthlyCreditsUsed,
      includedCreditsLimit: params.includedCreditLimit,
    }
  }

  const admin = getCreditsAdminClient()
  if (!admin) {
    return {
      reservation: {
        ...emptyReservation("unavailable", "AI credit top-up service is unavailable."),
        requiredCredits: requiredTopUpCredits,
        includedRemainingAtReservation: includedRemaining,
      },
      topUpBalance: snapshot.topUpCreditsRemaining,
      includedCreditsUsed: params.currentMonthlyCreditsUsed,
      includedCreditsLimit: params.includedCreditLimit,
    }
  }

  const { data, error } = await (admin as any).rpc("reserve_ai_credit_topup", {
    p_user_id: params.userId,
    p_request_id: params.requestId,
    p_required_credits: requiredTopUpCredits,
    p_included_remaining: includedRemaining,
  })

  if (error) {
    return {
      reservation: {
        ...emptyReservation("unavailable", error.message),
        requiredCredits: requiredTopUpCredits,
        includedRemainingAtReservation: includedRemaining,
      },
      topUpBalance: snapshot.topUpCreditsRemaining,
      includedCreditsUsed: params.currentMonthlyCreditsUsed,
      includedCreditsLimit: params.includedCreditLimit,
    }
  }

  const row = (Array.isArray(data) ? data[0] : data) as ReservationRpcRow | null
  const status = row?.status === "reserved" ? "reserved" : row?.status === "insufficient" ? "blocked" : "unavailable"

  return {
    reservation: {
      id: row?.reservation_id ?? null,
      requiredCredits: Number(row?.required_credits ?? requiredTopUpCredits),
      reservedCredits: Number(row?.reserved_credits ?? 0),
      includedRemainingAtReservation: Number(row?.included_remaining_at_reservation ?? includedRemaining),
      status,
      reason:
        row?.reason ??
        (status === "blocked"
          ? "Monthly AI credits exhausted and no paid top-up credits are available."
          : undefined),
    },
    topUpBalance: Number(row?.available_credits ?? snapshot.topUpCreditsRemaining),
    includedCreditsUsed: params.currentMonthlyCreditsUsed,
    includedCreditsLimit: params.includedCreditLimit,
  }
}

export async function finalizeAiCreditReservation(params: {
  reservationId: string | null | undefined
  actualCredits: number
}): Promise<void> {
  if (!params.reservationId) return
  const admin = getCreditsAdminClient()
  if (!admin) return

  await (admin as any).rpc("finalize_ai_credit_reservation", {
    p_reservation_id: params.reservationId,
    p_actual_credits: Math.max(0, Math.round(params.actualCredits)),
  })
}

export async function releaseAiCreditReservation(reservationId: string | null | undefined): Promise<void> {
  if (!reservationId) return
  const admin = getCreditsAdminClient()
  if (!admin) return

  await (admin as any).rpc("release_ai_credit_reservation", {
    p_reservation_id: reservationId,
  })
}

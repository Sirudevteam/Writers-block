import type { SupabaseClient } from "@supabase/supabase-js"

type ApplyAiCreditTopupResult =
  | { status: "applied"; purchaseId: string; creditsGranted: number; creditsRemaining: number }
  | { status: "duplicate"; purchaseId: string; creditsGranted: number; creditsRemaining: number }
  | { status: "error"; message: string }

type RpcRow = {
  status?: string
  purchase_id?: string
  credits_granted?: number
  credits_remaining?: number
  message?: string
}

export async function applyAiCreditTopupPayment(
  admin: SupabaseClient,
  params: {
    userId: string
    paymentId: string
    orderId: string
    amountPaise: number
    creditsGranted: number
  }
): Promise<ApplyAiCreditTopupResult> {
  const { data, error } = await (admin as any).rpc("apply_ai_credit_topup_payment", {
    p_user_id: params.userId,
    p_payment_id: params.paymentId,
    p_order_id: params.orderId,
    p_amount_paise: params.amountPaise,
    p_credits_granted: params.creditsGranted,
  })

  if (error) return { status: "error", message: error.message }

  const row = data as RpcRow | null
  if (!row || !row.status) return { status: "error", message: "invalid RPC response" }
  if (row.status === "error") return { status: "error", message: row.message ?? "apply failed" }

  if ((row.status === "applied" || row.status === "duplicate") && row.purchase_id) {
    return {
      status: row.status,
      purchaseId: row.purchase_id,
      creditsGranted: Number(row.credits_granted ?? params.creditsGranted),
      creditsRemaining: Number(row.credits_remaining ?? 0),
    }
  }

  return { status: "error", message: "unexpected apply result" }
}

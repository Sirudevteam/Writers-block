import { NextResponse } from "next/server"
import type { SubscriptionPlan } from "@/types/project"
import {
  estimateAiCredits,
  isAiEndpointAllowedForPlan,
  type AiCreditEndpoint,
} from "@/lib/ai-credit-policy"

type SupabaseRpcClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>
  ) => Promise<{ data: unknown; error: { message?: string } | null }>
}

export type AiCreditReservation = {
  id: string
  endpoint: string
  plan: SubscriptionPlan
  estimatedCredits: number
  includedCredits: number
  topupCredits: number
}

type ReserveAiCreditsResult =
  | { ok: true; reservation: AiCreditReservation }
  | { ok: false; response: NextResponse }

function jsonObject(data: unknown): Record<string, unknown> {
  return data && typeof data === "object" && !Array.isArray(data)
    ? (data as Record<string, unknown>)
    : {}
}

function numberField(data: Record<string, unknown>, key: string, fallback = 0): number {
  const value = data[key]
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

function stringField(data: Record<string, unknown>, key: string): string | null {
  const value = data[key]
  return typeof value === "string" ? value : null
}

export function aiCreditHeaders(reservation: AiCreditReservation): Record<string, string> {
  return {
    "X-AI-Credits-Reserved": String(reservation.estimatedCredits),
    "X-AI-Credits-Included": String(reservation.includedCredits),
    "X-AI-Credits-Topup": String(reservation.topupCredits),
  }
}

export async function reserveAiCredits(
  supabase: SupabaseRpcClient,
  params: {
    userId: string
    endpoint: AiCreditEndpoint
    plan: SubscriptionPlan
  }
): Promise<ReserveAiCreditsResult> {
  if (!isAiEndpointAllowedForPlan(params.endpoint, params.plan)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "This AI tool is available on Pro and Premium. Upgrade to unlock." },
        { status: 403 }
      ),
    }
  }

  const estimatedCredits = estimateAiCredits(params.endpoint)
  const { data, error } = await supabase.rpc("reserve_ai_credit", {
    p_user_id: params.userId,
    p_endpoint: params.endpoint,
    p_plan: params.plan,
    p_estimated_credits: estimatedCredits,
  })

  if (error) {
    console.error("[ai-credits] reservation failed", error)
    return {
      ok: false,
      response: NextResponse.json(
        { error: "AI credit reservation is unavailable. Please try again shortly." },
        { status: 503 }
      ),
    }
  }

  const payload = jsonObject(data)
  const status = stringField(payload, "status")

  if (status === "paid_plan_required") {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "This AI tool is available on Pro and Premium. Upgrade to unlock." },
        { status: 403 }
      ),
    }
  }

  if (status === "insufficient_credits") {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "Monthly AI credits exhausted. Upgrade or add credits to continue.",
          requiredCredits: numberField(payload, "estimated_credits", estimatedCredits),
          includedCreditsAvailable: numberField(payload, "included_available"),
          topupCreditsAvailable: numberField(payload, "topup_available"),
        },
        {
          status: 402,
          headers: {
            "X-AI-Credits-Required": String(numberField(payload, "estimated_credits", estimatedCredits)),
            "X-AI-Credits-Included-Available": String(numberField(payload, "included_available")),
            "X-AI-Credits-Topup-Available": String(numberField(payload, "topup_available")),
          },
        }
      ),
    }
  }

  const reservationId = stringField(payload, "reservation_id")
  if (status !== "reserved" || !reservationId) {
    console.error("[ai-credits] unexpected reservation response", payload)
    return {
      ok: false,
      response: NextResponse.json(
        { error: "AI credit reservation failed. Please try again shortly." },
        { status: 503 }
      ),
    }
  }

  return {
    ok: true,
    reservation: {
      id: reservationId,
      endpoint: params.endpoint,
      plan: (stringField(payload, "plan") as SubscriptionPlan | null) ?? params.plan,
      estimatedCredits: numberField(payload, "estimated_credits", estimatedCredits),
      includedCredits: numberField(payload, "included_credits"),
      topupCredits: numberField(payload, "topup_credits"),
    },
  }
}

export async function markAiProviderStarted(
  supabase: SupabaseRpcClient,
  reservation: AiCreditReservation
): Promise<void> {
  const { error } = await supabase.rpc("mark_ai_credit_provider_started", {
    p_reservation_id: reservation.id,
  })
  if (error) {
    throw new Error(error.message || "Failed to mark AI provider start")
  }
}

export async function settleAiCreditReservation(
  supabase: SupabaseRpcClient,
  reservation: AiCreditReservation,
  params: {
    outcome: "commit" | "release" | "failed_charged"
    actualCredits?: number
    failureCode?: string
  }
): Promise<void> {
  const { error } = await supabase.rpc("settle_ai_credit_reservation", {
    p_reservation_id: reservation.id,
    p_outcome: params.outcome,
    p_actual_credits: params.actualCredits ?? reservation.estimatedCredits,
    p_failure_code: params.failureCode ?? null,
  })
  if (error) {
    throw new Error(error.message || "Failed to settle AI credit reservation")
  }
}

export function createAiCreditSseStream<T>(params: {
  providerStream: AsyncIterable<T>
  supabase: SupabaseRpcClient
  reservation: AiCreditReservation
  getText: (chunk: T) => string | null
}): ReadableStream<Uint8Array> {
  let settled: Promise<void> | null = null

  const settleOnce = (outcome: "commit" | "failed_charged", failureCode?: string) => {
    settled ??= settleAiCreditReservation(params.supabase, params.reservation, {
      outcome,
      failureCode,
    })
    return settled
  }

  return new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()

      try {
        for await (const chunk of params.providerStream) {
          const text = params.getText(chunk)
          if (text) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ content: text })}\n\n`)
            )
          }
        }

        await settleOnce("commit")
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`))
        controller.close()
      } catch (error) {
        try {
          await settleOnce("failed_charged", "provider_stream_error")
        } catch (settleError) {
          console.error("[ai-credits] failed to charge stream failure", settleError)
        }
        controller.error(error)
      }
    },
    async cancel() {
      try {
        await settleOnce("failed_charged", "client_stream_cancelled")
      } catch (error) {
        console.error("[ai-credits] failed to charge cancelled stream", error)
      }
    },
  })
}

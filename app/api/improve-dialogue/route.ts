import { NextRequest, NextResponse } from "next/server"
import Replicate from "replicate"
import { createClient } from "@/lib/supabase/server"
import { runAiRateLimits } from "@/lib/ai-rate-limits"
import { getEffectivePlanForApiUser } from "@/lib/ai-effective-plan"
import { apiIpLimitOr429 } from "@/lib/api-ip-limit"
import { buildTextCompletionInput, getReplicateModelForPlan, getStreamOutputText } from "@/lib/replicate-model"
import {
  aiCreditHeaders,
  createAiCreditSseStream,
  markAiProviderStarted,
  reserveAiCredits,
  settleAiCreditReservation,
} from "@/lib/ai-credits"

const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN })

export async function POST(req: NextRequest) {
  try {
    const tooMany = await apiIpLimitOr429(req)
    if (tooMany) return tooMany

    // ── Auth check ────────────────────────────────────────────────────────────
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const effectivePlan = await getEffectivePlanForApiUser(supabase, user.id)
    const rate = await runAiRateLimits(req, effectivePlan, user.id)
    if (!rate.ok) return rate.response
    const { planQuota } = rate

    const { screenplay } = await req.json()

    if (!screenplay || screenplay.trim().length < 50) {
      return NextResponse.json({ error: "Screenplay is too short to improve" }, { status: 400 })
    }

    const credit = await reserveAiCredits(supabase as any, {
      userId: user.id,
      endpoint: "improve-dialogue",
      plan: effectivePlan,
    })
    if (!credit.ok) return credit.response
    const { reservation } = credit
    const model = getReplicateModelForPlan(reservation.plan)

    const systemPrompt = `You are an expert Tamil cinema dialogue writer. You improve screenplay dialogue to make it more:
- Emotionally authentic (உண்மையான உணர்ச்சி)
- Natural and conversational (இயற்கையான பேச்சுவழக்கு)
- Cinematic and impactful (திரைப்படத்திற்கு ஏற்ற)
- Character-specific (கதாபாத்திரத்திற்கு ஏற்ற)

RULES:
- Keep ALL scene headings, transitions, and action lines EXACTLY as they are
- Only improve DIALOGUE lines (lines after character names)
- Keep character names exactly the same
- Keep the same format (scene headings in ENGLISH, dialogue in TAMIL)
- Do NOT add new scenes or characters
- Return the COMPLETE improved screenplay, not just the dialogue`

    const input = buildTextCompletionInput(model, {
      systemPrompt: systemPrompt,
      userPrompt: `Improve the dialogue in this Tamil screenplay while keeping everything else identical:\n\n${screenplay}`,
      maxTokens: parseInt(process.env.MAX_TOKENS || "8000", 10),
      temperature: 0.7,
      topP: 0.9,
      llama: { minTokens: 200, topK: 40, presencePenalty: 0.3 },
    })

    let providerStarted = false
    let stream
    try {
      await markAiProviderStarted(supabase as any, reservation)
      providerStarted = true
      stream = await replicate.stream(model as `${string}/${string}`, { input })
    } catch (error) {
      await settleAiCreditReservation(supabase as any, reservation, {
        outcome: providerStarted ? "failed_charged" : "release",
        failureCode: providerStarted ? "provider_start_error" : "provider_not_started",
      }).catch((settleError) => {
        console.error("[ai-credits] failed to settle improve-dialogue startup error", settleError)
      })
      throw error
    }

    const readableStream = createAiCreditSseStream({
      providerStream: stream,
      supabase: supabase as any,
      reservation,
      getText: getStreamOutputText,
    })

    return new NextResponse(readableStream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        ...aiCreditHeaders(reservation),
        "X-RateLimit-Remaining": String(planQuota.remaining),
      },
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to improve dialogue" },
      { status: 500 }
    )
  }
}

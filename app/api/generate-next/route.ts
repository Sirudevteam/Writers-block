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

    const { screenplay, genre, characters, mood } = await req.json()

    if (!screenplay || screenplay.trim().length < 100) {
      return NextResponse.json({ error: "Existing screenplay is too short to continue" }, { status: 400 })
    }

    const credit = await reserveAiCredits(supabase as any, {
      userId: user.id,
      endpoint: "generate-next",
      plan: effectivePlan,
    })
    if (!credit.ok) return credit.response
    const { reservation } = credit
    const model = getReplicateModelForPlan(reservation.plan)

    const systemPrompt = `You are an expert Tamil cinema screenplay writer continuing an existing screenplay.

RULES:
1. Read the existing screenplay carefully — understand the story so far
2. Continue EXACTLY where it left off — same tone, same characters, same style
3. Write 3-5 NEW scenes that advance the story logically
4. Follow the same format: scene headings in ENGLISH, content in TAMIL
5. Keep character names consistent with what's already written
6. Do NOT repeat scenes that already exist
7. End with a clear narrative beat (not mid-sentence)
8. Do NOT include the original screenplay in your response — only the NEW scenes`

    const userPrompt = `EXISTING SCREENPLAY:
${screenplay}

---
CONTINUE the story with 3-5 new scenes.
Genre: ${genre || "drama"}
Characters: ${characters || "same as existing"}
Mood: ${mood || "same as existing"}

Write only the NEW continuation scenes starting from where the screenplay ended:`

    const input = buildTextCompletionInput(model, {
      systemPrompt: systemPrompt,
      userPrompt,
      maxTokens: parseInt(process.env.MAX_TOKENS || "8000", 10),
      temperature: 0.75,
      topP: 0.9,
      llama: { minTokens: 400, presencePenalty: 0.3 },
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
        console.error("[ai-credits] failed to settle generate-next startup error", settleError)
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
      { error: error?.message || "Failed to generate next scene" },
      { status: 500 }
    )
  }
}

// Tamil story generation via Replicate — requires auth (same as other AI routes)

import { NextRequest, NextResponse } from "next/server"
import Replicate from "replicate"
import { createClient } from "@/lib/supabase/server"
import { runAiRateLimits } from "@/lib/ai-rate-limits"
import { getEffectivePlanForApiUser } from "@/lib/ai-effective-plan"
import { apiIpLimitOr429 } from "@/lib/api-ip-limit"
import { buildTextCompletionInput, getReplicateModelForPlan, getStreamOutputText } from "@/lib/replicate-model"
import { tamilStoryRequestSchema } from "@/lib/api-schemas/documents-story"
import { zodErrorJsonResponse } from "@/lib/api-schemas/zod-response"
import {
  aiCreditHeaders,
  createAiCreditSseStream,
  markAiProviderStarted,
  reserveAiCredits,
  settleAiCreditReservation,
} from "@/lib/ai-credits"

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
})

export async function POST(req: NextRequest) {
  try {
    const tooMany = await apiIpLimitOr429(req)
    if (tooMany) return tooMany

    const token = process.env.REPLICATE_API_TOKEN
    if (!token) {
      return NextResponse.json(
        { error: "REPLICATE_API_TOKEN not configured. Please add your token to .env.local" },
        { status: 500 }
      )
    }

    const placeholders = [
      "r8_your_replicate_api_token_here",
      "r8_paste_your_real_token_here",
      "r8_...",
    ]
    if (placeholders.some((p) => token.includes(p)) || token.length < 20) {
      return NextResponse.json(
        {
          error: "Invalid API token: Reconfigure REPLICATE_API_TOKEN in server environment.",
        },
        { status: 500 }
      )
    }

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

    let raw: unknown
    try {
      raw = await req.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    const parsed = tamilStoryRequestSchema.safeParse(raw)
    if (!parsed.success) {
      return zodErrorJsonResponse(parsed.error)
    }

    const { genre, characters, location, mood, sceneDescription } = parsed.data

    const credit = await reserveAiCredits(supabase as any, {
      userId: user.id,
      endpoint: "documents",
      plan: effectivePlan,
    })
    if (!credit.ok) return credit.response
    const { reservation } = credit
    const model = getReplicateModelForPlan(reservation.plan)

    const systemPrompt = `நீ ஒரு தமிழ் கதை எழுத்தாளர். நீங்கள் தமிழில் சிறந்த கதைகள் எழுதுவதில் வல்லுநர்.

உங்கள் பணி: கொடுக்கப்பட்ட விவரங்களின் அடிப்படையில் ஒரு அழகான தமிழ் கதை எழுதுவது.

வழிகாட்டுதல்கள்:
1. கதை தமிழில் மட்டுமே எழுத வேண்டும்
2. வாசகர்களை கவரும் வகையில் கதையமைப்பு இருக்க வேண்டும்
3. கதாபாத்திரங்களின் உணர்வுகளை ஆழமாக விவரிக்கவும்
4. இடங்களை விவரித்து காட்சிகளை கண்முன் நிறுத்தவும்
5. உரையாடல்கள் இயல்பாகவும் உயிரோட்டமாகவும் இருக்க வேண்டும்
6. ஒரு நல்ல முடிவு கொடுக்கவும்

கதை அமைப்பு:
- தலைப்பு
- அறிமுகம் (இடம், காலம்)
- கதாநாயகர்கள்
- சம்பவங்கள்
- முடிவு`

    const userPrompt = `பின்வரும் விவரங்களின் அடிப்படையில் ஒரு தமிழ் கதை எழுதுங்கள்:

துறை (Genre): ${genre}
கதாபாத்திரங்கள்: ${characters}
இடம்: ${location}
மனநிலை (Mood): ${mood?.trim() || "விறுவிறுப்பான"}
காட்சி விவரம்: ${sceneDescription}

தமிழில் ஒரு முழுமையான கதை எழுதுங்கள். கதையில் உரையாடல்கள், விவரிப்புகள் மற்றும் உணர்ச்சிகள் இருக்க வேண்டும்.`

    const input = buildTextCompletionInput(model, {
      systemPrompt: systemPrompt,
      userPrompt,
      maxTokens: parseInt(process.env.MAX_TOKENS || "4096", 10),
      temperature: 0.7,
      topP: 0.9,
      llama: { minTokens: 0, presencePenalty: 1.15 },
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
        console.error("[ai-credits] failed to settle documents startup error", settleError)
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
      },
    })
  } catch (error: unknown) {
    const err = error as { response?: { status?: number }; message?: string }
    console.error("Error generating Tamil story:", error)

    if (err?.response?.status === 401 || err?.message?.includes("unauthorized")) {
      return NextResponse.json(
        { error: "Invalid Replicate API token. Check REPLICATE_API_TOKEN." },
        { status: 500 }
      )
    }

    if (err?.response?.status === 429) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please wait a moment and try again." },
        { status: 500 }
      )
    }

    return NextResponse.json(
      { error: err?.message || "Failed to generate Tamil story. Please try again." },
      { status: 500 }
    )
  }
}

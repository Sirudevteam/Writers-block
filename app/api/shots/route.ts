// Tamil Cinematic Shot Suggestions API using Replicate (default: google/gemini-2.5-flash)

import { NextRequest, NextResponse } from "next/server"
import Replicate from "replicate"
import { createClient } from "@/lib/supabase/server"
import { runAiRateLimits } from "@/lib/ai-rate-limits"
import { getEffectivePlanForApiUser } from "@/lib/ai-effective-plan"
import { apiIpLimitOr429 } from "@/lib/api-ip-limit"
import { buildTextCompletionInput, getReplicateModelForPlan } from "@/lib/replicate-model"
import {
  aiCreditHeaders,
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

    const { sceneText } = await req.json()

    if (!sceneText || sceneText.trim().length < 50) {
      return NextResponse.json(
        { error: "Scene text is too short. Please provide a complete scene." },
        { status: 400 }
      )
    }

    const credit = await reserveAiCredits(supabase as any, {
      userId: user.id,
      endpoint: "shots",
      plan: effectivePlan,
    })
    if (!credit.ok) return credit.response
    const { reservation } = credit
    const model = getReplicateModelForPlan(reservation.plan)

    const systemPrompt = `நீ ஒரு தொழில்முறை திரைப்பட இயக்குநர் மற்றும் ஒளிப்பதிவாளர்.

கொடுக்கப்பட்ட காட்சியின் அடிப்படையில் திரைப்பட ஷாட் பரிந்துரைகளை உருவாக்கவும்.

4-6 ஷாட்களுக்கு பின்வரும் விவரங்களை வழங்கவும்:

1. ஷாட் எண்
2. ஷாட் வகை (Wide, Medium, Close-Up, Extreme Close-Up போன்றவை)
3. கேமரா கோணம் (Low angle, High angle, Eye level, Dutch angle போன்றவை)
4. கம்போசிஷன் (Rule of thirds, Center frame, Leading lines போன்றவை)
5. கேமரா இயக்கம் (Static, Pan, Tilt, Dolly, Track, Handheld போன்றவை)
6. ஷாட்டின் நோக்கம் (Emotional beat, Reveal, Transition போன்றவை)

JSON வடிவத்தில் மட்டும் பதிலளிக்கவும்:
[
  {
    "shotNumber": 1,
    "shotType": "Wide",
    "cameraAngle": "Eye level",
    "composition": "Rule of thirds",
    "cameraMovement": "Static",
    "purpose": "Establish location",
    "description": "Brief description"
  }
]

காட்சியின் உணர்வுகள், செயல்கள், இடம், கதாபாத்திர இடைவினைகளின் அடிப்படையில் பரிந்துரைகள் செய்யவும்.`

    const input = buildTextCompletionInput(model, {
      systemPrompt: systemPrompt,
      userPrompt: `இந்த காட்சிக்கு ஷாட் பரிந்துரைகளை உருவாக்கவும்:\n\n${sceneText}`,
      maxTokens: 2048,
      temperature: 0.6,
      topP: 0.9,
      llama: { minTokens: 0, presencePenalty: 1.15 },
    })

    let providerStarted = false
    let output
    try {
      await markAiProviderStarted(supabase as any, reservation)
      providerStarted = true
      output = await replicate.run(model as `${string}/${string}`, { input })
    } catch (error) {
      await settleAiCreditReservation(supabase as any, reservation, {
        outcome: providerStarted ? "failed_charged" : "release",
        failureCode: providerStarted ? "provider_run_error" : "provider_not_started",
      }).catch((settleError) => {
        console.error("[ai-credits] failed to settle shots provider error", settleError)
      })
      throw error
    }

    let text = ""
    if (Array.isArray(output)) {
      text = output.join("")
    } else if (typeof output === "string") {
      text = output
    }

    let shots
    try {
      const jsonMatch = text.match(/\[[\s\S]*\]/)
      if (jsonMatch) {
        shots = JSON.parse(jsonMatch[0])
      } else {
        shots = JSON.parse(text)
      }
    } catch {
      await settleAiCreditReservation(supabase as any, reservation, {
        outcome: "failed_charged",
        failureCode: "provider_parse_error",
      }).catch((settleError) => {
        console.error("[ai-credits] failed to settle shots parse error", settleError)
      })
      return NextResponse.json(
        { error: "Failed to parse shot suggestions. Please try again." },
        { status: 500 }
      )
    }

    await settleAiCreditReservation(supabase as any, reservation, { outcome: "commit" })

    return NextResponse.json({ shots }, { headers: aiCreditHeaders(reservation) })
  } catch (error: any) {
    if (error?.status === 401 || error?.message?.includes("unauthorized")) {
      return NextResponse.json(
        { error: "Server configuration error. Please contact support." },
        { status: 500 }
      )
    }

    return NextResponse.json(
      { error: error?.message || "Failed to generate shot suggestions" },
      { status: 500 }
    )
  }
}

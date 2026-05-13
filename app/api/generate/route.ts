// Tamil Story Generation API using Replicate (default: google/gemini-2.5-flash; Llama supported via REPLICATE_MODEL)
// Supports Tamil language generation with auth, rate limiting, and usage tracking

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

const token = process.env.REPLICATE_API_TOKEN

const replicate = new Replicate({
  auth: token,
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

    // ── Subscription check (cached) ─────────────────────────────────────────
    const effectivePlan = await getEffectivePlanForApiUser(supabase, user.id)
    const rate = await runAiRateLimits(req, effectivePlan, user.id)
    if (!rate.ok) return rate.response
    const { planQuota } = rate

    // Check for placeholder token
    const placeholders = [
      "r8_your_replicate_api_token_here",
      "r8_your_replicate_token_here",
      "r8_paste_your_real_token_here",
      "r8_...",
    ]
    if (!token || placeholders.some((p) => token.includes(p)) || token.length < 20) {
      return NextResponse.json(
        { error: "Server configuration error. Please contact support." },
        { status: 500 }
      )
    }

    const { genre, characters, location, mood, sceneDescription } = await req.json()

    if (!genre || !characters || !location || !sceneDescription) {
      return NextResponse.json(
        { error: "Missing required fields: genre, characters, location, sceneDescription" },
        { status: 400 }
      )
    }

    const credit = await reserveAiCredits(supabase as any, {
      userId: user.id,
      endpoint: "generate",
      plan: effectivePlan,
    })
    if (!credit.ok) return credit.response
    const { reservation } = credit
    const model = getReplicateModelForPlan(reservation.plan)

    const systemPrompt = `You are an expert Tamil cinema screenplay writer with 20+ years of experience in the Tamil film industry.

STRICT FORMAT RULES — never deviate:

1. SCENE HEADINGS in ENGLISH only: "1. EXT - CRICKET STADIUM - DAY"
   Sub-scenes: "1A. INT - DRESSING ROOM - DAY"
   Number every scene sequentially.

2. TRANSITIONS in ENGLISH only: FADE IN, CUT TO, FADE OUT, DISSOLVE TO, SMASH CUT

3. CAMERA DIRECTIONS in English mixed with Tamil:
   "Camera மெதுவாக மேலெழும்ப.."
   "Close-up-ல் Deena முகம்.."
   "Wide shot-ல் Stadium காட்ட.."

4. ACTION LINES in Tamil — vivid, cinematic, emotional descriptions. End each line with ".."

5. CHARACTER NAMES: Use exact names given. Never rename or add new characters.

6. DIALOGUE: Conversational Tamil. Realistic. Emotional. Cricket-appropriate.

7. PARENTHETICALS in Tamil: (கோபமாக), (பதட்டத்துடன்), (மெல்லிய குரலில்)

8. Tamil action lines end with ".." — this is mandatory Tamil screenplay style.

9. Technical/sport terms stay in English: Crease, Over, Six, Wicket, Boundary, Run-up, Ball, Bat, Stumps, Stadium, Camera, Focus, Close-up, Wide shot

10. DO NOT add any meta-commentary like "Note:", "This is just the beginning", or any text after FADE OUT.

11. Each scene must be DIFFERENT — new angle, new emotion, new action. Never repeat the same description.

STRUCTURE EACH SCREENPLAY IN 3 ACTS:
- ACT 1: Setup — establish location, characters, stakes
- ACT 2: Tension — build conflict, emotion, pressure
- ACT 3: Climax — the decisive moment, resolution

EXAMPLE FORMAT:

FADE IN

1. EXT - CRICKET STADIUM - DAY

50,000 ரசிகர்கள் நிறைந்த ஒரு மகத்தான Stadium.. Camera மெதுவாக Aerial-ல் இருந்து கீழே இறங்க..

Pitch-ல் இரண்டு Batsman-கள் நிற்கின்றனர்.. Tension காற்றில் கலந்திருக்கிறது..

CUT TO

1A. EXT - CRICKET PITCH - CLOSE UP - DAY

Close-up-ல் ஒரு Batsman-இன் கண்கள்.. வியர்வை நெற்றியில் ஒழுக..

அவன்
 ராஜேஷ்..

ராஜேஷ் Bat-ஐ இறுகப் பற்றிக்கொள்கிறான்..

Write a COMPLETE, CINEMATIC screenplay with minimum 6-8 detailed scenes. Every scene must have unique action and advance the story.`

    const charList = characters || ""
    const sceneMood = mood || "intense"

    const userPrompt = `Write a professional Tamil cinema screenplay for this story:

GENRE: ${genre}
LOCATION: ${location}
MOOD: ${sceneMood}
CHARACTERS: ${charList}

STORY:
${sceneDescription}

IMPORTANT INSTRUCTIONS:
- Read the story carefully and use ALL specific details given (names, roles, situation)
- If a character is described as a "fast bowler" — write him bowling with power and aggression
- If a character is described as "wicket keeper" — show him crouching, gloves ready
- If the moment is "last ball, need a six" — BUILD that tension with close-ups, crowd reactions, heartbeats
- Show character EMOTIONS, not just their position
- Crowd reactions are important — show ரசிகர்கள் response at each dramatic moment
- Minimum 6 scenes. Each scene must be visually distinct
- End the screenplay with FADE OUT after the climax

Start with FADE IN:`

    const input = buildTextCompletionInput(model, {
      systemPrompt: systemPrompt,
      userPrompt,
      maxTokens: parseInt(process.env.MAX_TOKENS || "8000", 10),
      temperature: 0.75,
      topP: 0.9,
      llama: { minTokens: 800, presencePenalty: 0.3 },
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
        console.error("[ai-credits] failed to settle generate startup error", settleError)
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
        "X-RateLimit-Limit": String(planQuota.limit),
        "X-RateLimit-Remaining": String(planQuota.remaining),
        "X-RateLimit-Reset": String(Math.ceil(planQuota.reset / 1000)),
      },
    })
  } catch (error: any) {
    console.error("Error generating Tamil story:", error)

    if (error?.status === 401 || error?.message?.includes("unauthorized")) {
      return NextResponse.json(
        { error: "Server configuration error. Please contact support." },
        { status: 500 }
      )
    }

    if (error?.status === 429) {
      return NextResponse.json(
        { error: "AI service is busy. Please wait a moment and try again." },
        { status: 503 }
      )
    }

    return NextResponse.json(
      { error: error?.message || "Failed to generate screenplay. Please try again." },
      { status: 500 }
    )
  }
}

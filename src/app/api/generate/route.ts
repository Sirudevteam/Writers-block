// Tamil Story Generation API with direct provider routing, rate limiting, and usage tracking

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/infrastructure/db/supabase/server"
import { runAiRateLimits } from "@/modules/ai/application/rate-limits"
import { getEffectivePlanForApiUser } from "@/modules/ai/application/effective-plan"
import { apiIpLimitOr429 } from "@/core/security/api-ip-limit"
import { logBusinessEvent } from "@/modules/master-admin/application/events"
import { createGenerationSseResponse } from "@/modules/ai/application/generation-service"
import { aiRouteErrorResponse } from "@/modules/ai/infrastructure/provider-router"
import { resolveAiTaskPolicy } from "@/modules/ai/domain/task-policy"
import { generateScreenplaySchema } from "@/modules/ai/domain/schemas"
import { zodErrorJsonResponse } from "@/core/http/json"
import { loadProjectForAiContext } from "@/modules/story-memory/application/project-context"
import { fallbackContextForProject } from "@/modules/story-memory/application/story-memory-service"

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
    const rate = await runAiRateLimits(req, effectivePlan, user.id, {
      emailVerified: !!user.email_confirmed_at,
    })
    if (!rate.ok) return rate.response
    const { planQuota } = rate

    let raw: unknown
    try {
      raw = await req.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }
    const parsed = generateScreenplaySchema.safeParse(raw)
    if (!parsed.success) return zodErrorJsonResponse(parsed.error)

    const { genre, characters, location, mood, sceneDescription, projectId } = parsed.data
    const projectContext = await loadProjectForAiContext({ userId: user.id, projectId })
    const policy = resolveAiTaskPolicy({
      endpoint: "generate",
      plan: effectivePlan,
      inputSize: `${characters}\n${location}\n${sceneDescription}`.length,
      requestedMode: "live",
    })

    void logBusinessEvent(req, {
      eventType: "ai.generation",
      userId: user.id,
      plan: effectivePlan,
      metadata: { endpoint: "generate" },
    }).catch(() => {})

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

    return await createGenerationSseResponse({
      userId: user.id,
      plan: effectivePlan,
      endpoint: "generate",
      taskKind: "generate",
      requestedMode: "live",
      complexity: policy.complexity,
      candidateModels: policy.candidateModels,
      orgId: projectContext?.org_id ?? null,
      projectId: projectContext?.id ?? null,
      cacheStrategy: policy.cacheStrategy,
      cacheContext: userPrompt,
      systemPrompt,
      userPrompt,
      fallbackContext: fallbackContextForProject(
        projectContext ?? {
          title: "Untitled screenplay",
          genre,
          characters,
          location,
          mood: sceneMood,
          description: sceneDescription,
        }
      ),
      contextQuery: sceneDescription,
      inputSize: `${characters}\n${location}\n${sceneDescription}`.length,
      maxTokens: policy.maxTokens,
      temperature: 0.75,
      topP: 0.9,
      signal: req.signal,
      metadata: { genre, location, mood: sceneMood, routingPolicy: policy.reason },
      rateLimitHeaders: {
        "X-RateLimit-Limit": String(planQuota.limit),
        "X-RateLimit-Remaining": String(planQuota.remaining),
        "X-RateLimit-Reset": String(Math.ceil(planQuota.reset / 1000)),
      },
    })
  } catch (error: any) {
    console.error("Error generating Tamil story:", error)
    return aiRouteErrorResponse(error, "Failed to generate screenplay. Please try again.")
  }
}

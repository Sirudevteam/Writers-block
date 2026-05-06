// Tamil Cinematic Shot Suggestions API with direct provider routing

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/infrastructure/db/supabase/server"
import { runAiRateLimits } from "@/modules/ai/application/rate-limits"
import { getEffectivePlanForApiUser } from "@/modules/ai/application/effective-plan"
import { apiIpLimitOr429 } from "@/core/security/api-ip-limit"
import { z } from "zod"
import { parseJsonRequest } from "@/core/http/validation"
import { logBusinessEvent } from "@/modules/master-admin/application/events"
import { generateTextWithService } from "@/modules/ai/application/generation-service"
import { aiRouteErrorResponse } from "@/modules/ai/infrastructure/provider-router"
import { aiBudgetHeaders } from "@/modules/ai/application/usage-service"
import { resolveAiTaskPolicy } from "@/modules/ai/domain/task-policy"
import { loadProjectForAiContext } from "@/modules/story-memory/application/project-context"
import { fallbackContextForProject } from "@/modules/story-memory/application/story-memory-service"

const bodySchema = z.object({
  sceneText: z.string().min(50, "Scene text is too short. Please provide a complete scene.").max(20_000),
  projectId: z.string().uuid().optional().nullable(),
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
    const rate = await runAiRateLimits(req, effectivePlan, user.id, {
      emailVerified: !!user.email_confirmed_at,
    })
    if (!rate.ok) return rate.response

    const parsed = await parseJsonRequest(req, bodySchema)
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: parsed.status })
    }
    const { sceneText, projectId } = parsed.data
    const projectContext = await loadProjectForAiContext({ userId: user.id, projectId })
    const policy = resolveAiTaskPolicy({
      endpoint: "shots",
      plan: effectivePlan,
      inputSize: sceneText.length,
      requestedMode: "live",
    })

    void logBusinessEvent(req, {
      eventType: "ai.generation",
      userId: user.id,
      plan: effectivePlan,
      metadata: { endpoint: "shots" },
    }).catch(() => {})

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

    const result = await generateTextWithService({
      userId: user.id,
      plan: effectivePlan,
      endpoint: "shots",
      taskKind: "shots",
      requestedMode: "live",
      complexity: policy.complexity,
      candidateModels: policy.candidateModels,
      orgId: projectContext?.org_id ?? null,
      projectId: projectContext?.id ?? null,
      cacheStrategy: policy.cacheStrategy,
      systemPrompt,
      userPrompt: `இந்த காட்சிக்கு ஷாட் பரிந்துரைகளை உருவாக்கவும்:\n\n${sceneText}`,
      fallbackContext: fallbackContextForProject(projectContext ?? { title: "Current scene", content: sceneText }),
      contextQuery: sceneText,
      inputSize: sceneText.length,
      maxTokens: policy.maxTokens,
      temperature: 0.6,
      topP: 0.9,
      signal: req.signal,
      metadata: { routingPolicy: policy.reason },
    })
    const text = result.text

    let shots
    try {
      const jsonMatch = text.match(/\[[\s\S]*\]/)
      if (jsonMatch) {
        shots = JSON.parse(jsonMatch[0])
      } else {
        shots = JSON.parse(text)
      }
    } catch {
      return NextResponse.json(
        { error: "Failed to parse shot suggestions. Please try again." },
        { status: 500 }
      )
    }

    return NextResponse.json(
      { shots },
      {
        headers: {
          ...aiBudgetHeaders(result.budget),
          "X-AI-Request-Id": result.requestId,
          "X-AI-Provider": result.ref.provider,
          "X-AI-Model": result.ref.model,
          "X-AI-Complexity": result.effectiveComplexity,
          "X-AI-Cache-Hit": result.cache.cacheHit ? "1" : "0",
        },
      }
    )
  } catch (error: any) {
    return aiRouteErrorResponse(error, "Failed to generate shot suggestions")
  }
}

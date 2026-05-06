// Tamil story generation via direct AI provider routing.

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/infrastructure/db/supabase/server"
import { runAiRateLimits } from "@/modules/ai/application/rate-limits"
import { getEffectivePlanForApiUser } from "@/modules/ai/application/effective-plan"
import { apiIpLimitOr429 } from "@/core/security/api-ip-limit"
import { tamilStoryRequestSchema } from "@/modules/documents/domain/story-schema"
import { zodErrorJsonResponse } from "@/core/http/json"
import { logBusinessEvent } from "@/modules/master-admin/application/events"
import { createGenerationSseResponse } from "@/modules/ai/application/generation-service"
import { aiRouteErrorResponse } from "@/modules/ai/infrastructure/provider-router"
import { resolveAiTaskPolicy } from "@/modules/ai/domain/task-policy"
import { fallbackContextForProject } from "@/modules/story-memory/application/story-memory-service"

export async function POST(req: NextRequest) {
  try {
    const tooMany = await apiIpLimitOr429(req)
    if (tooMany) return tooMany

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
    const policy = resolveAiTaskPolicy({
      endpoint: "documents",
      plan: effectivePlan,
      inputSize: `${genre}\n${characters}\n${location}\n${mood ?? ""}\n${sceneDescription}`.length,
      requestedMode: "live",
    })

    void logBusinessEvent(req, {
      eventType: "ai.generation",
      userId: user.id,
      plan: effectivePlan,
      metadata: { endpoint: "documents" },
    }).catch(() => {})

    const systemPrompt = `You are an expert Tamil short-story writer.

Write only in Tamil. Create a complete, polished story with:
- A strong title
- A clear opening with place and time
- Memorable characters with emotional depth
- Natural dialogue
- Vivid scene description
- A satisfying ending

Do not include meta commentary, notes, or explanations.`

    const userPrompt = `Write a complete Tamil story from these details:

Genre: ${genre}
Characters: ${characters}
Location: ${location}
Mood: ${mood?.trim() || "dramatic"}
Scene description: ${sceneDescription}

Return the final story only.`

    return await createGenerationSseResponse({
      userId: user.id,
      plan: effectivePlan,
      endpoint: "documents",
      taskKind: "documents",
      requestedMode: "live",
      complexity: policy.complexity,
      candidateModels: policy.candidateModels,
      cacheStrategy: policy.cacheStrategy,
      cacheContext: userPrompt,
      systemPrompt,
      userPrompt,
      fallbackContext: fallbackContextForProject({
        title: "Tamil story",
        genre,
        characters,
        location,
        mood: mood?.trim() || "dramatic",
        description: sceneDescription,
      }),
      contextQuery: sceneDescription,
      inputSize: `${genre}\n${characters}\n${location}\n${mood ?? ""}\n${sceneDescription}`.length,
      maxTokens: policy.maxTokens,
      temperature: 0.7,
      topP: 0.9,
      signal: req.signal,
      metadata: {
        genre,
        location,
        mood: mood?.trim() || "dramatic",
        routingPolicy: policy.reason,
      },
      rateLimitHeaders: {
        "X-RateLimit-Limit": String(planQuota.limit),
        "X-RateLimit-Remaining": String(planQuota.remaining),
        "X-RateLimit-Reset": String(Math.ceil(planQuota.reset / 1000)),
      },
    })
  } catch (error: unknown) {
    console.error("Error generating Tamil story:", error)
    return aiRouteErrorResponse(error, "Failed to generate Tamil story. Please try again.")
  }
}

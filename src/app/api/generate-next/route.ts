import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/infrastructure/db/supabase/server"
import { runAiRateLimits } from "@/modules/ai/application/rate-limits"
import { getEffectivePlanForApiUser } from "@/modules/ai/application/effective-plan"
import { apiIpLimitOr429 } from "@/core/security/api-ip-limit"
import { continueScreenplaySchema } from "@/modules/ai/domain/schemas"
import { zodErrorJsonResponse } from "@/core/http/json"
import { logBusinessEvent } from "@/modules/master-admin/application/events"
import { createGenerationSseResponse } from "@/modules/ai/application/generation-service"
import { aiRouteErrorResponse } from "@/modules/ai/infrastructure/provider-router"
import { resolveAiTaskPolicy } from "@/modules/ai/domain/task-policy"
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
    const parsed = continueScreenplaySchema.safeParse(raw)
    if (!parsed.success) return zodErrorJsonResponse(parsed.error)
    const { screenplay, genre, characters, mood, projectId } = parsed.data
    const projectContext = await loadProjectForAiContext({ userId: user.id, projectId })
    const policy = resolveAiTaskPolicy({
      endpoint: "generate-next",
      plan: effectivePlan,
      inputSize: screenplay.length,
      requestedMode: "live",
    })

    void logBusinessEvent(req, {
      eventType: "ai.generation",
      userId: user.id,
      plan: effectivePlan,
      metadata: { endpoint: "generate-next" },
    }).catch(() => {})

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

    return await createGenerationSseResponse({
      userId: user.id,
      plan: effectivePlan,
      endpoint: "generate-next",
      taskKind: "generate-next",
      requestedMode: "live",
      complexity: policy.complexity,
      candidateModels: policy.candidateModels,
      orgId: projectContext?.org_id ?? null,
      projectId: projectContext?.id ?? null,
      cacheStrategy: policy.cacheStrategy,
      cacheContext: screenplay,
      systemPrompt,
      userPrompt,
      fallbackContext: fallbackContextForProject(
        projectContext ?? {
          title: "Current screenplay",
          genre,
          characters,
          mood,
          content: screenplay,
        }
      ),
      contextQuery: `${genre ?? ""}\n${characters ?? ""}\n${mood ?? ""}\n${screenplay.slice(-4000)}`,
      inputSize: screenplay.length,
      maxTokens: policy.maxTokens,
      temperature: 0.75,
      topP: 0.9,
      signal: req.signal,
      metadata: { genre, mood, routingPolicy: policy.reason },
      rateLimitHeaders: {
        "X-RateLimit-Remaining": String(planQuota.remaining),
      },
    })
  } catch (error: any) {
    return aiRouteErrorResponse(error, "Failed to generate next scene")
  }
}

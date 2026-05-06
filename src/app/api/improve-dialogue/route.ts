import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/infrastructure/db/supabase/server"
import { runAiRateLimits } from "@/modules/ai/application/rate-limits"
import { getEffectivePlanForApiUser } from "@/modules/ai/application/effective-plan"
import { apiIpLimitOr429 } from "@/core/security/api-ip-limit"
import { screenplayOnlySchema } from "@/modules/ai/domain/schemas"
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
    const parsed = screenplayOnlySchema.safeParse(raw)
    if (!parsed.success) return zodErrorJsonResponse(parsed.error)
    const { screenplay, projectId } = parsed.data
    const projectContext = await loadProjectForAiContext({ userId: user.id, projectId })
    const policy = resolveAiTaskPolicy({
      endpoint: "improve-dialogue",
      plan: effectivePlan,
      inputSize: screenplay.length,
      requestedMode: "live",
    })

    void logBusinessEvent(req, {
      eventType: "ai.generation",
      userId: user.id,
      plan: effectivePlan,
      metadata: { endpoint: "improve-dialogue" },
    }).catch(() => {})

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

    return await createGenerationSseResponse({
      userId: user.id,
      plan: effectivePlan,
      endpoint: "improve-dialogue",
      taskKind: "improve-dialogue",
      requestedMode: "live",
      complexity: policy.complexity,
      candidateModels: policy.candidateModels,
      orgId: projectContext?.org_id ?? null,
      projectId: projectContext?.id ?? null,
      cacheStrategy: policy.cacheStrategy,
      cacheContext: screenplay,
      systemPrompt,
      userPrompt: `Improve the dialogue in this Tamil screenplay while keeping everything else identical:\n\n${screenplay}`,
      fallbackContext: fallbackContextForProject(projectContext ?? { title: "Current screenplay", content: screenplay }),
      contextQuery: screenplay.slice(-4000),
      inputSize: screenplay.length,
      maxTokens: policy.maxTokens,
      temperature: 0.7,
      topP: 0.9,
      signal: req.signal,
      metadata: { routingPolicy: policy.reason },
      rateLimitHeaders: {
        "X-RateLimit-Remaining": String(planQuota.remaining),
      },
    })
  } catch (error: any) {
    return aiRouteErrorResponse(error, "Failed to improve dialogue")
  }
}

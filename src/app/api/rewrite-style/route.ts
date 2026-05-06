import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/infrastructure/db/supabase/server"
import { runAiRateLimits } from "@/modules/ai/application/rate-limits"
import { getEffectivePlanForApiUser } from "@/modules/ai/application/effective-plan"
import { apiIpLimitOr429 } from "@/core/security/api-ip-limit"
import type { SubscriptionPlan } from "@/shared/types/project"
import { rewriteStyleSchema } from "@/modules/ai/domain/schemas"
import { zodErrorJsonResponse } from "@/core/http/json"
import { logBusinessEvent } from "@/modules/master-admin/application/events"
import { createGenerationSseResponse } from "@/modules/ai/application/generation-service"
import { aiRouteErrorResponse } from "@/modules/ai/infrastructure/provider-router"
import { resolveAiTaskPolicy } from "@/modules/ai/domain/task-policy"
import { loadProjectForAiContext } from "@/modules/story-memory/application/project-context"
import { fallbackContextForProject } from "@/modules/story-memory/application/story-memory-service"

const PRESETS: Record<string, { label: string; systemExtra: string }> = {
  mass_action: {
    label: "High-energy mass (Tamil commercial)",
    systemExtra:
      "Rewrite toward Tamil mass-commercial blocking: big hero beats, crowd energy, build-up and payoffs, punchy one-liners where natural. Keep story logic.",
  },
  snappy_dialogue: {
    label: "Snappy, dialogue-driven",
    systemExtra:
      "Prioritize lean, cutting dialogue: subtext, rhythm, and conflict in lines. Tighten or expand lines for impact; keep characters true.",
  },
  emotional_lyrical: {
    label: "Emotional, lyrical",
    systemExtra:
      "Heighten inner life and family/emotion beats. More sensory detail in action lines, poetic but not purple; dialogue stays speakable for actors.",
  },
  realistic_grounded: {
    label: "Grounded / realistic",
    systemExtra:
      "Ground the scene in everyday speech and real stakes; reduce melodrama where it helps; keep Tamil natural for the setting.",
  },
}

const ALLOWED: SubscriptionPlan[] = ["pro", "premium"]

function buildSystemPrompt(styleId: string): string {
  const base = `You are an expert Tamil cinema co-writer. You REWRITE the screenplay the user provides.

STRICT FORMAT RULES:
- Scene headings in ENGLISH, body and dialogue in TAMIL (as in the original)
- Preserve character names, locations, and plot outcomes unless a small fix improves clarity
- Do not add meta-commentary or notes; output the screenplay only
- Return the full rewritten screenplay, not a summary

Style direction:
`
  const extra = PRESETS[styleId]?.systemExtra ?? PRESETS.mass_action.systemExtra
  return base + extra
}

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
    if (!ALLOWED.includes(effectivePlan)) {
      return NextResponse.json(
        { error: "Style rewrite is available on Pro and Premium. Upgrade to unlock." },
        { status: 403 }
      )
    }

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
    const parsed = rewriteStyleSchema.safeParse(raw)
    if (!parsed.success) return zodErrorJsonResponse(parsed.error)

    const { screenplay, styleId, projectId } = parsed.data
    const projectContext = await loadProjectForAiContext({ userId: user.id, projectId })
    const resolvedStyle = typeof styleId === "string" && styleId in PRESETS ? styleId : "mass_action"
    const policy = resolveAiTaskPolicy({
      endpoint: "rewrite-style",
      plan: effectivePlan,
      inputSize: screenplay.length,
      requestedMode: "live",
    })

    void logBusinessEvent(req, {
      eventType: "ai.generation",
      userId: user.id,
      plan: effectivePlan,
      metadata: { endpoint: "rewrite-style", styleId: resolvedStyle },
    }).catch(() => {})

    const systemPrompt = buildSystemPrompt(resolvedStyle)
    const userPrompt = `Rewrite this entire screenplay in the chosen style.\n\n${screenplay}`

    return await createGenerationSseResponse({
      userId: user.id,
      plan: effectivePlan,
      endpoint: "rewrite-style",
      taskKind: "rewrite-style",
      requestedMode: "live",
      complexity: policy.complexity,
      candidateModels: policy.candidateModels,
      orgId: projectContext?.org_id ?? null,
      projectId: projectContext?.id ?? null,
      cacheStrategy: policy.cacheStrategy,
      cacheContext: screenplay,
      systemPrompt,
      userPrompt,
      fallbackContext: fallbackContextForProject(projectContext ?? { title: "Current screenplay", content: screenplay }),
      contextQuery: `${resolvedStyle}\n${screenplay.slice(-4000)}`,
      inputSize: screenplay.length,
      maxTokens: policy.maxTokens,
      temperature: 0.75,
      topP: 0.9,
      signal: req.signal,
      metadata: { styleId: resolvedStyle, routingPolicy: policy.reason },
      rateLimitHeaders: {
        "X-RateLimit-Limit": String(planQuota.limit),
        "X-RateLimit-Remaining": String(planQuota.remaining),
        "X-RateLimit-Reset": String(Math.ceil(planQuota.reset / 1000)),
      },
    })
  } catch (error: unknown) {
    return aiRouteErrorResponse(error, "Failed to rewrite")
  }
}

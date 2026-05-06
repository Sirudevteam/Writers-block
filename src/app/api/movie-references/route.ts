import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/infrastructure/db/supabase/server"
import { apiIpLimitOr429 } from "@/core/security/api-ip-limit"
import { getEffectivePlanForApiUser } from "@/modules/ai/application/effective-plan"
import { runAiRateLimits } from "@/modules/ai/application/rate-limits"
import { movieReferencesSchema } from "@/modules/ai/domain/schemas"
import { zodErrorJsonResponse } from "@/core/http/json"
import { z } from "zod"
import { logBusinessEvent } from "@/modules/master-admin/application/events"
import { generateTextWithService } from "@/modules/ai/application/generation-service"
import { aiRouteErrorResponse } from "@/modules/ai/infrastructure/provider-router"
import { aiBudgetHeaders, isAiBudgetBlockedError } from "@/modules/ai/application/usage-service"
import { resolveAiTaskPolicy } from "@/modules/ai/domain/task-policy"
import { loadProjectForAiContext } from "@/modules/story-memory/application/project-context"
import { fallbackContextForProject } from "@/modules/story-memory/application/story-memory-service"

export interface MovieReference {
  movie: string
  scene: string
  youtubeId: string
  thumbnail: string
  description: string
  matchReason: string
  emotion: string
  situation: string
  location: string
}

const movieReferenceSchema = z.object({
  movie: z.string().trim().min(1).max(200),
  scene: z.string().trim().min(1).max(200),
  youtubeId: z.string().trim().regex(/^[a-zA-Z0-9_-]{6,20}$/),
  thumbnail: z.string().url().max(2_000).optional(),
  description: z.string().trim().min(1).max(1_000),
  matchReason: z.string().trim().min(1).max(1_000),
  emotion: z.string().trim().min(1).max(80),
  situation: z.string().trim().min(1).max(120),
  location: z.string().trim().min(1).max(120),
})

const movieReferencesResponseSchema = z.array(movieReferenceSchema).min(1).max(5)

// Fallback movie references database for when AI fails or for common patterns
const fallbackReferences: Record<string, MovieReference[]> = {
  tense: [
    {
      movie: "No Country for Old Men",
      scene: "Gas Station Coin Toss",
      youtubeId: "9Y8lm4uVhU0",
      thumbnail: "https://img.youtube.com/vi/9Y8lm4uVhU0/maxresdefault.jpg",
      description: "Anton Chigurh's infamous coin toss scene where fate hangs on a simple call of heads or tails.",
      matchReason: "Building suspense through dialogue and psychological intimidation",
      emotion: "tense",
      situation: "confrontation",
      location: "gas station",
    },
    {
      movie: "The Dark Knight",
      scene: "Interrogation Scene",
      youtubeId: "4f3-FJM9Rzw",
      thumbnail: "https://img.youtube.com/vi/4f3-FJM9Rzw/maxresdefault.jpg",
      description: "Batman interrogates the Joker in a tense psychological battle of wills.",
      matchReason: "Psychological warfare and escalating tension in a confined space",
      emotion: "tense",
      situation: "interrogation",
      location: "police station",
    },
  ],
  romantic: [
    {
      movie: "Before Sunrise",
      scene: "Record Store Scene",
      youtubeId: "9v5rUkTqTxE",
      thumbnail: "https://img.youtube.com/vi/9v5rUkTqTxE/maxresdefault.jpg",
      description: "Two strangers connect in a record store listening booth, sharing intimate glances.",
      matchReason: "Subtle romantic tension and connection through shared experience",
      emotion: "romantic",
      situation: "connection",
      location: "record store",
    },
  ],
  action: [
    {
      movie: "Mad Max: Fury Road",
      scene: "The Chase Begins",
      youtubeId: "hEJnMQG9ev8",
      thumbnail: "https://img.youtube.com/vi/hEJnMQG9ev8/maxresdefault.jpg",
      description: "An intense chase sequence through the wasteland with practical stunts.",
      matchReason: "High-energy action with clear stakes and relentless pacing",
      emotion: "intense",
      situation: "chase",
      location: "desert",
    },
  ],
  dramatic: [
    {
      movie: "The Godfather",
      scene: "I Knew It Was You",
      youtubeId: "uBHe5R7D6-Y",
      thumbnail: "https://img.youtube.com/vi/uBHe5R7D6-Y/maxresdefault.jpg",
      description: "Michael confronts his brother-in-law about his betrayal at a family event.",
      matchReason: "Dramatic confrontation with underlying family tensions",
      emotion: "dramatic",
      situation: "confrontation",
      location: "family gathering",
    },
  ],
  horror: [
    {
      movie: "The Shining",
      scene: "Here's Johnny",
      youtubeId: "S014oGZiSdI",
      thumbnail: "https://img.youtube.com/vi/S014oGZiSdI/maxresdefault.jpg",
      description: "Jack Torrance breaks through the door with an axe in this iconic horror moment.",
      matchReason: "Building dread and isolation leading to violent climax",
      emotion: "horror",
      situation: "attack",
      location: "hotel",
    },
  ],
  comedy: [
    {
      movie: "Bridesmaids",
      scene: "Dress Shop Food Poisoning",
      youtubeId: "nTnC6SJ3q58",
      thumbnail: "https://img.youtube.com/vi/nTnC6SJ3q58/maxresdefault.jpg",
      description: "The bridal party experiences food poisoning in an upscale dress shop.",
      matchReason: "Comedic timing in an otherwise formal situation",
      emotion: "comedy",
      situation: "disaster",
      location: "dress shop",
    },
  ],
  thriller: [
    {
      movie: "Se7en",
      scene: "What's in the Box",
      youtubeId: "1gb-_HP3Ws8",
      thumbnail: "https://img.youtube.com/vi/1gb-_HP3Ws8/maxresdefault.jpg",
      description: "The devastating climax where the detectives discover the final victim.",
      matchReason: "Building dread and shocking revelation",
      emotion: "thriller",
      situation: "revelation",
      location: "desert",
    },
  ],
  melancholic: [
    {
      movie: "Lost in Translation",
      scene: "Whisper Goodbye",
      youtubeId: "4HhTnjr1w3E",
      thumbnail: "https://img.youtube.com/vi/4HhTnjr1w3E/maxresdefault.jpg",
      description: "Two lost souls share a quiet moment of connection in Tokyo before parting.",
      matchReason: "Melancholic atmosphere and quiet emotional connection",
      emotion: "melancholic",
      situation: "farewell",
      location: "tokyo",
    },
  ],
}

// System prompt for the AI
const SYSTEM_PROMPT = `You are a film expert specializing in cinematic references. Analyze the provided screenplay and suggest 3-5 relevant movie scenes that match its tone, genre, mood, and content.

For each reference, provide:
1. Movie title (exact name)
2. Scene name/description
3. YouTube video ID (use a valid ID from a well-known scene if possible, or "dQw4w9WgXcQ" as fallback)
4. Brief scene description (2-3 sentences)
5. Match reason - explain specifically why this scene relates to the screenplay's emotion, situation, action, and location
6. Primary emotion (e.g., tense, romantic, dramatic, action, horror, comedy, melancholic, thriller)
7. Situation type (e.g., confrontation, chase, revelation, farewell, celebration, etc.)
8. Location type (e.g., interior, exterior, urban, rural, etc.)

Return ONLY a JSON array with this exact structure:
[{
  "movie": "Movie Title",
  "scene": "Scene Name",
  "youtubeId": "youtube_video_id",
  "thumbnail": "https://img.youtube.com/vi/youtube_video_id/maxresdefault.jpg",
  "description": "Scene description",
  "matchReason": "Why this matches",
  "emotion": "primary emotion",
  "situation": "situation type",
  "location": "location type"
}]

Ensure all YouTube IDs are valid and scenes are from well-known, critically acclaimed films. Focus on scenes that would genuinely help a filmmaker understand how to approach similar moments cinematically.`

export async function POST(request: NextRequest) {
  try {
    const tooMany = await apiIpLimitOr429(request)
    if (tooMany) return tooMany

    // Check authentication
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const effectivePlan = await getEffectivePlanForApiUser(supabase, user.id)
    const rate = await runAiRateLimits(request, effectivePlan, user.id, {
      emailVerified: !!user.email_confirmed_at,
    })
    if (!rate.ok) return rate.response

    // Parse request body
    let raw: unknown
    try {
      raw = await request.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }
    const parsed = movieReferencesSchema.safeParse(raw)
    if (!parsed.success) return zodErrorJsonResponse(parsed.error)
    const { screenplay, genre, mood, characters, location, projectId } = parsed.data
    const projectContext = await loadProjectForAiContext({ userId: user.id, projectId })
    const policy = resolveAiTaskPolicy({
      endpoint: "movie-references",
      plan: effectivePlan,
      inputSize: screenplay.length,
      requestedMode: "live",
    })

    void logBusinessEvent(request, {
      eventType: "ai.generation",
      userId: user.id,
      plan: effectivePlan,
      metadata: { endpoint: "movie-references" },
    }).catch(() => {})

    // Prepare the screenplay context
    const screenplayContext = `
Genre: ${genre || "Unknown"}
Mood: ${mood || "Unknown"}
Characters: ${characters || "Unknown"}
Location: ${location || "Unknown"}

Screenplay:
${screenplay.slice(0, 3000)}...

Analyze this screenplay and suggest relevant movie reference scenes.`

    // Call routed AI provider
    try {
      const result = await generateTextWithService({
        userId: user.id,
        plan: effectivePlan,
        endpoint: "movie-references",
        taskKind: "movie-references",
        requestedMode: "live",
        complexity: policy.complexity,
        candidateModels: policy.candidateModels,
        orgId: projectContext?.org_id ?? null,
        projectId: projectContext?.id ?? null,
        cacheStrategy: policy.cacheStrategy,
        cacheContext: screenplay,
        systemPrompt: SYSTEM_PROMPT,
        userPrompt: screenplayContext,
        fallbackContext: fallbackContextForProject(
          projectContext ?? {
            title: "Current screenplay",
            genre,
            mood,
            characters,
            location,
            content: screenplay,
          }
        ),
        contextQuery: `${genre ?? ""}\n${mood ?? ""}\n${screenplay.slice(-4000)}`,
        inputSize: screenplay.length,
        maxTokens: policy.maxTokens,
        temperature: 0.35,
        topP: 0.9,
        signal: request.signal,
        metadata: { genre, mood, location, routingPolicy: policy.reason },
      })

      // Parse JSON from response
      let references: MovieReference[]
      try {
        // Try to extract JSON from the response
        const jsonMatch = result.text.match(/\[[\s\S]*\]/)
        if (jsonMatch) {
          references = JSON.parse(jsonMatch[0])
        } else {
          references = JSON.parse(result.text)
        }

        // Validate the structure
        if (!Array.isArray(references) || references.length === 0) {
          throw new Error("Invalid response structure")
        }

        // Ensure all required fields are present
        const validated = movieReferencesResponseSchema.safeParse(references)
        if (!validated.success) {
          throw new Error("Invalid response structure")
        }

        references = validated.data.map((ref) => ({
          ...ref,
          thumbnail: `https://img.youtube.com/vi/${ref.youtubeId}/maxresdefault.jpg`,
        }))

        return NextResponse.json(
          { references },
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
      } catch (parseError) {
        console.error("Failed to parse AI response:", parseError)
        // Fall back to generated references based on genre/mood
        const fallbackRefs = getFallbackReferences(genre ?? undefined, mood ?? undefined, screenplay)
        return NextResponse.json(
          { references: fallbackRefs },
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
      }
    } catch (aiError) {
      if (isAiBudgetBlockedError(aiError)) return aiRouteErrorResponse(aiError, "Monthly AI credits exhausted")
      console.error("AI API error:", aiError)
      // Fall back to rule-based references
      const fallbackRefs = getFallbackReferences(genre ?? undefined, mood ?? undefined, screenplay)
      return NextResponse.json({ references: fallbackRefs })
    }
  } catch (error) {
    console.error("Movie references API error:", error)
    return NextResponse.json(
      { error: "Failed to generate movie references" },
      { status: 500 }
    )
  }
}

// Generate fallback references based on genre and mood
function getFallbackReferences(
  genre?: string,
  mood?: string,
  screenplay?: string
): MovieReference[] {
  const refs: MovieReference[] = []
  const text = (screenplay || "").toLowerCase()

  // Match based on genre
  const genreMap: Record<string, string[]> = {
    drama: ["dramatic", "tense", "melancholic"],
    thriller: ["thriller", "tense"],
    horror: ["horror", "tense"],
    comedy: ["comedy"],
    action: ["action", "tense"],
    romance: ["romantic", "melancholic"],
  }

  const emotions = genreMap[genre?.toLowerCase() || ""] || ["dramatic"]
  if (mood) {
    emotions.push(mood.toLowerCase())
  }

  // Add emotion detection from text
  if (text.includes("gun") || text.includes("shoot") || text.includes("chase")) {
    emotions.push("action", "tense")
  }
  if (text.includes("love") || text.includes("kiss") || text.includes("romantic")) {
    emotions.push("romantic")
  }
  if (text.includes("scream") || text.includes("blood") || text.includes("dead")) {
    emotions.push("horror", "tense")
  }
  if (text.includes("laugh") || text.includes("joke") || text.includes("funny")) {
    emotions.push("comedy")
  }

  // Get unique references
  const seen = new Set<string>()
  for (const emotion of emotions) {
    const refsForEmotion = fallbackReferences[emotion] || []
    for (const ref of refsForEmotion) {
      if (!seen.has(ref.movie)) {
        seen.add(ref.movie)
        refs.push(ref)
      }
    }
  }

  // If no matches, return some defaults
  if (refs.length === 0) {
    return [
      fallbackReferences.dramatic[0],
      fallbackReferences.tense[0],
      fallbackReferences.tense[1],
    ].filter(Boolean)
  }

  return refs.slice(0, 5)
}

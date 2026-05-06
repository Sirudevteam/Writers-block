import { describe, expect, it } from "vitest"
import { resolveTokenGuard, type StoryContextSnapshot } from "@/modules/ai/domain/generation"
import type { AiEvalCase, AiEvalResult } from "@/modules/ai/domain/evals"
import { storyContextPrompt } from "@/modules/story-memory/application/story-memory-service"
import { detectContinuityWarnings } from "@/modules/story-bible/domain/continuity"
import type { StoryBibleEntry } from "@/modules/story-bible/domain/types"

const cases: AiEvalCase[] = [
  {
    id: "character-continuity",
    taskKind: "generate-next",
    prompt: "Continue the final-over scene without changing Meera's role.",
    expectedContains: ["Meera"],
  },
  {
    id: "style-rewrite-cap",
    taskKind: "rewrite-style",
    prompt: "Rewrite this scene in a restrained cinematic voice.",
    maxOutputTokens: 2500,
  },
]

function runOfflineEval(item: AiEvalCase): AiEvalResult {
  const checks = [
    {
      name: "has prompt",
      passed: item.prompt.trim().length > 0,
    },
    {
      name: "known task kind",
      passed: item.taskKind !== "unknown",
    },
  ]

  return {
    id: item.id,
    passed: checks.every((check) => check.passed),
    checks,
  }
}

function storyBibleCharacter(title: string): StoryBibleEntry {
  return {
    id: `entry-${title}`,
    project_id: "project-1",
    org_id: "org-1",
    user_id: "user-1",
    kind: "character",
    title,
    content: `${title} is established in the Story Bible.`,
    metadata: {},
    source: "manual",
    pinned: true,
    created_at: new Date(0).toISOString(),
    updated_at: new Date(0).toISOString(),
    deleted_at: null,
  }
}

describe("offline AI eval fixtures", () => {
  it("keeps eval cases deterministic and provider-free", () => {
    const results = cases.map(runOfflineEval)
    expect(results.every((result) => result.passed)).toBe(true)
    expect(results.map((result) => result.id)).toEqual(["character-continuity", "style-rewrite-cap"])
  })

  it("checks Story Bible context inclusion without live providers", () => {
    const snapshot: StoryContextSnapshot = {
      status: "memory",
      projectId: "project-1",
      contextText: "PINNED STORY BIBLE\n[character] Meera\nMeera is the captain and never lies.",
      memoryChunkCount: 0,
      storyBibleEntryCount: 1,
      tokenEstimate: 24,
    }

    const prompt = storyContextPrompt(snapshot)
    expect(prompt).toContain("RELEVANT PROJECT MEMORY")
    expect(prompt).toContain("PINNED STORY BIBLE")
    expect(prompt).toContain("Meera is the captain")
  })

  it("flags unknown speaking characters from screenplay fixtures", () => {
    const warnings = detectContinuityWarnings({
      screenplay: "FADE IN\n\n1. INT - ROOM - DAY\n\nKAVIN\nWe still have time.",
      entries: [storyBibleCharacter("Meera")],
    })

    expect(warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "unknown_character",
          severity: "warning",
          message: expect.stringContaining("KAVIN"),
        }),
      ])
    )
  })

  it("enforces live token caps in offline eval checks", () => {
    expect(
      resolveTokenGuard({
        taskKind: "rewrite-style",
        requestedMode: "live",
        maxTokens: 8000,
        inputSize: 20_000,
        plan: "pro",
      })
    ).toMatchObject({ ok: true, effectiveMaxTokens: 2500 })

    expect(
      resolveTokenGuard({
        taskKind: "generate",
        requestedMode: "live",
        maxTokens: 8000,
        inputSize: 20_000,
        plan: "premium",
      })
    ).toMatchObject({ ok: true, effectiveMaxTokens: 7000 })
  })
})

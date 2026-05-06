import { parseScreenplay } from "@/modules/editor/domain/screenplay-parse"
import type { ContinuityWarning, StoryBibleEntry } from "@/modules/story-bible/domain/types"

function normalizedName(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\s*[-:].*$/, "")
    .toUpperCase()
}

export function detectContinuityWarnings(params: {
  screenplay: string
  entries: Pick<StoryBibleEntry, "kind" | "title">[]
}): ContinuityWarning[] {
  const characterNames = new Set(
    params.entries
      .filter((entry) => entry.kind === "character")
      .map((entry) => normalizedName(entry.title))
      .filter(Boolean)
  )

  if (params.screenplay.trim() && characterNames.size === 0) {
    return [
      {
        code: "missing_story_bible",
        severity: "info",
        message: "Add character entries so WriterBlocks can check dialogue continuity.",
      },
    ]
  }

  const warnings: ContinuityWarning[] = []
  const seen = new Set<string>()
  for (const line of parseScreenplay(params.screenplay)) {
    if (line.type !== "character") continue
    const name = normalizedName(line.text)
    if (!name || seen.has(name) || characterNames.has(name)) continue
    seen.add(name)
    warnings.push({
      code: "unknown_character",
      severity: "warning",
      anchor: line.text,
      message: `${line.text} speaks in the screenplay but is not in the Story Bible.`,
    })
    if (warnings.length >= 8) break
  }

  return warnings
}

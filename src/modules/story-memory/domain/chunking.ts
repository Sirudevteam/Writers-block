import crypto from "crypto"
import { estimateTokens } from "@/modules/ai/domain/costing"
import { parseScreenplay } from "@/modules/editor/domain/screenplay-parse"
import type { StoryMemoryChunk, StoryMemoryIndexProject } from "@/modules/story-memory/domain/types"

const MAX_SCENE_CHARS = 2_800
const MAX_CHARACTER_CHARS = 1_400

function normalizedText(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/[ \t]+$/gm, "").trim()
}

export function hashStoryMemoryText(text: string): string {
  return crypto.createHash("sha256").update(normalizedText(text)).digest("hex")
}

export function projectContentHash(project: StoryMemoryIndexProject): string {
  return hashStoryMemoryText(
    [
      project.title,
      project.description,
      project.genre,
      project.characters,
      project.location,
      project.mood,
      project.content,
    ]
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .join("\n\n")
  )
}

function chunkHash(kind: StoryMemoryChunk["kind"], anchor: string | null, content: string): string {
  return hashStoryMemoryText(`${kind}\n${anchor ?? ""}\n${content}`)
}

function memoryChunk(
  kind: StoryMemoryChunk["kind"],
  sourceAnchor: string | null,
  content: string,
  metadata: StoryMemoryChunk["metadata"] = {}
): StoryMemoryChunk | null {
  const normalized = normalizedText(content)
  if (!normalized) return null
  return {
    kind,
    sourceHash: chunkHash(kind, sourceAnchor, normalized),
    sourceAnchor,
    content: normalized,
    tokenCount: estimateTokens(normalized),
    metadata,
  }
}

function splitCharacters(raw: string | null): string[] {
  if (!raw) return []
  return raw
    .split(/\n|,|;/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 30)
}

function sceneChunks(content: string | null): StoryMemoryChunk[] {
  if (!content?.trim()) return []
  const lines = parseScreenplay(content)
  const scenes: Array<{ heading: string; lines: string[] }> = []
  let current: { heading: string; lines: string[] } | null = null

  for (const line of lines) {
    if (line.type === "scene-heading") {
      if (current) scenes.push(current)
      current = { heading: line.text, lines: [line.text] }
      continue
    }
    if (!current) continue
    if (line.text) current.lines.push(line.text)
  }

  if (current) scenes.push(current)

  return scenes
    .slice(-24)
    .map((scene, index) => {
      const sceneText = scene.lines.join("\n").slice(0, MAX_SCENE_CHARS)
      return memoryChunk(
        "scene",
        scene.heading,
        `${scene.heading}\n${sceneText}`,
        { sceneIndex: index + 1, heading: scene.heading }
      )
    })
    .filter((chunk): chunk is StoryMemoryChunk => chunk !== null)
}

function latestBeat(content: string | null): string {
  const normalized = normalizedText(content ?? "")
  if (!normalized) return ""
  return normalized.slice(Math.max(0, normalized.length - 2_400))
}

export function buildStoryMemoryChunks(project: StoryMemoryIndexProject): StoryMemoryChunk[] {
  const chunks: StoryMemoryChunk[] = []
  const projectSummary = memoryChunk(
    "project_summary",
    "project",
    [
      `Title: ${project.title}`,
      project.genre ? `Genre: ${project.genre}` : null,
      project.mood ? `Mood: ${project.mood}` : null,
      project.location ? `Primary location: ${project.location}` : null,
      project.description ? `Story: ${project.description}` : null,
      project.characters ? `Characters: ${project.characters}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
    { title: project.title, genre: project.genre ?? null }
  )
  if (projectSummary) chunks.push(projectSummary)

  for (const character of splitCharacters(project.characters)) {
    const name = character.split(/[-:]/)[0]?.trim() || character
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const mentions = project.content?.match(new RegExp(`.{0,180}${escaped}.{0,360}`, "giu"))?.slice(0, 3) ?? []
    const content = [`Character: ${character}`, ...mentions].join("\n").slice(0, MAX_CHARACTER_CHARS)
    const chunk = memoryChunk("character", name, content, { character: name })
    if (chunk) chunks.push(chunk)
  }

  chunks.push(...sceneChunks(project.content))

  const arc = memoryChunk(
    "arc",
    "current_story_arc",
    [
      project.description ? `Premise: ${project.description}` : null,
      `Latest story beat:\n${latestBeat(project.content)}`,
    ]
      .filter(Boolean)
      .join("\n\n"),
    { title: project.title }
  )
  if (arc) chunks.push(arc)

  const continuity = memoryChunk(
    "continuity_note",
    "continuity",
    [
      project.characters ? `Keep these character names consistent: ${project.characters}` : null,
      project.location ? `Established location: ${project.location}` : null,
      project.mood ? `Established tone/mood: ${project.mood}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
    { title: project.title }
  )
  if (continuity) chunks.push(continuity)

  return chunks.slice(0, 80)
}

export function buildFallbackStoryContext(project: Partial<StoryMemoryIndexProject> & { content?: string | null }): string {
  return [
    project.title ? `Title: ${project.title}` : null,
    project.genre ? `Genre: ${project.genre}` : null,
    project.mood ? `Mood: ${project.mood}` : null,
    project.location ? `Location: ${project.location}` : null,
    project.characters ? `Characters: ${project.characters}` : null,
    project.description ? `Story: ${project.description}` : null,
    project.content ? `Recent screenplay:\n${latestBeat(project.content)}` : null,
  ]
    .filter(Boolean)
    .join("\n\n")
}

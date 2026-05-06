type LineType =
  | "scene-heading"
  | "action"
  | "character"
  | "dialogue"
  | "parenthetical"
  | "transition"
  | "title"
  | "empty"

export interface ParsedLine {
  type: LineType
  text: string
}

/** Shared screenplay line classifier (editor + print + PDF). */
export function parseScreenplay(content: string): ParsedLine[] {
  const rawLines = content.split("\n")
  const result: ParsedLine[] = []
  let inDialogue = false

  for (let i = 0; i < rawLines.length; i++) {
    const trimmed = rawLines[i].trim()
    if (!trimmed) {
      result.push({ type: "empty", text: "" })
      inDialogue = false
      continue
    }
    if (/^(\d+[A-Z]?\.\s*)?(INT|EXT|INT\/EXT|EXT\/INT|I\/E|E\/I)[\s.\-–—]/i.test(trimmed)) {
      result.push({ type: "scene-heading", text: trimmed })
      inDialogue = false
      continue
    }
    if (/^(FADE[\s\-]?(IN|OUT|TO\s?BLACK|TO)|CUT\s?TO|DISSOLVE\s?TO|SMASH\s?CUT|JUMP\s?CUT)[\s.:!\-]*$/i.test(trimmed)) {
      result.push({ type: "transition", text: trimmed })
      inDialogue = false
      continue
    }
    if (/^\([\s\S]+\)$/.test(trimmed)) {
      result.push({ type: "parenthetical", text: trimmed })
      continue
    }
    if (inDialogue) {
      result.push({ type: "dialogue", text: trimmed })
      continue
    }
    if (/^[A-Z][A-Z\s.''\-()0-9]*$/.test(trimmed) && trimmed.length > 1 && trimmed.length < 40) {
      result.push({ type: "character", text: trimmed })
      inDialogue = true
      continue
    }
    if (/^.{1,35}:\s*$/.test(trimmed) && !/^(INT|EXT|FADE|CUT)/i.test(trimmed)) {
      result.push({ type: "character", text: trimmed.replace(/:\s*$/, "") })
      inDialogue = true
      continue
    }
    result.push({ type: "action", text: trimmed })
    inDialogue = false
  }
  return result
}

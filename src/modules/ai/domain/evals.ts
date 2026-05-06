import type { AiTaskKind } from "@/modules/ai/domain/generation"

export type AiEvalCase = {
  id: string
  taskKind: AiTaskKind
  prompt: string
  expectedContains?: string[]
  maxOutputTokens?: number
}

export type AiEvalResult = {
  id: string
  passed: boolean
  checks: Array<{
    name: string
    passed: boolean
    details?: string
  }>
}

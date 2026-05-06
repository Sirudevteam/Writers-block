"use client"

import { useState, useCallback } from "react"
import {
  shotSuggestionsResponseSchema,
  type ShotSuggestion,
} from "@/modules/ai/domain/schemas"

export type { ShotSuggestion } from "@/modules/ai/domain/schemas"

interface UseShotSuggestionsReturn {
  shots: ShotSuggestion[]
  isLoading: boolean
  error: string | null
  generateShots: (sceneText: string, projectId?: string | null) => Promise<void>
  clearShots: () => void
}

export function useShotSuggestions(): UseShotSuggestionsReturn {
  const [shots, setShots] = useState<ShotSuggestion[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const generateShots = useCallback(async (sceneText: string, projectId?: string | null) => {
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch("/api/shots", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sceneText, projectId }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to generate shot suggestions")
      }

      const data = await response.json()
      const parsed = shotSuggestionsResponseSchema.safeParse(data)
      if (!parsed.success) {
        throw new Error("Invalid shot suggestions response")
      }

      setShots(parsed.data.shots)
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred")
    } finally {
      setIsLoading(false)
    }
  }, [])

  const clearShots = useCallback(() => {
    setShots([])
    setError(null)
  }, [])

  return {
    shots,
    isLoading,
    error,
    generateShots,
    clearShots,
  }
}

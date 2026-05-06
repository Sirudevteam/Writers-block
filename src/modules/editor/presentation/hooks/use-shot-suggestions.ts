"use client"

import { useState, useCallback } from "react"

export interface ShotSuggestion {
  shotNumber: number
  shotType: string
  cameraAngle: string
  composition: string
  cameraMovement: string
  purpose: string
  description: string
}

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
      setShots(data.shots)
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

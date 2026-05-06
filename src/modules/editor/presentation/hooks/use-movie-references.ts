"use client"

import { useState, useCallback } from "react"
import {
  movieReferencesResponseSchema,
  type MovieReference,
} from "@/modules/ai/domain/schemas"

interface UseMovieReferencesReturn {
  references: MovieReference[]
  isLoading: boolean
  error: string | null
  generateReferences: (params: {
    screenplay: string
    genre?: string
    mood?: string
    characters?: string
    location?: string
    projectId?: string | null
  }) => Promise<void>
  clearReferences: () => void
}

export function useMovieReferences(): UseMovieReferencesReturn {
  const [references, setReferences] = useState<MovieReference[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const generateReferences = useCallback(
    async (params: {
      screenplay: string
      genre?: string
      mood?: string
      characters?: string
      location?: string
      projectId?: string | null
    }) => {
      const { screenplay, genre, mood, characters, location, projectId } = params

      // Don't generate if screenplay is too short
      if (!screenplay || screenplay.trim().length < 50) {
        setError("Screenplay too short for analysis")
        return
      }

      setIsLoading(true)
      setError(null)

      try {
        const response = await fetch("/api/movie-references", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            screenplay,
            genre,
            mood,
            characters,
            location,
            projectId,
          }),
        })

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.error || "Failed to generate references")
        }

        const data = await response.json()

        const parsed = movieReferencesResponseSchema.safeParse(data)
        if (!parsed.success) {
          throw new Error("Invalid response format")
        }

        setReferences(parsed.data.references)
      } catch (err) {
        setError(err instanceof Error ? err.message : "An unknown error occurred")
        // Clear references on error so we don't show stale data
        setReferences([])
      } finally {
        setIsLoading(false)
      }
    },
    []
  )

  const clearReferences = useCallback(() => {
    setReferences([])
    setError(null)
  }, [])

  return {
    references,
    isLoading,
    error,
    generateReferences,
    clearReferences,
  }
}

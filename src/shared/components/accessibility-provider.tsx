"use client"

import { createContext, useContext, useEffect, useState } from "react"

interface AccessibilityContextType {
  prefersReducedMotion: boolean
  prefersHighContrast: boolean
}

const AccessibilityContext = createContext<AccessibilityContextType>({
  prefersReducedMotion: false,
  prefersHighContrast: false,
})

export function AccessibilityProvider({ children }: { children: React.ReactNode }) {
  const [preferences, setPreferences] = useState<AccessibilityContextType>({
    prefersReducedMotion: false,
    prefersHighContrast: false,
  })

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)")
    const highContrastQuery = window.matchMedia("(prefers-contrast: high)")

    setPreferences({
      prefersReducedMotion: mediaQuery.matches,
      prefersHighContrast: highContrastQuery.matches,
    })

    const handleChange = () => {
      setPreferences({
        prefersReducedMotion: mediaQuery.matches,
        prefersHighContrast: highContrastQuery.matches,
      })
    }

    mediaQuery.addEventListener("change", handleChange)
    highContrastQuery.addEventListener("change", handleChange)

    return () => {
      mediaQuery.removeEventListener("change", handleChange)
      highContrastQuery.removeEventListener("change", handleChange)
    }
  }, [])

  return (
    <AccessibilityContext.Provider value={preferences}>
      {children}
    </AccessibilityContext.Provider>
  )
}

export const useAccessibility = () => useContext(AccessibilityContext)

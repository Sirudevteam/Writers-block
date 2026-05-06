"use client"

import { useState, useCallback, useRef, useEffect } from "react"

export type SaveStatus = "idle" | "saving" | "saved" | "error" | "offline"

interface AutoSaveState {
  status: SaveStatus
  lastSavedAt: Date | null
  lastSavedContent: string | null
}

interface UseAutoSaveOptions {
  projectId: string | null
  content: string
  onSave: (content: string) => Promise<boolean>
  debounceMs?: number
  intervalMs?: number
  enabled?: boolean
}

interface UseAutoSaveReturn extends AutoSaveState {
  triggerSave: () => Promise<void>
  hasUnsavedChanges: boolean
  syncWithDatabase: () => Promise<void>
}

const AUTOSAVE_STORAGE_KEY = "screenplay_autosave"

/**
 * Custom hook for auto-saving screenplay content to Supabase database
 * Features:
 * - Debounced saves on content changes (2s default)
 * - Periodic auto-save at intervals (30s default)
 * - Local storage fallback when offline
 * - Automatic sync when coming back online
 * - Window focus sync to ensure latest data
 * - Unsaved changes detection
 * - Manual save trigger
 */
export function useAutoSave({
  projectId,
  content,
  onSave,
  debounceMs = 2000,
  intervalMs = 30000,
  enabled = true,
}: UseAutoSaveOptions): UseAutoSaveReturn {
  const [state, setState] = useState<AutoSaveState>({
    status: "idle",
    lastSavedAt: null,
    lastSavedContent: null,
  })

  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)

  // Refs for managing timers and tracking state
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const lastSavedContentRef = useRef<string | null>(null)
  const isSavingRef = useRef(false)
  const pendingSaveRef = useRef(false)

  // Load last saved state from localStorage on mount
  useEffect(() => {
    if (projectId) {
      const storageKey = `${AUTOSAVE_STORAGE_KEY}_${projectId}`
      const saved = localStorage.getItem(storageKey)
      if (saved) {
        try {
          const { content: savedContent, timestamp } = JSON.parse(saved)
          lastSavedContentRef.current = savedContent
          setState((prev) => ({
            ...prev,
            lastSavedContent: savedContent,
            lastSavedAt: new Date(timestamp),
          }))
        } catch {
          // Ignore parse errors
        }
      }
    }
  }, [projectId])

  // Save to localStorage helper
  const saveToLocalStorage = useCallback(
    (contentToSave: string) => {
      if (projectId) {
        const storageKey = `${AUTOSAVE_STORAGE_KEY}_${projectId}`
        localStorage.setItem(
          storageKey,
          JSON.stringify({
            content: contentToSave,
            timestamp: new Date().toISOString(),
          })
        )
      }
    },
    [projectId]
  )

  // Clear localStorage helper
  const clearLocalStorage = useCallback(() => {
    if (projectId) {
      const storageKey = `${AUTOSAVE_STORAGE_KEY}_${projectId}`
      localStorage.removeItem(storageKey)
    }
  }, [projectId])

  // Core save function to Supabase
  const performSave = useCallback(
    async (contentToSave: string): Promise<boolean> => {
      if (!enabled || !contentToSave.trim() || isSavingRef.current) {
        return false
      }

      isSavingRef.current = true
      setState((prev) => ({ ...prev, status: "saving" }))

      try {
        // Check online status
        if (!navigator.onLine) {
          // Save to localStorage when offline
          saveToLocalStorage(contentToSave)
          setState((prev) => ({
            ...prev,
            status: "offline",
            lastSavedContent: contentToSave,
          }))
          lastSavedContentRef.current = contentToSave
          setHasUnsavedChanges(false)
          console.log("Auto-saved to localStorage (offline mode)")
          return true
        }

        // Attempt database save via onSave callback
        const success = await onSave(contentToSave)

        if (success) {
          lastSavedContentRef.current = contentToSave
          setState({
            status: "saved",
            lastSavedAt: new Date(),
            lastSavedContent: contentToSave,
          })
          clearLocalStorage()
          setHasUnsavedChanges(false)
          console.log("Auto-saved to Supabase database")
          return true
        } else {
          // Database save failed, fallback to localStorage
          saveToLocalStorage(contentToSave)
          setState((prev) => ({
            ...prev,
            status: "error",
            lastSavedContent: contentToSave,
          }))
          console.error("Auto-save to database failed, fallback to localStorage")
          return false
        }
      } catch (err) {
        // Error occurred, fallback to localStorage
        saveToLocalStorage(contentToSave)
        setState((prev) => ({
          ...prev,
          status: "error",
          lastSavedContent: contentToSave,
        }))
        console.error("Auto-save error:", err)
        return false
      } finally {
        isSavingRef.current = false
      }
    },
    [enabled, onSave, saveToLocalStorage, clearLocalStorage]
  )

  // Trigger save manually or programmatically
  const triggerSave = useCallback(async () => {
    if (pendingSaveRef.current) {
      return
    }
    pendingSaveRef.current = true
    await performSave(content)
    pendingSaveRef.current = false
  }, [content, performSave])

  // Sync with database - useful for manual sync or window focus
  const syncWithDatabase = useCallback(async () => {
    if (content.trim() && !isSavingRef.current) {
      await performSave(content)
    }
  }, [content, performSave])

  // Debounced save on content changes
  useEffect(() => {
    if (!enabled) {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
        debounceTimerRef.current = null
      }
      setHasUnsavedChanges(content !== lastSavedContentRef.current && content.trim().length > 0)
      return
    }

    // Don't save if content hasn't changed from last saved
    if (content === lastSavedContentRef.current) {
      setHasUnsavedChanges(false)
      return
    }

    // Mark as having unsaved changes
    setHasUnsavedChanges(true)

    // Clear existing debounce timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }

    // Set new debounce timer
    debounceTimerRef.current = setTimeout(() => {
      if (content.trim()) {
        performSave(content)
      }
    }, debounceMs)

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [content, debounceMs, enabled, performSave])

  // Periodic auto-save at intervals
  useEffect(() => {
    // Clear existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }

    if (!enabled) {
      return
    }

    // Set up periodic save
    intervalRef.current = setInterval(() => {
      if (hasUnsavedChanges && content.trim() && !isSavingRef.current) {
        performSave(content)
      }
    }, intervalMs)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [content, enabled, hasUnsavedChanges, intervalMs, performSave])

  // Handle beforeunload event
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        // Save to localStorage immediately
        saveToLocalStorage(content)
        // Show confirmation dialog
        e.preventDefault()
        e.returnValue = ""
        return ""
      }
    }

    window.addEventListener("beforeunload", handleBeforeUnload)
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload)
    }
  }, [content, hasUnsavedChanges, saveToLocalStorage])

  // Listen for online/offline events
  useEffect(() => {
    const handleOnline = () => {
      console.log("Back online - syncing with database...")
      // Try to sync when coming back online
      if (hasUnsavedChanges && content.trim()) {
        performSave(content)
      }
    }

    const handleOffline = () => {
      console.log("Gone offline - switching to localStorage backup")
      setState((prev) => ({ ...prev, status: "offline" }))
    }

    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)

    return () => {
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOffline)
    }
  }, [content, hasUnsavedChanges, performSave])

  // Sync on window focus to ensure data consistency
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && enabled && hasUnsavedChanges) {
        // Small delay to avoid immediate sync on tab switch
        setTimeout(() => {
          if (content.trim() && !isSavingRef.current) {
            performSave(content)
          }
        }, 1000)
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange)
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [content, enabled, hasUnsavedChanges, performSave])

  return {
    ...state,
    triggerSave,
    hasUnsavedChanges,
    syncWithDatabase,
  }
}

/**
 * Helper function to restore auto-saved content from localStorage
 */
export function getAutoSavedContent(projectId: string): { content: string; timestamp: string } | null {
  const storageKey = `${AUTOSAVE_STORAGE_KEY}_${projectId}`
  const saved = localStorage.getItem(storageKey)
  if (saved) {
    try {
      return JSON.parse(saved)
    } catch {
      return null
    }
  }
  return null
}

/**
 * Helper function to clear auto-saved content from localStorage
 */
export function clearAutoSavedContent(projectId: string): void {
  const storageKey = `${AUTOSAVE_STORAGE_KEY}_${projectId}`
  localStorage.removeItem(storageKey)
}

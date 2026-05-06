"use client"

import { AlertCircle, X } from "lucide-react"
import { Button } from "@/ui/components/button"

/**
 * Inline alert for sign-in / sign-up — no framer-motion (same rationale as AuthShell)
 * to avoid bundler / runtime issues on auth pages.
 */
export function AuthFormError({
  message,
  onDismiss,
  className = "",
}: {
  message: string
  onDismiss?: () => void
  className?: string
}) {
  return (
    <div
      className={`relative flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4 shadow-[0_0_20px_rgba(239,68,68,0.15)] ${className}`}
      role="alert"
      aria-live="polite"
    >
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-red-500/20">
        <AlertCircle className="h-4 w-4 text-red-400" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-red-400">Error</p>
        <p className="mt-0.5 text-sm text-red-300/90">{message}</p>
      </div>
      {onDismiss && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 flex-shrink-0 text-red-400 hover:bg-red-500/20 hover:text-red-300"
          onClick={onDismiss}
          aria-label="Dismiss error message"
        >
          <X className="h-4 w-4" aria-hidden />
        </Button>
      )}
    </div>
  )
}

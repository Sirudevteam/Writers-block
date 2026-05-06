"use client"

import { motion, AnimatePresence } from "framer-motion"
import { Loader2, Check, CloudOff, AlertCircle, Save } from "lucide-react"
import { cn } from "@/shared/utils/cn"
import type { SaveStatus } from "@/modules/editor/presentation/hooks/use-auto-save"

interface AutoSaveStatusProps {
  status: SaveStatus
  lastSavedAt: Date | null
  hasUnsavedChanges: boolean
  className?: string
  showLastSaved?: boolean
}

function formatLastSaved(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)

  if (diffMins < 1) {
    return "Just now"
  } else if (diffMins < 60) {
    return `${diffMins}m ago`
  } else if (diffHours < 24) {
    return `${diffHours}h ago`
  } else {
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    })
  }
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
}

export function AutoSaveStatus({
  status,
  lastSavedAt,
  hasUnsavedChanges,
  className,
  showLastSaved = true,
}: AutoSaveStatusProps) {
  const getStatusConfig = () => {
    switch (status) {
      case "saving":
        return {
          icon: <Loader2 className="w-3 h-3 animate-spin" />,
          text: "Saving...",
          bgColor: "bg-cinematic-blue/10",
          textColor: "text-cinematic-blue",
          dotColor: "bg-cinematic-blue",
        }
      case "saved":
        return {
          icon: <Check className="w-3 h-3" />,
          text: showLastSaved && lastSavedAt
            ? `Saved ${formatLastSaved(lastSavedAt)}`
            : "Saved",
          bgColor: "bg-green-500/10",
          textColor: "text-green-400",
          dotColor: "bg-green-400",
        }
      case "offline":
        return {
          icon: <CloudOff className="w-3 h-3" />,
          text: "Saved offline",
          bgColor: "bg-amber-500/10",
          textColor: "text-amber-400",
          dotColor: "bg-amber-400",
        }
      case "error":
        return {
          icon: <AlertCircle className="w-3 h-3" />,
          text: "Save failed",
          bgColor: "bg-red-500/10",
          textColor: "text-red-400",
          dotColor: "bg-red-400",
        }
      case "idle":
      default:
        return {
          icon: hasUnsavedChanges ? (
            <Save className="w-3 h-3" />
          ) : lastSavedAt ? (
            <Check className="w-3 h-3" />
          ) : null,
          text: hasUnsavedChanges
            ? "Unsaved changes"
            : lastSavedAt
            ? `Saved ${formatLastSaved(lastSavedAt)}`
            : "Ready",
          bgColor: hasUnsavedChanges ? "bg-yellow-500/10" : "bg-white/5",
          textColor: hasUnsavedChanges ? "text-yellow-400" : "text-muted-foreground",
          dotColor: hasUnsavedChanges ? "bg-yellow-400" : "bg-muted-foreground",
        }
    }
  }

  const config = getStatusConfig()

  return (
    <AnimatePresence mode="wait">
      <motion.span
        key={status + (hasUnsavedChanges ? "-unsaved" : "")}
        initial={{ opacity: 0, y: -5 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 5 }}
        transition={{ duration: 0.2 }}
        className={cn(
          "inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-full",
          config.bgColor,
          config.textColor,
          className
        )}
        title={lastSavedAt ? `Last saved at ${formatTime(lastSavedAt)}` : undefined}
      >
        {config.icon}
        <span className="hidden sm:inline">{config.text}</span>
        <span className="sm:hidden">
          {status === "saving" ? "..." : status === "saved" ? "✓" : status === "offline" ? "☁" : status === "error" ? "!" : hasUnsavedChanges ? "*" : "✓"}
        </span>
      </motion.span>
    </AnimatePresence>
  )
}

/**
 * Compact version for use in tight spaces
 */
export function AutoSaveStatusCompact({
  status,
  lastSavedAt,
  hasUnsavedChanges,
  className,
}: Omit<AutoSaveStatusProps, "showLastSaved">) {
  const getDotColor = () => {
    switch (status) {
      case "saving":
        return "bg-cinematic-blue animate-pulse"
      case "saved":
        return "bg-green-400"
      case "offline":
        return "bg-amber-400"
      case "error":
        return "bg-red-400"
      case "idle":
      default:
        return hasUnsavedChanges ? "bg-yellow-400" : "bg-green-400"
    }
  }

  const getTooltip = () => {
    switch (status) {
      case "saving":
        return "Saving..."
      case "saved":
        return lastSavedAt ? `Saved at ${formatTime(lastSavedAt)}` : "Saved"
      case "offline":
        return "Saved offline - will sync when online"
      case "error":
        return "Save failed - will retry"
      case "idle":
      default:
        return hasUnsavedChanges ? "Unsaved changes" : "All changes saved"
    }
  }

  return (
    <motion.span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs text-muted-foreground",
        className
      )}
      title={getTooltip()}
    >
      <span className={cn("w-2 h-2 rounded-full", getDotColor())} />
      <span className="hidden sm:inline">
        {status === "saving"
          ? "Saving..."
          : status === "saved"
          ? "Saved"
          : hasUnsavedChanges
          ? "Unsaved"
          : "Saved"}
      </span>
    </motion.span>
  )
}

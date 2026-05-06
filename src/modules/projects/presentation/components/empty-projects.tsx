"use client"

import { motion } from "framer-motion"
import { Film, Plus } from "lucide-react"
import { Button } from "@/ui/components/button"

interface EmptyProjectsProps {
  onCreateClick: () => void
  canCreate?: boolean
  blockedReason?: string | null
}

export function EmptyProjects({ onCreateClick, canCreate = true, blockedReason }: EmptyProjectsProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center py-16 px-4"
    >
      <div className="w-24 h-24 rounded-2xl bg-white/5 flex items-center justify-center mb-6">
        <Film className="w-12 h-12 text-muted-foreground/50" />
      </div>

      <h3 className="text-xl font-semibold text-white mb-2">
        No projects yet
      </h3>

      <p className="text-muted-foreground text-center max-w-sm mb-6">
        {canCreate
          ? "Start your first screenplay project and bring your stories to life with AI-powered writing."
          : blockedReason ?? "Upgrade your plan to create more screenplay projects."}
      </p>

      <Button
        onClick={onCreateClick}
        disabled={!canCreate}
        className="h-11 min-h-[44px] w-full max-w-xs bg-cinematic-orange px-6 text-black hover:bg-cinematic-orange/90 sm:w-auto"
      >
        <Plus className="w-4 h-4 mr-2" />
        {canCreate ? "Create Your First Project" : "Project Limit Reached"}
      </Button>
    </motion.div>
  )
}

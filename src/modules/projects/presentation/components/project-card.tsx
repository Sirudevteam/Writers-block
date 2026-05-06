"use client"

import { memo } from "react"
import { motion } from "framer-motion"
import Link from "next/link"
import { Calendar, Clock, Edit2, Trash2, Film, MoreVertical } from "lucide-react"
import { Button } from "@/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/ui/components/dropdown-menu"
import type { Project } from "@/shared/types/project"

interface ProjectCardProps {
  project: Project
  onDelete: (id: string) => void
  index?: number
}

const PROJECT_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
})

function formatDate(date: Date) {
  return PROJECT_DATE_FORMATTER.format(new Date(date))
}

function getTimeAgo(date: Date) {
  const now = new Date()
  const diff = now.getTime() - new Date(date).getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor(diff / (1000 * 60 * 60))
  const minutes = Math.floor(diff / (1000 * 60))

  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`
  return formatDate(date)
}

function getGenreColor(genre?: string) {
  const colors: Record<string, string> = {
    Drama: "from-red-500/20 to-red-500/5 border-red-500/30",
    Thriller: "from-purple-500/20 to-purple-500/5 border-purple-500/30",
    Comedy: "from-yellow-500/20 to-yellow-500/5 border-yellow-500/30",
    Romance: "from-pink-500/20 to-pink-500/5 border-pink-500/30",
    Action: "from-orange-500/20 to-orange-500/5 border-orange-500/30",
    Horror: "from-green-500/20 to-green-500/5 border-green-500/30",
  }
  return colors[genre || ""] || "from-cinematic-orange/20 to-cinematic-orange/5 border-cinematic-orange/30"
}

function ProjectCardComponent({ project, onDelete, index = 0 }: ProjectCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      whileHover={{ y: -4 }}
      className="group relative"
    >
      {/* Glow effect */}
      <div className="absolute -inset-0.5 bg-gradient-to-r from-cinematic-orange/20 to-cinematic-blue/20 rounded-2xl blur opacity-0 group-hover:opacity-50 transition-opacity duration-500" />
      
      <div className="relative bg-[#0f0f0f]/80 backdrop-blur border border-white/10 rounded-xl overflow-hidden hover:border-cinematic-orange/30 transition-all duration-300">
        {/* Card Header with Genre Badge */}
        <div className="p-4 sm:p-5">
          <div className="mb-3 flex items-start justify-between gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${getGenreColor(project.genre)} flex items-center justify-center border`}>
                <Film className="w-5 h-5 text-cinematic-orange" />
              </div>
              {project.genre && (
                <span className="text-xs px-2.5 py-1 rounded-full bg-white/5 text-muted-foreground uppercase tracking-wide border border-white/10">
                  {project.genre}
                </span>
              )}
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Project actions"
                  className="h-10 w-10 opacity-100 hover:bg-white/5 sm:opacity-0 sm:group-hover:opacity-100 sm:transition-opacity"
                >
                  <MoreVertical className="h-4 w-4 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-[#0f0f0f] border-white/10">
                <DropdownMenuItem className="text-red-400 focus:text-red-400 focus:bg-red-500/10" onClick={() => onDelete(project.id)}>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete Project
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Title & Description */}
          <Link href={`/editor?project=${project.id}`} className="block min-w-0">
            <h3 className="mb-1 line-clamp-2 text-base font-semibold text-white transition-colors group-hover:text-cinematic-orange sm:line-clamp-1 sm:text-lg">
              {project.title}
            </h3>
          </Link>
          {project.description && (
            <p className="text-sm text-muted-foreground line-clamp-2 mb-4">
              {project.description}
            </p>
          )}

          {/* Meta Info */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>{formatDate(project.createdAt)}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>Edited {getTimeAgo(project.updatedAt)}</span>
            </div>
          </div>
        </div>

        {/* Card Footer with Actions */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 bg-white/[0.02] px-4 py-3 sm:px-5">
          <Button
            asChild
              variant="ghost"
              size="sm"
              className="h-11 min-h-[44px] w-full text-cinematic-orange hover:text-cinematic-orange hover:bg-cinematic-orange/10 rounded-lg sm:h-9 sm:min-h-0 sm:w-auto"
            >
            <Link href={`/editor?project=${project.id}`} className="min-w-0 flex-1 sm:flex-none">
              <Edit2 className="mr-2 h-4 w-4 shrink-0" />
              Open project
            </Link>
          </Button>

          <Button
            variant="ghost"
            size="icon"
            aria-label="Delete project"
            className="h-11 w-11 min-h-[44px] min-w-[44px] shrink-0 text-muted-foreground hover:text-red-400 hover:bg-red-500/10 rounded-lg sm:h-9 sm:w-9 sm:min-h-0 sm:min-w-0"
            onClick={() => onDelete(project.id)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>

        {/* Progress indicator if content exists */}
        {project.content && project.content.length > 0 && (
          <div className="h-1 bg-white/5">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${Math.min((project.content.length / 5000) * 100, 100)}%` }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="h-full bg-gradient-to-r from-cinematic-orange to-cinematic-blue"
            />
          </div>
        )}
      </div>
    </motion.div>
  )
}

export const ProjectCard = memo(ProjectCardComponent)
ProjectCard.displayName = "ProjectCard"

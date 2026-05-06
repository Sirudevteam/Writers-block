"use client"

import { useCallback, useMemo, useState } from "react"
import dynamic from "next/dynamic"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import {
  Plus,
  Search,
  Grid3X3,
  List,
  Film,
  Sparkles,
  TrendingUp,
  Clock,
  Settings,
} from "lucide-react"
import { Button } from "@/ui/components/button"
import { Input } from "@/ui/components/input"
import { ProjectCard } from "@/modules/projects/presentation/components/project-card"
import { SubscriptionPanel } from "@/modules/billing/presentation/components/subscription-panel"
import { EmptyProjects } from "@/modules/projects/presentation/components/empty-projects"
import type { Subscription as UISubscription } from "@/shared/types/project"
import { mapDbProjectToUI } from "@/modules/projects/domain/mappers"
import { toUISubscription } from "@/modules/billing/domain/subscription"
import { CardSkeleton } from "@/shared/components/loading-skeleton"
import { useAccessibility } from "@/shared/components/accessibility-provider"
import { useProjects } from "@/modules/projects/presentation/hooks/use-projects"
import type { ProjectListPage } from "@/modules/projects/domain/types"
import type { Profile, Subscription as DbSubscription } from "@/infrastructure/db/types/database"

const CreateProjectModal = dynamic(
  () => import("@/modules/projects/presentation/components/create-project-modal").then((m) => m.CreateProjectModal),
  { ssr: false }
)

const FILM_STRIP_CELLS = Array.from({ length: 30 }, (_, i) => i)
const QUICK_TIPS = [
  "Use specific character descriptions for better AI results",
  "Include location details for authentic settings",
  "Try different moods to explore story variations",
] as const

function FilmStrip({ className = "" }: { className?: string }) {
  return (
    <div className={`flex opacity-10 ${className}`}>
      {FILM_STRIP_CELLS.map((i) => (
        <div key={i} className="flex-1 flex justify-center">
          <div className="w-1 h-full bg-white/40 rounded-sm" />
        </div>
      ))}
    </div>
  )
}

function getGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return "Good morning"
  if (hour < 17) return "Good afternoon"
  return "Good evening"
}

interface DashboardClientProps {
  profile: Profile | null
  subscription: DbSubscription | null
  initialProjectsPage: ProjectListPage
}

export function DashboardClient({
  profile,
  subscription: dbSub,
  initialProjectsPage,
}: DashboardClientProps) {
  const router = useRouter()
  const { prefersReducedMotion } = useAccessibility()
  const {
    projects: dbProjects,
    loading: projectsLoading,
    loadingMore,
    hasMore,
    quota,
    error: projectsError,
    createProject,
    deleteProject,
    loadMore,
    refetch: refetchProjects,
  } = useProjects({ initialPage: initialProjectsPage })

  const [searchQuery, setSearchQuery] = useState("")
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid")

  const projects = useMemo(() => dbProjects.map(mapDbProjectToUI), [dbProjects])
  const isLoading = projectsLoading

  const subscription: UISubscription = useMemo(
    () => toUISubscription(dbSub, quota?.activeUsed ?? projects.length),
    [dbSub, projects.length, quota?.activeUsed]
  )
  const isFreePlan = subscription.plan === "free"
  const quotaBlockedReason = quota?.blockedReason ?? "Project limit reached. Please upgrade your plan."

  const normalizedSearch = searchQuery.trim().toLowerCase()
  const filteredProjects = useMemo(() => {
    if (!normalizedSearch) return projects
    return projects.filter((p) => {
      return (
        p.title.toLowerCase().includes(normalizedSearch) ||
        p.genre?.toLowerCase().includes(normalizedSearch)
      )
    })
  }, [normalizedSearch, projects])

  const dashboardStats = useMemo(() => {
    const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
    const activeThisWeek = projects.filter(
      (p) => new Date(p.updatedAt).getTime() > oneWeekAgo
    ).length
    const completionPct = Math.round(
      projects.length > 0
        ? (projects.filter((p) => p.content && p.content.length > 100).length / projects.length) * 100
        : 0
    )

    return {
      totalProjects: projects.length,
      activeThisWeek,
      completionPct,
      slotsLeft: isFreePlan && quota
        ? Math.max(0, quota.freeLifetimeLimit - quota.freeLifetimeUsed)
        : Math.max(0, subscription.projectsLimit - subscription.projectsUsed),
    }
  }, [isFreePlan, projects, quota, subscription.projectsLimit, subscription.projectsUsed])

  const recentProjects = useMemo(() => projects.slice(0, 3), [projects])
  const canCreateProject = quota?.canCreate ?? projects.length < subscription.projectsLimit

  const openCreateModal = useCallback(() => {
    if (!canCreateProject) {
      alert(quotaBlockedReason)
      return
    }
    setIsCreateModalOpen(true)
  }, [canCreateProject, quotaBlockedReason])
  const closeCreateModal = useCallback(() => setIsCreateModalOpen(false), [])
  const goToSubscription = useCallback(() => router.push("/dashboard/subscription"), [router])

  const handleCreateProject = useCallback(
    async (title: string, description: string) => {
      if (!canCreateProject) {
        alert(quotaBlockedReason)
        return
      }
      try {
        await createProject(title, description)
      } catch {
        /* error surfaced via projectsError */
      }
    },
    [canCreateProject, createProject, quotaBlockedReason]
  )

  const handleDeleteProject = useCallback(
    async (id: string) => {
      const message =
        subscription.plan === "free"
          ? "Are you sure you want to delete this project?\n\nDeleting does not restore free project credits."
          : "Are you sure you want to delete this project?"
      if (confirm(message)) {
        await deleteProject(id)
      }
    },
    [deleteProject, subscription.plan]
  )

  const firstName = profile?.full_name?.split(/\s+/)[0]?.trim() ?? ""
  const greetingTitle = firstName ? `${getGreeting()}, ${firstName}` : "Dashboard"

  return (
    <div className="min-h-[100dvh] min-h-screen bg-[#0a0a0a] relative overflow-x-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {!prefersReducedMotion ? (
          <>
            <motion.div
              animate={{ scale: [1, 1.2, 1], opacity: [0.05, 0.1, 0.05] }}
              transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
              className="absolute -top-24 -right-24 sm:top-0 sm:right-0 w-[min(100vw,28rem)] h-[min(100vw,28rem)] sm:w-[600px] sm:h-[600px] bg-cinematic-orange/10 rounded-full blur-3xl"
            />
            <motion.div
              animate={{ scale: [1, 1.1, 1], opacity: [0.05, 0.12, 0.05] }}
              transition={{ duration: 12, repeat: Infinity, ease: "easeInOut", delay: 2 }}
              className="absolute -bottom-32 left-0 sm:bottom-0 sm:left-1/4 w-[min(90vw,24rem)] h-[min(90vw,24rem)] sm:w-[500px] sm:h-[500px] bg-cinematic-blue/10 rounded-full blur-3xl"
            />
          </>
        ) : (
          <>
            <div className="absolute -top-24 -right-24 sm:top-0 sm:right-0 w-[min(100vw,28rem)] h-[min(100vw,28rem)] sm:w-[600px] sm:h-[600px] bg-cinematic-orange/10 rounded-full blur-3xl opacity-[0.07]" />
            <div className="absolute -bottom-32 left-0 sm:bottom-0 sm:left-1/4 w-[min(90vw,24rem)] h-[min(90vw,24rem)] sm:w-[500px] sm:h-[500px] bg-cinematic-blue/10 rounded-full blur-3xl opacity-[0.08]" />
          </>
        )}
        <div
          className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
          }}
        />
      </div>

      <main className="w-full min-w-0 relative z-10 pt-[env(safe-area-inset-top,0px)]">
        <header className="sticky top-0 z-30 bg-[#0a0a0a]/90 backdrop-blur-2xl border-b border-white/10">
          <FilmStrip className="absolute top-0 left-0 right-0 h-2" />

          <div className="pl-14 pr-4 pt-5 pb-4 sm:px-6 lg:pl-6 lg:pr-6 sm:pt-6">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <motion.div
                initial={{ opacity: 0, x: prefersReducedMotion ? 0 : -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: prefersReducedMotion ? 0 : 0.5 }}
                className="min-w-0 flex-1 xl:pr-4"
              >
                <h1 className="text-xl font-bold font-display sm:text-2xl">
                  <span className="block truncate bg-gradient-to-r from-white via-white to-white/70 bg-clip-text text-transparent sm:max-w-[min(100%,42rem)]">
                    {greetingTitle}
                  </span>
                </h1>
                <p className="mt-1 text-xs text-muted-foreground sm:text-sm flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="min-w-0">Manage your screenplay projects.</span>
                  <Link
                    href="/dashboard/settings"
                    className="inline-flex items-center gap-1 shrink-0 text-cinematic-orange/90 hover:text-cinematic-orange hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-cinematic-orange/50 rounded py-1"
                  >
                    <Settings className="w-3.5 h-3.5 shrink-0" aria-hidden />
                    Profile &amp; settings
                  </Link>
                </p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: prefersReducedMotion ? 0 : 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: prefersReducedMotion ? 0 : 0.5, delay: prefersReducedMotion ? 0 : 0.1 }}
                className="flex w-full min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center xl:w-auto xl:max-w-none xl:flex-nowrap xl:justify-end"
              >
                <div className="relative group w-full sm:min-w-[min(100%,16rem)] sm:flex-1 xl:w-64 xl:flex-none">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground group-focus-within:text-cinematic-orange transition-colors"
                    aria-hidden
                  />
                  <Input
                    placeholder="Search projects..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    aria-label="Search projects"
                    className="h-11 min-h-[44px] w-full pl-10 bg-white/5 border-white/10 focus:border-cinematic-orange/50 focus:ring-cinematic-orange/20 rounded-xl text-base sm:text-sm"
                  />
                </div>

                <div className="flex w-full items-center gap-2 sm:w-auto sm:justify-end">
                  <div
                    className="flex flex-1 items-center justify-center rounded-xl border border-white/10 bg-white/5 p-1 sm:flex-initial"
                    role="group"
                    aria-label="Project layout"
                  >
                    <button
                      type="button"
                      onClick={() => setViewMode("grid")}
                      aria-pressed={viewMode === "grid"}
                      aria-label="Grid view"
                      className={`min-h-[44px] min-w-[44px] rounded-lg p-2.5 transition-all flex items-center justify-center ${viewMode === "grid" ? "bg-cinematic-orange/20 text-cinematic-orange" : "text-muted-foreground hover:text-white"}`}
                    >
                      <Grid3X3 className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode("list")}
                      aria-pressed={viewMode === "list"}
                      aria-label="List view"
                      className={`min-h-[44px] min-w-[44px] rounded-lg p-2.5 transition-all flex items-center justify-center ${viewMode === "list" ? "bg-cinematic-orange/20 text-cinematic-orange" : "text-muted-foreground hover:text-white"}`}
                    >
                      <List className="h-4 w-4" />
                    </button>
                  </div>

                  <Button
                    type="button"
                    onClick={openCreateModal}
                    disabled={!canCreateProject || isLoading}
                    className="h-11 min-h-[44px] flex-1 shrink-0 rounded-xl bg-cinematic-orange px-4 text-black hover:bg-cinematic-orange/90 sm:flex-initial relative overflow-hidden"
                  >
                    {!prefersReducedMotion && (
                      <motion.div
                        className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent -skew-x-12"
                        animate={{ x: ["-200%", "200%"] }}
                        transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
                        aria-hidden
                      />
                    )}
                    <Plus className="relative z-10 mr-2 h-4 w-4" aria-hidden />
                    <span className="relative z-10">New project</span>
                  </Button>
                </div>
              </motion.div>
            </div>
          </div>
        </header>

        <div className="px-4 py-4 pb-8 sm:p-6 sm:pb-10">
          {projectsError && (
            <div
              className="mb-6 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
              role="alert"
            >
              <span>{projectsError}</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-red-500/40 text-red-100 hover:bg-red-500/20 shrink-0"
                onClick={() => refetchProjects()}
              >
                Retry
              </Button>
            </div>
          )}
          {isLoading ? (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-2 sm:gap-4 md:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <CardSkeleton key={i} />
                ))}
              </div>
              <div className="space-y-4">
                <div className="h-6 w-32 bg-white/10 rounded-lg" />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <CardSkeleton key={i} />
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-8 xl:grid-cols-3 xl:gap-6">
              <div className="min-w-0 space-y-5 sm:space-y-6 xl:col-span-2">
                <div className="grid grid-cols-2 gap-2 sm:gap-4 md:grid-cols-4">
                  <motion.div
                    initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: prefersReducedMotion ? 0 : 0.1 }}
                    className="relative group min-w-0"
                  >
                    <div className="absolute -inset-0.5 bg-gradient-to-r from-cinematic-orange/30 to-cinematic-orange/10 rounded-2xl blur opacity-50 group-hover:opacity-75 transition-opacity" />
                    <div className="relative bg-[#0f0f0f]/80 backdrop-blur border border-white/10 rounded-xl p-3 sm:p-4">
                      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                        <div className="h-9 w-9 shrink-0 rounded-xl bg-cinematic-orange/20 flex items-center justify-center sm:h-10 sm:w-10">
                          <Film className="h-4 w-4 text-cinematic-orange sm:h-5 sm:w-5" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-lg font-bold text-white tabular-nums sm:text-2xl">{dashboardStats.totalProjects}</p>
                          <p className="text-[10px] leading-tight text-muted-foreground sm:text-xs">Total projects</p>
                        </div>
                      </div>
                    </div>
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: prefersReducedMotion ? 0 : 0.2 }}
                    className="relative group min-w-0"
                  >
                    <div className="absolute -inset-0.5 bg-gradient-to-r from-cinematic-blue/30 to-cinematic-blue/10 rounded-2xl blur opacity-50 group-hover:opacity-75 transition-opacity" />
                    <div className="relative bg-[#0f0f0f]/80 backdrop-blur border border-white/10 rounded-xl p-3 sm:p-4">
                      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                        <div className="h-9 w-9 shrink-0 rounded-xl bg-cinematic-blue/20 flex items-center justify-center sm:h-10 sm:w-10">
                          <Clock className="h-4 w-4 text-cinematic-blue sm:h-5 sm:w-5" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-lg font-bold text-white tabular-nums sm:text-2xl">{dashboardStats.activeThisWeek}</p>
                          <p className="text-[10px] leading-tight text-muted-foreground sm:text-xs">Active this week</p>
                        </div>
                      </div>
                    </div>
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: prefersReducedMotion ? 0 : 0.3 }}
                    className="relative group min-w-0"
                  >
                    <div className="absolute -inset-0.5 bg-gradient-to-r from-green-500/30 to-green-500/10 rounded-2xl blur opacity-50 group-hover:opacity-75 transition-opacity" />
                    <div className="relative bg-[#0f0f0f]/80 backdrop-blur border border-white/10 rounded-xl p-3 sm:p-4">
                      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                        <div className="h-9 w-9 shrink-0 rounded-xl bg-green-500/20 flex items-center justify-center sm:h-10 sm:w-10">
                          <TrendingUp className="h-4 w-4 text-green-400 sm:h-5 sm:w-5" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-lg font-bold text-white tabular-nums sm:text-2xl">{dashboardStats.completionPct}%</p>
                          <p className="text-[10px] leading-tight text-muted-foreground sm:text-xs">Completion</p>
                        </div>
                      </div>
                    </div>
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: prefersReducedMotion ? 0 : 0.4 }}
                    className="relative group min-w-0"
                  >
                    <div className="absolute -inset-0.5 bg-gradient-to-r from-purple-500/30 to-purple-500/10 rounded-2xl blur opacity-50 group-hover:opacity-75 transition-opacity" />
                    <div className="relative bg-[#0f0f0f]/80 backdrop-blur border border-white/10 rounded-xl p-3 sm:p-4">
                      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                        <div className="h-9 w-9 shrink-0 rounded-xl bg-purple-500/20 flex items-center justify-center sm:h-10 sm:w-10">
                          <Sparkles className="h-4 w-4 text-purple-400 sm:h-5 sm:w-5" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-lg font-bold text-white tabular-nums sm:text-2xl">{dashboardStats.slotsLeft}</p>
                          <p className="text-[10px] leading-tight text-muted-foreground sm:text-xs">
                            {isFreePlan ? "Credits left" : "Slots left"}
                          </p>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                </div>

                <div className="min-w-0">
                  <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <h2 className="text-base font-semibold text-white flex items-center gap-2 sm:text-lg">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-cinematic-orange" aria-hidden />
                      My projects
                    </h2>
                    <span className="text-xs text-muted-foreground sm:text-sm">
                      {filteredProjects.length} project{filteredProjects.length !== 1 ? "s" : ""}
                      {searchQuery.trim() ? " (filtered)" : hasMore ? "+" : ""}
                    </span>
                  </div>

                  {filteredProjects.length === 0 ? (
                    <EmptyProjects
                      onCreateClick={openCreateModal}
                      canCreate={canCreateProject}
                      blockedReason={quotaBlockedReason}
                    />
                  ) : (
                    <>
                      <div
                        className={
                          viewMode === "grid"
                            ? "grid grid-cols-1 gap-4 sm:grid-cols-2"
                            : "grid grid-cols-1 gap-3"
                        }
                      >
                        {filteredProjects.map((project, index) => (
                          <ProjectCard
                            key={project.id}
                            project={project}
                            onDelete={handleDeleteProject}
                            index={index}
                          />
                        ))}
                      </div>
                      {hasMore && !searchQuery.trim() && (
                        <div className="mt-4 flex justify-center">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={loadMore}
                            disabled={loadingMore}
                            className="border-white/10 text-muted-foreground hover:text-white hover:border-white/20"
                          >
                            {loadingMore ? "Loading..." : "Load more projects"}
                          </Button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>

              <aside className="min-w-0 space-y-5 sm:space-y-6 xl:max-w-none">
                <motion.div
                  initial={{ opacity: 0, x: prefersReducedMotion ? 0 : 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: prefersReducedMotion ? 0 : 0.3 }}
                >
                  <SubscriptionPanel
                    subscription={subscription}
                    projectQuota={quota}
                    onUpgrade={goToSubscription}
                  />
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, x: prefersReducedMotion ? 0 : 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: prefersReducedMotion ? 0 : 0.4 }}
                  className="relative group"
                >
                  <div className="absolute -inset-0.5 bg-gradient-to-r from-cinematic-orange/20 to-cinematic-blue/20 rounded-2xl blur opacity-30 group-hover:opacity-50 transition-opacity" />
                  <div className="relative bg-[#0f0f0f]/80 backdrop-blur border border-white/10 rounded-xl p-4 sm:p-5">
                    <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white sm:mb-4 sm:text-base">
                      <Sparkles className="h-4 w-4 shrink-0 text-cinematic-orange" />
                      Quick tips
                    </h3>
                    <ul className="space-y-3 text-xs text-muted-foreground sm:text-sm">
                      {QUICK_TIPS.map((tip, i) => (
                        <li key={tip} className="flex items-start gap-3">
                          <span className="w-5 h-5 rounded-full bg-cinematic-orange/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <span className="text-xs text-cinematic-orange">{i + 1}</span>
                          </span>
                          <span>{tip}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </motion.div>

                {recentProjects.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, x: prefersReducedMotion ? 0 : 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: prefersReducedMotion ? 0 : 0.5 }}
                    className="bg-[#0f0f0f]/80 backdrop-blur border border-white/10 rounded-xl p-4 sm:p-5"
                  >
                    <h3 className="mb-3 text-sm font-semibold text-white sm:mb-4 sm:text-base">Recent activity</h3>
                    <div className="space-y-3">
                      {recentProjects.map((project) => (
                        <div key={project.id} className="flex items-center gap-3 text-sm">
                          <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center">
                            <Film className="w-4 h-4 text-cinematic-orange" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-white truncate">{project.title}</p>
                            <p className="text-xs text-muted-foreground">
                              Edited {new Date(project.updatedAt).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </aside>
            </div>
          )}
        </div>
      </main>

      {isCreateModalOpen && (
        <CreateProjectModal
          isOpen={isCreateModalOpen}
          onClose={closeCreateModal}
          onCreate={handleCreateProject}
        />
      )}
    </div>
  )
}

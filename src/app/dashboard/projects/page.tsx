"use client"

import { useState, useCallback } from "react"
import { motion } from "framer-motion"
import { Plus, Search, ArrowLeft } from "lucide-react"
import Link from "next/link"
import { Button } from "@/ui/components/button"
import { Input } from "@/ui/components/input"
import { ProjectCard } from "@/modules/projects/presentation/components/project-card"
import { CreateProjectModal } from "@/modules/projects/presentation/components/create-project-modal"
import { EmptyProjects } from "@/modules/projects/presentation/components/empty-projects"
import { CardSkeleton } from "@/shared/components/loading-skeleton"
import { useUser } from "@/modules/account/presentation/hooks/use-user"
import { useProjects } from "@/modules/projects/presentation/hooks/use-projects"
import { mapDbProjectToUI } from "@/modules/projects/domain/mappers"
import { toUISubscription } from "@/modules/billing/domain/subscription"
import { SubscriptionPanel } from "@/modules/billing/presentation/components/subscription-panel"
import { useRouter } from "next/navigation"

export default function ProjectsPage() {
  const router = useRouter()
  const { subscription: dbSub, loading: userLoading } = useUser()
  const {
    projects: dbProjects,
    loading: projectsLoading,
    error: projectsError,
    quota,
    createProject,
    deleteProject,
    refetch: refetchProjects,
  } = useProjects()

  const [searchQuery, setSearchQuery] = useState("")
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)

  const projects = dbProjects.map(mapDbProjectToUI)
  const isLoading = projectsLoading

  const subscription = toUISubscription(dbSub, quota?.activeUsed ?? projects.length)
  const canCreateProject = quota?.canCreate ?? projects.length < subscription.projectsLimit
  const quotaBlockedReason = quota?.blockedReason ?? "Project limit reached. Please upgrade your plan."

  const filteredProjects = projects.filter(
    (project) =>
      project.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      project.genre?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const handleCreateProject = useCallback(
    async (title: string, description: string) => {
      if (!canCreateProject) {
        alert(quotaBlockedReason)
        return
      }
      try {
        await createProject(title, description)
      } catch {
        /* projectsError set in hook */
      }
    },
    [canCreateProject, createProject, quotaBlockedReason]
  )

  const handleDeleteProject = async (id: string) => {
    const message =
      subscription.plan === "free"
        ? "Are you sure you want to delete this project?\n\nDeleting does not restore free project credits."
        : "Are you sure you want to delete this project?"

    if (confirm(message)) {
      try {
        await deleteProject(id)
      } catch {
        /* projectsError set in hook */
      }
    }
  }

  return (
    <>
      <main className="relative z-10 flex min-w-0 flex-1 flex-col pt-[env(safe-area-inset-top,0px)]">
        <header className="sticky top-0 z-30 border-b border-white/10 bg-[#0a0a0a]/90 backdrop-blur-2xl">
          <div className="px-4 pb-4 pl-14 pt-5 sm:px-6 lg:pl-6">
            <div className="mb-4 flex flex-col gap-3 sm:mb-5 sm:flex-row sm:items-center sm:gap-4">
              <div className="flex min-w-0 items-start gap-2 sm:items-center sm:gap-3">
                <Button
                  asChild
                  variant="ghost"
                  size="icon"
                  className="h-11 min-h-[44px] min-w-[44px] text-muted-foreground hover:text-white"
                >
                  <Link href="/dashboard" className="shrink-0" aria-label="Back to dashboard">
                    <ArrowLeft className="h-5 w-5" aria-hidden />
                  </Link>
                </Button>
                <div className="min-w-0 flex-1">
                  <h1 className="font-display text-xl font-bold text-white sm:text-2xl">
                    <span className="block truncate">My Projects</span>
                  </h1>
                  <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">
                    Manage all your screenplay projects
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch sm:gap-3">
              <div className="relative min-w-0 flex-1">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  placeholder="Search projects…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  aria-label="Search projects"
                  className="h-11 min-h-[44px] w-full rounded-xl border-white/10 bg-white/5 pl-10 text-base sm:text-sm"
                />
              </div>
              <Button
                type="button"
                onClick={() => setIsCreateModalOpen(true)}
                disabled={!canCreateProject || isLoading || userLoading}
                className="h-11 min-h-[44px] w-full shrink-0 rounded-xl bg-cinematic-orange text-black hover:bg-cinematic-orange/90 disabled:opacity-50 sm:w-auto sm:px-6"
              >
                <Plus className="mr-2 h-4 w-4" aria-hidden />
                New Project
              </Button>
            </div>
          </div>
        </header>

        <div className="flex-1 px-4 py-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-6 sm:pb-10">
          {projectsError && (
            <div
              className="mb-6 flex flex-col gap-3 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200 sm:flex-row sm:items-center sm:justify-between"
              role="alert"
            >
              <span className="min-w-0 break-words">{projectsError}</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0 border-red-500/40 text-red-100 hover:bg-red-500/20"
                onClick={() => refetchProjects()}
              >
                Retry
              </Button>
            </div>
          )}

          {isLoading ? (
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3 xl:gap-8">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:col-span-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <CardSkeleton key={i} />
                ))}
              </div>
              <div
                className="hidden min-h-[12rem] animate-pulse rounded-2xl bg-white/5 xl:block"
                aria-hidden
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3 xl:gap-8">
              <div className="min-w-0 xl:col-span-2">
                {filteredProjects.length === 0 ? (
                  <EmptyProjects
                    onCreateClick={() => setIsCreateModalOpen(true)}
                    canCreate={canCreateProject}
                    blockedReason={quotaBlockedReason}
                  />
                ) : (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-4 lg:gap-5">
                    {filteredProjects.map((project, index) => (
                      <ProjectCard
                        key={project.id}
                        project={project}
                        onDelete={handleDeleteProject}
                        index={index}
                      />
                    ))}
                  </div>
                )}
              </div>

              <aside className="min-w-0 xl:sticky xl:top-36 xl:self-start">
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35 }}
                >
                  {userLoading ? (
                    <CardSkeleton />
                  ) : (
                    <SubscriptionPanel
                      subscription={subscription}
                      projectQuota={quota}
                      onUpgrade={() => router.push("/dashboard/subscription")}
                    />
                  )}
                </motion.div>
              </aside>
            </div>
          )}
        </div>
      </main>

      <CreateProjectModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreate={handleCreateProject}
      />
    </>
  )
}

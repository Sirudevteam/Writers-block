"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { parseErrorResponse } from "@/core/http/client"
import type { ProjectCreateResult, ProjectListPage, ProjectQuota } from "@/modules/projects/domain/types"
import type { ProjectListRow } from "@/infrastructure/db/types/database"

const PROJECTS_FETCH_TIMEOUT_MS = 15000

interface UseProjectsOptions {
  initialPage?: ProjectListPage
}

interface UseProjectsReturn {
  projects: ProjectListRow[]
  loading: boolean
  loadingMore: boolean
  hasMore: boolean
  quota: ProjectQuota | null
  error: string | null
  createProject: (
    title: string,
    description?: string,
    genre?: string
  ) => Promise<ProjectListRow>
  deleteProject: (id: string) => Promise<void>
  loadMore: () => Promise<void>
  refetch: () => Promise<void>
}

async function fetchPage(cursor?: string | null): Promise<ProjectListPage> {
  const url = new URL("/api/projects", location.origin)
  if (cursor) url.searchParams.set("cursor", cursor)
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), PROJECTS_FETCH_TIMEOUT_MS)

  let res: Response
  try {
    res = await fetch(url.toString(), {
      credentials: "same-origin",
      signal: controller.signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Projects took too long to load. Please retry.")
    }
    throw error
  } finally {
    window.clearTimeout(timeout)
  }

  if (!res.ok) throw new Error(await parseErrorResponse(res))
  const data = await res.json()

  if (Array.isArray(data)) {
    // Backwards compatibility for any callers that haven't updated yet.
    return { items: data, nextCursor: null, hasMore: false, quota: null }
  }

  return data as ProjectListPage
}

export function useProjects(options: UseProjectsOptions = {}): UseProjectsReturn {
  const initialPage = options.initialPage
  const hasInitialPage = initialPage !== undefined

  const [projects, setProjects] = useState<ProjectListRow[]>(() => initialPage?.items ?? [])
  const [loading, setLoading] = useState(!hasInitialPage)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(initialPage?.hasMore ?? false)
  const [quota, setQuota] = useState<ProjectQuota | null>(initialPage?.quota ?? null)
  const [error, setError] = useState<string | null>(null)
  const nextCursorRef = useRef<string | null>(initialPage?.nextCursor ?? null)

  const fetchProjects = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const page = await fetchPage(null)
      setProjects(page.items)
      setHasMore(page.hasMore)
      setQuota(page.quota ?? null)
      nextCursorRef.current = page.nextCursor
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load projects")
      setProjects([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (hasInitialPage) return
    void fetchProjects()
  }, [fetchProjects, hasInitialPage])

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore || !nextCursorRef.current) return
    setLoadingMore(true)
    setError(null)
    try {
      const page = await fetchPage(nextCursorRef.current)
      setProjects((prev) => [...prev, ...page.items])
      setHasMore(page.hasMore)
      setQuota(page.quota ?? quota)
      nextCursorRef.current = page.nextCursor
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load more projects")
    } finally {
      setLoadingMore(false)
    }
  }, [hasMore, loadingMore, quota])

  const createProject = useCallback(
    async (
      title: string,
      description?: string,
      genre?: string
    ): Promise<ProjectListRow> => {
      setError(null)
      const res = await fetch("/api/projects", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description: description ?? null,
          genre: genre ?? "drama",
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        const msg =
          typeof json?.error === "string" ? json.error : "Failed to create project"
        setError(msg)
        throw new Error(msg)
      }
      const data =
        json && typeof json === "object" && "project" in json
          ? (json as ProjectCreateResult)
          : { project: json as ProjectListRow, quota }
      setProjects((prev) => [data.project, ...prev])
      if (data.quota) setQuota(data.quota)
      return data.project
    },
    [quota]
  )

  const deleteProject = useCallback(async (id: string): Promise<void> => {
    setError(null)
    const res = await fetch(`/api/projects/${id}`, {
      method: "DELETE",
      credentials: "same-origin",
    })
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      const msg =
        typeof json?.error === "string" ? json.error : "Failed to delete project"
      setError(msg)
      throw new Error(msg)
    }
    setProjects((prev) => prev.filter((p) => p.id !== id))
    void fetchProjects()
  }, [fetchProjects])

  return {
    projects,
    loading,
    loadingMore,
    hasMore,
    quota,
    error,
    createProject,
    deleteProject,
    loadMore,
    refetch: fetchProjects,
  }
}

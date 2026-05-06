"use client"

import { motion, AnimatePresence } from "framer-motion"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import {
  ArrowRight,
  MessageSquare,
  AlertCircle,
  Camera,
  Loader2,
  Film,
  Save,
  Clapperboard,
  BookOpen,
  X,
  Menu,
  ChevronLeft,
  Download,
  Share2,
  Copy,
  Settings,
  FolderOpen,
  RefreshCw,
  Wand2,
  ThumbsUp,
  ThumbsDown,
} from "lucide-react"
import { useState, useRef, useCallback, useEffect, useMemo, Suspense } from "react"
import { Button } from "@/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/ui/components/dropdown-menu"
import { SceneInputForm } from "@/modules/editor/presentation/components/scene-input-form"
import { ScreenplayEditor } from "@/modules/editor/presentation/components/screenplay-editor"
import { ReferenceSceneCard } from "@/modules/editor/presentation/components/reference-scene-card"
import { useScreenplayStream, type SceneConfig } from "@/modules/editor/presentation/hooks/use-screenplay-stream"
import { useShotSuggestions } from "@/modules/editor/presentation/hooks/use-shot-suggestions"
import { useMovieReferences } from "@/modules/editor/presentation/hooks/use-movie-references"
import { ShotSuggestions } from "@/modules/editor/presentation/components/shot-suggestions"
import { StoryBiblePanel } from "@/modules/editor/presentation/components/story-bible-panel"
import { ProjectCollaborationPanel } from "@/modules/editor/presentation/components/project-collaboration-panel"
import { AutoSaveStatus, AutoSaveStatusCompact } from "@/modules/editor/presentation/components/auto-save-status"
import { getAutoSavedContent, clearAutoSavedContent } from "@/modules/editor/presentation/hooks/use-auto-save"
import { cn } from "@/shared/utils/cn"
import { getEffectivePlan } from "@/modules/billing/domain/subscription"
import { generatePrintHTML } from "@/modules/editor/domain/screenplay-print-html"
import { useUser } from "@/modules/account/presentation/hooks/use-user"
import { useRazorpay } from "@/modules/billing/presentation/hooks/use-razorpay"
import type { Project } from "@/infrastructure/db/types/database"
import { parseErrorResponse } from "@/core/http/client"

const STYLE_REWRITE_OPTIONS = [
  { id: "mass_action", label: "Mass / commercial" },
  { id: "snappy_dialogue", label: "Snappy dialogue" },
  { id: "emotional_lyrical", label: "Emotional, lyrical" },
  { id: "realistic_grounded", label: "Grounded / realistic" },
] as const

const DEFAULT_SITE_URL = "https://writersblock.app"

type QuickActionStatus = "idle" | "copied" | "shared" | "link-copied" | "copy-error" | "share-error"
type BatchJobStatus = "queued" | "processing" | "completed" | "failed" | "cancelled"
type BatchActionEndpoint = "improve-dialogue" | "rewrite-style"

type PendingBatchJob = {
  actionLabel: string
  batchEndpoint: string
  endpoint: BatchActionEndpoint
  projectId: string | null
  payload: Record<string, unknown>
}

type AiBatchJobSummary = {
  id: string
  endpoint: string
  projectId?: string | null
  status: BatchJobStatus
  result?: unknown
  errorMessage?: string | null
  attempts?: number
  createdAt?: string
  updatedAt?: string
  completedAt?: string | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value))
}

function isActiveBatchJob(job: AiBatchJobSummary): boolean {
  return job.status === "queued" || job.status === "processing"
}

function getBatchResultText(result: unknown): string | null {
  if (!isRecord(result)) return null
  return typeof result.text === "string" && result.text.trim() ? result.text : null
}

function getBatchResultRequestId(result: unknown): string | null {
  if (!isRecord(result)) return null
  return typeof result.requestId === "string" ? result.requestId : null
}

function normalizeBatchJob(job: unknown): AiBatchJobSummary | null {
  if (!isRecord(job) || typeof job.id !== "string" || typeof job.endpoint !== "string") return null
  const status = typeof job.status === "string" ? job.status : "queued"
  if (!["queued", "processing", "completed", "failed", "cancelled"].includes(status)) return null
  return {
    id: job.id,
    endpoint: job.endpoint,
    projectId: typeof job.projectId === "string" ? job.projectId : null,
    status: status as BatchJobStatus,
    result: job.result,
    errorMessage: typeof job.errorMessage === "string" ? job.errorMessage : null,
    attempts: typeof job.attempts === "number" ? job.attempts : undefined,
    createdAt: typeof job.createdAt === "string" ? job.createdAt : undefined,
    updatedAt: typeof job.updatedAt === "string" ? job.updatedAt : undefined,
    completedAt: typeof job.completedAt === "string" ? job.completedAt : null,
  }
}

function upsertBatchJob(current: AiBatchJobSummary[], next: AiBatchJobSummary): AiBatchJobSummary[] {
  const existing = current.findIndex((job) => job.id === next.id)
  if (existing === -1) return [next, ...current].slice(0, 5)
  const copy = current.slice()
  copy[existing] = next
  return copy
}

async function parseBatchableAiError(
  response: Response,
  fallback: string,
  pendingBatch: PendingBatchJob
): Promise<{ message: string; batch?: PendingBatchJob }> {
  const data = (await response.clone().json().catch(() => null)) as Record<string, unknown> | null
  if (data?.code === "batch_required") {
    return {
      message: typeof data.error === "string" ? data.error : fallback,
      batch: {
        ...pendingBatch,
        batchEndpoint: typeof data.batchEndpoint === "string" ? data.batchEndpoint : pendingBatch.batchEndpoint,
      },
    }
  }

  return { message: await parseErrorResponse(response, fallback) }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function pdfDownloadFilename(title: string): string {
  const cleaned = title
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80)

  return `${cleaned || "screenplay"}.pdf`
}

function filenameFromDisposition(value: string | null, fallback: string): string {
  const match = value?.match(/filename="([^"]+)"/i)
  return match?.[1] || fallback
}

async function copyTextToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }

  const textarea = document.createElement("textarea")
  textarea.value = text
  textarea.setAttribute("readonly", "")
  textarea.style.position = "fixed"
  textarea.style.left = "-9999px"
  textarea.style.top = "0"
  document.body.appendChild(textarea)
  textarea.select()

  try {
    if (!document.execCommand("copy")) {
      throw new Error("Copy command failed")
    }
  } finally {
    document.body.removeChild(textarea)
  }
}

async function readScreenplaySse(response: Response): Promise<string> {
  const reader = response.body?.getReader()
  if (!reader) throw new Error("Failed to read streamed response")

  const decoder = new TextDecoder()
  let buffer = ""
  let text = ""

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split("\n\n")
    buffer = lines.pop() || ""

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue
      try {
        const data = JSON.parse(line.slice(6)) as {
          done?: boolean
          content?: string
          error?: string
        }
        if (data.error) throw new Error(data.error)
        if (data.done) return text
        if (typeof data.content === "string") text += data.content
      } catch (err) {
        if (err instanceof Error) throw err
      }
    }
  }

  return text
}

// Wrapper component for Suspense
function EditorPageWrapper() {
  return (
    <Suspense fallback={<EditorPageSkeleton />}>
      <EditorPage />
    </Suspense>
  )
}

// Loading skeleton for the editor
function EditorPageSkeleton() {
  return (
    <main className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-cinematic-orange/10 flex items-center justify-center animate-pulse">
          <Clapperboard className="w-6 h-6 text-cinematic-orange/50" />
        </div>
        <p className="text-sm text-muted-foreground">Loading editor...</p>
      </div>
    </main>
  )
}

function EditorPage() {
  const searchParams = useSearchParams()
  const projectId = searchParams.get("project")
  const { subscription, loading: subscriptionLoading } = useUser()
  const effectivePlan = getEffectivePlan(subscription)
  const exportPrintWatermark = !subscriptionLoading && effectivePlan === "free"
  const canStyleRewrite = effectivePlan === "pro" || effectivePlan === "premium"

  const {
    generatedText,
    isGenerating,
    lastAiRequestId,
    savedProjectId,
    error,
    saveStatus,
    lastSavedAt,
    hasUnsavedChanges,
    generateScreenplay,
    clearGeneratedText,
    setGeneratedText,
    ensureSavedProject,
  } = useScreenplayStream(projectId)
  const { shots, isLoading: isLoadingShots, error: shotsError, generateShots, clearShots } = useShotSuggestions()
  const { references, isLoading: isLoadingReferences, error: referencesError, generateReferences, clearReferences } = useMovieReferences()
  const [showShots, setShowShots] = useState(false)
  const [showReferences, setShowReferences] = useState(false)
  const [showStoryBible, setShowStoryBible] = useState(false)
  const [showCollaboration, setShowCollaboration] = useState(false)
  const [showLeftPanel, setShowLeftPanel] = useState(true)
  const [isImproving, setIsImproving] = useState(false)
  const [isContinuing, setIsContinuing] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [project, setProject] = useState<Project | null>(null)
  const [isLoadingProject, setIsLoadingProject] = useState(false)
  const [showRestorePrompt, setShowRestorePrompt] = useState(false)
  const [autoSavedData, setAutoSavedData] = useState<{ content: string; timestamp: string } | null>(null)
  const [hasGeneratedReferences, setHasGeneratedReferences] = useState(false)
  const [styleRewriteId, setStyleRewriteId] = useState<string>("mass_action")
  const [isRewriting, setIsRewriting] = useState(false)
  const [quickActionStatus, setQuickActionStatus] = useState<QuickActionStatus>("idle")
  const [isCleanPdfExporting, setIsCleanPdfExporting] = useState(false)
  const [editorActionError, setEditorActionError] = useState<string | null>(null)
  const [pendingBatchJob, setPendingBatchJob] = useState<PendingBatchJob | null>(null)
  const [batchJobs, setBatchJobs] = useState<AiBatchJobSummary[]>([])
  const [isQueueingBatchJob, setIsQueueingBatchJob] = useState(false)
  const [batchStatusError, setBatchStatusError] = useState<string | null>(null)
  const [lastActionRequestId, setLastActionRequestId] = useState<string | null>(null)
  const [feedbackStatus, setFeedbackStatus] = useState<"idle" | "saving" | "saved" | "error">("idle")
  const [, setPdfExportError] = useState<string | null>(null)
  const lastConfigRef = useRef<SceneConfig | null>(null)
  const quickActionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const editorStats = useMemo(() => {
    const trimmed = generatedText.trim()
    const words = trimmed ? trimmed.split(/\s+/).length : 0
    return {
      words,
      pages: Math.max(1, Math.ceil(words / 250)),
    }
  }, [generatedText])

  const title = project?.title || "Untitled Screenplay"
  const activeProjectId = savedProjectId ?? project?.id ?? null
  const visibleError = error ?? editorActionError
  const visibleBatchJobs = useMemo(
    () =>
      batchJobs
        .filter((job) => job.endpoint === "improve-dialogue" || job.endpoint === "rewrite-style")
        .slice(0, 3),
    [batchJobs]
  )
  const hasActiveBatchJobs = useMemo(() => batchJobs.some(isActiveBatchJob), [batchJobs])
  const feedbackRequestId = lastActionRequestId ?? lastAiRequestId

  const setTransientQuickActionStatus = useCallback((status: QuickActionStatus) => {
    setQuickActionStatus(status)
    if (quickActionTimerRef.current) {
      clearTimeout(quickActionTimerRef.current)
    }
    quickActionTimerRef.current = setTimeout(() => {
      setQuickActionStatus("idle")
      quickActionTimerRef.current = null
    }, 2000)
  }, [])

  useEffect(() => {
    return () => {
      if (quickActionTimerRef.current) {
        clearTimeout(quickActionTimerRef.current)
      }
    }
  }, [])

  // Load existing project on mount
  useEffect(() => {
    if (projectId) {
      setIsLoadingProject(true)
      fetch(`/api/projects/${projectId}`)
        .then((res) => res.json())
        .then((data) => {
          if (data && !data.error) {
            setProject(data)
            // Load project content if available
            if (data.content) {
              setGeneratedText(data.content)
              clearReferences()
              setHasGeneratedReferences(false)
            }
            
            // Check for auto-saved content
            const autoSaved = getAutoSavedContent(projectId)
            if (autoSaved && autoSaved.content !== data.content) {
              setAutoSavedData(autoSaved)
              setShowRestorePrompt(true)
            }
          }
        })
        .catch(() => {
          // Ignore errors, user can still create new content
        })
        .finally(() => {
          setIsLoadingProject(false)
        })
    }
  }, [projectId, setGeneratedText, clearReferences])

  // Reset references when clearing screenplay
  const handleClearGeneratedText = useCallback(() => {
    clearGeneratedText()
    clearReferences()
    setHasGeneratedReferences(false)
    setEditorActionError(null)
    setPendingBatchJob(null)
    setBatchStatusError(null)
    setLastActionRequestId(null)
    setFeedbackStatus("idle")
  }, [clearGeneratedText, clearReferences])

  // Check screen size
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024)
      if (window.innerWidth < 1024) {
        setShowLeftPanel(false)
        setShowReferences(false)
      } else {
        setShowLeftPanel(true)
      }
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  const refreshBatchJobs = useCallback(async (jobId?: string) => {
    try {
      const query = jobId ? `?id=${encodeURIComponent(jobId)}` : ""
      const res = await fetch(`/api/ai/batch-jobs${query}`, {
        cache: "no-store",
        credentials: "same-origin",
      })
      if (!res.ok) {
        throw new Error(await parseErrorResponse(res, "Failed to load batch jobs"))
      }
      const data = (await res.json()) as { jobs?: unknown[] }
      const incoming = (Array.isArray(data.jobs) ? data.jobs : [])
        .map(normalizeBatchJob)
        .filter((job): job is AiBatchJobSummary => Boolean(job))
      setBatchJobs((current) => incoming.reduce(upsertBatchJob, current))
      setBatchStatusError(null)
    } catch (err) {
      setBatchStatusError(err instanceof Error ? err.message : "Failed to load batch jobs")
    }
  }, [])

  useEffect(() => {
    if (!hasActiveBatchJobs) return
    const timer = window.setInterval(() => {
      void refreshBatchJobs()
    }, 4000)
    return () => window.clearInterval(timer)
  }, [hasActiveBatchJobs, refreshBatchJobs])

  const handleQueueBatchJob = useCallback(async () => {
    if (!pendingBatchJob || isQueueingBatchJob) return
    setIsQueueingBatchJob(true)
    setBatchStatusError(null)
    try {
      const res = await fetch(pendingBatchJob.batchEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          endpoint: pendingBatchJob.endpoint,
          projectId: pendingBatchJob.projectId,
          payload: pendingBatchJob.payload,
        }),
      })
      if (!res.ok) {
        throw new Error(await parseErrorResponse(res, "Failed to queue batch job"))
      }
      const data = (await res.json()) as { job?: unknown }
      const job = normalizeBatchJob(data.job)
      if (job) {
        setBatchJobs((current) => upsertBatchJob(current, job))
        void refreshBatchJobs(job.id)
      }
      setPendingBatchJob(null)
      setEditorActionError(null)
    } catch (err) {
      setBatchStatusError(err instanceof Error ? err.message : "Failed to queue batch job")
    } finally {
      setIsQueueingBatchJob(false)
    }
  }, [isQueueingBatchJob, pendingBatchJob, refreshBatchJobs])

  const handleApplyBatchJobResult = useCallback(
    (job: AiBatchJobSummary) => {
      const text = getBatchResultText(job.result)
      if (!text) {
        setBatchStatusError("Batch job completed without screenplay text.")
        return
      }
      setGeneratedText(text)
      setLastActionRequestId(getBatchResultRequestId(job.result))
      setFeedbackStatus("idle")
      clearReferences()
      setHasGeneratedReferences(false)
      setPendingBatchJob(null)
      setEditorActionError(null)
      setBatchStatusError(null)
      setBatchJobs((current) => current.filter((item) => item.id !== job.id))
    },
    [clearReferences, setGeneratedText]
  )

  const submitAiFeedback = useCallback(
    async (rating: "up" | "down") => {
      if (!feedbackRequestId || feedbackStatus === "saving") return
      setFeedbackStatus("saving")
      try {
        const res = await fetch("/api/ai/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            requestId: feedbackRequestId,
            rating,
            metadata: {
              source: "editor",
              projectId: activeProjectId,
            },
          }),
        })
        if (!res.ok) {
          throw new Error(await parseErrorResponse(res, "Failed to save feedback"))
        }
        setFeedbackStatus("saved")
      } catch {
        setFeedbackStatus("error")
      }
    },
    [activeProjectId, feedbackRequestId, feedbackStatus]
  )

  const handleGenerate = (config: SceneConfig) => {
    setEditorActionError(null)
    setPendingBatchJob(null)
    setBatchStatusError(null)
    setLastActionRequestId(null)
    setFeedbackStatus("idle")
    clearReferences()
    setHasGeneratedReferences(false)
    clearGeneratedText()
    lastConfigRef.current = config
    generateScreenplay(config)
    if (isMobile) setShowLeftPanel(false)
  }

  const handleImproveDialogue = useCallback(async () => {
    if (!generatedText || isImproving) return
    setIsImproving(true)
    setEditorActionError(null)
    setPendingBatchJob(null)
    setBatchStatusError(null)
    try {
      const res = await fetch("/api/improve-dialogue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ screenplay: generatedText, projectId: activeProjectId }),
      })
      if (!res.ok) {
        const parsed = await parseBatchableAiError(res, "Failed to improve dialogue", {
          actionLabel: "Improve dialogue",
          batchEndpoint: "/api/ai/batch-jobs",
          endpoint: "improve-dialogue",
          projectId: activeProjectId,
          payload: { screenplay: generatedText },
        })
        if (parsed.batch) setPendingBatchJob(parsed.batch)
        throw new Error(parsed.message)
      }
      setLastActionRequestId(res.headers.get("X-AI-Request-Id"))
      setFeedbackStatus("idle")
      const improved = await readScreenplaySse(res)
      if (improved.trim()) {
        setGeneratedText(improved)
        clearReferences()
        setHasGeneratedReferences(false)
      }
    } catch (err) {
      setEditorActionError(err instanceof Error ? err.message : "Failed to improve dialogue")
    } finally {
      setIsImproving(false)
    }
  }, [generatedText, isImproving, activeProjectId, setGeneratedText, clearReferences])

  const handleStyleRewrite = useCallback(async () => {
    if (!generatedText || isRewriting || !canStyleRewrite) return
    setIsRewriting(true)
    setEditorActionError(null)
    setPendingBatchJob(null)
    setBatchStatusError(null)
    try {
      const res = await fetch("/api/rewrite-style", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ screenplay: generatedText, styleId: styleRewriteId, projectId: activeProjectId }),
      })
      if (!res.ok) {
        const parsed = await parseBatchableAiError(res, "Failed to rewrite screenplay", {
          actionLabel: "Style rewrite",
          batchEndpoint: "/api/ai/batch-jobs",
          endpoint: "rewrite-style",
          projectId: activeProjectId,
          payload: { screenplay: generatedText, styleId: styleRewriteId },
        })
        if (parsed.batch) setPendingBatchJob(parsed.batch)
        throw new Error(parsed.message)
      }
      setLastActionRequestId(res.headers.get("X-AI-Request-Id"))
      setFeedbackStatus("idle")
      const rewritten = await readScreenplaySse(res)
      if (rewritten.trim()) {
        setGeneratedText(rewritten)
        clearReferences()
        setHasGeneratedReferences(false)
      }
    } catch (err) {
      setEditorActionError(err instanceof Error ? err.message : "Failed to rewrite screenplay")
    } finally {
      setIsRewriting(false)
    }
  }, [generatedText, isRewriting, canStyleRewrite, styleRewriteId, activeProjectId, setGeneratedText, clearReferences])

  const handleGenerateNextScene = useCallback(async () => {
    if (!generatedText || isContinuing) return
    setIsContinuing(true)
    setEditorActionError(null)
    try {
      const config = lastConfigRef.current
      const res = await fetch("/api/generate-next", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          screenplay: generatedText,
          genre: config?.genre,
          characters: config?.characters,
          mood: config?.mood,
          projectId: activeProjectId,
        }),
      })
      if (!res.ok) {
        throw new Error(await parseErrorResponse(res, "Failed to continue screenplay"))
      }
      setLastActionRequestId(res.headers.get("X-AI-Request-Id"))
      setFeedbackStatus("idle")
      const continuation = await readScreenplaySse(res)
      if (continuation.trim()) {
        setGeneratedText(generatedText + "\n\n" + continuation)
        clearReferences()
        setHasGeneratedReferences(false)
      }
    } catch (err) {
      setEditorActionError(err instanceof Error ? err.message : "Failed to continue screenplay")
    } finally {
      setIsContinuing(false)
    }
  }, [generatedText, isContinuing, activeProjectId, setGeneratedText, clearReferences])

  const handleCopyScreenplay = useCallback(async () => {
    if (!generatedText.trim()) return
    try {
      await copyTextToClipboard(generatedText)
      setTransientQuickActionStatus("copied")
    } catch {
      setTransientQuickActionStatus("copy-error")
    }
  }, [generatedText, setTransientQuickActionStatus])

  const handleExportScreenplay = useCallback(() => {
    if (!generatedText.trim()) return

    const printWindow = window.open("", "_blank", "width=850,height=1100")
    if (!printWindow) {
      alert("Please allow popups to export PDF")
      return
    }

    const siteUrl =
      typeof process.env.NEXT_PUBLIC_SITE_URL === "string" && process.env.NEXT_PUBLIC_SITE_URL
        ? process.env.NEXT_PUBLIC_SITE_URL
        : DEFAULT_SITE_URL

    const html = generatePrintHTML(generatedText, title, siteUrl, exportPrintWatermark)
    printWindow.document.open()
    printWindow.document.write(html)
    printWindow.document.close()

    const runPrint = () => {
      try {
        printWindow.focus()
        printWindow.print()
      } catch {
        /* ignore */
      }
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.setTimeout(runPrint, 350)
      })
    })
  }, [generatedText, title, exportPrintWatermark])

  const requestProjectPdfDownload = useCallback(
    async (
      projectIdToExport: string,
      mode: "watermarked" | "clean",
      paymentId?: string
    ): Promise<"downloaded" | "pending"> => {
      const res = await fetch(`/api/projects/${projectIdToExport}/export-pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          mode,
          content: generatedText,
          paymentId,
        }),
      })

      if (res.ok) {
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = filenameFromDisposition(
          res.headers.get("content-disposition"),
          pdfDownloadFilename(title)
        )
        document.body.appendChild(a)
        a.click()
        a.remove()
        URL.revokeObjectURL(url)
        return "downloaded"
      }

      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (res.status === 402) {
        return "pending"
      }

      throw new Error(data.error || "Could not export PDF")
    },
    [generatedText, title]
  )

  const downloadCleanPdfAfterPayment = useCallback(
    async (projectIdToExport: string, paymentId?: string) => {
      if (!paymentId) {
        alert("Payment verified, but the payment id was missing. Try again.")
        return
      }

      setPdfExportError(null)
      setIsCleanPdfExporting(true)
      try {
        for (let attempt = 0; attempt < 15; attempt += 1) {
          const result = await requestProjectPdfDownload(projectIdToExport, "clean", paymentId)
          if (result === "downloaded") {
            return
          }
          await sleep(1500)
        }

        throw new Error("Payment verified. Clean PDF is not ready yet, please try export again.")
      } catch (err) {
        const message = err instanceof Error ? err.message : "Could not download clean PDF"
        setPdfExportError(message)
        alert(message)
      } finally {
        setIsCleanPdfExporting(false)
      }
    },
    [requestProjectPdfDownload]
  )

  const { initiatePdfExportPayment, isLoading: isPdfPaymentLoading } = useRazorpay({
    onSuccess: (result) => {
      if (result.purpose !== "pdf_clean_export") return
      void downloadCleanPdfAfterPayment(result.projectId, result.paymentId)
    },
    onError: (err) => {
      setPdfExportError(err)
      alert(err)
    },
  })

  const handleCleanPdfExport = useCallback(async () => {
    if (!generatedText.trim()) return

    setPdfExportError(null)
    setIsCleanPdfExporting(true)
    try {
      const projectIdToExport = activeProjectId ?? (await ensureSavedProject())
      if (!projectIdToExport) {
        throw new Error("Save this draft before buying a clean PDF export.")
      }

      if (effectivePlan === "free") {
        await initiatePdfExportPayment(projectIdToExport)
        return
      }

      await requestProjectPdfDownload(projectIdToExport, "clean")
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not export clean PDF"
      setPdfExportError(message)
      alert(message)
    } finally {
      setIsCleanPdfExporting(false)
    }
  }, [
    activeProjectId,
    effectivePlan,
    ensureSavedProject,
    generatedText,
    initiatePdfExportPayment,
    requestProjectPdfDownload,
  ])

  const isCleanPdfExportBusy = isCleanPdfExporting || isPdfPaymentLoading

  const handleShareScreenplay = useCallback(async () => {
    if (!generatedText.trim()) return

    const projectUrl = activeProjectId
      ? `${window.location.origin}/editor?project=${activeProjectId}`
      : window.location.href

    try {
      if (navigator.share) {
        await navigator.share(
          activeProjectId
            ? {
                title,
                text: "Open this screenplay draft in Writers Block.",
                url: projectUrl,
              }
            : {
                title,
                text: generatedText,
              }
        )
        setTransientQuickActionStatus("shared")
        return
      }

      if (activeProjectId) {
        await copyTextToClipboard(projectUrl)
        setTransientQuickActionStatus("link-copied")
      } else {
        await copyTextToClipboard(generatedText)
        setTransientQuickActionStatus("copied")
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return
      setTransientQuickActionStatus("share-error")
    }
  }, [activeProjectId, generatedText, setTransientQuickActionStatus, title])

  const handleGenerateShots = async () => {
    if (!generatedText) return
    setShowShots(true)
    await generateShots(generatedText, activeProjectId)
  }

  const handleCloseShots = () => {
    setShowShots(false)
    clearShots()
  }

  const loadReferences = useCallback(
    async (force = false) => {
      if (!generatedText.trim() || isGenerating || isLoadingReferences) return
      if (!force && hasGeneratedReferences) return

      const config = lastConfigRef.current
      await generateReferences({
        screenplay: generatedText,
        genre: config?.genre ?? project?.genre ?? undefined,
        mood: config?.mood ?? project?.mood ?? undefined,
        characters: config?.characters ?? project?.characters ?? undefined,
        location: config?.location ?? project?.location ?? undefined,
        projectId: activeProjectId,
      })
      setHasGeneratedReferences(true)
    },
    [
      generatedText,
      hasGeneratedReferences,
      isGenerating,
      isLoadingReferences,
      generateReferences,
      activeProjectId,
      project?.genre,
      project?.mood,
      project?.characters,
      project?.location,
    ]
  )

  const handleToggleReferences = useCallback(() => {
    const next = !showReferences
    if (next) setShowStoryBible(false)
    if (next) setShowCollaboration(false)
    setShowReferences(next)
    if (next) void loadReferences()
  }, [loadReferences, showReferences])

  const handleToggleStoryBible = useCallback(() => {
    const next = !showStoryBible
    if (next) setShowReferences(false)
    if (next) setShowCollaboration(false)
    setShowStoryBible(next)
  }, [showStoryBible])

  const handleToggleCollaboration = useCallback(() => {
    const next = !showCollaboration
    if (next) {
      setShowReferences(false)
      setShowStoryBible(false)
    }
    setShowCollaboration(next)
  }, [showCollaboration])

  // Handle regenerating references
  const handleRegenerateReferences = useCallback(() => {
    setHasGeneratedReferences(false)
    void loadReferences(true)
  }, [loadReferences])

  const handleEditorContentChange = useCallback(
    (text: string) => {
      setGeneratedText(text)
      setHasGeneratedReferences(false)
      setPendingBatchJob(null)
      setBatchStatusError(null)
      setLastActionRequestId(null)
      setFeedbackStatus("idle")
      clearReferences()
    },
    [setGeneratedText, clearReferences]
  )

  return (
    <main className="min-h-screen bg-[#0a0a0a] relative overflow-hidden">
      {/* Background Effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-cinematic-orange/[0.02] via-transparent to-cinematic-blue/[0.02]" />
        <div
          className="absolute inset-0 opacity-[0.015]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
          }}
        />
      </div>

      {/* Main Editor Area */}
      <div className="h-screen relative z-10 flex flex-col">
        {/* Header */}
        <div className="h-14 border-b border-white/10 bg-[#0a0a0a]/80 backdrop-blur-xl flex items-center px-4 lg:px-6">
          <div className="flex items-center gap-3">
            {/* Mobile Menu Toggle */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowLeftPanel(!showLeftPanel)}
              className="lg:hidden h-9 w-9 p-0 text-white/70 hover:text-white"
            >
              <Menu className="w-5 h-5" />
            </Button>

            <div className="w-9 h-9 rounded-lg bg-cinematic-orange/10 flex items-center justify-center border border-cinematic-orange/20">
              <Clapperboard className="w-4 h-4 text-cinematic-orange" />
            </div>
            <div>
              <h1 className="text-sm font-semibold text-white">
                {project?.title || "Untitled Screenplay"}
              </h1>
              <span className="text-[10px] text-muted-foreground">
                {isLoadingProject ? "Loading..." : project ? "Draft v1.0" : "New Project"}
              </span>
            </div>
          </div>
          
          <div className="flex-1" />
          
          <div className="flex items-center gap-2">
            {/* Story Bible Toggle - Desktop */}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleToggleStoryBible}
              className={cn(
                "hidden lg:flex text-xs gap-2 h-9",
                showStoryBible ? 'text-cinematic-blue bg-cinematic-blue/10' : 'text-muted-foreground hover:text-white'
              )}
            >
              <BookOpen className="w-4 h-4" />
              Story Bible
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={handleToggleCollaboration}
              className={cn(
                "hidden lg:flex text-xs gap-2 h-9",
                showCollaboration ? 'text-cinematic-blue bg-cinematic-blue/10' : 'text-muted-foreground hover:text-white'
              )}
            >
              <MessageSquare className="w-4 h-4" />
              Comments
            </Button>

            {/* References Toggle - Desktop */}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleToggleReferences}
              className={cn(
                "hidden lg:flex text-xs gap-2 h-9",
                showReferences ? 'text-cinematic-orange bg-cinematic-orange/10' : 'text-muted-foreground hover:text-white'
              )}
            >
              <BookOpen className="w-4 h-4" />
              References
            </Button>

            <div className="hidden lg:block w-px h-4 bg-white/10 mx-1" />

            {/* Status Indicator */}
            {isGenerating ? (
              <span className="text-xs text-cinematic-orange flex items-center gap-2 bg-cinematic-orange/10 px-3 py-1.5 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-cinematic-orange animate-pulse" />
                <span className="hidden sm:inline">Writing...</span>
              </span>
            ) : (
              <AutoSaveStatus
                status={saveStatus}
                lastSavedAt={lastSavedAt}
                hasUnsavedChanges={hasUnsavedChanges}
              />
            )}
            {feedbackRequestId && generatedText && !isGenerating && (
              <div className="hidden items-center gap-1 lg:flex">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={feedbackStatus === "saving"}
                  onClick={() => void submitAiFeedback("up")}
                  className="h-8 w-8 p-0 text-white/45 hover:bg-green-500/10 hover:text-green-300"
                  title="Good AI result"
                >
                  <ThumbsUp className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={feedbackStatus === "saving"}
                  onClick={() => void submitAiFeedback("down")}
                  className="h-8 w-8 p-0 text-white/45 hover:bg-red-500/10 hover:text-red-300"
                  title="Poor AI result"
                >
                  <ThumbsDown className="h-4 w-4" />
                </Button>
                {feedbackStatus === "saved" && <span className="text-[10px] text-green-300">Saved</span>}
                {feedbackStatus === "error" && <span className="text-[10px] text-red-300">Failed</span>}
              </div>
            )}
          </div>
        </div>

        {/* Error Banner */}
        <AnimatePresence>
          {visibleError && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="bg-red-500/10 border-b border-red-500/20 px-4 py-2 flex items-center gap-2 text-red-400 text-sm"
            >
              <AlertCircle className="w-4 h-4" />
              {visibleError}
            </motion.div>
          )}
        </AnimatePresence>

        {(pendingBatchJob || visibleBatchJobs.length > 0 || batchStatusError) && (
          <div className="border-b border-cinematic-blue/20 bg-cinematic-blue/10 px-4 py-3 text-sm">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <p className="font-medium text-cinematic-blue">Batch AI job</p>
                <p className="text-xs text-white/55">
                  Long screenplay actions can run in the background and apply back into the editor when complete.
                </p>
                {batchStatusError && <p className="mt-1 text-xs text-red-300">{batchStatusError}</p>}
              </div>
              {pendingBatchJob && (
                <Button
                  type="button"
                  size="sm"
                  className="h-9 shrink-0 bg-white text-black hover:bg-white/90"
                  disabled={isQueueingBatchJob}
                  onClick={handleQueueBatchJob}
                >
                  {isQueueingBatchJob ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Queue {pendingBatchJob.actionLabel}
                </Button>
              )}
            </div>

            {visibleBatchJobs.length > 0 && (
              <div className="mt-3 grid gap-2 lg:grid-cols-3">
                {visibleBatchJobs.map((job) => {
                  const resultText = getBatchResultText(job.result)
                  return (
                    <div key={job.id} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                      <div className="flex items-center justify-between gap-3">
                        <span className="truncate text-xs font-medium text-white/80">
                          {job.endpoint === "rewrite-style" ? "Style rewrite" : "Improve dialogue"}
                        </span>
                        <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-white/60">
                          {job.status}
                        </span>
                      </div>
                      {job.status === "failed" && (
                        <p className="mt-2 text-xs text-red-300">{job.errorMessage ?? "Batch job failed."}</p>
                      )}
                      {job.status === "completed" && resultText && (
                        <Button
                          type="button"
                          size="sm"
                          className="mt-2 h-8 bg-cinematic-blue text-black hover:bg-cinematic-blue/90"
                          onClick={() => handleApplyBatchJobResult(job)}
                        >
                          Apply result
                        </Button>
                      )}
                      {isActiveBatchJob(job) && (
                        <p className="mt-2 flex items-center gap-2 text-xs text-white/45">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Processing in background
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Main Content */}
        <div className="flex-1 flex min-h-0 overflow-hidden">
          {/* Left Panel - Scene Configuration */}
          <AnimatePresence mode="wait">
            {(showLeftPanel || !isMobile) && (
              <motion.div
                initial={isMobile ? { x: -320, opacity: 0 } : { opacity: 1 }}
                animate={{ x: 0, opacity: 1 }}
                exit={isMobile ? { x: -320, opacity: 0 } : { opacity: 0 }}
                transition={{ duration: 0.2 }}
                className={cn(
                  "flex-shrink-0 border-r border-white/10 bg-[#0a0a0a]/50 backdrop-blur flex flex-col z-20",
                  isMobile ? "absolute inset-y-0 left-0 w-[300px]" : "w-[280px] xl:w-[320px]"
                )}
              >
                {/* Panel Header */}
                <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-md bg-cinematic-orange/20 flex items-center justify-center">
                      <span className="text-xs font-bold text-cinematic-orange">01</span>
                    </div>
                    <h2 className="text-sm font-semibold text-white">Scene Config</h2>
                  </div>
                  {isMobile && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowLeftPanel(false)}
                      className="h-8 w-8 p-0 text-white/70"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </Button>
                  )}
                </div>
                
                {/* Form Content */}
                <div className="flex-1 overflow-y-auto p-4">
                  <SceneInputForm
                    onGenerate={handleGenerate}
                    isGenerating={isGenerating}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Mobile Overlay */}
          {isMobile && showLeftPanel && (
            <div 
              className="absolute inset-0 bg-black/50 z-10"
              onClick={() => setShowLeftPanel(false)}
            />
          )}

          {/* Center Panel - Editor */}
          <div className="flex-1 flex flex-col min-w-0 bg-[#0a0a0a]/30">
            {/* Editor Toolbar */}
            <div className="h-12 border-b border-white/10 flex items-center justify-between px-3 lg:px-4">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-cinematic-blue/20 flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-bold text-cinematic-blue">02</span>
                </div>
                <span className="text-sm font-medium text-white hidden sm:inline">Screenplay</span>
              </div>
              
              {generatedText && (
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={isImproving}
                    onClick={handleImproveDialogue}
                    className="h-8 text-xs gap-1.5 text-cinematic-blue hover:text-cinematic-blue hover:bg-cinematic-blue/10 px-2 lg:px-3"
                  >
                    {isImproving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MessageSquare className="w-3.5 h-3.5" />}
                    <span className="hidden md:inline">Improve</span>
                  </Button>
                  {canStyleRewrite ? (
                    <>
                      <label className="sr-only" htmlFor="style-rewrite-preset">
                        Style rewrite preset
                      </label>
                      <select
                        id="style-rewrite-preset"
                        value={styleRewriteId}
                        onChange={(e) => setStyleRewriteId(e.target.value)}
                        className="h-8 max-w-[min(42vw,9rem)] rounded-md border border-white/10 bg-[#141414] text-[10px] sm:text-xs text-white/90 px-1.5"
                      >
                        {STYLE_REWRITE_OPTIONS.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={isRewriting}
                        onClick={handleStyleRewrite}
                        title="Rewrite with a style preset (Pro & Premium)"
                        className="h-8 text-xs gap-1 text-amber-400/90 hover:text-amber-300 hover:bg-amber-500/10 px-1.5 lg:px-2"
                      >
                        {isRewriting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
                        <span className="hidden md:inline">Style</span>
                      </Button>
                    </>
                  ) : (
                    <Link
                      href="/dashboard/subscription"
                      className="hidden sm:inline-flex h-8 items-center rounded-md border border-dashed border-white/15 px-2 text-[10px] text-white/50 hover:text-cinematic-orange hover:border-cinematic-orange/40"
                    >
                      Style: Pro+
                    </Link>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={isContinuing}
                    onClick={handleGenerateNextScene}
                    className="h-8 text-xs gap-1.5 text-white/70 hover:text-white hover:bg-white/10 px-2 lg:px-3"
                  >
                    {isContinuing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowRight className="w-3.5 h-3.5" />}
                    <span className="hidden md:inline">Continue</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleGenerateShots}
                    disabled={isLoadingShots}
                    className="h-8 text-xs gap-1.5 text-cinematic-orange hover:text-cinematic-orange hover:bg-cinematic-orange/10 px-2 lg:px-3"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span className="hidden md:inline">Shots</span>
                  </Button>
                </div>
              )}
            </div>

            {/* Editor Content */}
            <div className="flex-1 p-2 sm:p-4 overflow-hidden">
              <div className="h-full bg-[#0f0f0f] rounded-xl border border-white/10 overflow-hidden">
                <ScreenplayEditor
                  content={generatedText}
                  isGenerating={isGenerating}
                  onClear={handleClearGeneratedText}
                  onContentChange={handleEditorContentChange}
                  title={title}
                  projectId={activeProjectId}
                  exportPrintWatermark={exportPrintWatermark}
                  onWatermarkedPdfExport={handleExportScreenplay}
                  onCleanPdfExport={handleCleanPdfExport}
                  isCleanPdfExporting={isCleanPdfExportBusy}
                />
              </div>
            </div>
          </div>

          {/* Right Panel - Reference Scenes */}
          <AnimatePresence>
            {showStoryBible && (
              <motion.div
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 380 }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ duration: 0.2 }}
                className="hidden lg:flex flex-shrink-0 border-l border-white/10 bg-[#0a0a0a]/50 backdrop-blur flex-col overflow-hidden"
              >
                <StoryBiblePanel
                  projectId={activeProjectId}
                  screenplay={generatedText}
                  onClose={() => setShowStoryBible(false)}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Right Panel - Collaboration */}
          <AnimatePresence>
            {showCollaboration && (
              <motion.div
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 360 }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ duration: 0.2 }}
                className="hidden lg:flex flex-shrink-0 border-l border-white/10 bg-[#0a0a0a]/50 backdrop-blur flex-col overflow-hidden"
              >
                <ProjectCollaborationPanel
                  projectId={activeProjectId}
                  onClose={() => setShowCollaboration(false)}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Right Panel - Reference Scenes */}
          <AnimatePresence>
            {showReferences && (
              <motion.div
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 340 }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ duration: 0.2 }}
                className="hidden lg:flex flex-shrink-0 border-l border-white/10 bg-[#0a0a0a]/50 backdrop-blur flex-col overflow-hidden"
              >
                {/* Panel Header */}
                <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-md bg-cinematic-orange/20 flex items-center justify-center">
                      <span className="text-xs font-bold text-cinematic-orange">03</span>
                    </div>
                    <h2 className="text-sm font-semibold text-white">Movie References</h2>
                  </div>
                  <div className="flex items-center gap-1">
                    {generatedText && !isLoadingReferences && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleRegenerateReferences}
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-white"
                        title="Regenerate references"
                      >
                        <RefreshCw className="w-4 h-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowReferences(false)}
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-white"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                {/* Scenes List */}
                <div className="flex-1 overflow-y-auto p-3 space-y-3">
                  {/* Loading State */}
                  {isLoadingReferences && (
                    <div className="flex flex-col items-center justify-center py-8 space-y-3">
                      <div className="w-10 h-10 rounded-full bg-cinematic-orange/10 flex items-center justify-center">
                        <Loader2 className="w-5 h-5 text-cinematic-orange animate-spin" />
                      </div>
                      <p className="text-xs text-muted-foreground text-center">
                        Analyzing screenplay...<br />
                        Finding matching scenes
                      </p>
                    </div>
                  )}

                  {/* Error State */}
                  {referencesError && !isLoadingReferences && (
                    <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
                      <p className="text-xs text-red-400 text-center">
                        {referencesError}
                      </p>
                    </div>
                  )}

                  {/* Empty State */}
                  {!isLoadingReferences && !referencesError && references.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-8 space-y-3">
                      <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center">
                        <Film className="w-6 h-6 text-muted-foreground" />
                      </div>
                      <p className="text-xs text-muted-foreground text-center max-w-[200px]">
                        Generate a screenplay to see AI-powered movie references based on emotion, situation, and location
                      </p>
                    </div>
                  )}

                  {/* References List */}
                  {!isLoadingReferences && references.map((scene, index) => (
                    <ReferenceSceneCard
                      key={`${scene.movie}-${index}`}
                      movie={scene.movie}
                      scene={scene.scene}
                      youtubeId={scene.youtubeId}
                      thumbnail={scene.thumbnail}
                      description={scene.description}
                      matchReason={scene.matchReason}
                      index={index}
                    />
                  ))}
                </div>

                {/* Footer Info */}
                {references.length > 0 && !isLoadingReferences && (
                  <div className="px-4 py-2 border-t border-white/10 bg-white/[0.02]">
                    <p className="text-[10px] text-muted-foreground text-center">
                      Based on screenplay analysis • {references.length} matches found
                    </p>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer Menu */}
        <footer className="h-12 border-t border-white/10 bg-[#0a0a0a]/90 backdrop-blur flex items-center justify-between px-3 lg:px-6 flex-shrink-0">
          {/* Left: Project Info */}
          <div className="flex items-center gap-3">
            <Link 
              href="/dashboard/projects" 
              className="flex items-center gap-2 text-xs text-muted-foreground hover:text-white transition-colors"
            >
              <FolderOpen className="w-4 h-4" />
              <span className="hidden sm:inline">Projects</span>
            </Link>
            <div className="w-px h-4 bg-white/10 hidden sm:block" />
            <span className="text-xs text-muted-foreground hidden md:inline">
              {editorStats.words} words
            </span>
            <span className="text-xs text-muted-foreground hidden lg:inline">
              · {editorStats.pages} pages
            </span>
          </div>

          {/* Center: Quick Actions */}
          <div className="flex items-center gap-1 sm:gap-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={!generatedText}
              onClick={handleCopyScreenplay}
              title={quickActionStatus === "copy-error" ? "Could not copy screenplay" : "Copy screenplay"}
              className="h-8 px-2 sm:px-3 text-xs text-muted-foreground hover:text-white disabled:opacity-30"
            >
              <Copy className="w-3.5 h-3.5 sm:mr-1.5" />
              <span className="hidden sm:inline">
                {quickActionStatus === "copied" ? "Copied" : quickActionStatus === "copy-error" ? "Copy failed" : "Copy"}
              </span>
            </Button>
            {exportPrintWatermark ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={!generatedText}
                    title="Choose PDF export option"
                    className="h-8 px-2 sm:px-3 text-xs text-muted-foreground hover:text-white disabled:opacity-30"
                  >
                    {isCleanPdfExportBusy ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin sm:mr-1.5" />
                    ) : (
                      <Download className="w-3.5 h-3.5 sm:mr-1.5" />
                    )}
                    <span className="hidden sm:inline">Export</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem
                    onSelect={(event) => {
                      event.preventDefault()
                      handleExportScreenplay()
                    }}
                    className="gap-2 text-xs"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Watermarked PDF - Free
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={isCleanPdfExportBusy}
                    onSelect={(event) => {
                      event.preventDefault()
                      void handleCleanPdfExport()
                    }}
                    className="gap-2 text-xs"
                  >
                    {isCleanPdfExportBusy ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Download className="h-3.5 w-3.5" />
                    )}
                    Clean PDF - ₹99
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                disabled={!generatedText}
                onClick={handleExportScreenplay}
                title="Export screenplay to PDF"
                className="h-8 px-2 sm:px-3 text-xs text-muted-foreground hover:text-white disabled:opacity-30"
              >
                <Download className="w-3.5 h-3.5 sm:mr-1.5" />
                <span className="hidden sm:inline">Export</span>
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              disabled={!generatedText}
              onClick={handleShareScreenplay}
              title={quickActionStatus === "share-error" ? "Could not share screenplay" : "Share screenplay"}
              className="h-8 px-2 sm:px-3 text-xs text-muted-foreground hover:text-white disabled:opacity-30"
            >
              <Share2 className="w-3.5 h-3.5 sm:mr-1.5" />
              <span className="hidden sm:inline">
                {quickActionStatus === "shared"
                  ? "Shared"
                  : quickActionStatus === "link-copied"
                  ? "Link copied"
                  : quickActionStatus === "share-error"
                  ? "Share failed"
                  : "Share"}
              </span>
            </Button>
          </div>

          {/* Right: Status & Settings */}
          <div className="flex items-center gap-2">
            {isGenerating && (
              <span className="text-xs text-cinematic-orange flex items-center gap-1.5">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span className="hidden sm:inline">Generating...</span>
              </span>
            )}
            {!isGenerating && (
              <AutoSaveStatusCompact
                status={saveStatus}
                lastSavedAt={lastSavedAt}
                hasUnsavedChanges={hasUnsavedChanges}
              />
            )}
            <div className="w-px h-4 bg-white/10 mx-1 hidden sm:block" />
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-muted-foreground hover:text-white"
            >
              <Link href="/dashboard/settings" aria-label="Editor settings">
                <Settings className="w-4 h-4" />
              </Link>
            </Button>
          </div>
        </footer>
      </div>

      {/* Shot Suggestions Modal */}
      {showShots && (
        <ShotSuggestions
          shots={shots}
          isLoading={isLoadingShots}
          error={shotsError}
          onClose={handleCloseShots}
          sceneTitle="Generated Scene"
        />
      )}

      {/* Auto-save Restore Prompt */}
      <AnimatePresence>
        {showRestorePrompt && autoSavedData && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50"
          >
            <div className="bg-[#0f0f0f] border border-cinematic-orange/30 rounded-xl px-5 py-4 shadow-2xl backdrop-blur-xl">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-cinematic-orange/10 flex items-center justify-center">
                  <Save className="w-5 h-5 text-cinematic-orange" />
                </div>
                <div>
                  <h4 className="text-sm font-medium text-white">Unsaved changes found</h4>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Auto-saved from {new Date(autoSavedData.timestamp).toLocaleTimeString()}
                  </p>
                </div>
                <div className="flex items-center gap-2 ml-4">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (projectId) {
                        clearAutoSavedContent(projectId)
                      }
                      setShowRestorePrompt(false)
                    }}
                    className="text-muted-foreground hover:text-white"
                  >
                    Discard
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      setGeneratedText(autoSavedData.content)
                      clearReferences()
                      setHasGeneratedReferences(false)
                      if (projectId) {
                        clearAutoSavedContent(projectId)
                      }
                      setShowRestorePrompt(false)
                    }}
                    className="bg-cinematic-orange text-black hover:bg-cinematic-orange/90"
                  >
                    Restore
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  )
}

export default EditorPageWrapper

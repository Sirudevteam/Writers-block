"use client"

import { useEffect, useMemo, useState } from "react"
import { AlertTriangle, BookOpen, Loader2, Pin, PinOff, Plus, RefreshCw, Save, Trash2, X } from "lucide-react"
import { Button } from "@/ui/components/button"
import { Input } from "@/ui/components/input"
import { Textarea } from "@/ui/components/textarea"
import type { ProjectMemoryStatus, ProjectStoryBibleEntry } from "@/infrastructure/db/types/database"
import { detectContinuityWarnings } from "@/modules/story-bible/domain/continuity"
import type { StoryBibleKind } from "@/modules/story-bible/domain/types"
import { cn } from "@/shared/utils/cn"

const TABS: Array<{ kind: StoryBibleKind; label: string }> = [
  { kind: "character", label: "Characters" },
  { kind: "scene", label: "Scenes" },
  { kind: "arc", label: "Arcs" },
  { kind: "continuity_note", label: "Continuity" },
  { kind: "style_rule", label: "Style" },
]

type StoryBibleResponse = {
  entries: ProjectStoryBibleEntry[]
  memoryStatus: ProjectMemoryStatus | null
}

function memoryStatusLabel(status: ProjectMemoryStatus | null): string {
  if (!status) return "Not indexed"
  if (status.status === "ready") return "Memory ready"
  if (status.status === "processing") return "Indexing"
  if (status.status === "failed") return "Index failed"
  return "Index pending"
}

export function StoryBiblePanel({
  projectId,
  screenplay,
  onClose,
}: {
  projectId: string | null
  screenplay: string
  onClose: () => void
}) {
  const [entries, setEntries] = useState<ProjectStoryBibleEntry[]>([])
  const [memoryStatus, setMemoryStatus] = useState<ProjectMemoryStatus | null>(null)
  const [activeKind, setActiveKind] = useState<StoryBibleKind>("character")
  const [title, setTitle] = useState("")
  const [content, setContent] = useState("")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const activeEntries = useMemo(
    () => entries.filter((entry) => entry.kind === activeKind),
    [entries, activeKind]
  )
  const warnings = useMemo(
    () => detectContinuityWarnings({ screenplay, entries }),
    [screenplay, entries]
  )

  async function refresh() {
    if (!projectId) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/story-bible`, { cache: "no-store" })
      const json = (await res.json().catch(() => ({}))) as Partial<StoryBibleResponse> & { error?: string }
      if (!res.ok) {
        setError(json.error ?? "Could not load Story Bible.")
        return
      }
      setEntries(Array.isArray(json.entries) ? json.entries : [])
      setMemoryStatus(json.memoryStatus ?? null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  function resetForm(nextKind = activeKind) {
    setEditingId(null)
    setActiveKind(nextKind)
    setTitle("")
    setContent("")
  }

  function beginEdit(entry: ProjectStoryBibleEntry) {
    setEditingId(entry.id)
    setActiveKind(entry.kind)
    setTitle(entry.title)
    setContent(entry.content)
  }

  async function saveEntry() {
    if (!projectId || saving) return
    const trimmedTitle = title.trim()
    const trimmedContent = content.trim()
    if (!trimmedTitle || !trimmedContent) {
      setError("Add a title and details before saving.")
      return
    }

    setSaving(true)
    setError(null)
    try {
      const res = await fetch(
        editingId
          ? `/api/projects/${projectId}/story-bible/${editingId}`
          : `/api/projects/${projectId}/story-bible`,
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            kind: activeKind,
            title: trimmedTitle,
            content: trimmedContent,
          }),
        }
      )
      const json = (await res.json().catch(() => ({}))) as { entry?: ProjectStoryBibleEntry; error?: string }
      if (!res.ok || !json.entry) {
        setError(json.error ?? "Could not save Story Bible entry.")
        return
      }
      setEntries((current) => {
        const without = current.filter((entry) => entry.id !== json.entry!.id)
        return [json.entry!, ...without].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updated_at.localeCompare(a.updated_at))
      })
      resetForm(activeKind)
      void refresh()
    } finally {
      setSaving(false)
    }
  }

  async function togglePinned(entry: ProjectStoryBibleEntry) {
    if (!projectId) return
    const res = await fetch(`/api/projects/${projectId}/story-bible/${entry.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ pinned: !entry.pinned }),
    })
    const json = (await res.json().catch(() => ({}))) as { entry?: ProjectStoryBibleEntry }
    if (res.ok && json.entry) {
      setEntries((current) => current.map((item) => (item.id === entry.id ? json.entry! : item)))
      void refresh()
    }
  }

  async function removeEntry(entry: ProjectStoryBibleEntry) {
    if (!projectId) return
    const res = await fetch(`/api/projects/${projectId}/story-bible/${entry.id}`, {
      method: "DELETE",
      credentials: "same-origin",
    })
    if (res.ok) {
      setEntries((current) => current.filter((item) => item.id !== entry.id))
      if (editingId === entry.id) resetForm()
      void refresh()
    }
  }

  return (
    <div className="flex h-full w-full flex-col bg-[#0a0a0a]/50">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-cinematic-blue/20">
            <BookOpen className="h-3.5 w-3.5 text-cinematic-blue" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white">Story Bible</h2>
            <p className="text-[10px] text-white/40">{memoryStatusLabel(memoryStatus)}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void refresh()}
            className="h-8 w-8 p-0 text-muted-foreground hover:text-white"
            title="Refresh Story Bible"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-8 w-8 p-0 text-muted-foreground hover:text-white"
            title="Close Story Bible"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {!projectId ? (
        <div className="p-4 text-sm text-white/55">Save this screenplay as a project before adding Story Bible entries.</div>
      ) : (
        <>
          <div className="border-b border-white/10 p-3">
            <div className="grid grid-cols-2 gap-1">
              {TABS.map((tab) => (
                <button
                  key={tab.kind}
                  type="button"
                  onClick={() => resetForm(tab.kind)}
                  className={cn(
                    "min-h-9 rounded-md px-2 text-xs font-medium transition",
                    activeKind === tab.kind
                      ? "bg-cinematic-orange text-black"
                      : "bg-white/5 text-white/65 hover:bg-white/10 hover:text-white"
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {warnings.length > 0 && (
            <div className="border-b border-amber-500/15 bg-amber-500/5 p-3">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-amber-300">
                <AlertTriangle className="h-3.5 w-3.5" />
                Continuity
              </div>
              <div className="space-y-1.5">
                {warnings.slice(0, 3).map((warning) => (
                  <p key={`${warning.code}-${warning.anchor ?? warning.message}`} className="text-[11px] leading-5 text-amber-100/75">
                    {warning.message}
                  </p>
                ))}
              </div>
            </div>
          )}

          <div className="border-b border-white/10 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold text-white/70">{editingId ? "Edit entry" : "New entry"}</span>
              {editingId && (
                <button type="button" className="text-[11px] text-white/45 hover:text-white" onClick={() => resetForm()}>
                  Cancel
                </button>
              )}
            </div>
            <div className="space-y-2">
              <Input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Title"
                maxLength={160}
                className="h-9 rounded-lg border-white/10 bg-white/5 text-sm text-white placeholder:text-white/30"
              />
              <Textarea
                value={content}
                onChange={(event) => setContent(event.target.value)}
                placeholder="Facts, rules, or continuity notes"
                maxLength={8000}
                className="min-h-[92px] resize-none rounded-lg border-white/10 bg-white/5 text-sm text-white placeholder:text-white/30"
              />
              {error && <p className="text-xs text-red-300">{error}</p>}
              <Button
                type="button"
                onClick={() => void saveEntry()}
                disabled={saving}
                className="h-9 w-full rounded-lg bg-cinematic-orange text-black hover:bg-cinematic-orange/90"
              >
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : editingId ? <Save className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />}
                {editingId ? "Save Entry" : "Add Entry"}
              </Button>
            </div>
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto p-3">
            {loading && activeEntries.length === 0 ? (
              <div className="py-8 text-center text-xs text-white/45">Loading Story Bible...</div>
            ) : activeEntries.length === 0 ? (
              <div className="rounded-lg border border-dashed border-white/10 p-4 text-center text-xs text-white/45">
                No {TABS.find((tab) => tab.kind === activeKind)?.label.toLowerCase()} yet.
              </div>
            ) : (
              activeEntries.map((entry) => (
                <div key={entry.id} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                  <div className="flex items-start justify-between gap-2">
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() => beginEdit(entry)}
                    >
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold text-white">{entry.title}</span>
                        {entry.pinned && <span className="rounded bg-cinematic-orange/15 px-1.5 py-0.5 text-[10px] text-cinematic-orange">Pinned</span>}
                      </div>
                      <p className="mt-1 line-clamp-3 text-xs leading-5 text-white/55">{entry.content}</p>
                    </button>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-white/45 hover:text-white"
                        onClick={() => void togglePinned(entry)}
                        title={entry.pinned ? "Unpin" : "Pin"}
                      >
                        {entry.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-white/45 hover:text-red-300"
                        onClick={() => void removeEntry(entry)}
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  )
}

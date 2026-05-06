"use client"

import { useCallback, useEffect, useState } from "react"
import { CheckCircle2, Clock, Loader2, MessageSquare, X } from "lucide-react"
import { Button } from "@/ui/components/button"
import { Textarea } from "@/ui/components/textarea"
import { parseErrorResponse } from "@/core/http/client"

type ProjectComment = {
  id: string
  body: string
  status: "open" | "resolved"
  created_at: string
  author?: { email?: string | null; full_name?: string | null } | null
}

type ProjectActivity = {
  id: string
  event_type: string
  target_type?: string | null
  created_at: string
  actor?: { email?: string | null; full_name?: string | null } | null
}

function authorName(author?: { email?: string | null; full_name?: string | null } | null): string {
  return author?.full_name || author?.email || "User"
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value))
}

export function ProjectCollaborationPanel({
  projectId,
  onClose,
}: {
  projectId: string | null
  onClose: () => void
}) {
  const [tab, setTab] = useState<"comments" | "activity">("comments")
  const [comments, setComments] = useState<ProjectComment[]>([])
  const [activity, setActivity] = useState<ProjectActivity[]>([])
  const [body, setBody] = useState("")
  const [loading, setLoading] = useState(false)
  const [posting, setPosting] = useState(false)
  const [busyCommentId, setBusyCommentId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    if (!projectId) return
    setLoading(true)
    setError(null)
    try {
      const [commentsRes, activityRes] = await Promise.all([
        fetch(`/api/projects/${projectId}/comments`, { cache: "no-store", credentials: "same-origin" }),
        fetch(`/api/projects/${projectId}/activity`, { cache: "no-store", credentials: "same-origin" }),
      ])
      if (!commentsRes.ok) throw new Error(await parseErrorResponse(commentsRes, "Failed to load comments"))
      if (!activityRes.ok) throw new Error(await parseErrorResponse(activityRes, "Failed to load activity"))
      const commentsData = (await commentsRes.json()) as { comments?: ProjectComment[] }
      const activityData = (await activityRes.json()) as { activity?: ProjectActivity[] }
      setComments(Array.isArray(commentsData.comments) ? commentsData.comments : [])
      setActivity(Array.isArray(activityData.activity) ? activityData.activity : [])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load collaboration data")
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const createComment = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!projectId || !body.trim()) return
    setPosting(true)
    setError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ body: body.trim() }),
      })
      if (!res.ok) throw new Error(await parseErrorResponse(res, "Failed to create comment"))
      const data = (await res.json()) as { comment?: ProjectComment }
      if (data.comment) setComments((current) => [...current, data.comment as ProjectComment])
      setBody("")
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create comment")
    } finally {
      setPosting(false)
    }
  }

  const setCommentStatus = async (comment: ProjectComment, status: "open" | "resolved") => {
    if (!projectId) return
    setBusyCommentId(comment.id)
    setError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/comments/${comment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ status }),
      })
      if (!res.ok) throw new Error(await parseErrorResponse(res, "Failed to update comment"))
      const data = (await res.json()) as { comment?: ProjectComment }
      if (data.comment) {
        setComments((current) => current.map((item) => (item.id === comment.id ? (data.comment as ProjectComment) : item)))
      }
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update comment")
    } finally {
      setBusyCommentId(null)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-cinematic-blue/20">
            <MessageSquare className="h-3.5 w-3.5 text-cinematic-blue" />
          </div>
          <h2 className="text-sm font-semibold text-white">Collaboration</h2>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} className="h-8 w-8 p-0 text-muted-foreground hover:text-white">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="border-b border-white/10 p-2">
        <div className="grid grid-cols-2 rounded-lg border border-white/10 bg-white/5 p-1">
          {(["comments", "activity"] as const).map((item) => (
            <button
              key={item}
              type="button"
              className={`rounded-md px-3 py-1.5 text-xs font-medium ${tab === item ? "bg-white text-black" : "text-white/60 hover:text-white"}`}
              onClick={() => setTab(item)}
            >
              {item === "comments" ? "Comments" : "Activity"}
            </button>
          ))}
        </div>
      </div>

      {!projectId ? (
        <div className="p-4 text-sm text-muted-foreground">Save this project before using comments and activity.</div>
      ) : (
        <>
          {error ? <div className="mx-3 mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</div> : null}
          {loading ? (
            <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading...
            </div>
          ) : tab === "comments" ? (
            <>
              <div className="flex-1 space-y-3 overflow-y-auto p-3">
                {comments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No comments yet.</p>
                ) : (
                  comments.map((comment) => (
                    <div key={comment.id} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span className="truncate text-xs font-medium text-white/75">{authorName(comment.author)}</span>
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] ${comment.status === "resolved" ? "bg-green-500/10 text-green-300" : "bg-cinematic-blue/10 text-cinematic-blue"}`}>
                          {comment.status === "resolved" ? <CheckCircle2 className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                          {comment.status}
                        </span>
                      </div>
                      <p className="whitespace-pre-wrap text-xs leading-5 text-white/65">{comment.body}</p>
                      <div className="mt-3 flex items-center justify-between gap-2">
                        <span className="text-[10px] text-white/35">{formatDate(comment.created_at)}</span>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={busyCommentId === comment.id}
                          className="h-7 border-white/10 bg-white/5 px-2 text-[10px] text-white/70"
                          onClick={() => void setCommentStatus(comment, comment.status === "resolved" ? "open" : "resolved")}
                        >
                          {comment.status === "resolved" ? "Reopen" : "Resolve"}
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <form onSubmit={createComment} className="border-t border-white/10 p-3">
                <Textarea
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  placeholder="Add a comment..."
                  maxLength={4000}
                  className="min-h-[88px] resize-none border-white/10 bg-white/5 text-sm text-white"
                />
                <Button
                  type="submit"
                  disabled={posting || !body.trim()}
                  className="mt-2 h-9 w-full bg-cinematic-blue text-black hover:bg-cinematic-blue/90"
                >
                  {posting ? "Posting..." : "Post comment"}
                </Button>
              </form>
            </>
          ) : (
            <div className="flex-1 space-y-2 overflow-y-auto p-3">
              {activity.length === 0 ? (
                <p className="text-sm text-muted-foreground">No activity yet.</p>
              ) : (
                activity.map((event) => (
                  <div key={event.id} className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
                    <p className="text-xs font-medium text-white/75">{event.event_type}</p>
                    <p className="mt-1 text-[10px] text-white/35">
                      {authorName(event.actor)} - {formatDate(event.created_at)}
                    </p>
                  </div>
                ))
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

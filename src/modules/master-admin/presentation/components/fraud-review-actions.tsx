"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import type { SignupRiskEvent } from "@/infrastructure/db/types/database"

const REVIEW_OPTIONS: Array<{ value: SignupRiskEvent["review_status"]; label: string }> = [
  { value: "open", label: "Open" },
  { value: "reviewed_safe", label: "Safe" },
  { value: "confirmed_abuse", label: "Abuse" },
  { value: "not_required", label: "No review" },
]

export function FraudReviewActions({
  eventId,
  initialStatus,
  initialNote,
}: {
  eventId: string
  initialStatus: SignupRiskEvent["review_status"]
  initialNote: string | null
}) {
  const router = useRouter()
  const [status, setStatus] = useState<SignupRiskEvent["review_status"]>(initialStatus)
  const [note, setNote] = useState(initialNote ?? "")
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function save() {
    setError(null)
    startTransition(() => {
      void (async () => {
        const res = await fetch(`/api/master-admin/fraud/${eventId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reviewStatus: status, reviewNote: note }),
        })
        if (!res.ok) {
          const body = await res.json().catch(() => null)
          setError(body?.error ?? "Could not save")
          return
        }
        router.refresh()
      })()
    })
  }

  return (
    <div className="flex min-w-[220px] flex-col gap-2">
      <select
        value={status}
        onChange={(e) => setStatus(e.target.value as SignupRiskEvent["review_status"])}
        className="h-9 rounded-lg border border-white/10 bg-black/30 px-2 text-xs text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cinematic-orange/50"
        disabled={isPending}
      >
        {REVIEW_OPTIONS.map((option) => (
          <option key={option.value} value={option.value} className="bg-[#111] text-white">
            {option.label}
          </option>
        ))}
      </select>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={1000}
        placeholder="Review note"
        className="h-9 rounded-lg border border-white/10 bg-black/30 px-2 text-xs text-white placeholder:text-white/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cinematic-orange/50"
        disabled={isPending}
      />
      <button
        type="button"
        onClick={save}
        disabled={isPending}
        className="rounded-lg border border-cinematic-orange/40 bg-cinematic-orange/10 px-3 py-1.5 text-xs font-medium text-cinematic-orange hover:border-cinematic-orange/70 disabled:opacity-50"
      >
        {isPending ? "Saving..." : "Save review"}
      </button>
      {error ? <span className="text-xs text-red-300">{error}</span> : null}
    </div>
  )
}

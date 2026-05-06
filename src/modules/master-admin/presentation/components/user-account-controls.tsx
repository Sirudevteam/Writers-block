"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import type { UserAccountControl } from "@/infrastructure/db/types/database"

const STATUS_OPTIONS: Array<{ value: UserAccountControl["status"]; label: string }> = [
  { value: "active", label: "Active" },
  { value: "review_required", label: "Review required" },
  { value: "suspended", label: "Suspended" },
]

export function UserAccountControls({
  userId,
  initialStatus,
  initialReason,
  initialNote,
}: {
  userId: string
  initialStatus: UserAccountControl["status"]
  initialReason: string | null
  initialNote: string | null
}) {
  const router = useRouter()
  const [status, setStatus] = useState<UserAccountControl["status"]>(initialStatus)
  const [reason, setReason] = useState(initialReason ?? "")
  const [note, setNote] = useState(initialNote ?? "")
  const [revokeSessions, setRevokeSessions] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function save(nextRevokeSessions = revokeSessions) {
    setError(null)
    startTransition(() => {
      void (async () => {
        const res = await fetch(`/api/master-admin/users/${userId}/account-control`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status,
            reason,
            note,
            revokeSessions: nextRevokeSessions,
          }),
        })
        if (!res.ok) {
          const body = await res.json().catch(() => null)
          setError(body?.error ?? "Could not update account")
          return
        }
        router.refresh()
      })()
    })
  }

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="text-xs uppercase tracking-wide text-white/40">Account status</span>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as UserAccountControl["status"])}
          className="mt-2 h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cinematic-orange/50"
          disabled={isPending}
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value} className="bg-[#111] text-white">
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="text-xs uppercase tracking-wide text-white/40">Reason</span>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={200}
          className="mt-2 h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-white placeholder:text-white/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cinematic-orange/50"
          placeholder="Policy, fraud review, billing dispute"
          disabled={isPending}
        />
      </label>
      <label className="block">
        <span className="text-xs uppercase tracking-wide text-white/40">Operator note</span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={2000}
          rows={3}
          className="mt-2 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cinematic-orange/50"
          placeholder="Internal context for this status"
          disabled={isPending}
        />
      </label>
      <label className="flex items-center gap-2 text-sm text-white/65">
        <input
          type="checkbox"
          checked={revokeSessions}
          onChange={(e) => setRevokeSessions(e.target.checked)}
          className="h-4 w-4 rounded border-white/20 bg-black/30"
          disabled={isPending}
        />
        Revoke existing sessions
      </label>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => save()}
          disabled={isPending}
          className="rounded-lg border border-cinematic-orange/40 bg-cinematic-orange/10 px-3 py-2 text-sm font-medium text-cinematic-orange hover:border-cinematic-orange/70 disabled:opacity-50"
        >
          {isPending ? "Saving..." : "Save status"}
        </button>
        <button
          type="button"
          onClick={() => save(true)}
          disabled={isPending}
          className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm font-medium text-white/75 hover:border-white/25 disabled:opacity-50"
        >
          Revoke sessions now
        </button>
      </div>
      {error ? <span className="block text-xs text-red-300">{error}</span> : null}
    </div>
  )
}

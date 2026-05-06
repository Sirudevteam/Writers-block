"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"

export function UserNoteForm({ userId }: { userId: string }) {
  const router = useRouter()
  const [note, setNote] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function save() {
    setError(null)
    startTransition(() => {
      void (async () => {
        const res = await fetch(`/api/master-admin/users/${userId}/notes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ note }),
        })
        if (!res.ok) {
          const body = await res.json().catch(() => null)
          setError(body?.error ?? "Could not add note")
          return
        }
        setNote("")
        router.refresh()
      })()
    })
  }

  return (
    <div className="space-y-2">
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={2000}
        rows={3}
        placeholder="Add internal note"
        className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cinematic-orange/50"
        disabled={isPending}
      />
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={isPending || note.trim().length === 0}
          className="rounded-lg border border-cinematic-orange/40 bg-cinematic-orange/10 px-3 py-2 text-sm font-medium text-cinematic-orange hover:border-cinematic-orange/70 disabled:opacity-50"
        >
          {isPending ? "Adding..." : "Add note"}
        </button>
        {error ? <span className="text-xs text-red-300">{error}</span> : null}
      </div>
    </div>
  )
}

"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/ui/components/button"
import { parseErrorResponse } from "@/core/http/client"

export function OrgInviteAcceptPanel({ token }: { token: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const acceptInvite = async () => {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const res = await fetch("/api/org/invites/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ token }),
      })
      if (!res.ok) throw new Error(await parseErrorResponse(res, "Failed to accept invite"))
      const data = (await res.json()) as { orgId?: string }
      if (data.orgId) {
        await fetch("/api/org/active", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ orgId: data.orgId }),
        }).catch(() => {})
      }
      setMessage("Invitation accepted.")
      router.replace("/dashboard/org")
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to accept invite")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-xl border border-cinematic-orange/25 bg-cinematic-orange/10 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-semibold text-cinematic-orange">Organization invite</div>
          <p className="mt-1 text-xs text-white/55">Accept this invite using the currently signed-in account.</p>
          {error ? <p className="mt-2 text-xs text-red-300">{error}</p> : null}
          {message ? <p className="mt-2 text-xs text-green-300">{message}</p> : null}
        </div>
        <Button
          type="button"
          disabled={busy}
          className="h-10 shrink-0 bg-cinematic-orange text-black hover:bg-cinematic-orange/90"
          onClick={() => void acceptInvite()}
        >
          {busy ? "Accepting..." : "Accept invite"}
        </Button>
      </div>
    </div>
  )
}

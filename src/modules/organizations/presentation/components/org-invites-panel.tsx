"use client"

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/ui/components/button"
import { Input } from "@/ui/components/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/ui/components/select"
import { parseErrorResponse } from "@/core/http/client"

type InviteRole = "admin" | "member" | "billing"

type OrgInvite = {
  id: string
  email: string
  role: InviteRole
  created_at: string
  expires_at: string
  accepted_at?: string | null
  revoked_at?: string | null
  resend_count?: number | null
  last_sent_at?: string | null
}

function inviteStatus(invite: OrgInvite): string {
  if (invite.accepted_at) return "accepted"
  if (invite.revoked_at) return "revoked"
  if (new Date(invite.expires_at).getTime() < Date.now()) return "expired"
  return "active"
}

export function OrgInvitesPanel({ canInvite }: { canInvite: boolean }) {
  const [invites, setInvites] = useState<OrgInvite[]>([])
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<InviteRole>("member")
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [devAcceptUrl, setDevAcceptUrl] = useState<string | null>(null)

  const loadInvites = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/org/invites", { cache: "no-store", credentials: "same-origin" })
      if (!res.ok) throw new Error(await parseErrorResponse(res, "Failed to load invitations"))
      const data = (await res.json()) as { invites?: OrgInvite[] }
      setInvites(Array.isArray(data.invites) ? data.invites : [])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load invitations")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadInvites()
  }, [loadInvites])

  const createInvite = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canInvite || !email.trim()) return
    setCreating(true)
    setError(null)
    setMessage(null)
    setDevAcceptUrl(null)
    try {
      const res = await fetch("/api/org/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ email: email.trim(), role }),
      })
      if (!res.ok) throw new Error(await parseErrorResponse(res, "Failed to create invitation"))
      const data = (await res.json()) as { invite?: OrgInvite; acceptUrl?: string }
      if (data.invite) setInvites((current) => [data.invite as OrgInvite, ...current])
      if (data.acceptUrl) setDevAcceptUrl(data.acceptUrl)
      setEmail("")
      setRole("member")
      setMessage("Invitation created.")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create invitation")
    } finally {
      setCreating(false)
    }
  }

  const patchInvite = async (inviteId: string, action: "resend" | "revoke") => {
    if (!canInvite) return
    setBusyId(inviteId)
    setError(null)
    setMessage(null)
    setDevAcceptUrl(null)
    try {
      const res = await fetch(`/api/org/invites/${inviteId}`, {
        method: action === "resend" ? "PATCH" : "DELETE",
        headers: action === "resend" ? { "Content-Type": "application/json" } : undefined,
        credentials: "same-origin",
        body: action === "resend" ? JSON.stringify({ action: "resend" }) : undefined,
      })
      if (!res.ok) {
        throw new Error(await parseErrorResponse(res, action === "resend" ? "Failed to resend invite" : "Failed to revoke invite"))
      }
      const data = (await res.json()) as { invite?: Partial<OrgInvite>; acceptUrl?: string }
      if (data.acceptUrl) setDevAcceptUrl(data.acceptUrl)
      setMessage(action === "resend" ? "Invitation resent." : "Invitation revoked.")
      await loadInvites()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invitation update failed")
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="rounded-xl border border-white/10 bg-[#111]">
      <div className="border-b border-white/10 px-4 py-3">
        <div className="text-sm font-semibold text-white/85">Invitations</div>
        <p className="mt-1 text-xs text-white/45">Invite users and manage pending organization invitations.</p>
      </div>

      <div className="space-y-4 p-4">
        {error ? <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</div> : null}
        {message ? <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-300">{message}</div> : null}
        {devAcceptUrl ? (
          <div className="rounded-lg border border-cinematic-orange/25 bg-cinematic-orange/10 px-3 py-2 text-xs text-cinematic-orange">
            Dev invite URL: <span className="font-mono break-all">{devAcceptUrl}</span>
          </div>
        ) : null}

        {canInvite ? (
          <form onSubmit={createInvite} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem_auto]">
            <Input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="teammate@example.com"
              className="h-10 border-white/10 bg-white/5 text-white"
              required
            />
            <Select value={role} onValueChange={(value) => setRole(value as InviteRole)}>
              <SelectTrigger className="h-10 border-white/10 bg-white/5 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="border-white/10 bg-[#0c0c0b] text-white">
                <SelectItem value="member">member</SelectItem>
                <SelectItem value="admin">admin</SelectItem>
                <SelectItem value="billing">billing</SelectItem>
              </SelectContent>
            </Select>
            <Button type="submit" disabled={creating} className="h-10 bg-cinematic-orange text-black hover:bg-cinematic-orange/90">
              {creating ? "Inviting..." : "Invite"}
            </Button>
          </form>
        ) : null}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-white/45">
                <th className="px-3 py-2 font-medium">Email</th>
                <th className="px-3 py-2 font-medium">Role</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Expires</th>
                <th className="px-3 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-white/45">Loading invitations...</td>
                </tr>
              ) : invites.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-white/45">No invitations.</td>
                </tr>
              ) : (
                invites.map((invite) => {
                  const status = inviteStatus(invite)
                  const active = status === "active"
                  return (
                    <tr key={invite.id} className="hover:bg-white/5">
                      <td className="px-3 py-3 font-mono text-xs text-white/85">{invite.email}</td>
                      <td className="px-3 py-3 text-white/65">{invite.role}</td>
                      <td className="px-3 py-3 text-white/65">{status}</td>
                      <td className="px-3 py-3 text-white/50">{new Date(invite.expires_at).toLocaleString("en-IN")}</td>
                      <td className="px-3 py-3">
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={!canInvite || !active || busyId === invite.id}
                            className="h-8 border-white/10 bg-white/5 text-white/80"
                            onClick={() => void patchInvite(invite.id, "resend")}
                          >
                            Resend
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={!canInvite || !active || busyId === invite.id}
                            className="h-8 border-red-500/25 bg-red-500/10 text-red-100"
                            onClick={() => void patchInvite(invite.id, "revoke")}
                          >
                            Revoke
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

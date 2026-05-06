"use client"

import { useMemo, useState } from "react"
import { Button } from "@/ui/components/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/ui/components/select"

type MemberRow = {
  user_id: string
  role: "owner" | "admin" | "member" | "billing"
  created_at: string
  profile?: { email?: string | null; full_name?: string | null } | null
}

const ROLES: MemberRow["role"][] = ["owner", "admin", "member", "billing"]

export function OrgMembersTable({
  orgId,
  currentUserId,
  canManage,
  initialMembers,
}: {
  orgId: string
  currentUserId: string
  canManage: boolean
  initialMembers: MemberRow[]
}) {
  const [members, setMembers] = useState<MemberRow[]>(initialMembers)
  const [busyUserId, setBusyUserId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const sorted = useMemo(() => {
    return [...members].sort((a, b) => a.created_at.localeCompare(b.created_at))
  }, [members])

  async function refresh() {
    const res = await fetch("/api/org/members", { credentials: "same-origin" })
    const json = (await res.json()) as { ok?: boolean; members?: MemberRow[]; error?: string }
    if (res.ok && json.ok && Array.isArray(json.members)) {
      setMembers(json.members)
    }
  }

  async function setRole(userId: string, role: MemberRow["role"]) {
    if (!canManage) return
    setBusyUserId(userId)
    setError(null)
    try {
      const res = await fetch("/api/org/members", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ userId, role }),
      })
      const json = (await res.json()) as { ok?: boolean; error?: string }
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Failed to update role.")
        return
      }
      await refresh()
    } finally {
      setBusyUserId(null)
    }
  }

  async function removeMember(userId: string) {
    if (!canManage) return
    setBusyUserId(userId)
    setError(null)
    try {
      const res = await fetch(`/api/org/members?userId=${encodeURIComponent(userId)}`, {
        method: "DELETE",
        credentials: "same-origin",
      })
      const json = (await res.json()) as { ok?: boolean; error?: string }
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Failed to remove member.")
        return
      }
      await refresh()
    } finally {
      setBusyUserId(null)
    }
  }

  return (
    <div className="rounded-xl border border-white/10 bg-[#111]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div>
          <div className="text-sm font-semibold text-white/85">Members</div>
          <div className="mt-0.5 font-mono text-[11px] text-white/35">{orgId}</div>
        </div>
        <Button
          type="button"
          variant="outline"
          className="h-9 rounded-lg border-white/10 bg-white/5 text-white/80"
          onClick={() => void refresh()}
        >
          Refresh
        </Button>
      </div>
      {error ? <div className="px-4 py-3 text-sm text-red-300">{error}</div> : null}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 text-white/45">
              <th className="px-4 py-3 font-medium">User</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">Joined</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-white/45">
                  No members.
                </td>
              </tr>
            ) : (
              sorted.map((m) => {
                const isSelf = m.user_id === currentUserId
                const busy = busyUserId === m.user_id
                const display = m.profile?.email ?? `${m.user_id.slice(0, 8)}…`
                return (
                  <tr key={m.user_id} className="hover:bg-white/5">
                    <td className="px-4 py-3">
                      <div className="font-mono text-xs text-white/85">{display}</div>
                      <div className="mt-1 font-mono text-[11px] text-white/35">{m.user_id}</div>
                    </td>
                    <td className="px-4 py-3">
                      <Select
                        disabled={!canManage || busy || (isSelf && m.role === "owner")}
                        value={m.role}
                        onValueChange={(v) => void setRole(m.user_id, v as MemberRow["role"])}
                      >
                        <SelectTrigger className="h-10 w-44 rounded-xl border-white/10 bg-white/5 text-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="border-white/10 bg-[#0c0c0b] text-white">
                          {ROLES.map((r) => (
                            <SelectItem key={r} value={r}>
                              {r}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-4 py-3 text-white/50">{new Date(m.created_at).toLocaleString("en-IN")}</td>
                    <td className="px-4 py-3">
                      <Button
                        type="button"
                        variant="outline"
                        disabled={!canManage || busy || isSelf}
                        className="h-9 rounded-lg border-white/10 bg-white/5 text-white/80 hover:border-red-500/30 hover:text-red-200"
                        onClick={() => void removeMember(m.user_id)}
                      >
                        Remove
                      </Button>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

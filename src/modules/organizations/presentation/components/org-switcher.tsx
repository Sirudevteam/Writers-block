"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import type { OrgMembership } from "@/modules/iam/application/org-context"
import { Button } from "@/ui/components/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/ui/components/select"

export function OrgSwitcher({
  memberships,
  activeOrgId,
}: {
  memberships: OrgMembership[]
  activeOrgId: string
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  const active = useMemo(
    () => memberships.find((m) => m.org_id === activeOrgId) ?? memberships[0],
    [memberships, activeOrgId]
  )

  async function setActive(orgId: string) {
    setLoading(true)
    try {
      const res = await fetch("/api/org/active", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ orgId }),
      })
      if (res.ok) {
        router.refresh()
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="w-[min(360px,100%)]">
        <Select disabled={loading} value={active?.org_id} onValueChange={setActive}>
          <SelectTrigger className="h-11 rounded-xl border-white/10 bg-white/5 text-white">
            <SelectValue placeholder="Select organization" />
          </SelectTrigger>
          <SelectContent className="border-white/10 bg-[#0c0c0b] text-white">
            {memberships.map((m) => (
              <SelectItem key={m.org_id} value={m.org_id}>
                {m.org.name} ({m.role})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button
        type="button"
        variant="outline"
        disabled
        className="h-11 rounded-xl border-white/10 bg-white/5 text-white/70"
      >
        Active org stored in cookie
      </Button>
    </div>
  )
}

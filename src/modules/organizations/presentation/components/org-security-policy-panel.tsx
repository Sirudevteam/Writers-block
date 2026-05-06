"use client"

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/ui/components/button"
import { Input } from "@/ui/components/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/ui/components/select"
import { parseErrorResponse } from "@/core/http/client"

type SsoJoinPolicy = "invite_or_domain" | "invite_only"

type SecurityPolicy = {
  allowed_domains: string[]
  verified_domains: string[]
  require_mfa: boolean
  require_sso: boolean
  disable_password_login: boolean
  session_duration_minutes: number
  sso_provider_id: string | null
  sso_domains: string[]
  sso_join_policy: SsoJoinPolicy
  scim_enabled: boolean
  scim_token_last_rotated_at: string | null
}

const DEFAULT_POLICY: SecurityPolicy = {
  allowed_domains: [],
  verified_domains: [],
  require_mfa: false,
  require_sso: false,
  disable_password_login: false,
  session_duration_minutes: 43200,
  sso_provider_id: null,
  sso_domains: [],
  sso_join_policy: "invite_or_domain",
  scim_enabled: false,
  scim_token_last_rotated_at: null,
}

function parseDomainList(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/[,\n]/)
        .map((part) => part.trim().toLowerCase())
        .filter(Boolean)
    )
  )
}

export function OrgSecurityPolicyPanel({
  canRead,
  canManage,
}: {
  canRead: boolean
  canManage: boolean
}) {
  const [loading, setLoading] = useState(canRead)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [policy, setPolicy] = useState<SecurityPolicy>(DEFAULT_POLICY)
  const [allowedDomains, setAllowedDomains] = useState("")
  const [verifiedDomains, setVerifiedDomains] = useState("")
  const [ssoDomains, setSsoDomains] = useState("")
  const [scimToken, setScimToken] = useState<string | null>(null)

  const loadPolicy = useCallback(async () => {
    if (!canRead) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/org/security-policy", { cache: "no-store", credentials: "same-origin" })
      if (!res.ok) throw new Error(await parseErrorResponse(res, "Failed to load security policy"))
      const data = (await res.json()) as { policy?: SecurityPolicy }
      const next = { ...DEFAULT_POLICY, ...(data.policy ?? {}) }
      setPolicy(next)
      setAllowedDomains(next.allowed_domains.join(", "))
      setVerifiedDomains(next.verified_domains.join(", "))
      setSsoDomains(next.sso_domains.join(", "))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load security policy")
    } finally {
      setLoading(false)
    }
  }, [canRead])

  useEffect(() => {
    void loadPolicy()
  }, [loadPolicy])

  const patchPolicy = async (rotateScimToken = false) => {
    if (!canManage) return
    setSaving(true)
    setError(null)
    setMessage(null)
    setScimToken(null)
    try {
      const res = await fetch("/api/org/security-policy", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          allowedDomains: parseDomainList(allowedDomains),
          verifiedDomains: parseDomainList(verifiedDomains),
          requireMfa: policy.require_mfa,
          requireSso: policy.require_sso,
          disablePasswordLogin: policy.disable_password_login,
          sessionDurationMinutes: policy.session_duration_minutes,
          ssoProviderId: policy.sso_provider_id || null,
          ssoDomains: parseDomainList(ssoDomains),
          ssoJoinPolicy: policy.sso_join_policy,
          scimEnabled: policy.scim_enabled,
          rotateScimToken,
        }),
      })
      if (!res.ok) throw new Error(await parseErrorResponse(res, "Failed to update security policy"))
      const data = (await res.json()) as { policy?: SecurityPolicy; scimToken?: string }
      if (data.policy) {
        setPolicy({ ...DEFAULT_POLICY, ...data.policy })
      }
      if (data.scimToken) setScimToken(data.scimToken)
      setMessage(rotateScimToken ? "Security policy saved and SCIM token rotated." : "Security policy saved.")
      await loadPolicy()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update security policy")
    } finally {
      setSaving(false)
    }
  }

  if (!canRead) {
    return (
      <div className="rounded-xl border border-white/10 bg-[#111] p-4 text-sm text-white/45">
        You do not have permission to view organization security policy.
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-white/10 bg-[#111]">
      <div className="border-b border-white/10 px-4 py-3">
        <div className="text-sm font-semibold text-white/85">Security policy</div>
        <p className="mt-1 text-xs text-white/45">MFA, SSO, domain, session, and SCIM controls.</p>
      </div>

      <div className="space-y-4 p-4">
        {loading ? <div className="text-sm text-white/45">Loading security policy...</div> : null}
        {error ? <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</div> : null}
        {message ? <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-300">{message}</div> : null}
        {scimToken ? (
          <div className="rounded-lg border border-cinematic-orange/25 bg-cinematic-orange/10 px-3 py-2 text-xs text-cinematic-orange">
            SCIM token, shown once: <span className="font-mono break-all">{scimToken}</span>
          </div>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-2">
          <label className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-3 text-sm text-white/80">
            Require MFA
            <input
              type="checkbox"
              checked={policy.require_mfa}
              disabled={!canManage}
              onChange={(event) => setPolicy((current) => ({ ...current, require_mfa: event.target.checked }))}
            />
          </label>
          <label className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-3 text-sm text-white/80">
            Require SSO
            <input
              type="checkbox"
              checked={policy.require_sso}
              disabled={!canManage}
              onChange={(event) => setPolicy((current) => ({ ...current, require_sso: event.target.checked }))}
            />
          </label>
          <label className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-3 text-sm text-white/80">
            Disable password login
            <input
              type="checkbox"
              checked={policy.disable_password_login}
              disabled={!canManage}
              onChange={(event) => setPolicy((current) => ({ ...current, disable_password_login: event.target.checked }))}
            />
          </label>
          <label className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-3 text-sm text-white/80">
            SCIM enabled
            <input
              type="checkbox"
              checked={policy.scim_enabled}
              disabled={!canManage}
              onChange={(event) => setPolicy((current) => ({ ...current, scim_enabled: event.target.checked }))}
            />
          </label>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-2">
            <label className="text-xs font-medium text-white/65">Session duration minutes</label>
            <Input
              type="number"
              min={15}
              max={43200}
              value={policy.session_duration_minutes}
              disabled={!canManage}
              onChange={(event) =>
                setPolicy((current) => ({ ...current, session_duration_minutes: Number(event.target.value) || 15 }))
              }
              className="h-10 border-white/10 bg-white/5 text-white"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-white/65">SSO join policy</label>
            <Select
              disabled={!canManage}
              value={policy.sso_join_policy}
              onValueChange={(value) => setPolicy((current) => ({ ...current, sso_join_policy: value as SsoJoinPolicy }))}
            >
              <SelectTrigger className="h-10 border-white/10 bg-white/5 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="border-white/10 bg-[#0c0c0b] text-white">
                <SelectItem value="invite_or_domain">invite_or_domain</SelectItem>
                <SelectItem value="invite_only">invite_only</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-2">
            <label className="text-xs font-medium text-white/65">Allowed domains</label>
            <Input
              value={allowedDomains}
              disabled={!canManage}
              onChange={(event) => setAllowedDomains(event.target.value)}
              placeholder="example.com, studio.in"
              className="h-10 border-white/10 bg-white/5 text-white"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-white/65">Verified domains</label>
            <Input
              value={verifiedDomains}
              disabled={!canManage}
              onChange={(event) => setVerifiedDomains(event.target.value)}
              placeholder="example.com"
              className="h-10 border-white/10 bg-white/5 text-white"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-white/65">SSO provider id</label>
            <Input
              value={policy.sso_provider_id ?? ""}
              disabled={!canManage}
              onChange={(event) => setPolicy((current) => ({ ...current, sso_provider_id: event.target.value }))}
              placeholder="Supabase SSO provider id"
              className="h-10 border-white/10 bg-white/5 text-white"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-white/65">SSO domains</label>
            <Input
              value={ssoDomains}
              disabled={!canManage}
              onChange={(event) => setSsoDomains(event.target.value)}
              placeholder="example.com"
              className="h-10 border-white/10 bg-white/5 text-white"
            />
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            disabled={!canManage || saving}
            className="h-10 bg-cinematic-orange text-black hover:bg-cinematic-orange/90"
            onClick={() => void patchPolicy(false)}
          >
            {saving ? "Saving..." : "Save policy"}
          </Button>
          <Button
            type="button"
            disabled={!canManage || saving}
            variant="outline"
            className="h-10 border-white/10 bg-white/5 text-white/80"
            onClick={() => void patchPolicy(true)}
          >
            Rotate SCIM token
          </Button>
        </div>
      </div>
    </div>
  )
}

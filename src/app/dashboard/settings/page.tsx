"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { motion } from "framer-motion"
import { ArrowLeft, User, Mail, Bell, Shield, Palette, Loader2, Download, LogOut, Trash2 } from "lucide-react"
import Link from "next/link"
import { Button } from "@/ui/components/button"
import { Input } from "@/ui/components/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/ui/components/card"
import { dispatchProfileUpdated } from "@/modules/account/presentation/profile-events"
import type { Profile } from "@/infrastructure/db/types/database"
import { createClient } from "@/infrastructure/db/supabase/client"
import { parseJwtAal } from "@/modules/auth/domain/jwt-aal"

async function parseError(res: Response): Promise<string> {
  try {
    const j = await res.json()
    if (typeof j?.error === "string") return j.error
  } catch {
    /* ignore */
  }
  return res.statusText || "Request failed"
}

export default function SettingsPage() {
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const [activeTab, setActiveTab] = useState("profile")
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveOk, setSaveOk] = useState(false)
  const [accountBusy, setAccountBusy] = useState<"export" | "sessions" | "delete" | null>(null)
  const [accountError, setAccountError] = useState<string | null>(null)
  const [accountOk, setAccountOk] = useState<string | null>(null)

  const [fullName, setFullName] = useState("")
  const [bio, setBio] = useState("")
  const [avatarUrl, setAvatarUrl] = useState("")
  const [email, setEmail] = useState("")

  // MFA (TOTP) state
  const [mfaLoading, setMfaLoading] = useState(false)
  const [mfaError, setMfaError] = useState<string | null>(null)
  const [aal, setAal] = useState<"aal1" | "aal2" | null>(null)
  const [totpFactors, setTotpFactors] = useState<Array<{ id: string; status?: string }>>([])
  const [enroll, setEnroll] = useState<{ factorId: string; qr: string; secret: string } | null>(null)
  const [challengeId, setChallengeId] = useState<string | null>(null)
  const [verifyCode, setVerifyCode] = useState("")

  const loadProfile = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const res = await fetch("/api/user/profile", {
        credentials: "same-origin",
        cache: "no-store",
      })
      if (!res.ok) {
        setLoadError(await parseError(res))
        return
      }
      const data = (await res.json()) as Profile
      setFullName(data.full_name ?? "")
      setBio(data.bio ?? "")
      setAvatarUrl(data.avatar_url ?? "")
      setEmail(data.email ?? "")
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load profile")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadProfile()
  }, [loadProfile])

  const loadMfa = useCallback(async () => {
    setMfaLoading(true)
    setMfaError(null)
    try {
      const supabase = createClient()
      const {
        data: { session },
      } = await supabase.auth.getSession()
      setAal(parseJwtAal(session?.access_token) ?? null)

      const { data, error } = await supabase.auth.mfa.listFactors()
      if (error) {
        setMfaError(error.message)
        return
      }
      const totp = (data?.totp ?? []).map((f) => ({ id: f.id, status: (f as any).status }))
      setTotpFactors(totp)
    } catch (e) {
      setMfaError(e instanceof Error ? e.message : "Failed to load MFA state")
    } finally {
      setMfaLoading(false)
    }
  }, [])

  useEffect(() => {
    if (activeTab === "security") {
      void loadMfa()
    }
  }, [activeTab, loadMfa])

  const startTotpEnrollment = async () => {
    setMfaLoading(true)
    setMfaError(null)
    setEnroll(null)
    setChallengeId(null)
    setVerifyCode("")
    try {
      const supabase = createClient()
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp" })
      if (error || !data?.id || !(data as any).totp?.qr_code || !(data as any).totp?.secret) {
        setMfaError(error?.message ?? "Failed to enroll MFA")
        return
      }
      setEnroll({ factorId: data.id, qr: (data as any).totp.qr_code, secret: (data as any).totp.secret })
      const ch = await supabase.auth.mfa.challenge({ factorId: data.id })
      if (ch.error || !ch.data?.id) {
        setMfaError(ch.error?.message ?? "Failed to start MFA challenge")
        return
      }
      setChallengeId(ch.data.id)
    } finally {
      setMfaLoading(false)
    }
  }

  const verifyTotp = async () => {
    if (!enroll?.factorId || !challengeId) return
    setMfaLoading(true)
    setMfaError(null)
    try {
      const supabase = createClient()
      const res = await supabase.auth.mfa.verify({
        factorId: enroll.factorId,
        challengeId,
        code: verifyCode.trim(),
      })
      if (res.error) {
        setMfaError(res.error.message)
        return
      }
      setEnroll(null)
      setChallengeId(null)
      setVerifyCode("")
      await loadMfa()
    } finally {
      setMfaLoading(false)
    }
  }

  const unenrollTotp = async (factorId: string) => {
    setMfaLoading(true)
    setMfaError(null)
    try {
      const supabase = createClient()
      const res = await supabase.auth.mfa.unenroll({ factorId })
      if (res.error) {
        setMfaError(res.error.message)
        return
      }
      await loadMfa()
    } finally {
      setMfaLoading(false)
    }
  }

  const handleSaveProfile = async () => {
    setSaveError(null)
    setSaveOk(false)
    setIsSaving(true)
    try {
      const res = await fetch("/api/user/profile", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: fullName.trim() || null,
          bio: bio.trim() || null,
          avatar_url: avatarUrl.trim() || null,
        }),
      })
      if (!res.ok) {
        setSaveError(await parseError(res))
        return
      }
      const data = (await res.json()) as Profile
      setFullName(data.full_name ?? "")
      setBio(data.bio ?? "")
      setAvatarUrl(data.avatar_url ?? "")
      setEmail(data.email ?? "")
      setSaveOk(true)
      dispatchProfileUpdated()
      setTimeout(() => setSaveOk(false), 4000)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Save failed")
    } finally {
      setIsSaving(false)
    }
  }

  const handleAccountExport = async () => {
    setAccountBusy("export")
    setAccountError(null)
    setAccountOk(null)
    try {
      const res = await fetch("/api/account/export", {
        method: "POST",
        credentials: "same-origin",
      })
      if (!res.ok) {
        setAccountError(await parseError(res))
        return
      }
      const data = await res.json()
      const payload = data?.export?.payload ?? data
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `writers-block-account-export-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      setAccountOk("Account export prepared.")
    } catch (e) {
      setAccountError(e instanceof Error ? e.message : "Failed to export account data")
    } finally {
      setAccountBusy(null)
    }
  }

  const handleRevokeSessions = async () => {
    if (!confirm("Sign out other sessions and require sign-in again?")) return
    setAccountBusy("sessions")
    setAccountError(null)
    setAccountOk(null)
    try {
      const res = await fetch("/api/account/sessions/revoke-all", {
        method: "POST",
        credentials: "same-origin",
      })
      if (!res.ok) {
        setAccountError(await parseError(res))
        return
      }
      window.location.href = "/signin"
    } catch (e) {
      setAccountError(e instanceof Error ? e.message : "Failed to revoke sessions")
    } finally {
      setAccountBusy(null)
    }
  }

  const handleAccountDeletion = async () => {
    const reason = window.prompt("Optional reason for deleting this account") ?? ""
    if (!confirm("Request account deletion? This can block if you are the only owner of an organization.")) return
    setAccountBusy("delete")
    setAccountError(null)
    setAccountOk(null)
    try {
      const res = await fetch("/api/account", {
        method: "DELETE",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      })
      if (!res.ok) {
        setAccountError(await parseError(res))
        return
      }
      setAccountOk("Account deletion request submitted.")
    } catch (e) {
      setAccountError(e instanceof Error ? e.message : "Failed to request account deletion")
    } finally {
      setAccountBusy(null)
    }
  }

  const tabs = [
    { id: "profile", label: "Profile", icon: User },
    { id: "notifications", label: "Notifications", icon: Bell },
    { id: "security", label: "Security", icon: Shield },
    { id: "account", label: "Account", icon: Trash2 },
    { id: "appearance", label: "Appearance", icon: Palette },
  ] as const

  return (
    <main className="ml-0 flex min-h-[100dvh] min-h-screen w-full min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 shrink-0 border-b border-white/10 bg-[#0a0a0a]/80 backdrop-blur-xl">
          <div className="flex items-center gap-4 py-4 pl-14 pr-4 sm:pr-6 lg:pl-6 lg:pr-8">
            <Button asChild variant="ghost" size="icon" className="text-muted-foreground hover:text-white">
              <Link href="/dashboard" aria-label="Back to dashboard">
                <ArrowLeft className="h-5 w-5" />
              </Link>
            </Button>
            <div className="min-w-0 flex-1">
              <h1 className="font-display text-xl font-bold text-white sm:text-2xl">Settings</h1>
              <p className="text-xs text-muted-foreground sm:text-sm">Manage your account preferences</p>
            </div>
          </div>
        </header>

        {/* Full-width shell: fixed-width settings nav + fluid panel (matches dashboard/projects) */}
        <div className="w-full min-w-0 flex-1 px-4 py-6 pb-10 sm:px-6 lg:px-8 lg:py-8">
          <div className="mx-auto grid w-full min-w-0 max-w-[1600px] grid-cols-1 gap-6 sm:gap-8 lg:grid-cols-[minmax(13rem,16.5rem)_minmax(0,1fr)] lg:items-start xl:gap-10">
            {/* Tab navigation */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="min-w-0 w-full lg:max-w-none"
            >
              <Card className="border-white/10 bg-[#0f0f0f]/80 backdrop-blur-sm">
                <CardContent className="p-2 sm:p-3 lg:p-2">
                  <nav
                    aria-label="Settings sections"
                    className="flex flex-row gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0 [scrollbar-width:thin]"
                  >
                    {tabs.map((tab) => {
                      const Icon = tab.icon
                      const isActive = activeTab === tab.id
                      return (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setActiveTab(tab.id)}
                          className={`flex w-full min-w-[9rem] shrink-0 items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-medium transition-colors lg:min-w-0 ${
                            isActive
                              ? "bg-cinematic-orange/20 text-cinematic-orange ring-1 ring-cinematic-orange/25"
                              : "text-muted-foreground hover:bg-white/5 hover:text-white"
                          }`}
                        >
                          <Icon className="h-5 w-5 shrink-0" aria-hidden />
                          <span>{tab.label}</span>
                        </button>
                      )
                    })}
                  </nav>
                </CardContent>
              </Card>
            </motion.div>

            {/* Main settings panel */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="min-w-0 w-full"
            >
              {activeTab === "profile" && (
                <Card className="border-white/10 bg-[#0f0f0f]/80 backdrop-blur-sm">
                  <CardHeader className="space-y-2 px-5 pb-4 pt-6 sm:px-8 sm:pb-5 sm:pt-8">
                    <CardTitle className="text-lg font-semibold text-white sm:text-xl">Profile information</CardTitle>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      Name, bio, and avatar are stored in your profile. Email is managed by your sign-in provider.
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-8 px-5 pb-8 pt-0 sm:px-8 sm:pb-10">
                    {loadError && (
                      <div
                        className="flex flex-col gap-3 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200 sm:flex-row sm:items-center sm:justify-between"
                        role="alert"
                      >
                        <span className="min-w-0">{loadError}</span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="shrink-0 border-red-500/40"
                          onClick={() => void loadProfile()}
                        >
                          Retry
                        </Button>
                      </div>
                    )}
                    {saveError && (
                      <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200" role="alert">
                        {saveError}
                      </div>
                    )}
                    {saveOk && (
                      <div className="rounded-lg border border-green-500/40 bg-green-500/10 px-4 py-3 text-sm text-green-200">
                        Profile saved.
                      </div>
                    )}

                    {loading ? (
                      <div className="flex items-center gap-2 py-8 text-muted-foreground">
                        <Loader2 className="h-5 w-5 animate-spin" />
                        Loading profile…
                      </div>
                    ) : (
                      <>
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
                          <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-cinematic-orange/15">
                            {avatarUrl.trim() ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={avatarUrl.trim()} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <User className="h-12 w-12 text-cinematic-orange" />
                            )}
                          </div>
                          <div className="min-w-0 space-y-1">
                            <p className="text-sm font-medium text-white">Profile photo</p>
                            <p className="text-xs text-muted-foreground">Paste an image URL below, or use the button to jump to the field.</p>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="mt-2 border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"
                              onClick={() => avatarInputRef.current?.focus()}
                            >
                              Change avatar URL
                            </Button>
                          </div>
                        </div>

                        <div className="grid min-w-0 grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-x-8 sm:gap-y-7">
                          <div className="min-w-0 space-y-2 sm:col-span-2">
                            <label htmlFor="settings-full-name" className="text-sm font-medium text-white">
                              Full name
                            </label>
                            <Input
                              id="settings-full-name"
                              value={fullName}
                              onChange={(e) => setFullName(e.target.value)}
                              className="h-11 w-full min-w-0 bg-white/5 border-white/10 text-base sm:text-sm"
                              autoComplete="name"
                            />
                          </div>

                          <div className="min-w-0 space-y-2 sm:col-span-2">
                            <label htmlFor="settings-email" className="text-sm font-medium text-white">
                              Email
                            </label>
                            <div className="flex min-w-0 w-full items-center gap-3 rounded-md border border-white/10 bg-white/5 px-3">
                              <Mail className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
                              <Input
                                id="settings-email"
                                type="email"
                                value={email}
                                readOnly
                                className="h-11 min-w-0 flex-1 cursor-not-allowed border-0 bg-transparent px-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 opacity-90"
                              />
                            </div>
                            <p className="text-xs text-muted-foreground">
                              To change email, use your sign-in provider account settings.
                            </p>
                          </div>

                          <div className="min-w-0 space-y-2 sm:col-span-2">
                            <label htmlFor="settings-avatar" className="text-sm font-medium text-white">
                              Avatar image URL
                            </label>
                            <Input
                              ref={avatarInputRef}
                              id="settings-avatar"
                              value={avatarUrl}
                              onChange={(e) => setAvatarUrl(e.target.value)}
                              placeholder="https://…"
                              className="h-11 w-full min-w-0 bg-white/5 border-white/10 text-base sm:text-sm"
                            />
                          </div>

                          <div className="min-w-0 space-y-2 sm:col-span-2">
                            <label htmlFor="settings-bio" className="text-sm font-medium text-white">
                              Bio
                            </label>
                            <textarea
                              id="settings-bio"
                              rows={5}
                              value={bio}
                              onChange={(e) => setBio(e.target.value)}
                              className="min-h-[8rem] w-full min-w-0 rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-muted-foreground resize-y"
                              placeholder="Tell us about yourself…"
                            />
                          </div>
                        </div>

                        <div className="flex justify-end border-t border-white/10 pt-8">
                          <Button
                            type="button"
                            onClick={() => void handleSaveProfile()}
                            disabled={isSaving || !!loadError}
                            className="h-11 min-h-[44px] min-w-[8rem] bg-cinematic-orange text-black hover:bg-cinematic-orange/90"
                          >
                            {isSaving ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Saving…
                              </>
                            ) : (
                              "Save changes"
                            )}
                          </Button>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              )}

              {activeTab === "notifications" && (
                <Card className="border-white/10 bg-[#0f0f0f]/80 backdrop-blur-sm">
                  <CardHeader className="px-5 pt-6 sm:px-8 sm:pt-8">
                    <CardTitle className="text-lg font-semibold text-white sm:text-xl">Notification preferences</CardTitle>
                    <p className="text-sm text-amber-200/80">
                      Not stored yet — these toggles are previews until notification settings ship.
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-4 px-5 pb-8 sm:px-8 sm:pb-10">
                    {[
                      { label: "Email notifications", desc: "Project and account updates" },
                      { label: "Marketing", desc: "News and offers" },
                    ].map((item) => (
                      <div
                        key={item.label}
                        className="flex items-center justify-between gap-4 border-b border-white/5 py-3 last:border-0 opacity-60"
                      >
                        <div className="min-w-0">
                          <p className="font-medium text-white">{item.label}</p>
                          <p className="text-sm text-muted-foreground">{item.desc}</p>
                        </div>
                        <input type="checkbox" className="h-4 w-4 shrink-0 rounded" disabled defaultChecked aria-disabled />
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {activeTab === "security" && (
                <Card className="border-white/10 bg-[#0f0f0f]/80 backdrop-blur-sm">
                  <CardHeader className="px-5 pt-6 sm:px-8 sm:pt-8">
                    <CardTitle className="text-lg font-semibold text-white sm:text-xl">Security</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      Enable multi-factor authentication (TOTP) to protect your account. Master Admin and organization-admin actions can require AAL2.
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-5 px-5 pb-8 text-sm sm:px-8 sm:pb-10">
                    {mfaError ? (
                      <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200" role="alert">
                        {mfaError}
                      </div>
                    ) : null}

                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="font-medium text-white">Session assurance level</div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {aal ? (
                              <span className="font-mono text-white/70">{aal}</span>
                            ) : (
                              <span className="text-white/40">Unknown</span>
                            )}
                            <span className="text-white/25"> · </span>
                            <span className="text-white/40">
                              AAL2 means MFA was completed at sign-in.
                            </span>
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          className="h-10 rounded-xl border-white/10 bg-white/5 text-white/80"
                          onClick={() => void loadMfa()}
                          disabled={mfaLoading}
                        >
                          {mfaLoading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : "Refresh"}
                        </Button>
                      </div>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="font-medium text-white">Authenticator app (TOTP)</div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {totpFactors.length > 0
                              ? `${totpFactors.length} factor(s) enrolled`
                              : "Not enabled"}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          {totpFactors.length === 0 ? (
                            <Button
                              type="button"
                              className="h-10 rounded-xl bg-cinematic-orange font-semibold text-black hover:bg-cinematic-orange/90"
                              onClick={() => void startTotpEnrollment()}
                              disabled={mfaLoading}
                            >
                              Enable TOTP
                            </Button>
                          ) : null}
                        </div>
                      </div>

                      {totpFactors.length > 0 ? (
                        <div className="mt-4 space-y-2">
                          {totpFactors.map((f) => (
                            <div key={f.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">
                              <div className="font-mono text-[11px] text-white/60">{f.id}</div>
                              <Button
                                type="button"
                                variant="outline"
                                className="h-9 rounded-lg border-white/10 bg-white/5 text-white/80 hover:border-red-500/30 hover:text-red-200"
                                onClick={() => void unenrollTotp(f.id)}
                                disabled={mfaLoading}
                              >
                                Remove
                              </Button>
                            </div>
                          ))}
                        </div>
                      ) : null}

                      {enroll ? (
                        <div className="mt-6 grid gap-4 rounded-xl border border-white/10 bg-[#0c0c0b] p-4 md:grid-cols-2">
                          <div>
                            <div className="text-sm font-medium text-white">Step 1: Scan QR</div>
                            <div className="mt-2 overflow-hidden rounded-lg border border-white/10 bg-white p-3">
                              {/* Supabase returns an SVG string */}
                              <div dangerouslySetInnerHTML={{ __html: enroll.qr }} />
                            </div>
                            <div className="mt-3 text-xs text-muted-foreground">
                              Secret (store in your authenticator):{" "}
                              <span className="font-mono text-white/70">{enroll.secret}</span>
                            </div>
                          </div>
                          <div>
                            <div className="text-sm font-medium text-white">Step 2: Verify code</div>
                            <div className="mt-2 flex gap-2">
                              <Input
                                value={verifyCode}
                                onChange={(e) => setVerifyCode(e.target.value)}
                                placeholder="6-digit code"
                                inputMode="numeric"
                                className="h-11 rounded-xl border-white/10 bg-white/5 text-white placeholder:text-white/35"
                              />
                              <Button
                                type="button"
                                className="h-11 rounded-xl bg-cinematic-orange font-semibold text-black hover:bg-cinematic-orange/90"
                                onClick={() => void verifyTotp()}
                                disabled={mfaLoading || verifyCode.trim().length < 6}
                              >
                                Verify
                              </Button>
                            </div>
                            <p className="mt-3 text-xs text-muted-foreground">
                              After verification, sign out and sign in again to get an AAL2 session.
                            </p>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>
              )}

              {activeTab === "account" && (
                <Card className="border-white/10 bg-[#0f0f0f]/80 backdrop-blur-sm">
                  <CardHeader className="px-5 pt-6 sm:px-8 sm:pt-8">
                    <CardTitle className="text-lg font-semibold text-white sm:text-xl">Account controls</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      Export your account data, revoke active sessions, or submit an account deletion request.
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-5 px-5 pb-8 text-sm sm:px-8 sm:pb-10">
                    {accountError ? (
                      <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200" role="alert">
                        {accountError}
                      </div>
                    ) : null}
                    {accountOk ? (
                      <div className="rounded-lg border border-green-500/40 bg-green-500/10 px-4 py-3 text-sm text-green-200">
                        {accountOk}
                      </div>
                    ) : null}

                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <div className="font-medium text-white">Export account data</div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Includes profile, organizations, projects, subscription, and invoice rows available to your account.
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          className="h-10 shrink-0 rounded-xl border-white/10 bg-white/5 text-white/80"
                          onClick={() => void handleAccountExport()}
                          disabled={accountBusy !== null}
                        >
                          {accountBusy === "export" ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Download className="mr-2 h-4 w-4" />
                          )}
                          Export
                        </Button>
                      </div>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <div className="font-medium text-white">Revoke all sessions</div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Signs out your active sessions through the backend session revocation control.
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          className="h-10 shrink-0 rounded-xl border-white/10 bg-white/5 text-white/80"
                          onClick={() => void handleRevokeSessions()}
                          disabled={accountBusy !== null}
                        >
                          {accountBusy === "sessions" ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <LogOut className="mr-2 h-4 w-4" />
                          )}
                          Revoke
                        </Button>
                      </div>
                    </div>

                    <div className="rounded-xl border border-red-500/25 bg-red-500/[0.06] p-4">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <div className="font-medium text-red-100">Request account deletion</div>
                          <p className="mt-1 text-xs text-red-100/65">
                            Organization ownership is checked before the request can proceed.
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          className="h-10 shrink-0 rounded-xl border-red-500/30 bg-red-500/10 text-red-100 hover:bg-red-500/15"
                          onClick={() => void handleAccountDeletion()}
                          disabled={accountBusy !== null}
                        >
                          {accountBusy === "delete" ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="mr-2 h-4 w-4" />
                          )}
                          Request deletion
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {activeTab === "appearance" && (
                <Card className="border-white/10 bg-[#0f0f0f]/80 backdrop-blur-sm">
                  <CardHeader className="px-5 pt-6 sm:px-8 sm:pt-8">
                    <CardTitle className="text-lg font-semibold text-white sm:text-xl">Appearance</CardTitle>
                    <p className="text-sm text-amber-200/80">Theme and language are not saved yet.</p>
                  </CardHeader>
                  <CardContent className="pointer-events-none space-y-4 px-5 pb-8 opacity-60 sm:px-8 sm:pb-10">
                    <p className="text-sm text-muted-foreground">Dark mode is the default across the app today.</p>
                  </CardContent>
                </Card>
              )}
            </motion.div>
          </div>
        </div>
    </main>
  )
}

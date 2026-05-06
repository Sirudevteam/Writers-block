"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ArrowRight, Mail, RefreshCw, ShieldCheck } from "lucide-react"
import { Button } from "@/ui/components/button"
import { Input } from "@/ui/components/input"
import { AuthFormError } from "@/modules/auth/presentation/components/auth-form-error"
import { getSafeNextPath } from "@/modules/auth/domain/next-path"
import { maskEmail } from "@/modules/auth/domain/mask-email"
import { validateEmail } from "@/modules/auth/domain/validation"

interface CodeVerificationFormProps {
  initialEmail: string
  mode?: "signup" | "signin" | "master-admin"
  nextPath: string
}

async function parseJson<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T
  } catch {
    return null
  }
}

export function CodeVerificationForm({ initialEmail, mode = "signup", nextPath }: CodeVerificationFormProps) {
  const router = useRouter()
  const [email, setEmail] = useState(initialEmail)
  const [token, setToken] = useState("")
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const safeNext = getSafeNextPath(nextPath)
  const normalizedEmail = useMemo(() => validateEmail(email), [email])
  const masked = normalizedEmail ? maskEmail(normalizedEmail) : null

  async function handleVerify(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setInfo(null)

    if (!normalizedEmail) {
      setError("Enter a valid email address.")
      setLoading(false)
      return
    }

    const cleanToken = token.replace(/\D/g, "").slice(0, 6)
    if (!/^\d{6}$/.test(cleanToken)) {
      setError("Enter the 6-digit verification code from your email.")
      setLoading(false)
      return
    }

    try {
      const res = await fetch("/api/auth/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          email: normalizedEmail,
          token: cleanToken,
          mode,
          next: safeNext,
        }),
      })

      const json = await parseJson<{ ok?: boolean; error?: string; redirectTo?: string }>(res)
      if (!res.ok || !json?.ok) {
        setError(json?.error ?? "We could not verify that code. Try again.")
        return
      }

      router.push(getSafeNextPath(json.redirectTo ?? safeNext))
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  async function handleResend() {
    if (mode !== "signup") {
      if (mode === "master-admin") {
        router.push(`/master-admin/signin?next=${encodeURIComponent(safeNext)}`)
        return
      }
      router.push(safeNext === "/dashboard" ? "/signin" : `/signin?next=${encodeURIComponent(safeNext)}`)
      return
    }

    setResending(true)
    setError(null)
    setInfo(null)

    if (!normalizedEmail) {
      setError("Enter a valid email address to resend the verification code.")
      setResending(false)
      return
    }

    try {
      await fetch("/api/auth/resend-signup-code", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ email: normalizedEmail }),
      })
      setInfo("If that email exists, a new 6-digit verification code has been sent.")
    } catch {
      setInfo("If that email exists, a new 6-digit verification code has been sent.")
    } finally {
      setResending(false)
    }
  }

  return (
    <div>
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg border border-cinematic-orange/20 bg-cinematic-orange/10">
          <ShieldCheck className="h-5 w-5 text-cinematic-orange" aria-hidden />
        </div>
        <h2 className="font-display text-2xl font-bold tracking-tight text-white">
          {mode === "master-admin" ? "Enter Master Admin code" : mode === "signin" ? "Enter sign-in code" : "Enter email code"}
        </h2>
        <p className="mt-2 text-sm text-white/50">
          Enter the 6-digit code from your email. This works across browsers and devices.
        </p>
      </div>

      {masked ? (
        <div className="mb-6 rounded-lg border border-white/[0.08] bg-white/[0.03] p-4 text-sm text-white/70">
          Code sent to <span className="font-medium text-white">{masked}</span>. Use the newest code if you requested
          more than one.
        </div>
      ) : null}

      {error ? <AuthFormError message={error} onDismiss={() => setError(null)} className="mb-6" /> : null}
      {info ? (
        <div className="mb-6 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm text-emerald-300">
          {info}
        </div>
      ) : null}

      <form onSubmit={handleVerify} className="space-y-5">
        <div className="space-y-2">
          <label htmlFor="code-email" className="text-sm font-medium text-white/90">
            Email
          </label>
          <div className="relative">
            <Input
              id="code-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              maxLength={254}
              placeholder="you@studio.com"
              disabled={loading || resending}
              className="h-12 rounded-lg border-white/10 bg-white/[0.04] pl-11 text-white placeholder:text-white/35 focus-visible:border-cinematic-orange/40 focus-visible:ring-cinematic-orange/20"
            />
            <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" aria-hidden />
          </div>
        </div>

        <div className="space-y-2">
          <label htmlFor="signup-token" className="text-sm font-medium text-white/90">
            6-digit code
          </label>
          <Input
            id="signup-token"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={token}
            onChange={(e) => setToken(e.target.value.replace(/\D/g, "").slice(0, 6))}
            required
            maxLength={6}
            placeholder="123456"
            disabled={loading}
            className="h-12 rounded-lg border-white/10 bg-white/[0.04] text-center font-mono text-lg tracking-[0.35em] text-white placeholder:text-white/25 focus-visible:border-cinematic-orange/40 focus-visible:ring-cinematic-orange/20"
          />
        </div>

        <Button
          type="submit"
          disabled={loading}
          className="group relative h-12 w-full overflow-hidden rounded-lg bg-cinematic-orange font-semibold text-black hover:bg-cinematic-orange/90 disabled:opacity-60"
        >
          <span className="relative z-10 inline-flex items-center justify-center gap-2">
            {loading ? (
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-black/25 border-t-black" aria-hidden />
            ) : (
              <>
                Continue
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
              </>
            )}
          </span>
        </Button>
      </form>

      <div className="mt-4 flex items-center justify-between gap-3 text-sm">
        <button
          type="button"
          onClick={() => void handleResend()}
          disabled={resending || loading}
          className="inline-flex items-center gap-2 rounded-lg px-1 py-1 text-cinematic-orange hover:text-cinematic-orange/85 disabled:opacity-50"
        >
          {resending ? <RefreshCw className="h-4 w-4 animate-spin" aria-hidden /> : null}
          {mode === "signup" ? "Resend code" : "Request new code"}
        </button>

        <Link
          href={
            mode === "master-admin"
              ? `/master-admin/signin?next=${encodeURIComponent(safeNext)}`
              : safeNext === "/dashboard"
                ? "/signin"
                : `/signin?next=${encodeURIComponent(safeNext)}`
          }
          className="rounded-lg px-1 py-1 text-white/45 hover:text-white/75"
        >
          Back to sign in
        </Link>
      </div>
    </div>
  )
}

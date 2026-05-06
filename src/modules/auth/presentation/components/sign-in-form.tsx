"use client"

import { useRouter } from "next/navigation"
import Link from "next/link"
import { ArrowRight, Eye, EyeOff } from "lucide-react"
import { useState } from "react"
import { getSafeNextPath } from "@/modules/auth/domain/next-path"
import { mapSupabaseAuthError } from "@/modules/auth/domain/safe-errors"
import { validateEmail, validatePasswordSignIn } from "@/modules/auth/domain/validation"
import { Button } from "@/ui/components/button"
import { Input } from "@/ui/components/input"
import { AuthFormError } from "@/modules/auth/presentation/components/auth-form-error"

interface SignInFormProps {
  nextPath: string
  initialError?: string | null
  initialNotice?: string | null
}

export function SignInForm({ nextPath, initialError = null, initialNotice = null }: SignInFormProps) {
  const router = useRouter()
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(initialError)
  const [notice, setNotice] = useState<string | null>(initialNotice)
  const [ssoEmail, setSsoEmail] = useState<string | null>(null)

  async function startSso(email: string) {
    setLoading(true)
    setError(null)
    setNotice(null)
    try {
      const res = await fetch("/api/auth/sso/start", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ email, next: getSafeNextPath(nextPath) }),
      })
      const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string }
      if (!res.ok || !json.url) {
        setError(json.error ?? "Failed to start SSO.")
        return
      }
      window.location.assign(json.url)
    } finally {
      setLoading(false)
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setNotice(null)
    const formData = new FormData(e.currentTarget)
    const email = validateEmail(formData.get("email"))
    const password = validatePasswordSignIn(formData.get("password"))
    const safeNext = getSafeNextPath(nextPath)

    if (!email) {
      setError("Enter a valid email address.")
      setLoading(false)
      return
    }
    if (!password) {
      setError("Enter a valid password.")
      setLoading(false)
      return
    }

    try {
      const res = await fetch("/api/auth/sign-in", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ email, password }),
      })

      let json: { ok?: boolean; error?: string; needsOtp?: boolean; code?: string }
      try {
        json = (await res.json()) as { ok?: boolean; error?: string; needsOtp?: boolean; code?: string }
      } catch {
        setError("Something went wrong. Try again.")
        return
      }

      if (!res.ok || !json.ok) {
        const message = json.error ?? mapSupabaseAuthError("unknown")
        if (json.code === "sso_required") {
          setSsoEmail(email)
          setError(message)
          return
        }
        if (message === "Please confirm your email before signing in.") {
          router.push(`/verify-code?email=${encodeURIComponent(email)}&next=${encodeURIComponent(safeNext)}`)
          router.refresh()
          return
        }
        setError(message)
        return
      }

      router.push(`/verify-code?mode=signin&email=${encodeURIComponent(email)}&next=${encodeURIComponent(safeNext)}`)
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg border border-cinematic-orange/20 bg-cinematic-orange/10">
          <span className="font-display text-xl font-bold text-cinematic-orange">WB</span>
        </div>
        <h2 className="font-display text-2xl font-bold tracking-tight text-white">Welcome back</h2>
        <p className="mt-2 text-sm text-white/50">Enter your password first, then confirm the 6-digit email code.</p>
      </div>

      {error ? <AuthFormError message={error} onDismiss={() => setError(null)} className="mb-6" /> : null}
      {ssoEmail ? (
        <Button
          type="button"
          className="mb-6 h-11 w-full rounded-lg bg-white text-black hover:bg-white/90"
          disabled={loading}
          onClick={() => void startSso(ssoEmail)}
        >
          Continue with SSO
        </Button>
      ) : null}
      {notice ? (
        <div className="mb-6 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm text-emerald-300">
          {notice}
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="space-y-5">
        <input type="hidden" name="next" value={nextPath} />
        <div className="space-y-2">
          <label htmlFor="email" className="text-sm font-medium text-white/90">
            Email
          </label>
          <Input
            id="email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            maxLength={254}
            placeholder="you@studio.com"
            disabled={loading}
            className="h-12 rounded-lg border-white/10 bg-white/[0.04] text-white placeholder:text-white/35 focus-visible:border-cinematic-orange/40 focus-visible:ring-cinematic-orange/20"
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="password" className="text-sm font-medium text-white/90">
              Password
            </label>
            <Link
              href="/forgot-password"
              className="text-xs font-medium text-cinematic-orange hover:text-cinematic-orange/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cinematic-orange/50 rounded"
            >
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <Input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              maxLength={72}
              placeholder="........"
              disabled={loading}
              className="h-12 rounded-lg border-white/10 bg-white/[0.04] pr-12 text-white placeholder:text-white/35 focus-visible:border-cinematic-orange/40 focus-visible:ring-cinematic-orange/20"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-white/45 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cinematic-orange/50"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
            </button>
          </div>
        </div>

        <Button
          type="submit"
          disabled={loading}
          className="group relative h-12 w-full overflow-hidden rounded-lg bg-cinematic-orange font-semibold text-black hover:bg-cinematic-orange/90 disabled:opacity-60"
        >
          <span className="relative z-10 inline-flex items-center justify-center gap-2">
            {loading ? (
              <span
                className="h-5 w-5 animate-spin rounded-full border-2 border-black/25 border-t-black"
                aria-hidden
              />
            ) : (
              <>
                Continue
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
              </>
            )}
          </span>
        </Button>
      </form>

      <p className="mt-8 text-center text-sm text-white/50">
        New here?{" "}
        <Link
          href={nextPath === "/dashboard" ? "/signup" : `/signup?next=${encodeURIComponent(nextPath)}`}
          className="font-semibold text-cinematic-orange hover:text-cinematic-orange/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cinematic-orange/50 rounded"
        >
          Create an account
        </Link>
      </p>

      <p className="mt-3 text-center text-xs text-white/35">Login requires your password and an email OTP.</p>
    </div>
  )
}

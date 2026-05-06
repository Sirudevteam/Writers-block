"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ArrowRight, Eye, EyeOff, ShieldCheck } from "lucide-react"
import { Button } from "@/ui/components/button"
import { Input } from "@/ui/components/input"
import { AuthFormError } from "@/modules/auth/presentation/components/auth-form-error"
import { getSafeNextPath } from "@/modules/auth/domain/next-path"
import { validateEmail, validatePasswordSignIn } from "@/modules/auth/domain/validation"

interface MasterAdminSignInFormProps {
  nextPath: string
}

export function MasterAdminSignInForm({ nextPath }: MasterAdminSignInFormProps) {
  const router = useRouter()
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const formData = new FormData(e.currentTarget)
    const email = validateEmail(formData.get("email"))
    const password = validatePasswordSignIn(formData.get("password"))
    const safeNext = getSafeNextPath(nextPath).startsWith("/master-admin")
      ? getSafeNextPath(nextPath)
      : "/master-admin"

    if (!email) {
      setError("Enter a valid admin email address.")
      setLoading(false)
      return
    }
    if (!password) {
      setError("Enter your password.")
      setLoading(false)
      return
    }

    try {
      const res = await fetch("/api/auth/master-admin-sign-in", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ email, password }),
      })

      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null
      if (!res.ok || !json?.ok) {
        setError(json?.error ?? "Master Admin sign-in failed. Please try again.")
        return
      }

      router.push(
        `/verify-code?mode=master-admin&email=${encodeURIComponent(email)}&next=${encodeURIComponent(safeNext)}`
      )
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg border border-cinematic-orange/20 bg-cinematic-orange/10">
          <ShieldCheck className="h-5 w-5 text-cinematic-orange" aria-hidden />
        </div>
        <h2 className="font-display text-2xl font-bold tracking-tight text-white">Master Admin sign in</h2>
        <p className="mt-2 text-sm text-white/50">
          Operators must pass password auth, email OTP, and the master-admin allowlist.
        </p>
      </div>

      {error ? <AuthFormError message={error} onDismiss={() => setError(null)} className="mb-6" /> : null}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <label htmlFor="master-admin-email" className="text-sm font-medium text-white/90">
            Admin email
          </label>
          <Input
            id="master-admin-email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            maxLength={254}
            placeholder="operator@studio.com"
            disabled={loading}
            className="h-12 rounded-lg border-white/10 bg-white/[0.04] text-white placeholder:text-white/35 focus-visible:border-cinematic-orange/40 focus-visible:ring-cinematic-orange/20"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="master-admin-password" className="text-sm font-medium text-white/90">
            Password
          </label>
          <div className="relative">
            <Input
              id="master-admin-password"
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

      <p className="mt-8 text-center text-sm text-white/45">
        Not an operator?{" "}
        <Link href="/signin" className="font-semibold text-cinematic-orange hover:text-cinematic-orange/85">
          Use normal sign in
        </Link>
      </p>
    </div>
  )
}

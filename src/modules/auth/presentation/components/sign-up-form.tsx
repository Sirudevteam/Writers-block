"use client"

import { useRouter } from "next/navigation"
import Link from "next/link"
import { ArrowRight, CheckCircle, Eye, EyeOff, UserPlus } from "lucide-react"
import { useState } from "react"
import { getSafeNextPath } from "@/modules/auth/domain/next-path"
import { mapSupabaseAuthError } from "@/modules/auth/domain/safe-errors"
import {
  PASSWORD_REQUIREMENT_MESSAGE,
  validateDisplayName,
  validateEmail,
  validatePasswordSignUp,
} from "@/modules/auth/domain/validation"
import { Button } from "@/ui/components/button"
import { Input } from "@/ui/components/input"
import { AuthFormError } from "@/modules/auth/presentation/components/auth-form-error"

interface SignUpFormProps {
  nextPath: string
}

export function SignUpForm({ nextPath }: SignUpFormProps) {
  const router = useRouter()
  const [showPassword, setShowPassword] = useState(false)
  const [agreed, setAgreed] = useState(false)
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const rules = {
    length: password.length >= 15 && password.length <= 72,
    uncommon: Boolean(validatePasswordSignUp(password)),
  }
  const passwordOk = Object.values(rules).every(Boolean)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const formData = new FormData(e.currentTarget)
    const name = validateDisplayName(formData.get("name"))
    const email = validateEmail(formData.get("email"))
    const passwordValue = validatePasswordSignUp(formData.get("password"))
    const safeNext = getSafeNextPath(nextPath)

    if (!name) {
      setError("Enter a display name (1-100 characters). Angle brackets are not allowed.")
      setLoading(false)
      return
    }
    if (!email) {
      setError("Enter a valid email address.")
      setLoading(false)
      return
    }
    if (!passwordValue) {
      setError(PASSWORD_REQUIREMENT_MESSAGE)
      setLoading(false)
      return
    }
    if (!agreed) {
      setError("Accept the Terms of Service and Privacy Policy to continue.")
      setLoading(false)
      return
    }

    try {
      const res = await fetch("/api/auth/sign-up", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          email,
          password: passwordValue,
          fullName: name,
          termsAccepted: agreed,
        }),
      })

      let json: {
        ok?: boolean
        error?: string
        needsSignupCode?: boolean
        email?: string
      }
      try {
        json = (await res.json()) as typeof json
      } catch {
        setError("Something went wrong. Try again.")
        return
      }

      if (!res.ok || !json.ok) {
        setError(json.error ?? mapSupabaseAuthError("unknown"))
        return
      }

      if (json.needsSignupCode) {
        const verificationEmail = json.email ?? email
        router.push(
          `/verify-code?email=${encodeURIComponent(verificationEmail)}&next=${encodeURIComponent(safeNext)}`
        )
        router.refresh()
        return
      }

      router.push(safeNext)
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg border border-cinematic-orange/20 bg-cinematic-orange/10">
          <UserPlus className="h-5 w-5 text-cinematic-orange" aria-hidden />
        </div>
        <h2 className="font-display text-2xl font-bold tracking-tight text-white">Create your account</h2>
        <p className="mt-2 text-sm text-white/50">
          Email and password only. We will send a 6-digit signup code you can enter from any browser or device.
        </p>
      </div>

      {error ? <AuthFormError message={error} onDismiss={() => setError(null)} className="mb-6" /> : null}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <label htmlFor="name" className="text-sm font-medium text-white/90">
            Display name
          </label>
          <Input
            id="name"
            name="name"
            type="text"
            autoComplete="name"
            required
            maxLength={100}
            placeholder="Your name"
            disabled={loading}
            className="h-12 rounded-lg border-white/10 bg-white/[0.04] text-white placeholder:text-white/35 focus-visible:border-cinematic-orange/40 focus-visible:ring-cinematic-orange/20"
          />
        </div>

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
          <label htmlFor="password" className="text-sm font-medium text-white/90">
            Password
          </label>
          <div className="relative">
            <Input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              required
              minLength={15}
              maxLength={72}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="15+ characters or a passphrase"
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
          {password ? (
            <ul className="space-y-1.5 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 text-xs">
              {(
                [
                  ["length", "15-72 characters"],
                  ["uncommon", "Not a common password"],
                ] as const
              ).map(([key, label]) => (
                <li key={key} className="flex items-center gap-2">
                  <CheckCircle
                    className={`h-3.5 w-3.5 flex-shrink-0 ${rules[key] ? "text-emerald-400" : "text-white/25"}`}
                    aria-hidden
                  />
                  <span className={rules[key] ? "text-emerald-400/90" : "text-white/40"}>{label}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="flex gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
          <input
            id="terms"
            name="terms"
            type="checkbox"
            value="on"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            disabled={loading}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-white/20 bg-white/[0.05] text-cinematic-orange focus-visible:ring-2 focus-visible:ring-cinematic-orange/50"
          />
          <label htmlFor="terms" className="text-left text-xs leading-relaxed text-white/55">
            I agree to the Terms of Service and Privacy Policy.
          </label>
        </div>

        <Button
          type="submit"
          disabled={!agreed || !passwordOk || loading}
          className="group relative h-12 w-full overflow-hidden rounded-lg bg-cinematic-orange font-semibold text-black hover:bg-cinematic-orange/90 disabled:opacity-50"
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
        Already have an account?{" "}
        <Link
          href={nextPath === "/dashboard" ? "/signin" : `/signin?next=${encodeURIComponent(nextPath)}`}
          className="font-semibold text-cinematic-orange hover:text-cinematic-orange/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cinematic-orange/50 rounded"
        >
          Sign in
        </Link>
      </p>
    </div>
  )
}

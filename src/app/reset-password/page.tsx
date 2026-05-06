"use client"

import { Suspense, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { motion } from "framer-motion"
import Link from "next/link"
import { Film, Eye, EyeOff, ArrowRight, AlertCircle, CheckCircle, Lock, Mail } from "lucide-react"
import { Button } from "@/ui/components/button"
import { Input } from "@/ui/components/input"
import {
  PASSWORD_REQUIREMENT_MESSAGE,
  validateEmail,
  validatePasswordSignUp,
} from "@/modules/auth/domain/validation"

function ResetPasswordContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState(searchParams.get("email") ?? "")
  const [code, setCode] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const normalizedEmail = useMemo(() => validateEmail(email), [email])
  const passwordChecks = {
    length: password.length >= 15 && password.length <= 72,
    uncommon: Boolean(validatePasswordSignUp(password)),
  }
  const isPasswordValid = Object.values(passwordChecks).every(Boolean)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!normalizedEmail) {
      setError("Enter a valid email address.")
      return
    }

    const cleanCode = code.replace(/\D/g, "").slice(0, 6)
    if (!/^\d{6}$/.test(cleanCode)) {
      setError("Enter the 6-digit reset code from your email.")
      return
    }

    const validPassword = validatePasswordSignUp(password)
    if (!validPassword) {
      setError(PASSWORD_REQUIREMENT_MESSAGE)
      return
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match")
      return
    }

    setLoading(true)

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          email: normalizedEmail,
          code: cleanCode,
          password: validPassword,
        }),
      })

      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null
      if (!res.ok || !json?.ok) {
        setError(json?.error ?? "We could not update your password. Please try again.")
        return
      }

      setSuccess(true)
      setTimeout(() => router.push("/signin"), 2000)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden">
        <motion.div
          animate={{ scale: [1, 1.2, 1], opacity: [0.1, 0.2, 0.1] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-cinematic-orange/10 rounded-full blur-3xl"
        />
        <motion.div
          animate={{ scale: [1, 1.1, 1], opacity: [0.1, 0.25, 0.1] }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 1 }}
          className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-cinematic-blue/10 rounded-full blur-3xl"
        />
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
          }}
        />
      </div>

      <div className="absolute top-0 left-0 right-0 h-4 flex opacity-20">
        {Array.from({ length: 50 }).map((_, i) => (
          <div key={i} className="flex-1 flex justify-center">
            <div className="w-1.5 h-full bg-white/30 rounded-sm" />
          </div>
        ))}
      </div>
      <div className="absolute bottom-0 left-0 right-0 h-4 flex opacity-20">
        {Array.from({ length: 50 }).map((_, i) => (
          <div key={i} className="flex-1 flex justify-center">
            <div className="w-1.5 h-full bg-white/30 rounded-sm" />
          </div>
        ))}
      </div>

      <Link href="/" className="absolute top-6 left-6 sm:top-8 sm:left-8 flex items-center gap-2 group z-20">
        <motion.div
          whileHover={{ rotate: 15, scale: 1.1 }}
          transition={{ duration: 0.2 }}
          className="w-10 h-10 rounded-xl bg-gradient-to-br from-cinematic-orange to-cinematic-orange/70 flex items-center justify-center"
        >
          <Film className="w-5 h-5 text-black" />
        </motion.div>
        <span className="text-lg font-bold bg-gradient-to-r from-white to-white/80 bg-clip-text text-transparent">
          Writers Block
        </span>
      </Link>

      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-md relative z-10"
      >
        <div className="absolute -inset-0.5 bg-gradient-to-r from-cinematic-orange/20 to-cinematic-blue/20 rounded-2xl blur-xl opacity-50" />

        <div className="relative bg-[#0f0f0f]/90 backdrop-blur-2xl rounded-2xl border border-white/10 p-8 shadow-2xl">
          {success ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center gap-4 py-4 text-center"
            >
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-green-500/20 to-green-500/5 flex items-center justify-center border border-green-500/20">
                <CheckCircle className="w-8 h-8 text-green-500" />
              </div>
              <h1 className="text-2xl font-bold text-white">Password updated!</h1>
              <p className="text-muted-foreground">Redirecting you to sign in...</p>
            </motion.div>
          ) : (
            <>
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="text-center mb-8"
              >
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-cinematic-orange/20 to-cinematic-blue/20 flex items-center justify-center mx-auto mb-4 border border-white/10">
                  <Lock className="w-8 h-8 text-cinematic-orange" />
                </div>
                <h1 className="text-3xl font-bold mb-2">
                  <span className="bg-gradient-to-r from-white to-white/80 bg-clip-text text-transparent">
                    Set New Password
                  </span>
                </h1>
                <p className="text-muted-foreground text-sm">
                  Enter your email, reset code, and new password
                </p>
              </motion.div>

              {error && (
                <motion.div
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex items-center gap-2 p-3 mb-6 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm"
                >
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {error}
                </motion.div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                <motion.div
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.25 }}
                  className="space-y-2"
                >
                  <label className="text-sm font-medium text-white/90">Email Address</label>
                  <div className="relative">
                    <Input
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="h-12 bg-white/5 border-white/10 text-white placeholder:text-muted-foreground/50 pl-11 focus:border-cinematic-orange/50 focus:ring-cinematic-orange/20 rounded-xl"
                      required
                      disabled={loading}
                    />
                    <Mail className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                  </div>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 }}
                  className="space-y-2"
                >
                  <label className="text-sm font-medium text-white/90">6-digit reset code</label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="123456"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    className="h-12 bg-white/5 border-white/10 text-center font-mono text-lg tracking-[0.35em] text-white placeholder:text-muted-foreground/50 focus:border-cinematic-orange/50 focus:ring-cinematic-orange/20 rounded-xl"
                    required
                    maxLength={6}
                    disabled={loading}
                  />
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.35 }}
                  className="space-y-2"
                >
                  <label className="text-sm font-medium text-white/90">New Password</label>
                  <div className="relative">
                    <Input
                      type={showPassword ? "text" : "password"}
                      placeholder="Enter new password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="h-12 bg-white/5 border-white/10 text-white placeholder:text-muted-foreground/50 pr-12 focus:border-cinematic-orange/50 focus:ring-cinematic-orange/20 rounded-xl"
                      required
                      minLength={15}
                      maxLength={72}
                      disabled={loading}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {password && (
                    <div className="space-y-1.5 mt-3 p-3 rounded-lg bg-white/5 border border-white/5">
                      {[
                        { key: "length", label: "15-72 characters" },
                        { key: "uncommon", label: "Not a common password" },
                      ].map(({ key, label }) => (
                        <div
                          key={key}
                          className={`flex items-center gap-2 text-xs transition-colors ${
                            passwordChecks[key as keyof typeof passwordChecks] ? "text-green-500" : "text-muted-foreground"
                          }`}
                        >
                          <CheckCircle className="w-3.5 h-3.5" />
                          {label}
                        </div>
                      ))}
                    </div>
                  )}
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.4 }}
                  className="space-y-2"
                >
                  <label className="text-sm font-medium text-white/90">Confirm Password</label>
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder="Repeat new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="h-12 bg-white/5 border-white/10 text-white placeholder:text-muted-foreground/50 focus:border-cinematic-orange/50 focus:ring-cinematic-orange/20 rounded-xl"
                    required
                    disabled={loading}
                  />
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.45 }}
                >
                  <Button
                    type="submit"
                    disabled={loading || !isPasswordValid}
                    className="w-full h-12 bg-cinematic-orange text-black font-semibold hover:bg-cinematic-orange/90 rounded-xl disabled:opacity-50 relative overflow-hidden group"
                  >
                    <motion.div
                      className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent -skew-x-12"
                      animate={{ x: ["-200%", "200%"] }}
                      transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
                    />
                    <span className="relative z-10 flex items-center justify-center">
                      {loading ? (
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                          className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full"
                        />
                      ) : (
                        <>
                          Update Password
                          <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                        </>
                      )}
                    </span>
                  </Button>
                </motion.div>
              </form>

              <p className="mt-5 text-center text-sm text-muted-foreground">
                Need a code?{" "}
                <Link href="/forgot-password" className="text-cinematic-orange hover:text-cinematic-orange/80 font-medium transition-colors">
                  Request a new reset code
                </Link>
              </p>
            </>
          )}
        </div>
      </motion.div>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-4 text-white/60">
          Loading...
        </div>
      }
    >
      <ResetPasswordContent />
    </Suspense>
  )
}

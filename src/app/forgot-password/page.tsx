"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import Link from "next/link"
import { Film, ArrowRight, AlertCircle, CheckCircle, KeyRound } from "lucide-react"
import { Button } from "@/ui/components/button"
import { Input } from "@/ui/components/input"
import { validateEmail } from "@/modules/auth/domain/validation"

export default function ForgotPasswordPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const normalizedEmail = validateEmail(email)
    if (!normalizedEmail) {
      setError("Enter a valid email address.")
      setLoading(false)
      return
    }

    try {
      const res = await fetch("/api/auth/request-password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ email: normalizedEmail }),
      })

      let json: { ok?: boolean; error?: string } | null = null
      try {
        json = (await res.json()) as { ok?: boolean; error?: string }
      } catch {
        json = null
      }

      if (!res.ok || !json?.ok) {
        setError(json?.error ?? "We could not send a reset code. Please try again.")
        return
      }

      setEmail(normalizedEmail)
      setSent(true)
      router.push(`/reset-password?email=${encodeURIComponent(normalizedEmail)}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-4 relative overflow-hidden">
      {/* Animated Background Effects */}
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
        {/* Film grain overlay */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
          }}
        />
      </div>

      {/* Film strip decorations */}
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

      {/* Logo */}
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

      {/* Main Card */}
      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-md relative z-10"
      >
        {/* Card glow effect */}
        <div className="absolute -inset-0.5 bg-gradient-to-r from-cinematic-orange/20 to-cinematic-blue/20 rounded-2xl blur-xl opacity-50" />
        
        <div className="relative bg-[#0f0f0f]/90 backdrop-blur-2xl rounded-2xl border border-white/10 p-8 shadow-2xl">
          {sent ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center gap-4 py-4 text-center"
            >
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-green-500/20 to-green-500/5 flex items-center justify-center border border-green-500/20">
                <CheckCircle className="w-8 h-8 text-green-500" />
              </div>
              <h1 className="text-2xl font-bold text-white">Check your email</h1>
              <p className="text-muted-foreground">
                If an account exists for <span className="text-white">{email}</span>, a 6-digit reset code has been
                sent. Check your inbox and spam folder.
              </p>
              <Button asChild className="mt-4 h-12 px-8 bg-cinematic-orange text-black hover:bg-cinematic-orange/90 rounded-xl">
                <Link href="/signin">
                  Back to Sign In
                </Link>
              </Button>
            </motion.div>
          ) : (
            <>
              {/* Header with icon */}
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="text-center mb-8"
              >
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-cinematic-orange/20 to-cinematic-blue/20 flex items-center justify-center mx-auto mb-4 border border-white/10">
                  <KeyRound className="w-8 h-8 text-cinematic-orange" />
                </div>
                <h1 className="text-3xl font-bold mb-2">
                  <span className="bg-gradient-to-r from-white to-white/80 bg-clip-text text-transparent">
                    Reset Password
                  </span>
                </h1>
                <p className="text-muted-foreground text-sm">
                  Enter your email and we&apos;ll send you a 6-digit reset code
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
                  transition={{ delay: 0.3 }}
                  className="space-y-2"
                >
                  <label className="text-sm font-medium text-white/90">Email Address</label>
                  <Input
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-12 bg-white/5 border-white/10 text-white placeholder:text-muted-foreground/50 focus:border-cinematic-orange/50 focus:ring-cinematic-orange/20 rounded-xl"
                    required
                    disabled={loading}
                  />
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                >
                  <Button
                    type="submit"
                    disabled={loading}
                    className="w-full h-12 bg-cinematic-orange text-black font-semibold hover:bg-cinematic-orange/90 rounded-xl disabled:opacity-50 relative overflow-hidden group"
                  >
                    {/* Shine effect */}
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
                          Send Reset Code
                          <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                        </>
                      )}
                    </span>
                  </Button>
                </motion.div>
              </form>

              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="text-center text-sm text-muted-foreground mt-8"
              >
                Remembered your password?{" "}
                <Link href="/signin" className="text-cinematic-orange hover:text-cinematic-orange/80 font-medium transition-colors">
                  Sign in
                </Link>
              </motion.p>
            </>
          )}
        </div>
      </motion.div>
    </div>
  )
}

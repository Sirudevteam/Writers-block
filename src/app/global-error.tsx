"use client"

import { useEffect } from "react"
import * as Sentry from "@sentry/nextjs"
import { Button } from "@/ui/components/button"
import { Film, AlertCircle } from "lucide-react"

/**
 * Root-level error boundary (must include html/body). Complements src/app/error.tsx for nested routes.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("Global application error:", error)
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="en">
      <body className="antialiased bg-[#0a0a0a] text-white">
        <div className="min-h-screen flex items-center justify-center p-4">
          <div className="max-w-md w-full text-center">
            <div className="relative mb-8">
              <div className="absolute -inset-4 bg-gradient-to-r from-[#ff6b35]/20 to-[#00d4ff]/20 rounded-full blur-2xl opacity-50" />
              <div className="relative w-20 h-20 mx-auto rounded-2xl bg-gradient-to-br from-white/10 to-white/5 border border-white/10 flex items-center justify-center">
                <AlertCircle className="w-10 h-10 text-[#ff6b35]" />
              </div>
            </div>

            <h2 className="text-2xl font-bold mb-4">Something went wrong</h2>

            <p className="text-white/60 mb-2">
              We apologize for the inconvenience. Our team has been notified.
            </p>

            {error.message && (
              <p className="text-sm text-red-400/80 mb-6 bg-red-500/10 rounded-lg p-3">
                {error.message}
              </p>
            )}

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button
                onClick={reset}
                className="bg-[#ff6b35] text-black hover:bg-[#ff6b35]/90"
              >
                Try again
              </Button>

              <Button
                variant="outline"
                onClick={() => {
                  window.location.href = "/"
                }}
                className="border-white/20 hover:bg-white/5 text-white"
              >
                <Film className="w-4 h-4 mr-2" />
                Go home
              </Button>
            </div>

            {error.digest && (
              <p className="mt-6 text-xs text-white/40">Error ID: {error.digest}</p>
            )}
          </div>
        </div>
      </body>
    </html>
  )
}

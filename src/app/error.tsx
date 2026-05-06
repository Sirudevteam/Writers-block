"use client"

import { useEffect } from "react"
import * as Sentry from "@sentry/nextjs"
import { Button } from "@/ui/components/button"
import { Film, AlertCircle } from "lucide-react"

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("Application error:", error)
    Sentry.captureException(error)
  }, [error])

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a] p-4">
      <div className="max-w-md w-full text-center">
        <div className="relative mb-8">
          <div className="absolute -inset-4 bg-gradient-to-r from-cinematic-orange/20 to-cinematic-blue/20 rounded-full blur-2xl opacity-50" />
          <div className="relative w-20 h-20 mx-auto rounded-2xl bg-gradient-to-br from-white/10 to-white/5 border border-white/10 flex items-center justify-center">
            <AlertCircle className="w-10 h-10 text-cinematic-orange" />
          </div>
        </div>
        
        <h2 className="text-2xl font-bold text-white mb-4">
          Something went wrong
        </h2>
        
        <p className="text-muted-foreground mb-2">
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
            className="bg-cinematic-orange text-black hover:bg-cinematic-orange/90"
          >
            Try again
          </Button>
          
          <Button 
            variant="outline"
            onClick={() => window.location.href = "/"}
            className="border-white/20 hover:bg-white/5"
          >
            <Film className="w-4 h-4 mr-2" />
            Go home
          </Button>
        </div>
        
        {error.digest && (
          <p className="mt-6 text-xs text-muted-foreground">
            Error ID: {error.digest}
          </p>
        )}
      </div>
    </div>
  )
}

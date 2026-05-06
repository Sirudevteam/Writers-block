"use client"

import { useEffect } from "react"
import { Button } from "@/ui/components/button"
import { FolderOpen, AlertCircle, RefreshCw } from "lucide-react"

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("Dashboard error:", error)
  }, [error])

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a] p-4">
      <div className="max-w-md w-full">
        <div className="bg-[#0f0f0f] border border-white/10 rounded-2xl p-8 text-center">
          <div className="w-16 h-16 mx-auto mb-6 rounded-xl bg-red-500/10 flex items-center justify-center">
            <AlertCircle className="w-8 h-8 text-red-400" />
          </div>
          
          <h2 className="text-xl font-bold text-white mb-2">
            Dashboard Error
          </h2>
          
          <p className="text-muted-foreground mb-6">
            We couldn&apos;t load your dashboard. This might be a temporary issue.
          </p>
          
          {error.message && (
            <p className="text-xs text-red-400/80 mb-6 bg-red-500/5 rounded-lg p-3">
              {error.message}
            </p>
          )}
          
          <div className="flex flex-col sm:flex-row gap-3">
            <Button 
              onClick={reset}
              className="flex-1 bg-cinematic-orange text-black hover:bg-cinematic-orange/90"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Retry
            </Button>
            
            <Button 
              variant="outline"
              onClick={() => window.location.href = "/dashboard"}
              className="flex-1 border-white/20 hover:bg-white/5"
            >
              <FolderOpen className="w-4 h-4 mr-2" />
              Go to Dashboard
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

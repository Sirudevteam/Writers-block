"use client"

import { memo, useEffect, useMemo, useState } from "react"
import { motion } from "framer-motion"
import { Crown, Zap, Sparkles, AlertCircle, ArrowRight, Coins } from "lucide-react"
import { Button } from "@/ui/components/button"
import type { Subscription } from "@/shared/types/project"
import { PLAN_NAMES, isUnlimitedProjectLimit } from "@/shared/types/project"
import type { ProjectQuota } from "@/modules/projects/domain/types"
import type { AiCreditHistoryItem, AiCreditSnapshot } from "@/modules/ai/domain/credits"

interface SubscriptionPanelProps {
  subscription: Subscription
  projectQuota?: ProjectQuota | null
  onUpgrade?: () => void
  onBuyAiCredits?: () => void
}

function compactCredits(value: number): string {
  if (value >= 1_000_000) return `${Number.isInteger(value / 1_000_000) ? value / 1_000_000 : (value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${Math.round(value / 1_000)}K`
  return value.toLocaleString("en-IN")
}

function SubscriptionPanelComponent({ subscription, projectQuota, onUpgrade, onBuyAiCredits }: SubscriptionPanelProps) {
  const { plan, projectsUsed, projectsLimit } = subscription
  const [aiCredits, setAiCredits] = useState<AiCreditSnapshot | null>(null)
  const [aiCreditHistory, setAiCreditHistory] = useState<AiCreditHistoryItem[]>([])
  const freeLifetimeQuota = plan === "free" ? projectQuota : null
  const showsFreeLifetimeCredits = Boolean(freeLifetimeQuota)
  const displayedUsed = freeLifetimeQuota ? freeLifetimeQuota.freeLifetimeUsed : projectsUsed
  const displayedLimit = freeLifetimeQuota ? freeLifetimeQuota.freeLifetimeLimit : projectsLimit
  const unlimited = !showsFreeLifetimeCredits && isUnlimitedProjectLimit(projectsLimit)
  const isOverCapacity = !showsFreeLifetimeCredits && !unlimited && projectsLimit > 0 && projectsUsed > projectsLimit
  const usagePct =
    unlimited || displayedLimit <= 0
      ? 0
      : (displayedUsed / displayedLimit) * 100
  const barPct = Math.min(usagePct, 100)
  const isNearLimit = !unlimited && !isOverCapacity && usagePct >= 80
  const isAtLimit = !unlimited && displayedUsed >= displayedLimit
  const limitLabel = unlimited ? "Unlimited" : String(displayedLimit)
  const aiCreditPct = useMemo(() => {
    if (!aiCredits || aiCredits.includedCreditsLimit <= 0) return 0
    return Math.min(100, (aiCredits.includedCreditsUsed / aiCredits.includedCreditsLimit) * 100)
  }, [aiCredits])
  const aiCreditsNearLimit = aiCreditPct >= 80 && aiCreditPct < 100
  const aiCreditsExhausted = Boolean(
    aiCredits && aiCredits.includedCreditsRemaining <= 0 && aiCredits.topUpCreditsRemaining <= 0
  )

  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetch("/api/ai/credits", { cache: "no-store" }).then((res) => (res.ok ? res.json() : null)),
      fetch("/api/ai/credits/history", { cache: "no-store" }).then((res) => (res.ok ? res.json() : null)),
    ])
      .then(([credits, history]: [AiCreditSnapshot | null, { history?: AiCreditHistoryItem[] } | null]) => {
        if (!cancelled) {
          setAiCredits(credits)
          setAiCreditHistory(Array.isArray(history?.history) ? history.history : [])
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAiCredits(null)
          setAiCreditHistory([])
        }
      })
    return () => {
      cancelled = true
    }
  }, [plan])

  const getPlanIcon = () => {
    switch (plan) {
      case "premium":
        return <Crown className="w-6 h-6 text-yellow-400" />
      case "pro":
        return <Zap className="w-6 h-6 text-cinematic-blue" />
      default:
        return <Sparkles className="w-6 h-6 text-cinematic-orange" />
    }
  }

  const getPlanColor = () => {
    switch (plan) {
      case "premium":
        return "from-yellow-500/20 via-orange-500/10 to-transparent border-yellow-500/30"
      case "pro":
        return "from-cinematic-blue/20 via-blue-500/10 to-transparent border-cinematic-blue/30"
      default:
        return "from-cinematic-orange/20 via-cinematic-orange/10 to-transparent border-cinematic-orange/30"
    }
  }

  const getProgressColor = () => {
    if (isOverCapacity || isAtLimit) return "bg-red-500"
    if (isNearLimit) return "bg-yellow-500"
    return "bg-gradient-to-r from-cinematic-orange to-cinematic-blue"
  }

  return (
    <div className={`relative min-w-0 overflow-hidden rounded-2xl border bg-gradient-to-br ${getPlanColor()}`}>
      <div className="pointer-events-none absolute top-0 right-0 h-24 w-24 rounded-full bg-white/5 blur-3xl sm:h-32 sm:w-32 -translate-y-1/2 translate-x-1/2" />

      <div className="relative p-4 sm:p-6">
        {/* Plan Header */}
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 sm:h-12 sm:w-12">
              {getPlanIcon()}
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">
                Current plan
              </p>
              <h3 className="truncate text-lg font-bold text-white sm:text-xl">
                {PLAN_NAMES[plan]}
              </h3>
            </div>
          </div>

          {plan !== "premium" && onUpgrade && (
            <Button
              size="sm"
              className="h-11 min-h-[44px] w-full shrink-0 rounded-xl bg-cinematic-orange text-black hover:bg-cinematic-orange/90 sm:h-9 sm:min-h-0 sm:w-auto"
              onClick={onUpgrade}
            >
              <span className="relative z-10 flex items-center">
                Upgrade
                <ArrowRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
              </span>
            </Button>
          )}
        </div>

        {/* Usage Stats */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              {showsFreeLifetimeCredits ? "Lifetime Project Creations" : "Projects Used"}
            </span>
            <span
              className={`font-bold text-lg ${isNearLimit || isAtLimit || isOverCapacity ? "text-red-400" : "text-white"}`}
            >
              {displayedUsed} / {limitLabel}
            </span>
          </div>

          {/* Progress Bar */}
          <div className="relative">
            <div className="h-2.5 bg-white/10 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${barPct}%` }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className={`absolute inset-y-0 left-0 rounded-full transition-colors duration-300 ${getProgressColor()}`}
              />
            </div>
            {/* Progress glow */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: barPct > 0 ? 1 : 0 }}
              className="absolute top-0 h-2.5 rounded-full blur-sm"
              style={{
                width: `${barPct}%`,
                background:
                  isOverCapacity || isAtLimit || isNearLimit
                    ? undefined
                    : "linear-gradient(90deg, #ff6b35, #00d4ff)",
              }}
            />
          </div>

          <p className="text-xs text-muted-foreground">
            {isOverCapacity ? (
              <span className="text-red-400">
                You have {projectsUsed} projects but your current plan allows {projectsLimit}. Delete projects to
                create new ones, or upgrade when your plan renews.
              </span>
            ) : isAtLimit ? (
              <span className="text-red-400">
                {showsFreeLifetimeCredits
                  ? "No free project credits remaining. Deleting projects does not restore credits."
                  : "No projects remaining"}
              </span>
            ) : unlimited ? (
              <span>Room for your scripts and drafts without a hard project cap on Premium.</span>
            ) : showsFreeLifetimeCredits ? (
              <>
                <span className="text-white font-medium">{displayedLimit - displayedUsed}</span> lifetime free project{" "}
                {displayedLimit - displayedUsed === 1 ? "creation" : "creations"} remaining
              </>
            ) : (
              <>
                <span className="text-white font-medium">{projectsLimit - projectsUsed}</span> projects remaining
              </>
            )}
          </p>

          {aiCredits && (
            <div className="rounded-xl border border-white/10 bg-black/15 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Coins className="h-4 w-4 text-cinematic-orange" />
                  <span className="text-sm text-muted-foreground">AI Credits</span>
                </div>
                <span className="text-sm font-bold text-white tabular-nums">
                  {compactCredits(aiCredits.includedCreditsUsed)} / {compactCredits(aiCredits.includedCreditsLimit)}
                </span>
              </div>
              <div className="h-2 rounded-full bg-white/10">
                <div
                  className="h-2 rounded-full bg-gradient-to-r from-cinematic-orange to-cinematic-blue"
                  style={{ width: `${aiCreditPct}%` }}
                />
              </div>
              <div className="mt-3 flex flex-col gap-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                <span>
                  {compactCredits(aiCredits.includedCreditsRemaining)} monthly credits left
                  {aiCredits.topUpCreditsRemaining > 0
                    ? ` + ${compactCredits(aiCredits.topUpCreditsRemaining)} top-up credits`
                    : ""}
                </span>
                {aiCredits.topUpEligible && onBuyAiCredits && (
                  <Button
                    type="button"
                    size="sm"
                    className="h-9 rounded-lg bg-white/10 text-white hover:bg-white/20"
                    onClick={onBuyAiCredits}
                  >
                    Buy 100K credits
                  </Button>
                )}
              </div>
              <p className="mt-3 text-[11px] leading-5 text-white/45">
                1 AI credit = 1 total AI token used. AI credits are used based on content length and complexity.
              </p>
              {(aiCreditsNearLimit || aiCreditsExhausted) && (
                <div className={`mt-3 rounded-lg px-3 py-2 text-xs ${aiCreditsExhausted ? "bg-red-500/10 text-red-300" : "bg-yellow-500/10 text-yellow-200"}`}>
                  {aiCreditsExhausted
                    ? aiCredits.topUpEligible
                      ? "Included credits are exhausted and no top-up balance is available."
                      : "Free monthly credits are exhausted. Upgrade to Pro or Premium to continue."
                    : "You have used over 80% of this month's included AI credits."}
                </div>
              )}
              {aiCreditHistory.length > 0 && (
                <div className="mt-4 border-t border-white/10 pt-3">
                  <div className="mb-2 text-xs font-semibold text-white/70">Top-up history</div>
                  <div className="space-y-2">
                    {aiCreditHistory.slice(0, 3).map((item) => (
                      <div key={item.id} className="flex items-center justify-between gap-3 text-[11px] text-white/50">
                        <span>{new Date(item.createdAt).toLocaleDateString("en-IN")}</span>
                        <span className="text-white/70">
                          +{compactCredits(item.creditsGranted)} / {compactCredits(item.creditsRemaining)} left
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Limit Warning */}
        {(isOverCapacity || isAtLimit) && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-5 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3"
          >
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-red-400 font-medium">
                {isOverCapacity
                  ? "Over project limit for current plan"
                  : showsFreeLifetimeCredits
                    ? "Free Project Credits Used"
                    : "Project Limit Reached"}
              </p>
              <p className="text-xs text-red-400/80 mt-1">
                {isOverCapacity
                  ? "Your plan was downgraded but existing projects were kept. Remove projects to free slots, or upgrade to add more."
                  : showsFreeLifetimeCredits
                    ? "Upgrade to create more projects. Deleting projects will not restore credits."
                    : "You have reached your project limit. Upgrade your plan to create more projects."}
              </p>
            </div>
          </motion.div>
        )}

        {isNearLimit && !isAtLimit && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-5 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-xl flex items-start gap-3"
          >
            <AlertCircle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-yellow-400">
              You&apos;re nearing your project limit. Consider upgrading soon.
            </p>
          </motion.div>
        )}
      </div>
    </div>
  )
}

export const SubscriptionPanel = memo(SubscriptionPanelComponent)
SubscriptionPanel.displayName = "SubscriptionPanel"

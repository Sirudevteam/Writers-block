"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { ArrowLeft, Check, Sparkles, Zap, Crown, Loader2 } from "lucide-react"
import Link from "next/link"
import { Button } from "@/ui/components/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/ui/components/card"
import { SubscriptionPanel } from "@/modules/billing/presentation/components/subscription-panel"
import { useUser } from "@/modules/account/presentation/hooks/use-user"
import { useProjects } from "@/modules/projects/presentation/hooks/use-projects"
import { useRazorpay } from "@/modules/billing/presentation/hooks/use-razorpay"
import type { Subscription } from "@/shared/types/project"
import { toUISubscription } from "@/modules/billing/domain/subscription"
import { PRO_MONTHLY_INR, PREMIUM_MONTHLY_INR } from "@/modules/billing/domain/pricing-inr"

const plans = [
  {
    id: "free",
    name: "Free",
    positioning: "Learn & Explore",
    price: "₹0",
    period: "forever",
    icon: Sparkles,
    color: "from-gray-500/20 to-gray-600/20",
    borderColor: "border-gray-500/30",
    upgradeHint: "Outgrow rough drafts: upgrade when you need a script you can hand to a director.",
    features: [
      "100K AI credits/month",
      "Up to ~800 words per generation",
      "Fast drafting mode",
      "5 AI generations per day",
      "3 lifetime project creations (not restored on delete)",
      "Tamil & English support",
      "Watermarked PDF export",
      "One-time clean PDF download available for ₹99",
      "Scene references to learn from films",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    positioning: "Build & Create",
    price: `₹${PRO_MONTHLY_INR.toLocaleString("en-IN")}`,
    period: "per month",
    icon: Zap,
    color: "from-cinematic-blue/20 to-blue-500/20",
    borderColor: "border-cinematic-blue/30",
    upgradeHint: "Need team-sized headroom? Premium is for sustained professional throughput.",
    features: [
      "600K AI credits/month",
      "Smart routing for better quality outputs",
      "Faster generation vs Free",
      "50 AI generations per day",
      "Up to 25 projects",
      "Production-aimed scene generation and dialogue improver",
      "Style rewrite presets (Pro & Premium)",
      "Clean PDF & email send - no free-tier watermark",
      "Shot ideas + movie references",
      "Need more? Add 100K AI credits for ₹99",
    ],
  },
  {
    id: "premium",
    name: "Premium",
    positioning: "Produce & Scale",
    price: `₹${PREMIUM_MONTHLY_INR.toLocaleString("en-IN")}`,
    period: "per month",
    icon: Crown,
    color: "from-cinematic-orange/20 to-orange-500/20",
    borderColor: "border-cinematic-orange/30",
    upgradeHint: "Built for people who treat the screenplay as a product, not a one-off file.",
    features: [
      "2M AI credits/month",
      "Priority Cinematic routing",
      "Longer outputs for big drafts (up to 2x on long-form tasks)",
      "Unlimited projects (high plan cap)",
      "All Pro features with 200 AI generations per day",
      "Priority when the system is under load",
      "Fair usage policy applies",
      "Need more? Add 100K AI credits for ₹99",
      "Roadmap: org-friendly workflows - contact us for early access",
    ],
  },
]

export default function SubscriptionPage() {
  const router = useRouter()
  const { subscription: dbSub, loading: userLoading, refetch } = useUser()
  const { projects, quota } = useProjects()
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [paymentError, setPaymentError] = useState<string | null>(null)

  const { initiatePayment, initiateAiCreditTopupPayment, isLoading: isPaymentLoading } = useRazorpay({
    onSuccess: (result) => {
      setPaymentError(null)
      if (result.purpose === "ai_credit_topup") {
        const amount = result.credits.toLocaleString("en-IN")
        setSuccessMessage(
          result.status === "applied"
            ? `${amount} AI credits added to your account.`
            : "Payment verified. Your AI credits will appear as soon as the webhook arrives."
        )
        router.refresh()
        return
      }

      if (result.status === "applied") {
        setSuccessMessage("Payment confirmed and your subscription is active.")
        void refetch()
        router.refresh()
        return
      }

      setSuccessMessage("Payment verified. Your plan will update as soon as the webhook arrives.")
    },
    onError: (err) => {
      setPaymentError(err)
    },
  })

  const subscription: Subscription = toUISubscription(dbSub, quota?.activeUsed ?? projects.length)

  useEffect(() => {
    void fetch("/api/business/subscription-view", { method: "POST" }).catch(() => {})
  }, [])

  const handleUpgrade = (planId: string) => {
    if (planId === "pro" || planId === "premium") {
      setPaymentError(null)
      initiatePayment(planId)
    }
  }

  return (
    <main className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 bg-[#0a0a0a]/80 backdrop-blur-xl border-b border-white/10">
          <div className="pl-14 lg:pl-6 pr-6 py-4">
            <div className="flex items-center gap-4">
              <Button asChild variant="ghost" size="icon" className="text-muted-foreground hover:text-white">
                <Link href="/dashboard" aria-label="Back to dashboard">
                  <ArrowLeft className="w-5 h-5" />
                </Link>
              </Button>
              <div>
                <h1 className="text-2xl font-bold font-display text-white">Subscription</h1>
                <p className="text-sm text-muted-foreground">Manage your plan and billing</p>
              </div>
            </div>
          </div>
        </header>

        <div className="p-6 max-w-6xl mx-auto">
          {successMessage && (
            <div className="mb-6 p-4 bg-green-500/10 border border-green-500/30 rounded-lg text-green-400 text-sm">
              {successMessage}
            </div>
          )}
          {paymentError && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
              {paymentError}
            </div>
          )}

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8"
          >
            <h2 className="text-lg font-semibold text-white mb-4">Current Plan</h2>
            {userLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading...
              </div>
            ) : (
              <SubscriptionPanel
                subscription={subscription}
                projectQuota={quota}
                onBuyAiCredits={initiateAiCreditTopupPayment}
              />
            )}
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <h2 className="text-lg font-semibold text-white mb-6">Upgrade Your Plan</h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {plans.map((plan, index) => {
                const Icon = plan.icon
                const isCurrentPlan = subscription.plan === plan.id

                return (
                  <motion.div
                    key={plan.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 + index * 0.1 }}
                  >
                    <Card
                      className={`h-full bg-gradient-to-br ${plan.color} border ${plan.borderColor} ${
                        isCurrentPlan ? "ring-2 ring-cinematic-orange" : ""
                      }`}
                    >
                      <CardHeader>
                        <div className="flex items-center gap-3 mb-2">
                          <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center">
                            <Icon className="w-6 h-6 text-white" />
                          </div>
                          {isCurrentPlan && (
                            <span className="px-2 py-1 text-xs rounded-full bg-cinematic-orange/20 text-cinematic-orange">
                              Current
                            </span>
                          )}
                        </div>
                        <CardTitle className="text-2xl font-bold text-white">{plan.name}</CardTitle>
                        <p className="text-xs font-medium text-white/60">{plan.positioning}</p>
                        <div className="flex items-baseline gap-1">
                          <span className="text-3xl font-bold text-white">{plan.price}</span>
                          <span className="text-muted-foreground">/{plan.period}</span>
                        </div>
                        <p className="text-xs text-white/50 pt-1 border-l-2 border-cinematic-orange/30 pl-2 mt-1">
                          {plan.upgradeHint}
                        </p>
                      </CardHeader>
                      <CardContent>
                        <ul className="space-y-3 mb-6">
                          {plan.features.map((feature) => (
                            <li key={feature} className="flex items-start gap-2">
                              <Check className="w-5 h-5 text-green-400 flex-shrink-0" />
                              <span className="text-sm text-white/80">{feature}</span>
                            </li>
                          ))}
                        </ul>
                        <Button
                          className={`w-full ${
                            isCurrentPlan
                              ? "bg-white/10 text-white cursor-default"
                              : plan.id === "premium"
                              ? "bg-cinematic-orange text-black hover:bg-cinematic-orange/90"
                              : "bg-white text-black hover:bg-white/90"
                          }`}
                          disabled={isCurrentPlan || plan.id === "free" || isPaymentLoading}
                          onClick={() => handleUpgrade(plan.id)}
                        >
                          {isPaymentLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                          {isCurrentPlan ? "Current Plan" : plan.id === "free" ? "Free Plan" : "Upgrade"}
                        </Button>
                      </CardContent>
                    </Card>
                  </motion.div>
                )
              })}
            </div>
            <p className="mt-4 text-center text-sm text-muted-foreground">
              AI credits are used based on content length and complexity.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="mt-12"
          >
            <h2 className="text-lg font-semibold text-white mb-4">Frequently Asked Questions</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                {
                  q: "Can I cancel my subscription anytime?",
                  a: "You can stop renewing by not purchasing again when your period ends. Access stays active until the end of the period you already paid for. For cancellations or refunds, contact support per our billing policy.",
                },
                {
                  q: "What happens when I reach my project limit?",
                  a: "Free includes 3 lifetime project creations, so deleting does not restore credits. Paid plans use active project slots: delete existing projects or upgrade when you need more room.",
                },
                {
                  q: "Can I change my plan later?",
                  a: "You can upgrade to Pro or Premium anytime from this page via checkout. Plan changes are applied through our payment provider; there is no self-serve downgrade button here—contact support if you need to change or cancel a paid plan.",
                },
                {
                  q: "Is there a free trial?",
                  a: "Yes. The Free plan includes 3 lifetime project creations, drafting tools, and watermarked PDFs. You can buy a one-time clean PDF download for ₹99 or upgrade to Pro for clean export and the full set of pro writing tools.",
                },
              ].map((faq, index) => (
                <div key={index} className="bg-card/50 border border-white/10 rounded-lg p-4">
                  <h3 className="font-medium text-white mb-2">{faq.q}</h3>
                  <p className="text-sm text-muted-foreground">{faq.a}</p>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </main>
  )
}

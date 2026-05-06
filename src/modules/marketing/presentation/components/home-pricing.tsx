"use client"

import { motion, AnimatePresence } from "framer-motion"
import { Check, Sparkles, Zap, Crown, ArrowRight } from "lucide-react"
import Link from "next/link"
import { Button } from "@/ui/components/button"
import { useState } from "react"
import {
  PRO_MONTHLY_INR,
  PRO_YEARLY_INR,
  PREMIUM_MONTHLY_INR,
  PREMIUM_YEARLY_INR,
  SAVINGS_PRO_ANNUAL_INR,
  SAVINGS_PREMIUM_ANNUAL_INR,
} from "@/modules/billing/domain/pricing-inr"

const plans = [
  {
    id: "free",
    icon: Sparkles,
    name: "Free",
    positioning: "Learn & Explore",
    monthlyPrice: 0,
    yearlyPrice: 0,
    period: "forever",
    description: "Explore drafting, formatting, references, and exports before upgrading for production output.",
    upgradeHint: "Upgrade when you need higher quality generation, clean exports, and more daily headroom.",
    cta: "Start for Free",
    ctaHref: "/signup",
    highlight: false,
    features: [
      "100K AI credits/month",
      "Up to ~800 words per generation",
      "Fast drafting mode",
      "5 AI generations per day",
      "3 lifetime project creations (not restored on delete)",
      "Tamil & English screenplay support",
      "Watermarked export (print & email PDF)",
      "One time clean PDF download available for ₹99",
      "Scene references to study craft",
    ],
  },
  {
    id: "pro",
    icon: Zap,
    name: "Pro",
    positioning: "Build & Create",
    monthlyPrice: PRO_MONTHLY_INR,
    yearlyPrice: PRO_YEARLY_INR,
    period: "per month",
    description: "Write production ready scripts faster with stronger scenes, better dialogue, and clean exports.",
    upgradeHint: "For studios and teams, Premium adds headroom and advanced workflow (see below).",
    cta: "Upgrade to Pro",
    ctaHref: "/signup",
    highlight: true,
    badge: "Most Popular",
    savings: `Save ₹${SAVINGS_PRO_ANNUAL_INR.toLocaleString("en-IN")}/year`,
    features: [
      "600K AI credits/month",
      "Smart routing for better quality outputs",
      "Faster generation vs Free",
      "Up to 25 projects",
      "High quality Tamil & English screenplay generation",
      "Dialogue improver and scene continuation",
      "Style rewrite: mass, emotional, snappy, or grounded (Pro and Premium)",
      "Up to 50 AI generations per day (fair use; see plan)",
      "Clean PDF export (no preview watermark) + email PDF",
      "Need more? Add 100K AI credits for ₹99",
    ],
  },
  {
    id: "premium",
    icon: Crown,
    name: "Premium",
    positioning: "Produce & Scale",
    monthlyPrice: PREMIUM_MONTHLY_INR,
    yearlyPrice: PREMIUM_YEARLY_INR,
    period: "per month",
    description: "AI writing partner for professional filmmaking: room for every draft, and priority quality.",
    upgradeHint: "For writers who need one place for professional grade drafts without juggling multiple tools.",
    cta: "Go Premium",
    ctaHref: "/signup",
    highlight: false,
    savings: `Save ₹${SAVINGS_PREMIUM_ANNUAL_INR.toLocaleString("en-IN")}/year`,
    features: [
      "2M AI credits/month",
      "Priority Cinematic routing",
      "Longer outputs for big drafts (up to 2x on long-form tasks)",
      "Unlimited projects (fair use; high cap in billing)",
      "All Pro features + headroom for large productions",
      "Style rewrite and dialogue tools at full strength",
      "Priority for generation capacity when the service is busy",
      "Fair usage policy applies",
      "Need more? Add 100K AI credits for ₹99",
      "Custom tone & production instructions (project level; coming soon). Ask sales",
    ],
  },
]

export function HomePricingSection() {
  const [isYearly, setIsYearly] = useState(false)

  return (
    <section
      id="pricing"
      aria-label="Pricing"
      className="py-24 px-4 sm:px-6 lg:px-8 scroll-mt-16 relative overflow-hidden"
    >
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[600px] bg-cinematic-orange/5 rounded-full blur-3xl" />
      </div>

      <div className="max-w-6xl mx-auto relative">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <motion.span
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="inline-block text-xs font-semibold tracking-widest uppercase text-cinematic-orange mb-3 px-4 py-1.5 rounded-full bg-cinematic-orange/10 border border-cinematic-orange/20"
          >
            Pricing
          </motion.span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold font-display text-white mb-4">
            Finish scripts faster,{" "}
            <span className="bg-gradient-to-r from-cinematic-orange to-amber-500 bg-clip-text text-transparent">
              not just trying AI
            </span>
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto text-lg mb-8">
            Clear tiers: try for free, ship with Pro, scale with Premium. No hidden model jargon, just better scenes and
            dialogue for Tamil and English cinema.
          </p>

          <div className="mx-auto flex w-full max-w-md flex-col gap-2 rounded-2xl border border-white/10 bg-white/5 p-1 sm:mx-0 sm:inline-flex sm:w-auto sm:flex-row sm:rounded-full sm:gap-0">
            <button
              type="button"
              onClick={() => setIsYearly(false)}
              className={`relative min-h-[44px] flex-1 rounded-xl px-5 py-2.5 text-sm font-medium transition-all duration-300 sm:min-h-0 sm:flex-none sm:rounded-full sm:px-6 ${
                !isYearly
                  ? "bg-cinematic-orange text-black shadow-lg shadow-cinematic-orange/25"
                  : "text-white/70 hover:text-white"
              }`}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setIsYearly(true)}
              className={`relative min-h-[44px] flex-1 rounded-xl px-5 py-2.5 text-sm font-medium transition-all duration-300 sm:min-h-0 sm:flex-none sm:rounded-full sm:px-6 ${
                isYearly
                  ? "bg-cinematic-orange text-black shadow-lg shadow-cinematic-orange/25"
                  : "text-white/70 hover:text-white"
              }`}
            >
              <span className="inline-flex w-full items-center justify-center gap-2">
                Yearly
                {!isYearly && (
                  <span className="shrink-0 rounded-full bg-green-500 px-2 py-0.5 text-[10px] font-bold text-white">
                    20% off
                  </span>
                )}
              </span>
            </button>
          </div>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 items-stretch">
          {plans.map((plan, index) => {
            const Icon = plan.icon
            const price = isYearly ? plan.yearlyPrice : plan.monthlyPrice
            const displayPrice = price === 0 ? "₹0" : `₹${price.toLocaleString()}`

            return (
              <motion.div
                key={plan.id}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className={`relative rounded-2xl border transition-all duration-500 ${
                  plan.highlight
                    ? "border-cinematic-orange/50 bg-gradient-to-b from-cinematic-orange/10 via-cinematic-orange/5 to-transparent shadow-2xl shadow-cinematic-orange/10"
                    : "border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.03]"
                }`}
              >
                {plan.badge && (
                  <div className="absolute top-0 left-0 right-0 flex justify-center">
                    <motion.div
                      initial={{ y: -10, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      transition={{ delay: 0.3 }}
                      className="px-4 py-1.5 rounded-b-xl bg-cinematic-orange text-black text-xs font-bold shadow-lg shadow-cinematic-orange/25"
                    >
                      {plan.badge}
                    </motion.div>
                  </div>
                )}

                {plan.highlight && (
                  <div className="absolute -inset-px rounded-2xl bg-gradient-to-b from-cinematic-orange/20 via-transparent to-transparent opacity-50 blur-sm" />
                )}

                <div className={`relative p-8 ${plan.badge ? "pt-10" : ""}`}>
                  <div className="flex items-center gap-3 mb-6">
                    <div
                      className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                        plan.highlight
                          ? "bg-cinematic-orange/20 border border-cinematic-orange/30"
                          : "bg-white/10 border border-white/10"
                      }`}
                    >
                      <Icon className={`w-6 h-6 ${plan.highlight ? "text-cinematic-orange" : "text-white"}`} />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-white">{plan.name}</h3>
                      <p className="text-xs text-white/55">{plan.positioning}</p>
                      {plan.savings && isYearly && (
                        <span className="text-xs text-green-400 font-medium">{plan.savings}</span>
                      )}
                    </div>
                  </div>

                  <div className="mb-6">
                    <div className="flex items-baseline gap-2">
                      <AnimatePresence mode="wait">
                        <motion.span
                          key={isYearly ? "yearly" : "monthly"}
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 10 }}
                          transition={{ duration: 0.2 }}
                          className="text-4xl font-bold text-white"
                        >
                          {displayPrice}
                        </motion.span>
                      </AnimatePresence>
                      <span className="text-muted-foreground text-sm">/ {plan.period}</span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{plan.description}</p>
                    {"upgradeHint" in plan && plan.upgradeHint && (
                      <p className="text-xs text-white/50 mt-2 border-l-2 border-cinematic-orange/40 pl-3">{plan.upgradeHint}</p>
                    )}
                  </div>

                  <Button
                    asChild
                      className={`w-full h-12 font-semibold rounded-xl transition-all duration-300 group ${
                        plan.highlight
                          ? "bg-cinematic-orange text-black hover:bg-cinematic-orange/90 hover:shadow-lg hover:shadow-cinematic-orange/25 hover:-translate-y-0.5"
                          : "bg-white/10 text-white hover:bg-white/20 border border-white/10"
                      }`}
                    >
                    <Link href={plan.ctaHref} className="mb-8">
                      {plan.cta}
                      <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                    </Link>
                  </Button>

                  <ul className="space-y-3">
                    {plan.features.map((feature, i) => (
                      <motion.li
                        key={feature}
                        initial={{ opacity: 0, x: -10 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: i * 0.05 }}
                        className="flex items-start gap-3"
                      >
                        <div
                          className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                            plan.highlight ? "bg-cinematic-orange/20" : "bg-white/10"
                          }`}
                        >
                          <Check className={`w-3 h-3 ${plan.highlight ? "text-cinematic-orange" : "text-white/70"}`} />
                        </div>
                        <span className="text-sm text-white/80">{feature}</span>
                      </motion.li>
                    ))}
                  </ul>
                </div>
              </motion.div>
            )
          })}
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="text-center mt-12"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10">
            <Check className="w-4 h-4 text-green-500" />
            <span className="text-sm text-muted-foreground">
              AI credits are used based on content length and complexity
            </span>
          </div>
        </motion.div>
      </div>
    </section>
  )
}

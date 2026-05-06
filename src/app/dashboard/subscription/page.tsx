"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { ArrowLeft, Check, Sparkles, Zap, Crown, ExternalLink, Loader2, ReceiptText } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import Link from "next/link"
import { Button } from "@/ui/components/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/ui/components/card"
import { SubscriptionPanel } from "@/modules/billing/presentation/components/subscription-panel"
import { useUser } from "@/modules/account/presentation/hooks/use-user"
import { useProjects } from "@/modules/projects/presentation/hooks/use-projects"
import { useRazorpay, type SubscriptionTaxProfile } from "@/modules/billing/presentation/hooks/use-razorpay"
import type { BillingCycle, Subscription } from "@/shared/types/project"
import { toUISubscription } from "@/modules/billing/domain/subscription"
import {
  PREMIUM_MONTHLY_INR,
  PREMIUM_YEARLY_INR,
  PRO_MONTHLY_INR,
  PRO_YEARLY_INR,
  SAVINGS_PREMIUM_ANNUAL_INR,
  SAVINGS_PRO_ANNUAL_INR,
} from "@/modules/billing/domain/pricing-inr"
import { parseErrorResponse } from "@/core/http/client"
import type { Database } from "@/infrastructure/db/types/database"

const RUPEE = "\u20b9"

type PlanId = "free" | "pro" | "premium"
type BillingSubscription = Database["public"]["Tables"]["subscriptions"]["Row"]

type BillingHistoryItem = {
  id?: string
  event_type?: string | null
  status?: string | null
  plan?: string | null
  billing_cycle?: string | null
  amount_paise?: number | null
  currency?: string | null
  created_at?: string | null
  invoice_number?: string | null
  invoice_url?: string | null
  issued_at?: string | null
  razorpay_payment_id?: string | null
  razorpay_invoice_id?: string | null
  razorpay_subscription_id?: string | null
}

type BillingHistoryResponse = {
  ok?: boolean
  subscription: BillingSubscription | null
  customer: {
    billing_email?: string | null
    legal_name?: string | null
    gstin?: string | null
  } | null
  ledger: BillingHistoryItem[]
  invoices: BillingHistoryItem[]
  refunds: BillingHistoryItem[]
}

type PlanCardDefinition = {
  id: PlanId
  name: string
  positioning: string
  monthlyPrice: number
  annualMonthlyPrice: number
  annualSavings: number
  icon: LucideIcon
  color: string
  borderColor: string
  upgradeHint: string
  features: string[]
}

function formatInr(amount: number): string {
  return `${RUPEE}${Math.round(amount).toLocaleString("en-IN")}`
}

function formatDate(value?: string | null): string {
  if (!value) return "Not set"
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value))
}

function humanize(value?: string | null): string {
  if (!value) return "None"
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

function annualTotal(plan: PlanCardDefinition): number {
  return plan.monthlyPrice * 12 - plan.annualSavings
}

function cleanTaxProfile(profile: SubscriptionTaxProfile): SubscriptionTaxProfile | undefined {
  const cleaned = {
    billingEmail: profile.billingEmail?.trim() || undefined,
    legalName: profile.legalName?.trim() || undefined,
    gstin: profile.gstin?.trim().toUpperCase() || undefined,
  }
  return Object.values(cleaned).some(Boolean) ? cleaned : undefined
}

const plans: PlanCardDefinition[] = [
  {
    id: "free",
    name: "Free",
    positioning: "Learn & Explore",
    monthlyPrice: 0,
    annualMonthlyPrice: 0,
    annualSavings: 0,
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
    monthlyPrice: PRO_MONTHLY_INR,
    annualMonthlyPrice: PRO_YEARLY_INR,
    annualSavings: SAVINGS_PRO_ANNUAL_INR,
    icon: Zap,
    color: "from-cinematic-blue/20 to-blue-500/20",
    borderColor: "border-cinematic-blue/30",
    upgradeHint: "Need team-sized headroom? Premium is for sustained professional throughput.",
    features: [
      "600K AI credits/month",
      "Smart routing for better quality outputs",
      "Higher quality routing vs Free",
      "50 AI generations per day",
      "Up to 25 projects",
      "Production-aimed scene generation and dialogue improver",
      "Style rewrite presets (Pro & Premium)",
      "Clean PDF & email send - no free-tier watermark",
      "More room for shot ideas + movie references",
      "Need more? Add 100K AI credits for ₹99",
    ],
  },
  {
    id: "premium",
    name: "Premium",
    positioning: "Produce & Scale",
    monthlyPrice: PREMIUM_MONTHLY_INR,
    annualMonthlyPrice: PREMIUM_YEARLY_INR,
    annualSavings: SAVINGS_PREMIUM_ANNUAL_INR,
    icon: Crown,
    color: "from-cinematic-orange/20 to-orange-500/20",
    borderColor: "border-cinematic-orange/30",
    upgradeHint: "Built for people who treat the screenplay as a product, not a one-off file.",
    features: [
      "2M AI credits/month",
      "Cinematic plan profile for production workflows",
      "Longer outputs for big drafts (up to 2x on long-form tasks)",
      "Unlimited projects (high plan cap)",
      "All Pro features with 200 AI generations per day",
      "Higher monthly and daily headroom for busy production weeks",
      "Fair usage policy applies",
      "Need more? Add 100K AI credits for ₹99",
      "Roadmap: org-friendly workflows - contact us for early access",
    ],
  },
]

function itemAmount(item: BillingHistoryItem): string | null {
  return typeof item.amount_paise === "number" ? formatInr(item.amount_paise / 100) : null
}

function BillingStatusPanel({
  history,
  loading,
  error,
  actionLoading,
  onCancel,
  onReactivate,
}: {
  history: BillingHistoryResponse | null
  loading: boolean
  error: string | null
  actionLoading: "cancel" | "reactivate" | null
  onCancel: () => void
  onReactivate: () => void
}) {
  const subscription = history?.subscription ?? null
  const recentInvoices = history?.invoices?.slice(0, 3) ?? []
  const recentLedger = history?.ledger?.slice(0, 4) ?? []
  const [selectedInvoice, setSelectedInvoice] = useState<BillingHistoryItem | null>(null)
  const [invoiceLoadingId, setInvoiceLoadingId] = useState<string | null>(null)
  const [invoiceError, setInvoiceError] = useState<string | null>(null)
  const canManageRenewal = Boolean(subscription?.razorpay_subscription_id && subscription.plan !== "free")
  const statusClass =
    subscription?.status === "active" || subscription?.status === "trialing"
      ? "text-green-300 bg-green-500/10 border-green-500/20"
      : subscription?.status === "past_due"
        ? "text-yellow-200 bg-yellow-500/10 border-yellow-500/20"
      : "text-red-300 bg-red-500/10 border-red-500/20"

  const loadInvoiceDetails = useCallback(async (invoice: BillingHistoryItem) => {
    if (!invoice.id) {
      setSelectedInvoice(invoice)
      return
    }

    setInvoiceLoadingId(invoice.id)
    setInvoiceError(null)
    try {
      const res = await fetch(`/api/billing/invoices/${invoice.id}`, {
        cache: "no-store",
        credentials: "same-origin",
      })
      if (!res.ok) {
        throw new Error(await parseErrorResponse(res, "Failed to load invoice details"))
      }
      const data = (await res.json()) as { invoice?: BillingHistoryItem }
      setSelectedInvoice(data.invoice ?? invoice)
    } catch (err) {
      setInvoiceError(err instanceof Error ? err.message : "Failed to load invoice details")
    } finally {
      setInvoiceLoadingId(null)
    }
  }, [])

  return (
    <Card className="mt-5 border-white/10 bg-card/50">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-base text-white">Billing Status</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Subscription status, renewal controls, and recent billing events.
            </p>
          </div>
          {subscription && (
            <span className={`w-fit rounded-full border px-3 py-1 text-xs font-medium ${statusClass}`}>
              {humanize(subscription.status)}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading billing...
          </div>
        ) : error ? (
          <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/10 p-3 text-sm text-yellow-100">
            {error}
          </div>
        ) : subscription ? (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg border border-white/10 bg-black/15 p-3">
                <p className="text-xs text-muted-foreground">Billing cycle</p>
                <p className="mt-1 text-sm font-semibold text-white">{humanize(subscription.billing_cycle)}</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-black/15 p-3">
                <p className="text-xs text-muted-foreground">
                  {subscription.cancel_at_period_end ? "Access ends" : "Renews on"}
                </p>
                <p className="mt-1 text-sm font-semibold text-white">{formatDate(subscription.current_period_end)}</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-black/15 p-3">
                <p className="text-xs text-muted-foreground">Grace period</p>
                <p className="mt-1 text-sm font-semibold text-white">{formatDate(subscription.grace_period_end)}</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-black/15 p-3">
                <p className="text-xs text-muted-foreground">Renewal</p>
                <p className="mt-1 text-sm font-semibold text-white">
                  {subscription.cancel_at_period_end ? "Cancels at period end" : "Auto-renewal active"}
                </p>
              </div>
            </div>

            {canManageRenewal && (
              <div className="flex flex-col gap-2 sm:flex-row">
                {subscription.cancel_at_period_end ? (
                  <Button
                    type="button"
                    className="bg-white text-black hover:bg-white/90"
                    disabled={actionLoading === "reactivate"}
                    onClick={onReactivate}
                  >
                    {actionLoading === "reactivate" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Reactivate renewal
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    className="border-red-500/30 text-red-200 hover:bg-red-500/10 hover:text-red-100"
                    disabled={actionLoading === "cancel"}
                    onClick={onCancel}
                  >
                    {actionLoading === "cancel" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Cancel renewal
                  </Button>
                )}
              </div>
            )}

            {(recentInvoices.length > 0 || recentLedger.length > 0) && (
              <div className="grid gap-4 lg:grid-cols-2">
                {recentInvoices.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/60">Recent invoices</p>
                    <div className="space-y-2">
                      {recentInvoices.map((invoice, index) => (
                        <div
                          key={invoice.id ?? invoice.razorpay_invoice_id ?? index}
                          className="grid gap-2 rounded-lg border border-white/10 bg-black/15 px-3 py-2 text-xs sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center"
                        >
                          <span className="min-w-0 truncate text-white/75">
                            {invoice.invoice_number ?? invoice.razorpay_invoice_id ?? "Invoice"}
                          </span>
                          <span className="shrink-0 text-white/50">{itemAmount(invoice) ?? humanize(invoice.status)}</span>
                          <button
                            type="button"
                            className="inline-flex w-fit items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-white/70 transition hover:bg-white/10 hover:text-white"
                            onClick={() => void loadInvoiceDetails(invoice)}
                            disabled={invoiceLoadingId === invoice.id}
                          >
                            {invoiceLoadingId === invoice.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <ReceiptText className="h-3 w-3" />
                            )}
                            Details
                          </button>
                        </div>
                      ))}
                    </div>
                    {invoiceError && <p className="mt-2 text-xs text-red-300">{invoiceError}</p>}
                  </div>
                )}
                {recentLedger.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/60">Recent events</p>
                    <div className="space-y-2">
                      {recentLedger.map((event, index) => (
                        <div
                          key={event.id ?? index}
                          className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/15 px-3 py-2 text-xs"
                        >
                          <span className="min-w-0 truncate text-white/75">{humanize(event.event_type)}</span>
                          <span className="shrink-0 text-white/50">{formatDate(event.created_at)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {selectedInvoice && (
              <div className="rounded-lg border border-white/10 bg-black/20 p-4">
                <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-white">
                      {selectedInvoice.invoice_number ?? selectedInvoice.razorpay_invoice_id ?? "Invoice details"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Issued {formatDate(selectedInvoice.issued_at ?? selectedInvoice.created_at)}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="w-fit rounded-md border border-white/10 px-2 py-1 text-xs text-white/60 transition hover:bg-white/10 hover:text-white"
                    onClick={() => setSelectedInvoice(null)}
                  >
                    Close
                  </button>
                </div>
                <div className="grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <p className="text-white/45">Status</p>
                    <p className="mt-1 text-white/80">{humanize(selectedInvoice.status)}</p>
                  </div>
                  <div>
                    <p className="text-white/45">Amount</p>
                    <p className="mt-1 text-white/80">{itemAmount(selectedInvoice) ?? "Not recorded"}</p>
                  </div>
                  <div>
                    <p className="text-white/45">Payment ID</p>
                    <p className="mt-1 truncate text-white/80">{selectedInvoice.razorpay_payment_id ?? "Not recorded"}</p>
                  </div>
                  <div>
                    <p className="text-white/45">Subscription ID</p>
                    <p className="mt-1 truncate text-white/80">
                      {selectedInvoice.razorpay_subscription_id ?? subscription?.razorpay_subscription_id ?? "Not recorded"}
                    </p>
                  </div>
                </div>
                {selectedInvoice.invoice_url && (
                  <a
                    href={selectedInvoice.invoice_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-flex items-center gap-2 text-xs font-medium text-cinematic-orange hover:text-cinematic-orange/80"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Open hosted invoice
                  </a>
                )}
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No paid billing activity has been recorded yet.</p>
        )}
      </CardContent>
    </Card>
  )
}

export default function SubscriptionPage() {
  const router = useRouter()
  const { user, profile, subscription: dbSub, loading: userLoading, refetch } = useUser()
  const { projects, quota } = useProjects()
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [paymentError, setPaymentError] = useState<string | null>(null)
  const [billingCycle, setBillingCycle] = useState<BillingCycle>("monthly")
  const [taxProfile, setTaxProfile] = useState<SubscriptionTaxProfile>({
    billingEmail: "",
    legalName: "",
    gstin: "",
  })
  const [billingHistory, setBillingHistory] = useState<BillingHistoryResponse | null>(null)
  const [billingHistoryLoading, setBillingHistoryLoading] = useState(true)
  const [billingHistoryError, setBillingHistoryError] = useState<string | null>(null)
  const [billingActionLoading, setBillingActionLoading] = useState<"cancel" | "reactivate" | null>(null)

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

      setSuccessMessage("Checkout completed. Your plan will update as soon as the webhook arrives.")
    },
    onError: (err) => {
      setPaymentError(err)
    },
  })

  const subscription: Subscription = toUISubscription(dbSub, quota?.activeUsed ?? projects.length)
  const billingSubscription = billingHistory?.subscription ?? dbSub

  useEffect(() => {
    void fetch("/api/business/subscription-view", { method: "POST" }).catch(() => {})
  }, [])

  useEffect(() => {
    setTaxProfile((current) => ({
      billingEmail: current.billingEmail || profile?.email || user?.email || "",
      legalName: current.legalName || profile?.full_name || "",
      gstin: current.gstin || "",
    }))
  }, [profile?.email, profile?.full_name, user?.email])

  const loadBillingHistory = useCallback(async () => {
    setBillingHistoryLoading(true)
    setBillingHistoryError(null)
    try {
      const res = await fetch("/api/billing/history", {
        cache: "no-store",
        credentials: "same-origin",
      })
      if (!res.ok) {
        throw new Error(await parseErrorResponse(res, "Failed to load billing history"))
      }
      const data = (await res.json()) as BillingHistoryResponse
      setBillingHistory({
        ok: data.ok,
        subscription: data.subscription ?? null,
        customer: data.customer ?? null,
        ledger: Array.isArray(data.ledger) ? data.ledger : [],
        invoices: Array.isArray(data.invoices) ? data.invoices : [],
        refunds: Array.isArray(data.refunds) ? data.refunds : [],
      })
      if (data.subscription?.billing_cycle) {
        setBillingCycle(data.subscription.billing_cycle)
      }
    } catch (err) {
      setBillingHistoryError(err instanceof Error ? err.message : "Failed to load billing history")
    } finally {
      setBillingHistoryLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadBillingHistory()
  }, [loadBillingHistory])

  const handleUpgrade = (planId: string) => {
    if (planId === "pro" || planId === "premium") {
      setPaymentError(null)
      initiatePayment(planId, billingCycle, cleanTaxProfile(taxProfile))
    }
  }

  const handleBillingAction = useCallback(
    async (action: "cancel" | "reactivate") => {
      setBillingActionLoading(action)
      setPaymentError(null)
      setSuccessMessage(null)
      try {
        const res = await fetch(`/api/billing/subscriptions/${action}`, {
          method: "POST",
          credentials: "same-origin",
        })
        if (!res.ok) {
          throw new Error(
            await parseErrorResponse(
              res,
              action === "cancel" ? "Failed to cancel renewal" : "Failed to reactivate renewal"
            )
          )
        }
        const data = (await res.json()) as { shortUrl?: string | null }
        if (action === "reactivate" && data.shortUrl) {
          window.location.assign(data.shortUrl)
          return
        }
        setSuccessMessage(action === "cancel" ? "Renewal cancellation requested." : "Renewal reactivation requested.")
        await Promise.all([loadBillingHistory(), refetch()])
        router.refresh()
      } catch (err) {
        setPaymentError(err instanceof Error ? err.message : "Billing action failed")
      } finally {
        setBillingActionLoading(null)
      }
    },
    [loadBillingHistory, refetch, router]
  )

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
              <>
                <SubscriptionPanel
                  subscription={subscription}
                  projectQuota={quota}
                  onBuyAiCredits={initiateAiCreditTopupPayment}
                />
                <BillingStatusPanel
                  history={
                    billingHistory ?? {
                      subscription: dbSub,
                      customer: null,
                      ledger: [],
                      invoices: [],
                      refunds: [],
                    }
                  }
                  loading={billingHistoryLoading}
                  error={billingHistoryError}
                  actionLoading={billingActionLoading}
                  onCancel={() => void handleBillingAction("cancel")}
                  onReactivate={() => void handleBillingAction("reactivate")}
                />
              </>
            )}
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <h2 className="text-lg font-semibold text-white mb-6">Upgrade Your Plan</h2>

            <div className="mb-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)]">
              <div className="rounded-xl border border-white/10 bg-card/40 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">Billing cycle</p>
                    <p className="text-xs text-muted-foreground">Annual pricing uses the backend annual plan IDs.</p>
                  </div>
                  <div className="flex rounded-lg border border-white/10 bg-black/20 p-1">
                    {(["monthly", "annual"] as BillingCycle[]).map((cycle) => (
                      <button
                        key={cycle}
                        type="button"
                        className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                          billingCycle === cycle
                            ? "bg-white text-black"
                            : "text-white/60 hover:bg-white/10 hover:text-white"
                        }`}
                        onClick={() => setBillingCycle(cycle)}
                      >
                        {cycle === "monthly" ? "Monthly" : "Annual"}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="text-xs text-white/50">
                  {billingCycle === "annual"
                    ? `Pro saves ${formatInr(SAVINGS_PRO_ANNUAL_INR)} per year and Premium saves ${formatInr(SAVINGS_PREMIUM_ANNUAL_INR)} per year.`
                    : "Monthly checkout keeps the current recurring monthly pricing."}
                </p>
              </div>

              <div className="rounded-xl border border-white/10 bg-card/40 p-4">
                <p className="mb-3 text-sm font-semibold text-white">Billing details</p>
                <div className="grid gap-2">
                  <input
                    type="email"
                    value={taxProfile.billingEmail ?? ""}
                    onChange={(event) =>
                      setTaxProfile((current) => ({ ...current, billingEmail: event.target.value }))
                    }
                    placeholder="Billing email"
                    className="h-9 rounded-md border border-white/10 bg-black/20 px-3 text-sm text-white placeholder:text-white/35"
                  />
                  <div className="grid gap-2 sm:grid-cols-2">
                    <input
                      type="text"
                      value={taxProfile.legalName ?? ""}
                      onChange={(event) =>
                        setTaxProfile((current) => ({ ...current, legalName: event.target.value }))
                      }
                      placeholder="Legal name"
                      className="h-9 rounded-md border border-white/10 bg-black/20 px-3 text-sm text-white placeholder:text-white/35"
                    />
                    <input
                      type="text"
                      value={taxProfile.gstin ?? ""}
                      onChange={(event) =>
                        setTaxProfile((current) => ({ ...current, gstin: event.target.value.toUpperCase() }))
                      }
                      placeholder="GSTIN optional"
                      maxLength={15}
                      className="h-9 rounded-md border border-white/10 bg-black/20 px-3 text-sm text-white placeholder:text-white/35"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {plans.map((plan, index) => {
                const Icon = plan.icon
                const isSamePlan = subscription.plan === plan.id
                const isCurrentCycle = plan.id === "free" || billingSubscription?.billing_cycle === billingCycle
                const isCurrentPlan = isSamePlan && isCurrentCycle
                const price = plan.id === "free"
                  ? formatInr(0)
                  : formatInr(billingCycle === "annual" ? plan.annualMonthlyPrice : plan.monthlyPrice)
                const buttonLabel = isCurrentPlan
                  ? "Current Plan"
                  : plan.id === "free"
                    ? "Free Plan"
                    : isSamePlan
                      ? "Switch Billing"
                      : "Upgrade"

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
                          <span className="text-3xl font-bold text-white">{price}</span>
                          <span className="text-muted-foreground">/{plan.id === "free" ? "forever" : "per month"}</span>
                        </div>
                        {plan.id !== "free" && billingCycle === "annual" && (
                          <p className="text-xs text-green-300">
                            Billed {formatInr(annualTotal(plan))}/year, save {formatInr(plan.annualSavings)}
                          </p>
                        )}
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
                          {buttonLabel}
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
                  a: "Yes. Cancel renewal from Billing Status. Paid access stays active until the end of the period you already paid for.",
                },
                {
                  q: "What happens when I reach my project limit?",
                  a: "Free includes 3 lifetime project creations, so deleting does not restore credits. Paid plans use active project slots: delete existing projects or upgrade when you need more room.",
                },
                {
                  q: "Can I change my plan later?",
                  a: "You can upgrade or switch billing cycle from this page. For downgrades and refunds, contact support so we can handle the billing-provider transition correctly.",
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

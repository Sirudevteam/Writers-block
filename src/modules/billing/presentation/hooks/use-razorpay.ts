"use client"

import { useState, useCallback, useRef } from "react"
import { parseErrorResponse } from "@/core/http/client"
import type { BillingCycle } from "@/shared/types/project"

type PaymentSuccessResult =
  | { status: "applied"; purpose: "subscription"; subscriptionId: string; paymentId?: string }
  | { status: "pending_webhook"; purpose: "subscription"; subscriptionId: string; paymentId?: string }
  | { status: "applied"; paymentId: string; purpose: "pdf_clean_export"; projectId: string }
  | { status: "pending_webhook"; paymentId: string; purpose: "pdf_clean_export"; projectId: string }
  | { status: "applied"; paymentId: string; purpose: "ai_credit_topup"; credits: number }
  | { status: "pending_webhook"; paymentId: string; purpose: "ai_credit_topup"; credits: number }

type PaymentOrderPayload =
  | { purpose: "pdf_clean_export"; projectId: string }
  | { purpose: "ai_credit_topup"; pack: "100k" }

type SubscriptionCheckoutResponse = {
  ok?: boolean
  subscriptionId?: string
  shortUrl?: string | null
  keyId?: string
  planName?: string
}

export type SubscriptionTaxProfile = {
  billingEmail?: string
  legalName?: string
  gstin?: string
  billingAddress?: Record<string, unknown>
}

interface RazorpayOptions {
  onSuccess?: (result: PaymentSuccessResult) => void
  onError?: (error: string) => void
}

declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => { open(): void }
  }
}

function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (document.querySelector('script[src*="razorpay"]')) {
      resolve(true)
      return
    }
    const script = document.createElement("script")
    script.src = "https://checkout.razorpay.com/v1/checkout.js"
    script.onload = () => resolve(true)
    script.onerror = () => resolve(false)
    document.body.appendChild(script)
  })
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForSubscriptionWebhook(
  subscriptionId: string,
  paymentId?: string
): Promise<boolean> {
  for (let attempt = 0; attempt < 15; attempt += 1) {
    await sleep(1500)
    const subRes = await fetch("/api/subscription", {
      credentials: "same-origin",
      cache: "no-store",
    })
    if (!subRes.ok) continue

    const subscription = (await subRes.json()) as {
      razorpay_subscription_id?: string | null
      razorpay_payment_id?: string | null
      status?: string | null
    } | null

    if (subscription?.razorpay_subscription_id !== subscriptionId) continue
    if (paymentId && subscription.razorpay_payment_id && subscription.razorpay_payment_id !== paymentId) {
      continue
    }
    if (subscription.status === "active" || subscription.status === "trialing") {
      return true
    }
  }

  return false
}

export function useRazorpay({ onSuccess, onError }: RazorpayOptions = {}) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const checkoutLock = useRef(false)

  const failCheckout = useCallback(
    (message: string) => {
      setError(message)
      onError?.(message)
      setIsLoading(false)
      checkoutLock.current = false
    },
    [onError]
  )

  const releaseCheckout = useCallback(() => {
    setIsLoading(false)
    checkoutLock.current = false
  }, [])

  const startOrderPayment = useCallback(
    async (payload: PaymentOrderPayload) => {
      if (checkoutLock.current) {
        return
      }
      checkoutLock.current = true
      setIsLoading(true)
      setError(null)

      const loaded = await loadRazorpayScript()
      if (!loaded) {
        failCheckout("Failed to load payment gateway. Please check your connection.")
        return
      }

      try {
        const orderRes = await fetch("/api/razorpay/create-order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })

        if (!orderRes.ok) {
          failCheckout(await parseErrorResponse(orderRes, "Failed to create payment order"))
          return
        }

        const { orderId, amount, currency, keyId, planName } = await orderRes.json()

        const options = {
          key: keyId,
          amount,
          currency,
          name: "Writers Block",
          description: planName,
          order_id: orderId,
          handler: async (response: {
            razorpay_order_id: string
            razorpay_payment_id: string
            razorpay_signature: string
          }) => {
            const verifyRes = await fetch("/api/razorpay/verify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              }),
            })

            if (verifyRes.ok) {
              const verifyData = (await verifyRes.json()) as {
                applied?: boolean
                paymentId?: string
                purpose?: "pdf_clean_export" | "ai_credit_topup"
                projectId?: string
                credits?: number
              }

              if (verifyData.purpose === "pdf_clean_export") {
                const paymentId = verifyData.paymentId ?? response.razorpay_payment_id
                const projectId =
                  verifyData.projectId ??
                  ("projectId" in payload ? payload.projectId : "")

                onSuccess?.({
                  status: verifyData.applied ? "applied" : "pending_webhook",
                  paymentId,
                  purpose: "pdf_clean_export",
                  projectId,
                })
                releaseCheckout()
                return
              }

              if (verifyData.purpose === "ai_credit_topup") {
                onSuccess?.({
                  status: verifyData.applied ? "applied" : "pending_webhook",
                  paymentId: verifyData.paymentId ?? response.razorpay_payment_id,
                  purpose: "ai_credit_topup",
                  credits: verifyData.credits ?? 100_000,
                })
                releaseCheckout()
                return
              }

              failCheckout("Payment verification response was invalid.")
              return
            } else {
              failCheckout(await parseErrorResponse(verifyRes, "Payment verification failed"))
              return
            }

            releaseCheckout()
          },
          prefill: {},
          theme: { color: "#F97316" },
          modal: {
            ondismiss: releaseCheckout,
          },
        }

        const rzp = new window.Razorpay(options)
        rzp.open()
      } catch (err) {
        failCheckout(err instanceof Error ? err.message : "Payment failed. Please try again.")
      }
    },
    [failCheckout, onSuccess, releaseCheckout]
  )

  const startSubscriptionCheckout = useCallback(
    async (plan: "pro" | "premium", billingCycle: BillingCycle, taxProfile?: SubscriptionTaxProfile) => {
      if (checkoutLock.current) {
        return
      }
      checkoutLock.current = true
      setIsLoading(true)
      setError(null)

      const loaded = await loadRazorpayScript()
      if (!loaded) {
        failCheckout("Failed to load payment gateway. Please check your connection.")
        return
      }

      try {
        const checkoutRes = await fetch("/api/billing/subscriptions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plan, billingCycle, taxProfile }),
        })

        if (!checkoutRes.ok) {
          failCheckout(await parseErrorResponse(checkoutRes, "Failed to create subscription checkout"))
          return
        }

        const checkout = (await checkoutRes.json()) as SubscriptionCheckoutResponse
        const subscriptionId = checkout.subscriptionId
        if (!subscriptionId) {
          failCheckout("Subscription checkout response was missing a subscription id.")
          return
        }

        if (!checkout.keyId && checkout.shortUrl) {
          window.location.assign(checkout.shortUrl)
          return
        }

        if (!checkout.keyId) {
          failCheckout("Payment gateway key is missing from subscription checkout.")
          return
        }

        const options = {
          key: checkout.keyId,
          name: "Writers Block",
          description: checkout.planName ?? `${plan} subscription`,
          subscription_id: subscriptionId,
          handler: async (response: {
            razorpay_payment_id?: string
            razorpay_subscription_id?: string
            razorpay_signature?: string
          }) => {
            const resolvedSubscriptionId = response.razorpay_subscription_id ?? subscriptionId
            const paymentId = response.razorpay_payment_id
            const applied = await waitForSubscriptionWebhook(resolvedSubscriptionId, paymentId)
            onSuccess?.({
              status: applied ? "applied" : "pending_webhook",
              purpose: "subscription",
              subscriptionId: resolvedSubscriptionId,
              paymentId,
            })
            releaseCheckout()
          },
          prefill: {},
          theme: { color: "#F97316" },
          modal: {
            ondismiss: releaseCheckout,
          },
        }

        const rzp = new window.Razorpay(options)
        rzp.open()
      } catch (err) {
        failCheckout(err instanceof Error ? err.message : "Subscription checkout failed. Please try again.")
      }
    },
    [failCheckout, onSuccess, releaseCheckout]
  )

  const initiatePayment = useCallback(
    async (plan: "pro" | "premium", billingCycle: BillingCycle = "monthly", taxProfile?: SubscriptionTaxProfile) => {
      await startSubscriptionCheckout(plan, billingCycle, taxProfile)
    },
    [startSubscriptionCheckout]
  )

  const initiatePdfExportPayment = useCallback(
    async (projectId: string) => {
      await startOrderPayment({ purpose: "pdf_clean_export", projectId })
    },
    [startOrderPayment]
  )

  const initiateAiCreditTopupPayment = useCallback(async () => {
    await startOrderPayment({ purpose: "ai_credit_topup", pack: "100k" })
  }, [startOrderPayment])

  return { initiatePayment, initiatePdfExportPayment, initiateAiCreditTopupPayment, isLoading, error }
}

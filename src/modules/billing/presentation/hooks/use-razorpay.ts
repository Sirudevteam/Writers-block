"use client"

import { useState, useCallback, useRef } from "react"
import type { BillingCycle } from "@/shared/types/project"

type PaymentSuccessResult =
  | { status: "applied"; paymentId: string; purpose: "subscription" }
  | { status: "pending_webhook"; paymentId: string; purpose: "subscription" }
  | { status: "applied"; paymentId: string; purpose: "pdf_clean_export"; projectId: string }
  | { status: "pending_webhook"; paymentId: string; purpose: "pdf_clean_export"; projectId: string }
  | { status: "applied"; paymentId: string; purpose: "ai_credit_topup"; credits: number }
  | { status: "pending_webhook"; paymentId: string; purpose: "ai_credit_topup"; credits: number }

type PaymentOrderPayload =
  | { plan: "pro" | "premium"; billingCycle: BillingCycle }
  | { purpose: "pdf_clean_export"; projectId: string }
  | { purpose: "ai_credit_topup"; pack: "100k" }

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

export function useRazorpay({ onSuccess, onError }: RazorpayOptions = {}) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const checkoutLock = useRef(false)

  const startPayment = useCallback(
    async (payload: PaymentOrderPayload) => {
      if (checkoutLock.current) {
        return
      }
      checkoutLock.current = true
      setIsLoading(true)
      setError(null)

      const loaded = await loadRazorpayScript()
      if (!loaded) {
        const msg = "Failed to load payment gateway. Please check your connection."
        setError(msg)
        onError?.(msg)
        setIsLoading(false)
        checkoutLock.current = false
        return
      }

      const orderRes = await fetch("/api/razorpay/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (!orderRes.ok) {
        const data = await orderRes.json()
        const msg = data.error || "Failed to create payment order"
        setError(msg)
        onError?.(msg)
        setIsLoading(false)
        checkoutLock.current = false
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
              setIsLoading(false)
              checkoutLock.current = false
              return
            }

            if (verifyData.purpose === "ai_credit_topup") {
              onSuccess?.({
                status: verifyData.applied ? "applied" : "pending_webhook",
                paymentId: verifyData.paymentId ?? response.razorpay_payment_id,
                purpose: "ai_credit_topup",
                credits: verifyData.credits ?? 100_000,
              })
              setIsLoading(false)
              checkoutLock.current = false
              return
            }

            if (verifyData.applied && verifyData.paymentId) {
              onSuccess?.({
                status: "applied",
                paymentId: verifyData.paymentId,
                purpose: "subscription",
              })
            } else {
              let webhookApplied = false
              for (let attempt = 0; attempt < 15; attempt += 1) {
                await sleep(1500)
                const subRes = await fetch("/api/subscription", {
                  credentials: "same-origin",
                  cache: "no-store",
                })
                if (!subRes.ok) {
                  continue
                }

                const subscription = (await subRes.json()) as { razorpay_payment_id?: string | null } | null
                if (
                  verifyData.paymentId &&
                  subscription?.razorpay_payment_id === verifyData.paymentId
                ) {
                  webhookApplied = true
                  onSuccess?.({
                    status: "applied",
                    paymentId: verifyData.paymentId,
                    purpose: "subscription",
                  })
                  break
                }
              }

              if (!webhookApplied) {
                onSuccess?.({
                  status: "pending_webhook",
                  paymentId: verifyData.paymentId ?? response.razorpay_payment_id,
                  purpose: "subscription",
                })
              }
            }
          } else {
            const data = await verifyRes.json()
            const msg = data.error || "Payment verification failed"
            setError(msg)
            onError?.(msg)
          }
          setIsLoading(false)
          checkoutLock.current = false
        },
        prefill: {},
        theme: { color: "#F97316" },
        modal: {
          ondismiss: () => {
            setIsLoading(false)
            checkoutLock.current = false
          },
        },
      }

      const rzp = new window.Razorpay(options)
      rzp.open()
    },
    [onSuccess, onError]
  )

  const initiatePayment = useCallback(
    async (plan: "pro" | "premium", billingCycle: BillingCycle = "monthly") => {
      await startPayment({ plan, billingCycle })
    },
    [startPayment]
  )

  const initiatePdfExportPayment = useCallback(
    async (projectId: string) => {
      await startPayment({ purpose: "pdf_clean_export", projectId })
    },
    [startPayment]
  )

  const initiateAiCreditTopupPayment = useCallback(async () => {
    await startPayment({ purpose: "ai_credit_topup", pack: "100k" })
  }, [startPayment])

  return { initiatePayment, initiatePdfExportPayment, initiateAiCreditTopupPayment, isLoading, error }
}

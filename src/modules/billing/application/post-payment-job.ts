import { Client } from "@upstash/qstash"
import { z } from "zod"

let client: Client | null | undefined

export const razorpayPostPaymentJobSchema = z.object({
  razorpayPaymentId: z.string().min(1).max(120),
  razorpayOrderId: z.string().min(1).max(120),
  userId: z.string().uuid(),
  plan: z.enum(["pro", "premium"]),
  billingCycle: z.enum(["monthly", "annual"]),
  amountPaise: z.number().int().nonnegative(),
  currentPeriodEnd: z.string().min(1),
})

export type RazorpayPostPaymentJobPayload = z.infer<typeof razorpayPostPaymentJobSchema>

export function isProductionRuntime(): boolean {
  return process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production"
}

function getQstashClient(): Client | null {
  if (client !== undefined) return client
  const token = process.env.QSTASH_TOKEN
  client = token ? new Client({ token }) : null
  return client
}

function getPublicJobBaseUrl(): string | null {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  if (!raw) return null
  return raw.replace(/\/+$/, "")
}

export function getRazorpayPostPaymentJobUrl(): string | null {
  const base = getPublicJobBaseUrl()
  return base ? `${base}/api/jobs/razorpay-post-payment` : null
}

function missingQstashConfig(): string[] {
  const missing: string[] = []
  if (!process.env.QSTASH_TOKEN) missing.push("QSTASH_TOKEN")
  if (!process.env.QSTASH_CURRENT_SIGNING_KEY) missing.push("QSTASH_CURRENT_SIGNING_KEY")
  if (!process.env.QSTASH_NEXT_SIGNING_KEY) missing.push("QSTASH_NEXT_SIGNING_KEY")
  if (!process.env.NEXT_PUBLIC_SITE_URL) missing.push("NEXT_PUBLIC_SITE_URL")
  return missing
}

export async function enqueueRazorpayPostPaymentJob(
  payload: RazorpayPostPaymentJobPayload
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const missing = missingQstashConfig()
  if (missing.length > 0) {
    return { ok: false, reason: `Missing QStash config: ${missing.join(", ")}` }
  }

  const qstash = getQstashClient()
  const url = getRazorpayPostPaymentJobUrl()
  if (!qstash || !url) {
    return { ok: false, reason: "QStash client or destination URL is unavailable" }
  }

  await qstash.publishJSON({
    url,
    body: payload,
    retries: 5,
    retryDelay: "min(60000, pow(2, retried) * 1000)",
    contentBasedDeduplication: true,
  })

  return { ok: true }
}

import { NextRequest, NextResponse } from "next/server"
import { Receiver } from "@upstash/qstash"
import { createAdminClient } from "@/infrastructure/db/supabase/admin"
import { sendPaymentConfirmation } from "@/infrastructure/email/email-service"
import {
  getRazorpayPostPaymentJobUrl,
  razorpayPostPaymentJobSchema,
  type RazorpayPostPaymentJobPayload,
} from "@/modules/billing/application/post-payment-job"
import { requestHasInternalApiSecret } from "@/core/security/internal-api"
import type { Database } from "@/infrastructure/db/types/database"

export const dynamic = "force-dynamic"

const JOB_HEADERS = { "Cache-Control": "private, no-store, max-age=0" } as const

type AdminClient = ReturnType<typeof createAdminClient>
type PostProcessJobRow = {
  razorpay_payment_id: string
  subscription_event_inserted_at: string | null
  business_event_logged_at: string | null
  email_sent_at: string | null
}

function masterAdminSchema(admin: AdminClient) {
  return (admin as any).schema("master_admin")
}

function receiverFromEnv(): Receiver | null {
  const currentSigningKey = process.env.QSTASH_CURRENT_SIGNING_KEY
  const nextSigningKey = process.env.QSTASH_NEXT_SIGNING_KEY
  if (!currentSigningKey || !nextSigningKey) return null
  return new Receiver({ currentSigningKey, nextSigningKey })
}

async function verifyQstashRequest(req: NextRequest, rawBody: string): Promise<boolean> {
  if (requestHasInternalApiSecret(req)) return true

  const receiver = receiverFromEnv()
  const url = getRazorpayPostPaymentJobUrl()
  const signature = req.headers.get("upstash-signature")

  if (!receiver || !url || !signature) return false

  try {
    return await receiver.verify({
      signature,
      body: rawBody,
      url,
    })
  } catch {
    return false
  }
}

async function claimJob(admin: AdminClient, payload: RazorpayPostPaymentJobPayload) {
  const { data, error } = await (admin as any).rpc("claim_payment_post_process_job", {
    p_payment_id: payload.razorpayPaymentId,
    p_order_id: payload.razorpayOrderId,
    p_user_id: payload.userId,
    p_plan: payload.plan,
    p_billing_cycle: payload.billingCycle,
    p_amount_paise: payload.amountPaise,
    p_current_period_end: payload.currentPeriodEnd,
  })
  if (error) throw new Error(error.message)
  return data as { status: "claimed" | "completed" | "processing"; job?: PostProcessJobRow }
}

async function markJobStep(
  admin: AdminClient,
  paymentId: string,
  column: "subscription_event_inserted_at" | "business_event_logged_at" | "email_sent_at"
) {
  const now = new Date().toISOString()
  const { error } = await masterAdminSchema(admin)
    .from("payment_post_process_jobs")
    .update({ [column]: now, updated_at: now })
    .eq("razorpay_payment_id", paymentId)
    .is(column, null)
  if (error) throw new Error(error.message)
}

async function completeJob(admin: AdminClient, paymentId: string) {
  const { error } = await (admin as any).rpc("complete_payment_post_process_job", {
    p_payment_id: paymentId,
  })
  if (error) throw new Error(error.message)
}

async function failJob(admin: AdminClient, paymentId: string, errorMessage: string) {
  const { error } = await (admin as any).rpc("fail_payment_post_process_job", {
    p_payment_id: paymentId,
    p_error: errorMessage,
  })
  if (error) {
    console.error("[razorpay-post-payment-job] failed to mark job failed:", error.message)
  }
}

async function ensureSubscriptionEvent(admin: AdminClient, payload: RazorpayPostPaymentJobPayload) {
  const { data: existing, error: lookupError } = await admin
    .from("subscription_events")
    .select("id")
    .eq("razorpay_payment_id", payload.razorpayPaymentId)
    .eq("event_type", "activated")
    .maybeSingle()

  if (lookupError) throw new Error(lookupError.message)
  if (existing) return

  const insert: Database["public"]["Tables"]["subscription_events"]["Insert"] = {
    user_id: payload.userId,
    event_type: "activated",
    to_plan: payload.plan,
    billing_cycle: payload.billingCycle,
    razorpay_payment_id: payload.razorpayPaymentId,
  }
  const { error } = await admin.from("subscription_events").insert(insert)
  if (error && error.code !== "23505") throw new Error(error.message)
}

async function sendConfirmationEmail(admin: AdminClient, payload: RazorpayPostPaymentJobPayload) {
  const { data: profile, error } = await admin
    .from("profiles")
    .select("email")
    .eq("id", payload.userId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!profile?.email) return

  await sendPaymentConfirmation(
    profile.email,
    payload.plan,
    payload.amountPaise,
    new Date(payload.currentPeriodEnd),
    payload.billingCycle
  )
}

async function ensureBusinessEvent(admin: AdminClient, payload: RazorpayPostPaymentJobPayload) {
  const events = masterAdminSchema(admin)
  const { data: existing, error: lookupError } = await events
    .from("business_events")
    .select("id")
    .eq("event_type", "payment.webhook_applied")
    .eq("metadata->>paymentId", payload.razorpayPaymentId)
    .maybeSingle()

  if (lookupError) throw new Error(lookupError.message)
  if (existing) return

  const { error } = await events.from("business_events").insert({
    event_type: "payment.webhook_applied",
    user_id: payload.userId,
    outcome: "success",
    plan: payload.plan,
    billing_cycle: payload.billingCycle,
    amount_paise: payload.amountPaise,
    route: "/api/jobs/razorpay-post-payment",
    metadata: {
      orderId: payload.razorpayOrderId,
      paymentId: payload.razorpayPaymentId,
      source: "qstash",
    },
  })
  if (error && error.code !== "23505") throw new Error(error.message)
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const isValid = await verifyQstashRequest(req, rawBody)
  if (!isValid) {
    return NextResponse.json({ error: "Invalid QStash signature" }, { status: 401, headers: JOB_HEADERS })
  }

  let rawPayload: unknown
  try {
    rawPayload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400, headers: JOB_HEADERS })
  }

  const parsed = razorpayPostPaymentJobSchema.safeParse(rawPayload)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid job payload" }, { status: 400, headers: JOB_HEADERS })
  }

  const payload = parsed.data
  const admin = createAdminClient()

  let claimed: Awaited<ReturnType<typeof claimJob>>
  try {
    claimed = await claimJob(admin, payload)
  } catch (e) {
    const message = e instanceof Error ? e.message : "claim failed"
    return NextResponse.json({ error: message }, { status: 500, headers: JOB_HEADERS })
  }

  if (claimed.status === "completed") {
    return NextResponse.json({ success: true, skipped: "completed" }, { headers: JOB_HEADERS })
  }
  if (claimed.status === "processing") {
    return NextResponse.json({ success: true, skipped: "already_processing" }, { status: 202, headers: JOB_HEADERS })
  }

  const job = claimed.job
  if (!job) {
    return NextResponse.json({ error: "Claim response missing job" }, { status: 500, headers: JOB_HEADERS })
  }

  try {
    if (!job.subscription_event_inserted_at) {
      await ensureSubscriptionEvent(admin, payload)
      await markJobStep(admin, payload.razorpayPaymentId, "subscription_event_inserted_at")
    }

    if (!job.email_sent_at) {
      await sendConfirmationEmail(admin, payload)
      await markJobStep(admin, payload.razorpayPaymentId, "email_sent_at")
    }

    if (!job.business_event_logged_at) {
      await ensureBusinessEvent(admin, payload)
      await markJobStep(admin, payload.razorpayPaymentId, "business_event_logged_at")
    }

    await completeJob(admin, payload.razorpayPaymentId)
    return NextResponse.json({ success: true }, { headers: JOB_HEADERS })
  } catch (e) {
    const message = e instanceof Error ? e.message : "post-payment job failed"
    await failJob(admin, payload.razorpayPaymentId, message)
    return NextResponse.json({ error: message }, { status: 500, headers: JOB_HEADERS })
  }
}

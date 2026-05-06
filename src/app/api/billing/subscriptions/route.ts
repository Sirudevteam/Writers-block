import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { isAllowedRequestOrigin } from "@/modules/auth/security/request-origin"
import { guardOrgApi, IAM_JSON_HEADERS } from "@/modules/iam/application/api-guard"
import {
  createRazorpayClient,
  getRazorpaySubscriptionPlanId,
  recordBillingLedger,
  type PaidPlan,
} from "@/modules/billing/application/razorpay-subscriptions"
import type { BillingCycle } from "@/shared/types/project"

export const dynamic = "force-dynamic"

const taxProfileSchema = z.object({
  billingEmail: z.string().email().max(320).optional(),
  legalName: z.string().trim().max(200).optional(),
  gstin: z.string().trim().toUpperCase().regex(/^[0-9A-Z]{15}$/).optional(),
  billingAddress: z.record(z.string(), z.unknown()).optional(),
}).optional()

const createSchema = z.object({
  plan: z.enum(["pro", "premium"]),
  billingCycle: z.enum(["monthly", "annual"]).default("monthly"),
  taxProfile: taxProfileSchema,
})

const PLAN_NAMES: Record<PaidPlan, Record<BillingCycle, string>> = {
  pro: {
    monthly: "Pro Plan (Monthly)",
    annual: "Pro Plan (Annual)",
  },
  premium: {
    monthly: "Premium Plan (Monthly)",
    annual: "Premium Plan (Annual)",
  },
}

async function getOrCreateRazorpayCustomer(params: {
  supabase: any
  orgId: string
  userId: string
  userEmail: string | null
  profile: z.infer<typeof taxProfileSchema>
}) {
  const billingEmail = params.profile?.billingEmail ?? params.userEmail
  if (!billingEmail) throw new Error("A billing email is required")

  const { data: existing } = await params.supabase
    .from("billing_customers")
    .select("*")
    .eq("org_id", params.orgId)
    .maybeSingle()

  if (existing?.razorpay_customer_id) {
    await params.supabase.from("billing_customers").upsert({
      org_id: params.orgId,
      user_id: params.userId,
      billing_email: billingEmail,
      legal_name: params.profile?.legalName ?? existing.legal_name,
      gstin: params.profile?.gstin ?? existing.gstin,
      billing_address: params.profile?.billingAddress ?? existing.billing_address ?? {},
      razorpay_customer_id: existing.razorpay_customer_id,
    }, { onConflict: "org_id" })
    return existing.razorpay_customer_id as string
  }

  const razorpay = createRazorpayClient()
  const customer = await (razorpay as any).customers.create({
    name: params.profile?.legalName ?? billingEmail,
    email: billingEmail,
    notes: {
      user_id: params.userId,
      org_id: params.orgId,
      gstin: params.profile?.gstin ?? "",
    },
  })

  await params.supabase.from("billing_customers").upsert({
    org_id: params.orgId,
    user_id: params.userId,
    billing_email: billingEmail,
    legal_name: params.profile?.legalName ?? null,
    gstin: params.profile?.gstin ?? null,
    billing_address: params.profile?.billingAddress ?? {},
    razorpay_customer_id: customer.id,
  }, { onConflict: "org_id" })

  return customer.id as string
}

export async function POST(req: NextRequest) {
  if (!isAllowedRequestOrigin((name) => req.headers.get(name))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: IAM_JSON_HEADERS })
  }
  const gate = await guardOrgApi(req, "billing:manage")
  if (!gate.ok) return gate.response

  const parsed = createSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid subscription request" }, { status: 400, headers: IAM_JSON_HEADERS })
  }

  try {
    const planId = getRazorpaySubscriptionPlanId(parsed.data.plan as PaidPlan, parsed.data.billingCycle)
    const customerId = await getOrCreateRazorpayCustomer({
      supabase: gate.supabase as any,
      orgId: gate.orgId,
      userId: gate.userId,
      userEmail: gate.userEmail,
      profile: parsed.data.taxProfile,
    })

    const razorpay = createRazorpayClient()
    const keyId = process.env.RAZORPAY_KEY_ID?.trim()
    if (!keyId) throw new Error("Razorpay is not configured")

    const subscription = await (razorpay as any).subscriptions.create({
      plan_id: planId,
      customer_id: customerId,
      total_count: parsed.data.billingCycle === "annual" ? 10 : 120,
      customer_notify: 1,
      notes: {
        purpose: "subscription",
        user_id: gate.userId,
        org_id: gate.orgId,
        plan: parsed.data.plan,
        billing_cycle: parsed.data.billingCycle,
      },
    })

    await recordBillingLedger(gate.supabase as any, {
      userId: gate.userId,
      orgId: gate.orgId,
      eventType: "subscription.created",
      plan: parsed.data.plan,
      billingCycle: parsed.data.billingCycle,
      razorpaySubscriptionId: subscription.id,
      status: subscription.status,
      payload: subscription,
    })

    return NextResponse.json(
      {
        ok: true,
        subscriptionId: subscription.id,
        status: subscription.status,
        shortUrl: subscription.short_url ?? null,
        keyId,
        plan: parsed.data.plan,
        billingCycle: parsed.data.billingCycle,
        planName: PLAN_NAMES[parsed.data.plan as PaidPlan][parsed.data.billingCycle],
      },
      { status: 201, headers: IAM_JSON_HEADERS }
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create subscription"
    return NextResponse.json({ error: message }, { status: 500, headers: IAM_JSON_HEADERS })
  }
}

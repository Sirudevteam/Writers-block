import crypto from "crypto"
import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/infrastructure/db/supabase/server"
import { createAdminClient } from "@/infrastructure/db/supabase/admin"
import { applyAiCreditTopupPayment } from "@/modules/billing/application/apply-ai-credit-topup"
import { AI_CREDIT_TOPUP_CREDITS, getAiCreditTopupAmountPaise } from "@/modules/ai/domain/credits"
import { E2E_TEST_HEADERS, requireE2eTestAccess } from "../_shared"

export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  const denied = requireE2eTestAccess(request)
  if (denied) return denied

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: E2E_TEST_HEADERS })
  }

  const admin = createAdminClient()
  const suffix = crypto.randomUUID()
  const result = await applyAiCreditTopupPayment(admin, {
    userId: user.id,
    paymentId: `e2e_pay_${suffix}`,
    orderId: `e2e_order_${suffix}`,
    amountPaise: getAiCreditTopupAmountPaise(),
    creditsGranted: AI_CREDIT_TOPUP_CREDITS,
  })

  if (result.status === "error") {
    return NextResponse.json({ error: result.message }, { status: 500, headers: E2E_TEST_HEADERS })
  }

  return NextResponse.json({ ok: true, ...result }, { headers: E2E_TEST_HEADERS })
}

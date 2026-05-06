import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/infrastructure/db/supabase/server"
import { apiIpLimitOr429 } from "@/core/security/api-ip-limit"
import { NO_STORE_HEADERS } from "@/core/http/cache"
import { getEffectivePlanForApiUser } from "@/modules/ai/application/effective-plan"
import { getAiCreditSnapshot } from "@/modules/ai/application/credit-service"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const tooMany = await apiIpLimitOr429(req)
  if (tooMany) return tooMany

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE_HEADERS })
  }

  const plan = await getEffectivePlanForApiUser(supabase, user.id)
  const snapshot = await getAiCreditSnapshot({ userId: user.id, plan })
  return NextResponse.json(snapshot, { headers: NO_STORE_HEADERS })
}

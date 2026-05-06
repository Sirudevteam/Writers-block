import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/infrastructure/db/supabase/server"
import { apiIpLimitOr429 } from "@/core/security/api-ip-limit"
import { NO_STORE_HEADERS } from "@/core/http/cache"
import { listAiCreditHistory } from "@/modules/ai/application/credit-service"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const tooMany = await apiIpLimitOr429(request)
  if (tooMany) return tooMany

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE_HEADERS })
  }

  const history = await listAiCreditHistory({ userId: user.id, limit: 25 })
  return NextResponse.json({ history }, { headers: NO_STORE_HEADERS })
}

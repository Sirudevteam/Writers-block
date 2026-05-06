/**
 * Admin Stats API
 * Protected by master_admin.users (service role check).
 * Returns platform metrics: users, subscriptions, revenue, usage.
 */

import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/infrastructure/db/supabase/server"
import { apiIpLimitOr429 } from "@/core/security/api-ip-limit"
import { createClient as createAdminClient } from "@supabase/supabase-js"
import type { Database } from "@/infrastructure/db/types/database"
import { userHasAdminPrivileges } from "@/modules/master-admin/security/admin-privileges"
import { computeAdminStats } from "@/modules/master-admin/application/admin-stats"

export const dynamic = "force-dynamic"

const ADMIN_STATS_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
} as const

export async function GET(request: NextRequest) {
  const tooMany = await apiIpLimitOr429(request)
  if (tooMany) return tooMany

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: ADMIN_STATS_HEADERS })
  }

  // 403 (not 404) for non-admins: explicit for API clients; page/middleware use 404 to avoid route discovery
  if (!(await userHasAdminPrivileges(user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: ADMIN_STATS_HEADERS })
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500, headers: ADMIN_STATS_HEADERS })
  }

  const adminSupabase = createAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  try {
    const body = await computeAdminStats(adminSupabase)
    return NextResponse.json(body, {
      headers: ADMIN_STATS_HEADERS,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load stats"
    return NextResponse.json({ error: message }, { status: 500, headers: ADMIN_STATS_HEADERS })
  }
}

import { NextResponse, type NextRequest } from "next/server"
import { createClient as createAdminClient } from "@supabase/supabase-js"
import type { Database } from "@/infrastructure/db/types/database"
import { guardMasterAdminApi } from "@/modules/master-admin/security/api-guard"
import { MASTER_ADMIN_JSON_HEADERS } from "@/modules/master-admin/application/http"
import { withMasterAdminCache } from "@/modules/master-admin/infrastructure/cache"
import { resolveMasterAdminDateRange } from "@/modules/master-admin/domain/date-range"
import { fetchBusinessFunnel } from "@/modules/master-admin/infrastructure/admin-queries"

export const dynamic = "force-dynamic"

function searchRecord(url: URL): Record<string, string | string[] | undefined> {
  const out: Record<string, string | string[] | undefined> = {}
  url.searchParams.forEach((value, key) => {
    out[key] = value
  })
  return out
}

export async function GET(req: NextRequest) {
  const gate = await guardMasterAdminApi(req)
  if (!gate.ok) return gate.response

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: "Server misconfigured" },
      { status: 500, headers: MASTER_ADMIN_JSON_HEADERS }
    )
  }

  const range = resolveMasterAdminDateRange(searchRecord(new URL(req.url)))
  const adminSupabase = createAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  try {
    const body = await withMasterAdminCache(
      ["business-funnel", new URL(req.url).searchParams.toString()],
      async () => {
        const funnel = await fetchBusinessFunnel(adminSupabase, range.fromIso, range.toIso)
        return { range, funnel }
      }
    )
    return NextResponse.json(body, { headers: MASTER_ADMIN_JSON_HEADERS })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load business funnel"
    return NextResponse.json({ error: message }, { status: 500, headers: MASTER_ADMIN_JSON_HEADERS })
  }
}

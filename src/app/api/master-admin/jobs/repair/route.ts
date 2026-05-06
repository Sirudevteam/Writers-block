import { NextRequest, NextResponse } from "next/server"
import { createClient as createAdminClient } from "@supabase/supabase-js"
import { z } from "zod"
import type { Database } from "@/infrastructure/db/types/database"
import { guardMasterAdminApi } from "@/modules/master-admin/security/api-guard"
import { MASTER_ADMIN_JSON_HEADERS } from "@/modules/master-admin/application/http"

export const dynamic = "force-dynamic"

const repairSchema = z.object({
  action: z.enum([
    "release_expired_reservations",
    "retry_payment_job",
    "unlock_ai_batch_jobs",
    "unlock_story_memory_jobs",
  ]),
  id: z.string().optional(),
})

export async function POST(req: NextRequest) {
  const gate = await guardMasterAdminApi(req)
  if (!gate.ok) return gate.response

  const parsed = repairSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid repair action" }, { status: 400, headers: MASTER_ADMIN_JSON_HEADERS })
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500, headers: MASTER_ADMIN_JSON_HEADERS })
  }

  const admin = createAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
  const staleCutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString()

  try {
    if (parsed.data.action === "release_expired_reservations") {
      let query = admin.from("ai_credit_reservations").select("id").eq("status", "pending").lt("expires_at", new Date().toISOString()).limit(100)
      if (parsed.data.id) query = query.eq("id", parsed.data.id)
      const { data, error } = await query
      if (error) throw error
      for (const row of data ?? []) {
        await (admin as any).rpc("release_ai_credit_reservation", { p_reservation_id: row.id })
      }
      return NextResponse.json({ ok: true, repaired: data?.length ?? 0 }, { headers: MASTER_ADMIN_JSON_HEADERS })
    }

    if (parsed.data.action === "retry_payment_job") {
      if (!parsed.data.id) {
        return NextResponse.json({ error: "id is required" }, { status: 400, headers: MASTER_ADMIN_JSON_HEADERS })
      }
      const { data, error } = await (admin as any).schema("master_admin").from("payment_post_process_jobs")
        .update({ status: "pending", last_error: null, updated_at: new Date().toISOString() })
        .eq("razorpay_payment_id", parsed.data.id)
        .select("*")
        .maybeSingle()
      if (error) throw error
      return NextResponse.json({ ok: true, job: data }, { headers: MASTER_ADMIN_JSON_HEADERS })
    }

    if (parsed.data.action === "unlock_ai_batch_jobs") {
      let query = admin.from("ai_batch_jobs").update({ status: "queued", locked_at: null } as any).eq("status", "processing").lt("locked_at", staleCutoff)
      if (parsed.data.id) query = query.eq("id", parsed.data.id)
      const { data, error } = await query.select("id")
      if (error) throw error
      return NextResponse.json({ ok: true, repaired: data?.length ?? 0 }, { headers: MASTER_ADMIN_JSON_HEADERS })
    }

    let query = admin.from("project_memory_status").update({ status: "pending", locked_at: null } as any).eq("status", "processing").lt("locked_at", staleCutoff)
    if (parsed.data.id) query = query.eq("project_id", parsed.data.id)
    const { data, error } = await query.select("project_id")
    if (error) throw error
    return NextResponse.json({ ok: true, repaired: data?.length ?? 0 }, { headers: MASTER_ADMIN_JSON_HEADERS })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Repair action failed"
    return NextResponse.json({ error: message }, { status: 500, headers: MASTER_ADMIN_JSON_HEADERS })
  }
}

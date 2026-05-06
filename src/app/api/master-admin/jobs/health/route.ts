import { NextRequest, NextResponse } from "next/server"
import { createClient as createAdminClient } from "@supabase/supabase-js"
import type { Database } from "@/infrastructure/db/types/database"
import { guardMasterAdminApi } from "@/modules/master-admin/security/api-guard"
import { MASTER_ADMIN_JSON_HEADERS } from "@/modules/master-admin/application/http"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const gate = await guardMasterAdminApi(req)
  if (!gate.ok) return gate.response

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500, headers: MASTER_ADMIN_JSON_HEADERS })
  }

  const admin = createAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
  const staleCutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString()
  const now = new Date().toISOString()

  const [
    paymentJobs,
    aiBatchJobs,
    storyMemoryJobs,
    staleReservations,
    webhookFailures,
  ] = await Promise.all([
    (admin as any).schema("master_admin").from("payment_post_process_jobs").select("*").in("status", ["pending", "processing", "failed"]).order("updated_at", { ascending: false }).limit(50),
    admin.from("ai_batch_jobs").select("*").in("status", ["queued", "processing", "failed"]).order("updated_at", { ascending: false }).limit(50),
    admin.from("project_memory_status").select("*").in("status", ["pending", "processing", "failed"]).order("updated_at", { ascending: false }).limit(50),
    admin.from("ai_credit_reservations").select("*").eq("status", "pending").lt("expires_at", now).order("expires_at", { ascending: true }).limit(50),
    (admin as any).schema("master_admin").from("security_events").select("*").eq("event_type", "payment.webhook_failure").order("created_at", { ascending: false }).limit(50),
  ])

  const error = paymentJobs.error ?? aiBatchJobs.error ?? storyMemoryJobs.error ?? staleReservations.error ?? webhookFailures.error
  if (error) {
    return NextResponse.json({ error: "Failed to load job health" }, { status: 500, headers: MASTER_ADMIN_JSON_HEADERS })
  }

  return NextResponse.json(
    {
      runAt: now,
      staleCutoff,
      paymentJobs: paymentJobs.data ?? [],
      aiBatchJobs: aiBatchJobs.data ?? [],
      storyMemoryJobs: storyMemoryJobs.data ?? [],
      staleReservations: staleReservations.data ?? [],
      webhookFailures: webhookFailures.data ?? [],
      counts: {
        paymentJobs: paymentJobs.data?.length ?? 0,
        aiBatchJobs: aiBatchJobs.data?.length ?? 0,
        storyMemoryJobs: storyMemoryJobs.data?.length ?? 0,
        staleReservations: staleReservations.data?.length ?? 0,
        webhookFailures: webhookFailures.data?.length ?? 0,
      },
    },
    { headers: MASTER_ADMIN_JSON_HEADERS }
  )
}

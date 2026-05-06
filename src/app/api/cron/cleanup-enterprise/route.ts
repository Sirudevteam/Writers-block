import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { requestHasSecret } from "@/core/security/internal-api"

export const dynamic = "force-dynamic"

function isProductionRuntime(): boolean {
  return process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production"
}

function unauthorized(req: NextRequest): NextResponse | null {
  const cronSecret = process.env.CRON_SECRET?.trim()
  if (isProductionRuntime()) {
    if (!cronSecret) return NextResponse.json({ error: "Cron is not configured" }, { status: 503 })
    if (!requestHasSecret(req, cronSecret, "x-cron-secret")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  } else if (cronSecret && !requestHasSecret(req, cronSecret, "x-cron-secret")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  return null
}

export async function GET(req: NextRequest) {
  const blocked = unauthorized(req)
  if (blocked) return blocked

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    return NextResponse.json({ error: "Server misconfiguration: missing Supabase service credentials." }, { status: 503 })
  }

  const admin = createClient(url, serviceKey)
  const now = new Date().toISOString()
  const staleCutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString()
  const oldOtpCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const result: Record<string, unknown> = { runAt: now }
  const errors: string[] = []

  try {
    const { count } = await (admin.from("organization_invites") as any)
      .delete({ count: "exact" })
      .is("accepted_at", null)
      .lt("expires_at", now)
    result.expiredInvitesDeleted = count ?? 0
  } catch (error) {
    errors.push(`expired invites cleanup failed: ${error instanceof Error ? error.message : String(error)}`)
  }

  try {
    const [{ count: userOtp }, { count: masterOtp }] = await Promise.all([
      (admin as any).schema("user_auth").from("otp_challenges").delete({ count: "exact" }).lt("expires_at", oldOtpCutoff),
      (admin as any).schema("master_admin").from("otp_challenges").delete({ count: "exact" }).lt("expires_at", oldOtpCutoff),
    ])
    result.expiredUserOtpsDeleted = userOtp ?? 0
    result.expiredMasterAdminOtpsDeleted = masterOtp ?? 0
  } catch (error) {
    errors.push(`expired OTP cleanup failed: ${error instanceof Error ? error.message : String(error)}`)
  }

  try {
    const { data } = await admin
      .from("ai_credit_reservations")
      .select("id")
      .eq("status", "pending")
      .lt("expires_at", now)
      .limit(200)
    for (const row of data ?? []) {
      await (admin as any).rpc("release_ai_credit_reservation", { p_reservation_id: row.id })
    }
    result.staleReservationsReleased = data?.length ?? 0
  } catch (error) {
    errors.push(`stale AI reservation cleanup failed: ${error instanceof Error ? error.message : String(error)}`)
  }

  try {
    const [{ data: aiJobs }, { data: memoryJobs }, { data: paymentJobs }] = await Promise.all([
      admin.from("ai_batch_jobs").update({ status: "queued", locked_at: null } as any).eq("status", "processing").lt("locked_at", staleCutoff).select("id"),
      admin.from("project_memory_status").update({ status: "pending", locked_at: null } as any).eq("status", "processing").lt("locked_at", staleCutoff).select("project_id"),
      (admin as any).schema("master_admin").from("payment_post_process_jobs").update({ status: "pending", locked_at: null }).eq("status", "processing").lt("locked_at", staleCutoff).select("razorpay_payment_id"),
    ])
    result.staleAiJobsUnlocked = aiJobs?.length ?? 0
    result.staleStoryMemoryJobsUnlocked = memoryJobs?.length ?? 0
    result.stalePaymentJobsUnlocked = paymentJobs?.length ?? 0
  } catch (error) {
    errors.push(`stale job lock cleanup failed: ${error instanceof Error ? error.message : String(error)}`)
  }

  return NextResponse.json({ ok: errors.length === 0, ...result, errors: errors.length ? errors : undefined })
}

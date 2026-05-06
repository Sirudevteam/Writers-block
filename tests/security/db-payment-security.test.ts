import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { PLAN_LIMITS } from "@/shared/types/project"

const sql = readFileSync(join(process.cwd(), "supabase", "database.sql"), "utf8")

describe("billing database security", () => {
  it("keeps the Free lifetime project quota at 3", () => {
    expect(PLAN_LIMITS.free).toBe(3)
    expect(sql).toMatch(/ELSE 3 END/)
    expect(sql).toMatch(/projects_limit\s+INTEGER\s+DEFAULT 3/)
  })

  it("consumes clean PDF purchases only through a service-role RPC", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.consume_pdf_export_purchase")
    expect(sql).toContain("FOR UPDATE")
    expect(sql).toContain("WHERE razorpay_payment_id = p_payment_id")
    expect(sql).toContain("AND user_id = p_user_id")
    expect(sql).toContain("AND org_id = p_org_id")
    expect(sql).toContain("AND project_id = p_project_id")
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.consume_pdf_export_purchase(TEXT, UUID, UUID, UUID) FROM PUBLIC")
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.consume_pdf_export_purchase(TEXT, UUID, UUID, UUID) TO service_role")
  })

  it("allows users to read PDF export purchases but not write them through RLS policies", () => {
    expect(sql).toContain('CREATE POLICY "Users can view own PDF export purchases"')
    expect(sql).toContain("ON public.pdf_export_purchases FOR SELECT")
    expect(sql).not.toMatch(/ON public\.pdf_export_purchases FOR (INSERT|UPDATE|DELETE)/)
  })

  it("keeps subscription grants behind the existing service-role RPC", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.apply_subscription_payment")
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.apply_subscription_payment(UUID, TEXT, TEXT, TEXT, TEXT, INTEGER) FROM PUBLIC")
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.apply_subscription_payment(UUID, TEXT, TEXT, TEXT, TEXT, INTEGER) TO service_role")
  })

  it("keeps AI credit top-up grants and reservations behind service-role RPCs", () => {
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.ai_credit_topup_purchases")
    expect(sql).toContain("CONSTRAINT ai_credit_topup_purchases_payment_id_key UNIQUE")
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.ai_credit_reservations")
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.apply_ai_credit_topup_payment")
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.reserve_ai_credit_topup")
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.finalize_ai_credit_reservation")
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.release_ai_credit_reservation")
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.apply_ai_credit_topup_payment(UUID, TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC")
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.apply_ai_credit_topup_payment(UUID, TEXT, TEXT, INTEGER, INTEGER) TO service_role")
  })
})

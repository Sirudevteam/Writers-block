import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { parseModelList, PLAN_MONTHLY_TOKEN_BUDGETS } from "@/modules/ai/domain/costing"
import { hashAiBatchRequest } from "@/modules/ai/application/batch-jobs"
import { resolveAiTaskPolicy } from "@/modules/ai/domain/task-policy"
import { classifyAiTaskKind, resolveTokenGuard } from "@/modules/ai/domain/generation"
import { AI_CREDIT_TOPUP_CREDITS, getAiCreditTopupAmountPaise } from "@/modules/ai/domain/credits"
import { buildStoryMemoryChunks, projectContentHash } from "@/modules/story-memory/domain/chunking"

const sql = readFileSync(join(process.cwd(), "supabase", "database.sql"), "utf8")

describe("AI cost optimization policy", () => {
  it("routes simple, standard, and complex tasks to the expected tiers", () => {
    expect(resolveAiTaskPolicy({ endpoint: "shots", plan: "free" }).complexity).toBe("simple")
    expect(resolveAiTaskPolicy({ endpoint: "improve-dialogue", plan: "pro", inputSize: 10_000 }).complexity).toBe(
      "standard"
    )
    expect(resolveAiTaskPolicy({ endpoint: "rewrite-style", plan: "premium", inputSize: 80_000 }).complexity).toBe(
      "complex"
    )
    expect(resolveAiTaskPolicy({ endpoint: "documents", plan: "free" })).toMatchObject({
      complexity: "simple",
      maxTokens: 4096,
    })
    expect(resolveAiTaskPolicy({ endpoint: "generate", plan: "free" }).batchEligible).toBe(false)
    expect(resolveAiTaskPolicy({ endpoint: "bulk-formatting", plan: "pro" }).batchEligible).toBe(true)
  })

  it("rejects Replicate model overrides", () => {
    expect(parseModelList("replicate:google/gemini-2.5-flash,openai:gpt-4o-mini")).toEqual([
      { provider: "openai", model: "gpt-4o-mini" },
    ])
  })

  it("enforces the monthly AI credit budgets", () => {
    expect(PLAN_MONTHLY_TOKEN_BUDGETS.free.totalTokens).toBe(100_000)
    expect(PLAN_MONTHLY_TOKEN_BUDGETS.pro.totalTokens).toBe(600_000)
    expect(PLAN_MONTHLY_TOKEN_BUDGETS.pro.inputTokens).toBeNull()
    expect(PLAN_MONTHLY_TOKEN_BUDGETS.premium.totalTokens).toBe(2_000_000)
  })

  it("defines the paid AI credit top-up pack", () => {
    expect(AI_CREDIT_TOPUP_CREDITS).toBe(100_000)
    expect(getAiCreditTopupAmountPaise()).toBe(9900)
  })

  it("creates stable idempotency hashes for AI batch jobs", () => {
    const a = hashAiBatchRequest("u1", "bulk-formatting", "p1", { b: 2, a: 1 })
    const b = hashAiBatchRequest("u1", "bulk-formatting", "p1", { a: 1, b: 2 })
    const c = hashAiBatchRequest("u1", "bulk-formatting", "p1", { a: 1, b: 3 })

    expect(a).toBe(b)
    expect(a).not.toBe(c)
  })

  it("classifies AI tasks and caps live output tokens", () => {
    expect(classifyAiTaskKind("generate-next")).toBe("generate-next")
    expect(classifyAiTaskKind("movie-references")).toBe("movie-references")

    expect(
      resolveTokenGuard({
        taskKind: "generate",
        requestedMode: "live",
        maxTokens: 8000,
        inputSize: 10_000,
        plan: "pro",
      })
    ).toMatchObject({ ok: true, effectiveMaxTokens: 3500, cap: 3500 })

    expect(
      resolveTokenGuard({
        taskKind: "shots",
        requestedMode: "live",
        maxTokens: 2048,
        inputSize: 1000,
        plan: "premium",
      })
    ).toMatchObject({ ok: true, effectiveMaxTokens: 1000, cap: 1000 })

    expect(
      resolveTokenGuard({
        taskKind: "generate",
        requestedMode: "live",
        maxTokens: 8000,
        inputSize: 10_000,
        plan: "free",
      })
    ).toMatchObject({ ok: true, effectiveMaxTokens: 1200, cap: 1200 })

    expect(
      resolveTokenGuard({
        taskKind: "rewrite-style",
        requestedMode: "live",
        maxTokens: 8000,
        inputSize: 10_000,
        plan: "premium",
      })
    ).toMatchObject({ ok: true, effectiveMaxTokens: 5000, cap: 5000 })
  })

  it("requires batch mode for large live dialogue and style rewrites", () => {
    expect(
      resolveTokenGuard({
        taskKind: "improve-dialogue",
        requestedMode: "live",
        maxTokens: 8000,
        inputSize: 60_001,
      })
    ).toMatchObject({ ok: false, batchRequired: true })

    expect(
      resolveTokenGuard({
        taskKind: "rewrite-style",
        requestedMode: "batch",
        maxTokens: 8000,
        inputSize: 250_000,
      })
    ).toMatchObject({ ok: true, batchRequired: false, effectiveMaxTokens: 8000 })
  })

  it("builds deterministic project story memory chunks", () => {
    const project = {
      id: "p1",
      user_id: "u1",
      org_id: "o1",
      title: "Last Ball",
      description: "A final-over cricket drama.",
      genre: "sports drama",
      characters: "Arjun - fast bowler, Meera - captain",
      location: "Chennai stadium",
      mood: "tense",
      content: "FADE IN\n\n1. EXT - STADIUM - NIGHT\n\nArjun runs in for the final ball..\n\nFADE OUT",
    }

    expect(projectContentHash(project)).toBe(projectContentHash({ ...project }))
    const chunks = buildStoryMemoryChunks(project)
    expect(chunks.map((chunk) => chunk.kind)).toEqual(
      expect.arrayContaining(["project_summary", "character", "scene", "arc", "continuity_note"])
    )
    expect(new Set(chunks.map((chunk) => chunk.sourceHash)).size).toBe(chunks.length)
  })
})

describe("AI optimization database security", () => {
  it("adds cache, batch, and feedback tables with scoped unique constraints", () => {
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.ai_prompt_cache_entries")
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.ai_batch_jobs")
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.ai_generation_feedback")
    expect(sql).toContain("CONSTRAINT ai_prompt_cache_entries_context_key UNIQUE")
    expect(sql).toContain("CONSTRAINT ai_batch_jobs_user_endpoint_hash_key UNIQUE")
    expect(sql).toContain("CONSTRAINT ai_generation_feedback_user_request_key UNIQUE")
  })

  it("keeps cache writes and batch processing on service-role paths", () => {
    expect(sql).toContain("ALTER TABLE public.ai_prompt_cache_entries ENABLE ROW LEVEL SECURITY")
    expect(sql).toContain('CREATE POLICY "Users can view own AI prompt cache entries"')
    expect(sql).not.toMatch(/ON public\.ai_prompt_cache_entries FOR (INSERT|UPDATE|DELETE)/)
    expect(sql).toContain('CREATE POLICY "Users can view own AI batch jobs"')
    expect(sql).not.toMatch(/ON public\.ai_batch_jobs FOR (INSERT|UPDATE|DELETE)/)
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.claim_ai_batch_job")
    expect(sql).toContain("FOR UPDATE SKIP LOCKED")
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.claim_ai_batch_job(UUID) TO service_role")
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.complete_ai_batch_job(UUID, JSONB) TO service_role")
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.fail_ai_batch_job(UUID, TEXT) TO service_role")
  })

  it("keeps feedback writes behind the verified API/service role", () => {
    expect(sql).toContain("ALTER TABLE public.ai_generation_feedback ENABLE ROW LEVEL SECURITY")
    expect(sql).toContain('CREATE POLICY "Users can view own AI generation feedback"')
    expect(sql).not.toMatch(/ON public\.ai_generation_feedback FOR (INSERT|UPDATE|DELETE)/)
    expect(sql).toContain("usage_log_id  UUID        REFERENCES public.usage_logs")
  })

  it("adds service-owned story memory tables, vector search, and worker RPCs", () => {
    expect(sql).toContain("CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions")
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.project_story_memory")
    expect(sql).toContain("embedding       extensions.vector(1536)")
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.project_memory_status")
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.match_project_story_memory")
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.claim_story_memory_job")
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.complete_story_memory_job")
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.fail_story_memory_job")
    expect(sql).toContain("ALTER TABLE public.project_story_memory ENABLE ROW LEVEL SECURITY")
    expect(sql).toContain("ALTER TABLE public.project_memory_status ENABLE ROW LEVEL SECURITY")
    expect(sql).toContain('CREATE POLICY "Users can view own project story memory"')
    expect(sql).toContain('CREATE POLICY "Users can view own project memory status"')
    expect(sql).not.toMatch(/ON public\.project_story_memory FOR (INSERT|UPDATE|DELETE)/)
    expect(sql).not.toMatch(/ON public\.project_memory_status FOR (INSERT|UPDATE|DELETE)/)
  })

  it("adds editable Story Bible tables with org/project scoped RLS", () => {
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.project_story_bible_entries")
    expect(sql).toContain("kind        TEXT        NOT NULL CHECK (kind IN ('character', 'scene', 'arc', 'continuity_note', 'style_rule'))")
    expect(sql).toContain("source      TEXT        DEFAULT 'manual' NOT NULL CHECK (source IN ('manual', 'ai_suggested', 'imported', 'system'))")
    expect(sql).toContain("CREATE INDEX IF NOT EXISTS project_story_bible_entries_project_kind_idx")
    expect(sql).toContain("ALTER TABLE public.project_story_bible_entries ENABLE ROW LEVEL SECURITY")
    expect(sql).toContain('CREATE POLICY "Org project readers can view story bible entries"')
    expect(sql).toContain('CREATE POLICY "Org project writers can create story bible entries"')
    expect(sql).toContain('CREATE POLICY "Org project writers can update story bible entries"')
    expect(sql).toContain('CREATE POLICY "Org project writers can delete story bible entries"')
  })

  it("adds service-owned AI credit top-up ledgers and reservation RPCs", () => {
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.ai_credit_topup_purchases")
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.ai_credit_reservations")
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.ai_credit_reservation_allocations")
    expect(sql).toContain("CONSTRAINT ai_credit_topup_purchases_payment_id_key UNIQUE")
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.apply_ai_credit_topup_payment")
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.reserve_ai_credit_topup")
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.finalize_ai_credit_reservation")
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.release_ai_credit_reservation")
    expect(sql).toContain("ALTER TABLE public.ai_credit_topup_purchases ENABLE ROW LEVEL SECURITY")
    expect(sql).toContain("ALTER TABLE public.ai_credit_reservations ENABLE ROW LEVEL SECURITY")
    expect(sql).toContain("ALTER TABLE public.ai_credit_reservation_allocations ENABLE ROW LEVEL SECURITY")
    expect(sql).toContain('CREATE POLICY "Users can view own AI credit topups"')
    expect(sql).not.toMatch(/ON public\.ai_credit_topup_purchases FOR (INSERT|UPDATE|DELETE)/)
    expect(sql).not.toMatch(/ON public\.ai_credit_reservations FOR (INSERT|UPDATE|DELETE)/)
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.apply_ai_credit_topup_payment(UUID, TEXT, TEXT, INTEGER, INTEGER) TO service_role")
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.reserve_ai_credit_topup(UUID, TEXT, INTEGER, INTEGER) TO service_role")
  })
})

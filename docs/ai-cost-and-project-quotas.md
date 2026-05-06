# AI Cost Controls and Project Quotas

**Last updated:** May 6, 2026

This document is the source of truth for the current AI generation architecture, provider router, story memory, monthly AI credits, top-ups, cost tracking, and Free-plan project creation policy.

## Plan Rules

| Plan | Project rule | Monthly AI credits | Daily anti-abuse limit |
|---|---|---:|---:|
| Free | 3 lifetime project creations | 100K credits | 5 generations/day |
| Pro | 25 active project slots | 600K credits | 50 generations/day |
| Premium | Effectively unlimited active slots | 2M credits | 200 generations/day |

One AI credit equals one total AI token. AI credits are used based on content length and complexity. Pro and Premium users can buy non-expiring 100K credit top-ups for ₹99 after included monthly credits are exhausted; Free users must upgrade before buying top-ups.

Free project credits are lifetime credits. Deleting a Free project does not restore a creation credit. Paid plans keep the active slot model, so paid users can delete projects and create new ones while staying under their active slot limit.

The effective plan is derived from `subscriptions.status`; `active` and `trialing` retain paid entitlements, `past_due` retains paid entitlements only until `grace_period_end`, and cancelled, expired, inactive, or missing subscriptions fall back to Free.

## Free Project Creation Enforcement

Project creation is enforced server-side and database-side.

- `GET /api/projects` returns paginated project rows plus a `quota` object:
  - `activeUsed`
  - `activeLimit`
  - `freeLifetimeUsed`
  - `freeLifetimeLimit`
  - `canCreate`
  - `blockedReason`
- `POST /api/projects` calls `public.create_project_with_quota(...)` through the service-role client and returns `{ project, quota }`.
- `public.project_creation_usage` stores durable Free lifetime creation usage keyed by `user_id`.
- `public.enforce_project_limit_before_insert()` runs before every `projects` insert, takes a per-user advisory transaction lock, checks active slot limits, increments Free lifetime credits only when the effective plan is Free, and blocks when the Free lifetime limit is reached.
- Direct authenticated inserts into `public.projects` are still protected by the trigger, so parallel requests and alternate clients cannot bypass the limit.

Historical backfill in `supabase/database.sql` uses `master_admin.business_events` rows with `event_type = 'project.created'` and `plan = 'free'` where event history exists. If a user has no project-created event history, the backfill falls back to current project count because deleted historical projects cannot be reconstructed.

Related files:

- [supabase/database.sql](../supabase/database.sql)
- [src/infrastructure/db/types/database.ts](../src/infrastructure/db/types/database.ts)
- [src/app/api/projects/route.ts](../src/app/api/projects/route.ts)
- [src/modules/projects/application/project-service.ts](../src/modules/projects/application/project-service.ts)
- [src/modules/projects/infrastructure/project-repository.ts](../src/modules/projects/infrastructure/project-repository.ts)
- [src/modules/projects/presentation/hooks/use-projects.ts](../src/modules/projects/presentation/hooks/use-projects.ts)

## AI Router

AI routes now pass through `GenerationService` before provider calls:

```text
API route -> auth/rate limits -> GenerationService
  -> task classification
  -> story context retrieval/fallback
  -> live token guard
  -> provider router
  -> usage/cost logging
```

The direct provider router still handles provider fallback, monthly budget checks, usage logging, and SSE/text execution:

| Complexity | Typical traffic | Primary model family | Use cases |
|---|---:|---|---|
| Simple | 50% | Gemini 2.5 Flash-Lite, GPT-4o mini | quick drafts, outlines, shot ideas, short polish |
| Standard | 35% | Gemini 2.5 Flash, GPT-5.4 mini | scene continuation, dialogue rewrite, style rewrite |
| Complex | 15% | GPT-5.4, Claude Sonnet 4.6 | full screenplay generation, long rewrites, narrative arcs |

Gemini 3.1 Pro Preview is disabled unless `AI_ENABLE_GEMINI_3_1_PRO=true`.

Routing policy is centralized in `resolveAiTaskPolicy(...)`:

- Simple: shot suggestions, outlines, and short ideas.
- Standard: dialogue improvement, continuation, movie references, moderate rewrites, and background references.
- Complex: full screenplay generation, long rewrites, document/story generation, and narrative-arc work.
- `/api/documents` remains an SSE endpoint but now uses the shared direct-provider router with `endpoint: "documents"` and a 4096-token policy.

Live output caps are enforced before the provider call:

| Task | Live max output tokens | Large-input behavior |
|---|---:|---|
| `generate` | 3,500 | live allowed |
| `generate-next` | 1,800 | live allowed |
| `improve-dialogue` | 1,200 | scripts over 60K chars return `409 batch_required` |
| `rewrite-style` | 2,500 | scripts over 60K chars return `409 batch_required` |
| `shots` | 1,000 | live allowed |
| `movie-references` | 1,000 | live allowed |
| `documents` | 4,096 | live allowed |

Plan-aware caps override the base caps: Free live outputs are capped at 1,200 tokens, and Premium gets 2x caps on long-form `generate`, `generate-next`, `rewrite-style`, and `documents` tasks. Free routing is clamped to Fast drafting mode; user-facing UI never exposes provider/model names.

## AI Credit Top-Ups

Paid credit packs use Razorpay with `purpose = "ai_credit_topup"` and `pack = "100k"`.

| Component | Purpose |
|---|---|
| `ai_credit_topup_purchases` | Non-expiring purchase ledger with granted and remaining credits |
| `ai_credit_reservations` | Short-lived reservation rows for projected overage before provider calls |
| `ai_credit_reservation_allocations` | Allocation rows linking reservations to purchase credits |
| `apply_ai_credit_topup_payment(...)` | Idempotent webhook RPC that grants 100K credits once per Razorpay payment |
| `reserve_ai_credit_topup(...)` | Service-role RPC that reserves paid credits for projected overage |
| `finalize_ai_credit_reservation(...)` | Consumes actual overage and refunds unused reserved credits |
| `release_ai_credit_reservation(...)` | Releases reservations after provider failure |

Included monthly credits are consumed first. Purchased credits are only reserved when the projected request would exceed the included monthly budget. Top-ups do not bypass daily limits, task caps, warning/downgrade behavior, or Premium fair-use downgrade protections.

Related files:

- [src/modules/ai/application/generation-service.ts](../src/modules/ai/application/generation-service.ts)
- [src/modules/ai/domain/generation.ts](../src/modules/ai/domain/generation.ts)
- [src/modules/ai/infrastructure/provider-router.ts](../src/modules/ai/infrastructure/provider-router.ts)
- [src/modules/ai/domain/costing.ts](../src/modules/ai/domain/costing.ts)
- [src/app/api/generate/route.ts](../src/app/api/generate/route.ts)
- [src/app/api/generate-next/route.ts](../src/app/api/generate-next/route.ts)
- [src/app/api/improve-dialogue/route.ts](../src/app/api/improve-dialogue/route.ts)
- [src/app/api/rewrite-style/route.ts](../src/app/api/rewrite-style/route.ts)
- [src/app/api/shots/route.ts](../src/app/api/shots/route.ts)
- [src/app/api/movie-references/route.ts](../src/app/api/movie-references/route.ts)
- [src/app/api/documents/route.ts](../src/app/api/documents/route.ts)
- [src/modules/ai/domain/task-policy.ts](../src/modules/ai/domain/task-policy.ts)

## Story Memory

Project memory is stored in Supabase Postgres with pgvector and built through LangChain.js/OpenAI embeddings.

| Component | Purpose |
|---|---|
| `project_story_memory` | Vector-backed chunks for project summaries, characters, scenes, arcs, and continuity notes |
| `project_memory_status` | Per-project indexing state, content hash, attempts, and last indexed timestamp |
| `match_project_story_memory(...)` | Service-role RPC for cosine similarity retrieval scoped by user/org/project |
| `/api/jobs/story-memory` | QStash-signed async worker that rebuilds memory chunks |
| `/api/projects/[id]/memory/rebuild` | Authenticated project-scoped manual rebuild trigger |

Generation uses story memory only when a valid project id belongs to the current user. If memory is missing, stale, or unavailable, `GenerationService` falls back to project fields and the recent screenplay tail instead of blocking generation.

Memory indexing is queued after project creation/update when screenplay metadata or content changes. Automatic processing requires QStash. Without QStash, the status row can be marked `pending`, and operators can call the worker directly with `STORY_MEMORY_JOB_SECRET` or the app-owned `INTERNAL_API_SECRET` fallback.

## Editable Story Bible

Story Bible entries are the user-owned source of truth for screenplay intelligence. Vector memory is derived infrastructure.

| Component | Purpose |
|---|---|
| `project_story_bible_entries` | Editable entries for characters, scenes, arcs, continuity notes, and style rules |
| `GET /api/projects/[id]/story-bible` | Returns project entries plus memory indexing status |
| `POST /api/projects/[id]/story-bible` | Creates an entry and queues a memory rebuild |
| `PATCH /api/projects/[id]/story-bible/[entryId]` | Updates an entry and queues a memory rebuild |
| `DELETE /api/projects/[id]/story-bible/[entryId]` | Soft-deletes an entry and queues a memory rebuild |

Pinned Story Bible entries are inserted into `GenerationService` context before vector memory. Unpinned entries are selected by task/context budget and then vector memory fills the remaining context window. The editor panel exposes Characters, Scenes, Arcs, Continuity, and Style tabs, plus continuity warnings for unknown speaking characters.

Related files:

- [src/modules/story-bible](../src/modules/story-bible)
- [src/modules/editor/presentation/components/story-bible-panel.tsx](../src/modules/editor/presentation/components/story-bible-panel.tsx)
- [src/app/api/projects/[id]/story-bible/route.ts](../src/app/api/projects/[id]/story-bible/route.ts)
- [supabase/database.sql](../supabase/database.sql)

Required/default env:

- `OPENAI_API_KEY` for embeddings, even when generation routes to Gemini or Anthropic
- `AI_CREDIT_TOPUP_PRICE_PAISE=9900`
- `AI_EMBEDDING_MODEL=text-embedding-3-small`
- `AI_EMBEDDING_DIMENSIONS=1536`
- `STORY_MEMORY_TOP_K=8`
- `STORY_MEMORY_MAX_CONTEXT_TOKENS=3000`
- `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY` for automatic async indexing
- `STORY_MEMORY_JOB_SECRET` optional direct worker fallback
- `INTERNAL_API_SECRET` optional shared fallback for app-owned background job callers
- `AI_PROVIDER_MOCK=true` only for E2E/deterministic CI runs

Related files:

- [src/modules/story-memory](../src/modules/story-memory)
- [src/app/api/jobs/story-memory/route.ts](../src/app/api/jobs/story-memory/route.ts)
- [src/app/api/projects/[id]/memory/rebuild/route.ts](../src/app/api/projects/[id]/memory/rebuild/route.ts)
- [supabase/database.sql](../supabase/database.sql)

## Prompt Cache, Batch Jobs, and Feedback

Prompt context caching is stored in `public.ai_prompt_cache_entries`, keyed by user, project, provider, model, and context hash. Provider cache features are used where supported; cache-read and cache-creation tokens are still recorded in `usage_logs`.

Non-real-time tasks can be queued through `POST /api/ai/batch-jobs` and processed by `POST /api/jobs/ai-batch`. Batch jobs are stored in `public.ai_batch_jobs`, protected by auth/rate limits, and claimed/completed through service-role RPCs. The worker route accepts QStash signatures, `AI_BATCH_JOB_SECRET`, or `INTERNAL_API_SECRET`.

AI response feedback is accepted by `POST /api/ai/feedback` and stored in `public.ai_generation_feedback` with request id, endpoint, provider, model, complexity, rating, and optional reason. Admin AI-cost reporting can use this data to decide where cheaper models are good enough.

## AI Budget States

Monthly included AI credits are evaluated before provider calls.

| Usage | State | Behavior |
|---:|---|---|
| < 70% | `ok` | Route normally |
| 70% to < 85% | `warning` | Route normally and return budget warning headers |
| 85% to < 100% | `downgrade` | Downgrade one complexity tier before routing |
| >= 100% | `blocked` | Return an error before provider spend unless a paid top-up reservation covers the projected overage |

Budget headers are returned when available:

- `X-AI-Budget-State`
- `X-AI-Monthly-Usage-Percent`
- `X-AI-Monthly-Input-Used`
- `X-AI-Monthly-Output-Used`
- `X-AI-Monthly-Total-Used`
- `X-AI-Provider`
- `X-AI-Model`
- `X-AI-Complexity`

If the AI credit/budget service cannot read Supabase usage data, production fails closed by default. Local development can fail open with `AI_BUDGET_FAIL_OPEN=true`.

## Usage and Cost Tracking

AI usage is written through `recordAiUsage(...)`, not ad hoc inserts.

`public.usage_logs` stores request-level facts:

- `provider`
- `model`
- `complexity`
- `original_complexity`
- `input_tokens`
- `output_tokens`
- `cached_input_tokens`
- `cache_creation_input_tokens`
- `total_tokens`
- `cost_usd`
- `cost_inr`
- `latency_ms`
- `status`
- `usage_source`
- `error_message`
- `metadata`

`public.ai_usage_monthly` stores per-user monthly rollups for fast budget checks and admin reporting.

`usage_logs.metadata.generationService` records the resolved task kind, requested/effective token caps, input size, and story context status (`memory`, `fallback`, `empty`, or `unavailable`) for debugging cost and continuity behavior.

Pricing is versioned in [src/modules/ai/domain/costing.ts](../src/modules/ai/domain/costing.ts) with `AI_PRICING_LAST_REVIEWED = "2026-05-01"`. Review provider prices monthly against official OpenAI, Gemini, and Anthropic pricing pages before changing margin assumptions.

## Financial Dashboard

Master Admin includes `/master-admin/ai-cost`.

The page shows:

- smart-routing projected monthly cost
- input/output/total token cards
- model/provider/endpoint cost breakdown
- per-plan AI credit controls
- margin projection
- cost reduction recommendations

The default planning baseline is 100 Pro-equivalent users consuming 50M input + 30M output tokens/month. The target AI COGS range is roughly `$160-$220/month` before cache/batch savings, with a hard alert at `$300/month`.

At `PRO_MONTHLY_INR = 1199` and `AI_EXCHANGE_RATE_INR_PER_USD = 95`, 100 Pro users produce INR 119,900/month. At `$220` AI COGS, API cost is about INR 20,900 and AI gross margin is roughly 82% before infrastructure, tax, and payment fees.

## Operational Checks

After changing quota or AI routing behavior:

```bash
npm run typecheck
npm run build
npm run test:security
```

Smoke check:

- `/signin`
- `/`
- `/dashboard/projects`
- `/dashboard/subscription`
- `/editor`
- `/master-admin/ai-cost`

Quota scenarios to validate:

- Free user creates 3 projects, deletes all 3, then cannot create another.
- Parallel Free project-create requests near the limit never exceed 3 successful creations.
- Free user with 2 lifetime credits used and 0 active projects can create one more.
- Pro and Premium users can delete and recreate within active project limits.
- Downgraded paid users are limited by active slots; Free lifetime credits only apply to creations made while the effective plan is Free.

AI scenarios to validate:

- normal streaming generation
- JSON shot suggestions
- movie references fallback
- missing provider keys
- provider 429/500 fallback
- monthly budget warning, downgrade, and hard cap
- prompt cache hit/miss accounting
- batch job idempotency and retry behavior
- feedback submission ownership checks
- live token caps and `409 batch_required` for large live rewrite/dialogue requests
- story memory fallback when no indexed chunks exist
- story memory worker idempotency and retry behavior
- usage/cost rollup accuracy

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Start development server (port 3000)
npm run build      # Production build with optimizations
npm run start      # Start production server
npm run lint       # Run Next.js ESLint
npm run typecheck  # TypeScript check (tsc --noEmit)
npm run test:security # Vitest security suite
npm run audit:ci   # npm audit — fails only on critical (see CI workflow)
```

There is no broad `npm test` script; use `npm run test:security` for the focused security suite.

## Current Auth + Billing Behavior

For the current production auth and payment flow, prefer [docs/auth-and-billing-current-behavior.md](docs/auth-and-billing-current-behavior.md).

That document is the source of truth for:
- OTP-first signup code entry on `/verify-code`
- password + email OTP sign-in using app-owned Resend OTP email
- password reset using `email -> OTP -> new password` (no PKCE recovery-link flow)
- Master Admin sign-in using the same password + OTP shape, isolated in the `master_admin` schema
- signup no longer uses an app callback route
- webhook-only subscription writes for Razorpay
- ₹99 one-time clean PDF exports for Free users, with webhook-created purchases and atomic consumption
- Free lifetime project creation credits and paid active project slots
- server-side auth guidance (`getUser()` semantics over `getSession()` in auth-sensitive paths)
- public homepage rendering: keep `/` static and let the navbar resolve auth client-side

For current AI routing, story memory, API cost controls, monthly AI credits/top-ups, project quota enforcement, and Master Admin AI Cost behavior, prefer [docs/ai-cost-and-project-quotas.md](docs/ai-cost-and-project-quotas.md).

For current performance posture, build baseline, middleware scope, editor streaming behavior, and database indexes, prefer [docs/performance-architecture.md](docs/performance-architecture.md).

## Scale & observability (~1M requests/day)

**Dashboards to watch**

- **Vercel** — function duration, error rate, concurrent invocations, top routes; correlate cold starts with P99.
- **Supabase** — database CPU, connections, and slow queries; **Auth** request volume (session refresh and API traffic).
- **Upstash** — Redis command rate and latency (rate limits + optional subscription plan cache).
- **Sentry** (optional) — set `NEXT_PUBLIC_SENTRY_DSN` / `SENTRY_DSN` in [`.env.example`](.env.example); tunnel route `/monitoring` avoids ad-blockers on ingest.

**Platform headroom (check before high traffic)**

- **Vercel** — project region aligned with **Upstash** Redis region; function memory and plan limits support peak concurrency (order of 50–200+ short-lived req/s for typical campaign spikes on top of ~12 req/s average for ~1M requests/day).
- **Supabase** — compute and disk can sustain PostgREST + Auth load; add replicas or larger compute if dashboards show sustained CPU or slow queries.
- **Upstash** — free/pro tier enough for `ratelimit:*` and `cache:sub:*` key volume; colocate with app region.

**In-app scale hooks**

- **General API** — [src/core/security/api-ip-limit.ts](src/core/security/api-ip-limit.ts) applies 100 req/min per IP (when Redis is configured) to authenticated API routes. AI routes also keep stricter [src/modules/ai/application/rate-limits.ts](src/modules/ai/application/rate-limits.ts) limits.
- **Subscription for AI** — [src/modules/ai/application/effective-plan.ts](src/modules/ai/application/effective-plan.ts) caches `subscriptions` plan/status in Redis (60s TTL) to cut DB reads; [src/modules/billing/infrastructure/subscription-plan-cache.ts](src/modules/billing/infrastructure/subscription-plan-cache.ts) keys are invalidated when the Razorpay webhook applies subscription state.
- **Server auth paths** — [src/infrastructure/db/supabase/server-auth.ts](src/infrastructure/db/supabase/server-auth.ts) uses Supabase `getUser()` semantics for protected server shells and authorization-sensitive pages.
- **Public homepage** — `src/app/(home)/page.tsx` should remain statically prerendered and outside the middleware matcher. Do not add a blocking server-side Supabase Auth check to `/`; [src/shared/components/navbar.tsx](src/shared/components/navbar.tsx) resolves guest vs signed-in links on the client.
- **Editor streaming** — [src/modules/editor/presentation/hooks/use-screenplay-stream.ts](src/modules/editor/presentation/hooks/use-screenplay-stream.ts) batches SSE chunks with `requestAnimationFrame`; [src/modules/editor/presentation/hooks/use-auto-save.ts](src/modules/editor/presentation/hooks/use-auto-save.ts) is disabled while generation is active to avoid write amplification.
- **AI generation, usage, and credits** - [src/modules/ai/application/generation-service.ts](src/modules/ai/application/generation-service.ts), [src/modules/ai/infrastructure/provider-router.ts](src/modules/ai/infrastructure/provider-router.ts), [src/modules/ai/application/usage-service.ts](src/modules/ai/application/usage-service.ts), and [src/modules/ai/domain/costing.ts](src/modules/ai/domain/costing.ts) retrieve bounded story context, enforce task token caps, route providers, enforce monthly AI credits, reserve paid top-ups for overage, write `usage_logs`, and update `ai_usage_monthly`. If write volume becomes a bottleneck, move `recordAiUsage(...)` to a queue or batch worker.
- **Story memory** - [src/modules/story-memory](src/modules/story-memory) stores project summaries, characters, scenes, arcs, and continuity notes in Supabase pgvector. Indexing is queued through `/api/jobs/story-memory`; live generation must fall back to project fields and the recent screenplay tail if memory is empty or unavailable.
- **Project quotas** - Project creation must go through `modules/projects/application/project-service.ts` and `public.create_project_with_quota(...)`. Free lifetime credits live in `project_creation_usage` and are not restored by delete.

## Environment Setup

Copy `.env.example` to `.env.local` and fill in:

### Required
- `NEXT_PUBLIC_SITE_URL` - Canonical app URL for metadata, email links, CSRF origin checks, sitemap, and robots.
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase project credentials
- `OPENAI_API_KEY`, `GEMINI_API_KEY`, and `ANTHROPIC_API_KEY` - Direct provider keys for the AI router. Configure at least one usable provider per intended task tier. `OPENAI_API_KEY` is also required for story memory embeddings.
- `SUPABASE_SERVICE_ROLE_KEY` - Required for project quota RPC calls, AI monthly budget checks/rollups, webhook, admin, and cron routes.
- `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` — Payment processing

### For Production Features (required in production)
- `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` — Redis for distributed rate limiting
- `RAZORPAY_WEBHOOK_SECRET` — Webhook signature verification (from Razorpay Dashboard → Webhooks)
- `RESEND_API_KEY` / `RESEND_FROM_EMAIL` - Transactional email for signup/signin/reset OTPs, Master Admin OTPs, payment confirmation, expiry warnings, and PDF delivery. Supabase hosted Confirm signup, Magic link, and recovery-link emails are not used by the normal app auth flow.
- `AUTH_OTP_SECRET` / `MASTER_ADMIN_OTP_SECRET` - Recommended explicit encryption secrets for OTP challenge payloads. They fall back to server-only provider keys when unset, but production should set them directly.
- `ADMIN_HOSTS` — Comma-separated `Host` values allowed to serve `/master-admin` and `/api/master-admin` (e.g. `admin.yourdomain.com,localhost:3000`). If empty, those routes return 404 on every host.
- `FRAUD_SIGNAL_HASH_SECRET` — HMAC secret for Master Admin signup fraud detection. Required to store hash-only IP/device signals; raw IPs and user agents are never persisted.
- `REQUIRE_AAL2_FOR_MASTER_ADMIN` — Optional. Set to `1` to require MFA (JWT `aal2`) for Master Admin after operators enroll TOTP ([docs/admin-operators.md](docs/admin-operators.md)).
- `REQUIRE_AAL2_FOR_IAM_ADMIN` - Optional. Set to `1` to require MFA for privileged org actions such as member management and audit reads ([docs/iam-enterprise.md](docs/iam-enterprise.md)).
- **Admin operators** — Rows in `master_admin.users` (`user_id` → `auth.users`). Grant with SQL after schema deploy ([supabase/database.sql](supabase/database.sql), [docs/admin-operators.md](docs/admin-operators.md)). **`master_admin.audit_log`** records successful Master Admin requests (apply schema). Not env-based; `ADMIN_EMAILS` is unused.
- **Custom schemas** - After applying schema SQL, expose `user_auth` and `master_admin` in Supabase Dashboard -> API settings because the server queries them with Supabase JS `.schema(...)`.
- `CRON_SECRET` — Protects `/api/cron/*` endpoints from unauthorized calls

### Pricing (env-based, no deploy needed to change)
- `PRO_MONTHLY_PRICE_PAISE` (default: 119900 = ₹1,199)
- `PRO_ANNUAL_PRICE_PAISE` (default: 1151000 = yearly, ~20% off monthly)
- `PREMIUM_MONTHLY_PRICE_PAISE` (default: 399900 = ₹3,999)
- `PREMIUM_ANNUAL_PRICE_PAISE` (default: 3839000 = yearly, ~20% off monthly)
- `PDF_CLEAN_EXPORT_PRICE_PAISE` (default: 9900 = ₹99)

### Optional
- `AI_SIMPLE_MODELS`, `AI_STANDARD_MODELS`, `AI_COMPLEX_MODELS` - Comma-separated provider/model overrides in `provider:model` form.
- `AI_ENABLE_GEMINI_3_1_PRO` - Set to `true` only when preview Gemini Pro routing is intended.
- `AI_EXCHANGE_RATE_INR_PER_USD` - Defaults to `95` for cost planning.
- `AI_CREDIT_TOPUP_PRICE_PAISE` - Defaults to `9900` for the Pro/Premium 100K AI credit pack.
- `AI_BUDGET_FAIL_OPEN` - Local development escape hatch; production fails closed unless this is explicitly `true`.
- `NEXT_PUBLIC_CONTACT_EMAIL` - Optional marketing footer mailto target
- `SUPABASE_DATABASE_URL` — Connection pooler URL for serverless functions
- `QSTASH_TOKEN` / signing keys - Required in production for async Razorpay post-payment side effects, AI batch jobs, and story memory indexing.
- `AI_EMBEDDING_MODEL`, `AI_EMBEDDING_DIMENSIONS`, `STORY_MEMORY_TOP_K`, `STORY_MEMORY_MAX_CONTEXT_TOKENS` - Story memory embedding/retrieval controls. Defaults are `text-embedding-3-small`, `1536`, `8`, and `3000`.
- `STORY_MEMORY_JOB_SECRET` - Optional bearer/header fallback for direct `/api/jobs/story-memory` worker calls when not using QStash.
- `WAF_ENABLED`, `WAF_DRY_RUN`, `WAF_ALLOWED_IPS`, `WAF_BLOCKED_COUNTRIES` - Middleware WAF controls
- `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` - Optional Sentry runtime/build configuration
- `INTERNAL_API_SECRET` - Reserved only; no route currently validates it. Cron uses `CRON_SECRET`, and Razorpay uses Razorpay HMAC signatures.

## Architecture

**Writers Block** is a Next.js 15 (App Router) AI screenplay writing platform optimized for production performance.

### High-Level Architecture

```text
User -> Vercel Edge -> Middleware -> API Route -> Rate Limit (Redis) -> Supabase
                                          |
                              Auth + plan + project scope
                                          |
      GenerationService -> story memory + token guard -> AI Router -> OpenAI/Gemini/Anthropic -> SSE/Text
```

### Request Flow

1. **Edge/CDN** — Static assets served from Vercel Edge Network with 1-year cache
2. **Middleware** ([middleware.ts](middleware.ts)) — Auth, WAF, CSRF, Master Admin, and protected route checks; matcher excludes `/` and static marketing pages
3. **API Routes** — Serverless functions with:
   - IP-based Redis rate limiting + per-user plan-based daily limits ([src/core/security/rate-limit.ts](src/core/security/rate-limit.ts))
   - Subscription status enforcement (expired/cancelled → free tier limits)
   - Shared route helpers in `core/http` and feature orchestration in `modules/*/application`
   - Proper Cache-Control headers
4. **Database** — Supabase with:
   - Connection pooling for serverless
   - Composite indexes for performance
   - Row-Level Security (RLS)

### Modular Boundaries

`src/app/` is the Next.js routing layer. Business logic should move into feature modules:

```text
modules/<feature>/
  domain/          Zod schemas, domain types, constants
  application/     use cases and orchestration
  infrastructure/  Supabase/external-provider repositories
  ui/              feature-owned src/shared/hooks/components
```

Current extracted modules:
- `modules/ai` owns generation orchestration, task caps, routing policy, provider routing, budgets, and usage logging.
- `modules/projects` owns project schemas, cursor pagination, services, repository, and `useProjects`.
- `modules/story-memory` owns LangChain embeddings, pgvector retrieval, memory status, and indexing jobs.
- `modules/account` owns profile update schema, profile service, and profile repository.

Cross-cutting helpers live in `core/` (`core/http`, `core/errors`, `core/logger`).

### AI Models

- **GenerationService** - [src/modules/ai/application/generation-service.ts](src/modules/ai/application/generation-service.ts) classifies tasks, retrieves bounded story context, enforces task output caps, calls the provider router, and attaches usage metadata.
- **Direct provider router** - [src/modules/ai/infrastructure/provider-router.ts](src/modules/ai/infrastructure/provider-router.ts) routes screenplay generation, continuation, dialogue improvement, style rewrite, shots, movie references, and document/story generation to OpenAI, Gemini, or Anthropic.
- **Story memory** - [src/modules/story-memory](src/modules/story-memory) uses LangChain.js, OpenAI embeddings, and Supabase pgvector. Generation falls back to project fields plus recent screenplay tail when memory is missing or unavailable.
- **Simple tasks** - Gemini 2.5 Flash-Lite, GPT-4o mini, or Claude Haiku.
- **Standard tasks** - Gemini 2.5 Flash, GPT-5.4 mini, or Claude Haiku.
- **Complex tasks** - GPT-5.4, then Claude Sonnet 4.6. Gemini 3.1 Pro Preview requires `AI_ENABLE_GEMINI_3_1_PRO=true`.
- All AI endpoints require authentication, effective-plan resolution, daily rate limits, live token caps, monthly budget checks, and usage/cost recording.

### Payment Flow

```
Client → /api/razorpay/create-order → Razorpay SDK → Order ID
      → Razorpay Checkout Modal
      → /api/razorpay/verify (HMAC signature check, UX validation only)
      → /api/razorpay/webhook (HMAC body check) → Update subscription or create clean PDF purchase
```

- `/api/razorpay/webhook` is the sole source of truth for subscription writes.
- `/api/razorpay/verify` validates the client-returned Razorpay signature for UX, then the client polls `/api/subscription` until the webhook-applied state is visible.
- Free clean PDF export uses the same order/verify/webhook security model with `purpose: "pdf_clean_export"`; the webhook creates `pdf_export_purchases`, and `/api/projects/:id/export-pdf` consumes one purchase atomically.
- Payment ledger rows are written to `razorpay_payments`, subscription history is written to `subscription_events`, and `POST /api/subscription` is intentionally disabled.

### Data Layer (Supabase)

Core public app tables with Row-Level Security (users only access their own data):
- `profiles` — Extends `auth.users` with display info
- `organizations`, `organization_members`, `organization_invites` — Enterprise IAM and tenant context
- `subscriptions` — Plan tier, billing cycle, status, period dates, Razorpay IDs
- `subscription_events` — Append-only subscription change history
- `razorpay_payments` — Payment ledger for captured Razorpay payments
- `pdf_export_purchases` - One-time clean PDF export purchases and consumption state
- `projects` — Screenplay content, genre, characters, status
- `project_creation_usage` - Durable Free lifetime project creation credits
- `project_memory_status` - Per-project story-memory indexing state and content hash
- `project_story_memory` - pgvector chunks for project summaries, characters, scenes, arcs, and continuity notes
- `documents` — File attachments linked to projects
- `usage_logs` — Request-level AI generation audit and cost log
- `ai_usage_monthly` - Monthly per-user AI token and cost rollup for budget checks
- `ai_prompt_cache_entries` - Prompt context cache metadata
- `ai_batch_jobs` - Non-real-time AI job queue
- `ai_generation_feedback` - User feedback linked to AI request ids

Security-sensitive auth/control-plane tables are isolated in custom schemas:
- `user_auth.otp_challenges` - signup, signin, and password-reset OTP challenges
- `master_admin.users` - platform operators
- `master_admin.audit_log` - Master Admin request audit
- `master_admin.business_events` and `master_admin.security_events` - product/payment/security trails
- `master_admin.payment_post_process_jobs` - async payment side-effect idempotency
- `master_admin.otp_challenges` - Master Admin sign-in OTP challenges

**Schema file:** [supabase/database.sql](supabase/database.sql) — single source of truth, run in Supabase SQL Editor.

Types are in [src/infrastructure/db/types/database.ts](src/infrastructure/db/types/database.ts) (schema types) and [src/shared/types/project.ts](src/shared/types/project.ts) (business logic including `PLAN_LIMITS`, `PLAN_DAILY_LIMITS`, `BillingCycle`).

## Key Patterns

### AI Endpoint Pattern

All AI routes should use `getEffectivePlanForApiUser(...)`, `runAiRateLimits(...)`, and either `createGenerationSseResponse(...)` or `generateTextWithService(...)`:

```typescript
// 1. Auth check
const { data: { user } } = await supabase.auth.getUser()
if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

// 2. Effective plan check - expired/cancelled falls back to free
const plan = await getEffectivePlanForApiUser(supabase, user.id)

// 3. IP + per-user daily limits
const aiLimit = await runAiRateLimits(req, user.id, plan)
if (!aiLimit.ok) return aiLimit.response

// 4. Call GenerationService. It handles story context retrieval,
// task output caps, monthly budgets, provider fallback, usage_logs,
// and ai_usage_monthly.
return createGenerationSseResponse({
  userId: user.id,
  plan,
  endpoint: "generate",
  taskKind: "generate",
  projectId,
  complexity: "standard",
  systemPrompt,
  userPrompt,
  maxTokens,
  temperature,
  rateLimitHeaders: aiLimit.headers,
})
```

### Rate Limiting

Two layers in [src/core/security/rate-limit.ts](src/core/security/rate-limit.ts):

| Limiter | Scope | Limit | Use |
|---------|-------|-------|-----|
| `getGenerationRatelimit()` | Per IP | 10/hour | All AI endpoints |
| `getPlanRatelimit("free")` | Per user ID | 5/day | Free plan |
| `getPlanRatelimit("pro")` | Per user ID | 50/day | Pro plan |
| `getPlanRatelimit("premium")` | Per user ID | 200/day | Premium plan |

**Fail-open vs fail-closed**

- **General API IP limit** ([src/core/security/api-ip-limit.ts](src/core/security/api-ip-limit.ts)) — On Upstash/Redis network errors, the limiter **fails open** (allows the request) so a Redis outage does not break every authenticated API route.
- **AI generation limits** ([src/core/security/rate-limit.ts](src/core/security/rate-limit.ts)) — In **production**, if Redis env vars are missing, AI routes **fail closed** (503) unless `ALLOW_AI_WITHOUT_REDIS=1` (emergency only).

### Performance-First Development

#### 1. Data Fetching
Keep route handlers thin and move business logic into feature modules. For server components, fetch only the fields needed for the page and add cache boundaries only when the response is safe to reuse.

```typescript
import { listProjects } from "@/modules/projects/application/project-service"

const page = await listProjects({ supabase, userId, orgId, limit: 50, cursor: null })
```

#### 2. Animations
Respect user preferences and device capabilities:
```typescript
import { useAccessibility } from "@/shared/components/accessibility-provider"

const { prefersReducedMotion } = useAccessibility()
<motion.div animate={prefersReducedMotion ? false : { opacity: 1 }} />
```

#### 3. Image Optimization
Always use Next.js Image component:
```typescript
import Image from "next/image"
<Image src="..." alt="..." width={320} height={180} placeholder="blur" />
```

#### 4. Lazy Loading
```typescript
import dynamic from "next/dynamic"
const HeavyComponent = dynamic(() => import("./heavy-component"), {
  ssr: false, loading: () => <Skeleton />
})
```

#### 5. Streaming UI
Do not set React state for every SSE token. Batch stream chunks with `requestAnimationFrame` or a short timer, and avoid autosaving every partial chunk.

### Admin Routes

Admin access is gated by `master_admin.users` (service-role lookup by `auth.users` id; see [src/modules/master-admin/security/admin-privileges.ts](src/modules/master-admin/security/admin-privileges.ts), [docs/admin-operators.md](docs/admin-operators.md)).

- **Dashboard:** `src/app/dashboard/admin/page.tsx` — shows users, MRR, plan breakdown, usage, recent payments
- **Stats API:** `src/app/api/admin/stats/route.ts` — returns raw stats JSON (uses service role client)
- **Master Admin (subdomain):** `src/app/(master-admin)/master-admin/*` — host-gated via `ADMIN_HOSTS` in middleware; operator row in `master_admin.users` + service role for cross-user reads
- **Master Admin API:** `src/app/api/master-admin/*` — JSON for overview, users, subscriptions, usage, payments, security, business, fraud, plus CSV exports (`Cache-Control: private, no-store`)
- Both use `createClient(URL, SERVICE_ROLE_KEY)` initialized **inside** the handler (not at module level)

### Service Role Client Pattern

Routes that need cross-user data access (webhook, admin, cron) use the Supabase service role client. Always initialize it **inside** the handler function to avoid build-time errors:

```typescript
// CORRECT — inside handler
export async function POST(req: NextRequest) {
  const adminSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  // ...
}

// WRONG — at module level (breaks Next.js build)
const adminSupabase = createClient(URL, KEY) // ❌
```

### GET Routes That Use Live Data

Add `export const dynamic = "force-dynamic"` to prevent Next.js static prerendering:

```typescript
export const dynamic = "force-dynamic" // Required for cron/admin GET routes
```

Do not add `force-dynamic` to public marketing pages unless they truly require live per-request data. The homepage is intentionally static to avoid blank first paint from slow auth/network calls.

### API Route Standards

```typescript
// GET with caching
export const revalidate = 60
export async function GET() {
  return NextResponse.json(data, {
    headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=60" },
  })
}

// POST/mutations — never cache
export async function POST() {
  return NextResponse.json(data, {
    headers: { "Cache-Control": "no-store, max-age=0" },
  })
}
```

### Component Guidelines

#### Editor Layout
The editor uses a responsive flexbox layout:
- Left panel: Scene configuration (320px fixed)
- Center panel: Screenplay editor (flexible)
- Right panel: Reference scenes (340px, collapsible)

#### Styling
Dark cinematic theme — `cinematic.orange` (#ff6b35), `cinematic.blue` (#00d4ff), `cinematic.dark` (#0a0a0a) defined in [tailwind.config.ts](tailwind.config.ts)

#### Accessibility
- All components support `prefers-reduced-motion`
- Focus indicators on interactive elements
- ARIA labels where needed
- Error boundaries for graceful failures

### Route Groups

- `src/app/(home)/` — Public landing page
- `src/app/dashboard/` — Protected project management pages
- `src/app/dashboard/org/` — Organization switcher and member management
- `src/app/dashboard/admin/` — Admin-only analytics (requires `master_admin.users` row)
- `src/app/(master-admin)/` — Master Admin shell (requires `master_admin.users` row + host in `ADMIN_HOSTS`)
- `src/app/editor/` — Protected screenplay editor
- `src/app/api/` — All backend logic lives here as serverless route handlers
- `src/app/api/razorpay/` — Payment order creation, verification, webhook
- `src/app/api/ai/` — AI feedback and batch job creation
- `src/app/api/auth/` — App-owned OTP auth routes
- `src/app/api/business/` — Lightweight product/business event endpoints
- `src/app/api/jobs/` — QStash-style async workers, including `ai-batch` and `story-memory`
- `src/app/api/org/` — Active org and member management routes
- `src/app/api/projects/` — Org-scoped project CRUD, PDF email delivery, and project-scoped memory rebuild
- `src/app/api/rewrite-style/` — Pro/Premium screenplay style rewrite stream
- `src/app/api/documents/` — Tamil story/document generation stream
- `src/app/api/admin/` — Admin stats API (service role)
- `src/app/api/master-admin/` — Master Admin JSON APIs (service role)
- `src/app/api/cron/` — Scheduled jobs (Vercel Cron)

## Performance Checklist

When adding new features, ensure:

- [ ] **Images** use Next.js Image component with proper sizing
- [ ] **Fonts** use `display: swap` (except critical above-fold fonts)
- [ ] **Animations** check `useAccessibility()` before running
- [ ] **API Routes** have proper Cache-Control headers
- [ ] **Database Queries** select only needed columns and have matching indexes in `supabase/database.sql`
- [ ] **AI Endpoints** have both IP rate limit + per-user plan rate limit
- [ ] **AI Endpoints** check auth + subscription status
- [ ] **AI Endpoints** use `GenerationService` so story context, token caps, monthly budgets, provider fallback, `usage_logs`, and `ai_usage_monthly` stay consistent
- [ ] **Story memory** indexing stays async through `/api/jobs/story-memory`; live generation does not create embeddings inline
- [ ] **Project creation** uses the project service/RPC path, not direct inserts into `projects`
- [ ] **Streaming UI** batches SSE chunks before setting React state
- [ ] **Autosave** is paused or debounced during high-frequency generated updates
- [ ] **Middleware matcher** does not include static marketing pages without a specific need
- [ ] **Admin/Cron clients** initialized inside handler, not at module level
- [ ] **Error Boundaries** added for new route segments
- [ ] **Bundle Size** checked with `npm run build`

## File Organization

```
src/app/
├── api/
│   ├── admin/stats/      # Admin stats API (service role)
│   ├── ai/               # AI feedback and batch job creation
│   ├── auth/             # Signup, signin, OTP verification, password reset
│   ├── business/         # Product/business event endpoints
│   ├── jobs/             # QStash-style async workers
│   ├── master-admin/     # Master Admin JSON APIs (service role)
│   ├── org/              # Organization context and members
│   ├── cron/check-subscriptions/  # Daily expiry cron
│   ├── generate/         # Screenplay generation (SSE)
│   ├── generate-next/    # Scene continuation (SSE)
│   ├── improve-dialogue/ # Dialogue improvement (SSE)
│   ├── shots/            # Shot suggestions
│   ├── projects/         # Project CRUD
│   ├── razorpay/
│   │   ├── create-order/ # Payment order creation
│   │   ├── verify/       # Client-side payment verification
│   │   └── webhook/      # Server-side payment confirmation
│   ├── subscription/     # Subscription reads; writes are disabled
│   └── user/profile/     # Profile CRUD
├── dashboard/
│   ├── admin/            # Admin dashboard (master_admin.users gated)
│   ├── org/
│   ├── projects/
│   ├── settings/
│   └── subscription/
├── verify-code/          # OTP entry after signup, signin, and Master Admin signin
├── signin/
├── signup/
├── forgot-password/
├── reset-password/
├── editor/               # Screenplay editor page
├── error.tsx             # Global error boundary
├── not-found.tsx
└── layout.tsx            # Root layout with analytics

src/shared/components/
├── ui/                   # shadcn/ui components
└── loading-skeleton.tsx

src/shared/hooks/
├── useRazorpay.ts        # Payment hook (supports billingCycle param)
├── useScreenplayStream.ts # Batched SSE stream handling + autosave integration
├── useAutoSave.ts        # Debounced/local fallback autosave
└── ...

core/
├── errors/               # AppError and HTTP error shaping
├── http/                 # JSON, cache, and Zod request helpers
└── logger/               # Cross-cutting logger

modules/
├── account/              # Profile domain/application/infrastructure
└── projects/             # Project domain/application/infrastructure/ui hook

src/modules/
├── admin-privileges.ts   # master_admin.users + service role; middleware + route checks
├── admin-host.ts         # ADMIN_HOSTS allowlist for Master Admin paths
├── admin-stats.ts        # Legacy /dashboard/admin metrics
├── ai-costing.ts         # AI model prices, AI credit budgets, and cost math
├── ai-batch-jobs.ts      # Batch AI queue helpers
├── ai-prompt-cache.ts    # Prompt context cache metadata
├── ai-router.ts          # Direct provider routing, fallback, streaming, and budget checks
├── ai-task-policy.ts     # Endpoint/task routing policy
├── ai-usage.ts           # usage_logs writes and ai_usage_monthly rollups
├── master-admin-queries.ts # Bounded service-role queries for Master Admin UI/APIs
├── master-admin-auth.ts  # Server guard for (master-admin) pages
├── master-admin-api-guard.ts # Host + operator guard for /api/master-admin/*
├── email.ts              # Resend email helper
├── ratelimit.ts          # Redis rate limiting (IP + per-user plan)
├── security/             # WAF, API security, request signing
├── iam/                  # Organization IAM helpers
└── supabase/             # Supabase clients

docs/
├── README.md              # Documentation index and source-of-truth map
├── admin-operators.md    # Grant/revoke operators, ADMIN_HOSTS, troubleshooting
├── auth-and-billing-current-behavior.md
├── iam-enterprise.md
├── performance-architecture.md
├── security-architecture.md
└── supabase-auth-email-templates.md

supabase/
└── database.sql          # Complete schema (tables, indexes, RLS, triggers)

types/
├── database.ts           # Supabase schema types (including usage_logs, ai_usage_monthly, project_creation_usage)
└── project.ts            # Business logic types (PLAN_LIMITS, PLAN_DAILY_LIMITS, BillingCycle)

vercel.json               # Cron job schedule (daily 9AM UTC)
```

## Common Tasks

### Adding a New AI API Route

1. Create file in `src/app/api/new-feature/route.ts`
2. Validate JSON with a Zod schema from `src/modules/*/domain/schemas.ts` or a feature-owned schema.
3. Add `apiIpLimitOr429`, auth check, `getEffectivePlanForApiUser`, and `runAiRateLimits` before calling model providers.
4. Use `createGenerationSseResponse(...)` for streaming text or `generateTextWithService(...)` for JSON/non-stream responses.
5. Add an `AiTaskKind` and live token cap in `src/modules/ai/domain/generation.ts` for new task types.
6. Do not insert into `usage_logs` directly; `GenerationService` and the AI router record usage and update monthly rollups.
7. Add `Cache-Control: no-cache` and rate-limit headers when quota data is available.

### Adding a New Database Table

1. Add table definition to `supabase/database.sql`
2. Add RLS policies in the same file
3. Add indexes in the PERFORMANCE INDEXES section
4. Add types to `src/infrastructure/db/types/database.ts`
5. Run the SQL in Supabase SQL Editor
6. Run `ANALYZE table_name;` after creation

### Adding a New Database Index

1. Add to `supabase/database.sql` (PERFORMANCE INDEXES section) using `CREATE INDEX IF NOT EXISTS`
2. Run in Supabase SQL Editor for existing databases
3. Run `ANALYZE table_name;`

### Adding a New Component with Animations

1. Prefer the existing local motion pattern for the area you are editing.
2. Use `useAccessibility()` to check if animations should run.
3. Provide static fallback for reduced motion

### Granting or revoking admin operators

1. Ensure `master_admin.users` exists ([supabase/database.sql](supabase/database.sql)).
2. Follow [docs/admin-operators.md](docs/admin-operators.md) for SQL examples, `ADMIN_HOSTS`, and troubleshooting.
3. Set `SUPABASE_SERVICE_ROLE_KEY`; middleware uses it for `userHasAdminPrivileges`.

### Updating Prices

Change env vars — no code deploy needed:
```
PRO_MONTHLY_PRICE_PAISE=119900
PRO_ANNUAL_PRICE_PAISE=1151000
PREMIUM_MONTHLY_PRICE_PAISE=399900
PREMIUM_ANNUAL_PRICE_PAISE=3839000
PDF_CLEAN_EXPORT_PRICE_PAISE=9900
```
UI display prices are centralized in `src/modules/billing/domain/pricing-inr.ts` and consumed by the homepage, dashboard subscription page, FAQ copy, and AI Cost dashboard.

### Razorpay Webhook Setup

1. Go to Razorpay Dashboard → Settings → Webhooks
2. URL: `https://yourdomain.com/api/razorpay/webhook`
3. Events: check `payment.captured`
4. Copy the webhook secret → set as `RAZORPAY_WEBHOOK_SECRET` in Vercel

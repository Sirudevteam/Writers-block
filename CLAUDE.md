# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Start development server (port 3000)
npm run build      # Production build with optimizations
npm run start      # Start production server
npm run lint       # Run Next.js ESLint
npm run typecheck  # TypeScript check (tsc --noEmit)
npm run audit:ci   # npm audit — fails only on critical (see CI workflow)
npm run loadtest:k6  # k6 smoke test (install k6 separately — see Scale & observability)
```

No test runner is configured. There is no `test` script in package.json.

## Scale & observability (~1M requests/day)

**Dashboards to watch**

- **Vercel** — function duration, error rate, concurrent invocations, top routes; correlate cold starts with P99.
- **Supabase** — database CPU, connections, and slow queries; **Auth** request volume (session refresh and API traffic).
- **Upstash** — Redis command rate and latency (rate limits + optional subscription plan cache).
- **Sentry** (optional) — set `NEXT_PUBLIC_SENTRY_DSN` / `SENTRY_DSN` in [`.env.example`](.env.example); tunnel route `/monitoring` avoids ad-blockers on ingest.

**Baseline load test**

- Install [k6](https://k6.io/docs/get-started/installation/), then: `npm run loadtest:k6` (override `BASE_URL` / optional `COOKIE` for `/api` — see [scripts/loadtest/k6-smoke.js](scripts/loadtest/k6-smoke.js)).
- Run against production-like env before campaigns; fix regressions if `http_req_failed` or P95 duration crosses thresholds in the script.

**Platform headroom (check before high traffic)**

- **Vercel** — project region aligned with **Upstash** Redis region; function memory and plan limits support peak concurrency (order of 50–200+ short-lived req/s for typical campaign spikes on top of ~12 req/s average for ~1M requests/day).
- **Supabase** — compute and disk can sustain PostgREST + Auth load; add replicas or larger compute if dashboards show sustained CPU or slow queries.
- **Upstash** — free/pro tier enough for `ratelimit:*` and `cache:sub:*` key volume; colocate with app region.

**In-app scale hooks**

- **General API** — [lib/api-ip-limit.ts](lib/api-ip-limit.ts) applies 100 req/min per IP (when Redis is configured) to authenticated API routes. AI routes also keep stricter [lib/ai-rate-limits.ts](lib/ai-rate-limits.ts) limits.
- **Subscription for AI** — [lib/ai-effective-plan.ts](lib/ai-effective-plan.ts) caches `subscriptions` plan/status in Redis (60s TTL) to cut DB reads; [lib/subscription-plan-cache.ts](lib/subscription-plan-cache.ts) keys are invalidated on successful payment in [app/api/razorpay/verify/route.ts](app/api/razorpay/verify/route.ts) and [app/api/razorpay/webhook/route.ts](app/api/razorpay/webhook/route.ts).
- **AI credit reservations** - [lib/ai-credits.ts](lib/ai-credits.ts) reserves credits in Postgres before provider calls and settles each reservation after completion, cancellation, or failure.
- **Server layouts** — [lib/supabase/server-auth.ts](lib/supabase/server-auth.ts) uses `getSession()` after middleware refresh to avoid a duplicate `getUser()` Auth round-trip on dashboard shell and related pages.
- **usage_logs** - AI usage rows are written from settled credit reservations. If `usage_logs` write volume becomes a bottleneck, move reservation settlement side effects to a queue or batch worker without allowing provider calls before a successful reservation.

## Environment Setup

Copy `.env.example` to `.env.local` and fill in:

### Required
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase project credentials
- `REPLICATE_API_TOKEN` — For Replicate-powered screenplay generation
- Optional: `REPLICATE_MODEL_FREE` / `REPLICATE_MODEL_PRO` / `REPLICATE_MODEL_PREMIUM` (plus `REPLICATE_MODEL` fallback) — per-plan model routing in `lib/replicate-model.ts`
- `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` — Payment processing

### For Production Features (required in production)
- `SUPABASE_SERVICE_ROLE_KEY` — Server-only key for webhook, admin, cron routes
- `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` — Redis for distributed rate limiting
- `RAZORPAY_WEBHOOK_SECRET` — Webhook signature verification (from Razorpay Dashboard → Webhooks)
- `RESEND_API_KEY` / `RESEND_FROM_EMAIL` — Transactional email (payment confirmation, expiry warnings, PDF). **Sign-up verification** is sent by **Supabase Auth**; theme the “Confirm signup” (and related) templates using [docs/supabase-auth-email-templates.md](docs/supabase-auth-email-templates.md) and [emails/](emails/).
- `ADMIN_HOSTS` — Comma-separated `Host` values allowed to serve `/master-admin` and `/api/master-admin` (e.g. `admin.yourdomain.com,localhost:3000`). If empty, those routes return 404 on every host.
- **Admin operators** — Rows in `public.master_admin_users` (`user_id` → `auth.users`). Grant with SQL after schema deploy ([supabase/database.sql](supabase/database.sql), [docs/admin-operators.md](docs/admin-operators.md)). Not env-based; `ADMIN_EMAILS` is unused.
- `CRON_SECRET` — Protects `/api/cron/*` endpoints from unauthorized calls

### Pricing (env-based, no deploy needed to change)
- `PRO_MONTHLY_PRICE_PAISE` (default: 119900 = ₹1,199)
- `PRO_ANNUAL_PRICE_PAISE` (default: 1151000 = yearly, ~20% off monthly)
- `PREMIUM_MONTHLY_PRICE_PAISE` (default: 399900 = ₹3,999)
- `PREMIUM_ANNUAL_PRICE_PAISE` (default: 3839000 = yearly, ~20% off monthly)

### Optional
- `ANTHROPIC_API_KEY` — Anthropic-powered movie reference suggestions
- `SUPABASE_DATABASE_URL` — Connection pooler URL for serverless functions
- `QSTASH_TOKEN` — For async queue processing (future feature)

## Architecture

**Writers Block** is a Next.js 14 (App Router) AI screenplay writing platform optimized for production performance.

### High-Level Architecture

```
User → Vercel Edge → Middleware → API Route → Rate Limit (Redis) → Supabase
                                          ↓
                              Auth Check + Plan Check
                                          ↓
                                    Replicate AI → SSE Stream
```

### Request Flow

1. **Edge/CDN** — Static assets served from Vercel Edge Network with 1-year cache
2. **Middleware** ([middleware.ts](middleware.ts)) — Auth check, optimized matcher excludes static files
3. **API Routes** — Serverless functions with:
   - IP-based Redis rate limiting + per-user plan-based daily limits ([lib/ratelimit.ts](lib/ratelimit.ts))
   - Subscription status enforcement (expired/cancelled → free tier limits)
   - Cached queries using React `cache()` ([lib/data/queries.ts](lib/data/queries.ts))
   - Proper Cache-Control headers
4. **Database** — Supabase with:
   - Connection pooling for serverless
   - Composite indexes for performance
   - Row-Level Security (RLS)

### AI Models

- **Replicate (default: `google/gemini-2.5-flash`)** — Screenplay generation, continuation, dialogue improvement, shots, and document/story generation
- **Anthropic** — Movie reference suggestions
- All AI endpoints require authentication and check subscription plan before calling Replicate

### Payment Flow

```
Client → /api/razorpay/create-order → Razorpay SDK → Order ID
      → Razorpay Checkout Modal
      → /api/razorpay/verify (HMAC signature check) → Update subscription
      → /api/razorpay/webhook (server-side fallback, HMAC body check) → Update subscription
```

- Both `/verify` and `/webhook` update the subscription — idempotency is enforced via `unique_razorpay_payment_id` constraint
- Webhook is the reliable path for cases where the client disconnects before `/verify` completes

### Data Layer (Supabase)

Five tables with Row-Level Security (users only access their own data):
- `profiles` — Extends `auth.users` with display info
- `subscriptions` — Plan tier, billing cycle, status, period dates, Razorpay IDs
- `projects` — Screenplay content, genre, characters, status
- `documents` — File attachments linked to projects
- `usage_logs` — AI generation audit log (user_id, endpoint, plan, created_at)

**Schema file:** [supabase/database.sql](supabase/database.sql) — single source of truth, run in Supabase SQL Editor.

Types are in [types/database.ts](types/database.ts) (schema types) and [types/project.ts](types/project.ts) (business logic including `PLAN_LIMITS`, `PLAN_DAILY_LIMITS`, `BillingCycle`).

## Key Patterns

### AI Endpoint Pattern

All AI routes follow this structure:

```typescript
// 1. Auth check
const { data: { user } } = await supabase.auth.getUser()
if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

// 2. Subscription check — expired/cancelled falls back to free
const { data: subscription } = await (supabase.from("subscriptions") as any)
  .select("plan, status").eq("user_id", user.id).single()
const effectivePlan: SubscriptionPlan =
  subscription?.status === "active" ? subscription.plan : "free"

// 3. IP-based rate limit (global guard)
const ipResult = await getGenerationRatelimit().limit(getClientIP(req))
if (!ipResult.success) return NextResponse.json({ error: "..." }, { status: 429 })

// 4. Per-user plan-based daily limit
const planResult = await getPlanRatelimit(effectivePlan).limit(user.id)
if (!planResult.success) return NextResponse.json({ error: "..." }, { status: 429 })

// 5. Reserve credits before provider work
const reservation = await reserveAiCredit({
  supabase,
  userId: user.id,
  endpoint: "generate",
  credits: 1,
})
if (!reservation.ok) return NextResponse.json({ error: "..." }, { status: 402 })

// 6. Mark provider start, call Replicate, then settle the reservation
await markAiCreditProviderStarted(supabase, reservation.reservationId)
try {
  // Call Replicate + stream response
  await settleAiCreditReservation(supabase, reservation.reservationId, "succeeded")
} catch (error) {
  await settleAiCreditReservation(supabase, reservation.reservationId, "failed_charged")
  throw error
}
```

### Rate Limiting

Two layers in [lib/ratelimit.ts](lib/ratelimit.ts):

| Limiter | Scope | Limit | Use |
|---------|-------|-------|-----|
| `getGenerationRatelimit()` | Per IP | 10/hour | All AI endpoints |
| `getPlanRatelimit("free")` | Per user ID | 5/day | Free plan |
| `getPlanRatelimit("pro")` | Per user ID | 50/day | Pro plan |
| `getPlanRatelimit("premium")` | Per user ID | 200/day | Premium plan |

**Fail-open vs fail-closed**

- **General API IP limit** ([lib/api-ip-limit.ts](lib/api-ip-limit.ts)) — On Upstash/Redis network errors, the limiter **fails open** (allows the request) so a Redis outage does not break every authenticated API route.
- **AI generation limits** ([lib/ratelimit.ts](lib/ratelimit.ts)) — In **production**, if Redis env vars are missing, AI routes **fail closed** (503) unless `ALLOW_AI_WITHOUT_REDIS=1` (emergency only).

### Performance-First Development

#### 1. Data Fetching
Always use cached queries for server components:
```typescript
import { getUserData, getProjects } from "@/lib/data/queries"

const userData = await getUserData() // Cached + deduplicated
const projects = await getProjects(userId)
```

#### 2. Animations
Respect user preferences and device capabilities:
```typescript
import { useMotionPreference } from "@/hooks/useMotionPreference"

const { shouldReduceMotion } = useMotionPreference()
<motion.div animate={shouldReduceMotion ? {} : { opacity: 1 }} />
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

### Admin Routes

Admin access is gated by `public.master_admin_users` (service-role lookup by `auth.users` id; see [lib/admin-privileges.ts](lib/admin-privileges.ts), [docs/admin-operators.md](docs/admin-operators.md)).

- **Dashboard:** `app/dashboard/admin/page.tsx` — shows users, MRR, plan breakdown, usage, recent payments
- **Stats API:** `app/api/admin/stats/route.ts` — returns raw stats JSON (uses service role client)
- **Master Admin (subdomain):** `app/(master-admin)/master-admin/*` — host-gated via `ADMIN_HOSTS` in middleware; operator row in `master_admin_users` + service role for cross-user reads
- **Master Admin API:** `app/api/master-admin/*` — JSON for overview, users, subscriptions, usage (`Cache-Control: private, no-store`)
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

- `app/(home)/` — Public landing page
- `app/dashboard/` — Protected project management pages
- `app/dashboard/admin/` — Admin-only analytics (requires `master_admin_users` row)
- `app/(master-admin)/` — Master Admin shell (requires `master_admin_users` row + host in `ADMIN_HOSTS`)
- `app/editor/` — Protected screenplay editor
- `app/auth/callback/` — OAuth redirect handler
- `app/api/` — All backend logic lives here as serverless route handlers
- `app/api/razorpay/` — Payment order creation, verification, webhook
- `app/api/admin/` — Admin stats API (service role)
- `app/api/master-admin/` — Master Admin JSON APIs (service role)
- `app/api/cron/` — Scheduled jobs (Vercel Cron)

## Performance Checklist

When adding new features, ensure:

- [ ] **Images** use Next.js Image component with proper sizing
- [ ] **Fonts** use `display: swap` (except critical above-fold fonts)
- [ ] **Animations** check `useMotionPreference()` before running
- [ ] **API Routes** have proper Cache-Control headers
- [ ] **Database Queries** use `cache()` from React (server components)
- [ ] **AI Endpoints** have both IP rate limit + per-user plan rate limit
- [ ] **AI Endpoints** check auth + subscription status
- [ ] **AI Endpoints** reserve credits before provider calls and settle exactly once
- [ ] **Admin/Cron clients** initialized inside handler, not at module level
- [ ] **Error Boundaries** added for new route segments
- [ ] **Bundle Size** checked with `npm run build`

## File Organization

```
app/
├── api/
│   ├── admin/stats/      # Admin stats API (service role)
│   ├── master-admin/     # Master Admin JSON APIs (service role)
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
│   ├── subscription/     # Subscription reads/updates
│   └── user/profile/     # Profile CRUD
├── dashboard/
│   ├── admin/            # Admin dashboard (master_admin_users gated)
│   ├── projects/
│   ├── settings/
│   └── subscription/
├── editor/               # Screenplay editor page
├── error.tsx             # Global error boundary
├── not-found.tsx
└── layout.tsx            # Root layout with analytics

components/
├── ui/                   # shadcn/ui components
├── lottie-animation.tsx
└── loading-skeleton.tsx

hooks/
├── useMotionPreference.ts
├── useRazorpay.ts        # Payment hook (supports billingCycle param)
└── ...

lib/
├── admin-privileges.ts   # master_admin_users + service role; middleware + route checks
├── admin-host.ts         # ADMIN_HOSTS allowlist for Master Admin paths
├── admin-stats.ts        # Legacy /dashboard/admin metrics
├── master-admin-queries.ts # Bounded service-role queries for Master Admin UI/APIs
├── master-admin-auth.ts  # Server guard for (master-admin) pages
├── master-admin-api-guard.ts # Host + operator guard for /api/master-admin/*
├── data/queries.ts       # Cached data fetching
├── email.ts              # Resend email helper
├── ratelimit.ts          # Redis rate limiting (IP + per-user plan)
├── motion.ts             # Tree-shaken motion exports
└── supabase/             # Supabase clients

docs/
├── admin-operators.md    # Grant/revoke operators, ADMIN_HOSTS, troubleshooting
└── supabase-auth-email-templates.md

supabase/
└── database.sql          # Complete schema (tables, indexes, RLS, triggers)

types/
├── database.ts           # Supabase schema types (including usage_logs)
└── project.ts            # Business logic types (PLAN_LIMITS, PLAN_DAILY_LIMITS, BillingCycle)

vercel.json               # Cron job schedule (daily 9AM UTC)
```

## Common Tasks

### Adding a New AI API Route

1. Create file in `app/api/new-feature/route.ts`
2. Add auth check → subscription check → IP rate limit → plan rate limit (in that order)
3. Reserve credits with `reserveAiCredit` before any provider call. Return 402/429/503 without calling the provider when reservation fails.
4. Mark provider start immediately before the external AI call, then settle as `succeeded`, `failed_charged`, or release if the provider never started.
5. Stream response via ReadableStream + SSE
6. Add `Cache-Control: no-cache` header

### Adding a New Database Table

1. Add table definition to `supabase/database.sql`
2. Add RLS policies in the same file
3. Add indexes in the PERFORMANCE INDEXES section
4. Add types to `types/database.ts`
5. Run the SQL in Supabase SQL Editor
6. Run `ANALYZE table_name;` after creation

### Adding a New Database Index

1. Add to `supabase/database.sql` (PERFORMANCE INDEXES section) using `CREATE INDEX IF NOT EXISTS`
2. Run in Supabase SQL Editor for existing databases
3. Run `ANALYZE table_name;`

### Applying AI Credit Reservation Schema

The AI credit routes fail closed when the reservation RPCs are missing. Before enabling these routes in an environment, apply the `ai_credit_reservations` table and `reserve_ai_credit`, `mark_ai_credit_provider_started`, and `settle_ai_credit_reservation` functions from `supabase/database.sql`.

- `reserve_ai_credit` locks the active user subscription row before checking held and settled usage.
- `mark_ai_credit_provider_started` records the point after which provider-started failures are charged.
- `settle_ai_credit_reservation` is the only path that writes the final usage event.

### Adding a New Component with Animations

1. Import from `lib/motion.ts` instead of `framer-motion`
2. Use `useMotionPreference()` to check if animations should run
3. Provide static fallback for reduced motion

### Granting or revoking admin operators

1. Ensure `master_admin_users` exists ([supabase/database.sql](supabase/database.sql)).
2. Follow [docs/admin-operators.md](docs/admin-operators.md) for SQL examples, `ADMIN_HOSTS`, and troubleshooting.
3. Set `SUPABASE_SERVICE_ROLE_KEY`; middleware uses it for `userHasAdminPrivileges`.

### Updating Prices

Change env vars — no code deploy needed:
```
PRO_MONTHLY_PRICE_PAISE=119900
PRO_ANNUAL_PRICE_PAISE=1151000
PREMIUM_MONTHLY_PRICE_PAISE=399900
PREMIUM_ANNUAL_PRICE_PAISE=3839000
```
UI display prices are still in `components/home-pricing.tsx` and `app/dashboard/subscription/page.tsx`.

### Razorpay Webhook Setup

1. Go to Razorpay Dashboard → Settings → Webhooks
2. URL: `https://yourdomain.com/api/razorpay/webhook`
3. Events: check `payment.captured`
4. Copy the webhook secret → set as `RAZORPAY_WEBHOOK_SECRET` in Vercel

## Pricing

Pro: ₹1,199/month (yearly: ~₹959/month billed annually, default env)
Premium: ₹3,999/month (yearly: ~₹3,199/month billed annually, default env)

Prices are controlled by:
- **Display:** `components/home-pricing.tsx`, `app/dashboard/subscription/page.tsx`
- **Payment amounts:** env vars (`PRO_MONTHLY_PRICE_PAISE`, etc.) with fallback in `app/api/razorpay/create-order/route.ts`

## Recent Changes

### April 2026 — Admin operators table

- **`master_admin_users`:** Platform operators (`/dashboard/admin`, `/master-admin`, `/api/master-admin`) are authorized by rows keyed to `auth.users.id`, not `ADMIN_EMAILS`.
- **Customer metrics:** Master Admin user lists and related aggregates exclude operator ids.
- **Docs:** [docs/admin-operators.md](docs/admin-operators.md)

### March 2026 — Security & Billing Release
- **Razorpay Webhook:** Server-side payment confirmation at `/api/razorpay/webhook` — reliable fallback if client disconnects
- **Payment Idempotency:** Unique constraint on `razorpay_payment_id` prevents double-processing
- **Annual Plans:** `billing_cycle` column, 365-day period, env-based annual pricing
- **Subscription Enforcement:** All AI endpoints check plan status — expired/cancelled → free tier limits
- **Per-User Rate Limits:** Plan-based daily limits (free: 5/day, pro: 50/day, premium: 200/day)
- **Usage Tracking:** settled AI credit reservations write final `usage_logs` rows
- **Email Notifications:** Resend integration (`lib/email.ts`) — payment confirmation + 7-day expiry warnings
- **Admin Dashboard:** `/dashboard/admin` with MRR, users, plan breakdown, usage stats, recent payments
- **Subscription Expiry Cron:** `/api/cron/check-subscriptions` runs daily at 9AM UTC via Vercel Cron
- **Content Security Policy:** CSP header in `next.config.js` covering Razorpay, Supabase, Replicate, Resend

### Performance Optimization Release
- **Bundle Optimization**: Tree-shaking, dynamic imports, optimized package imports
- **Image Optimization**: WebP/AVIF formats, responsive sizes, lazy loading
- **Font Optimization**: `display: swap`, selective preloading
- **Rate Limiting**: Redis-based distributed rate limiting with Upstash
- **Database Indexes**: Composite indexes for common query patterns
- **API Caching**: Proper Cache-Control headers with stale-while-revalidate
- **Error Boundaries**: Global and route-specific error handling
- **Analytics**: Vercel Analytics and Speed Insights integration
- **Motion Optimization**: Low-power device detection, reduced-motion support

### Previous Changes
- **Editor Redesign:** Collapsible reference panel, fixed video thumbnails, improved form UX with progress bar
- **Pricing UI:** Updated toggle switch, proper badge positioning, 20% savings display
- **CTA Section:** Professional gradient border, countdown timer, trust badges
- **Footer:** Proper 5-column alignment with newsletter signup
- **Accessibility:** Added `prefers-reduced-motion` support, focus indicators, skeleton screens

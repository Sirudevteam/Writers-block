# Writers Block

Writers Block is a production-focused AI screenplay writing platform built with Next.js 15, Supabase, Upstash Redis, Razorpay, and direct OpenAI/Gemini/Anthropic routing. It supports Tamil-first screenplay workflows, English-friendly UI, streaming AI generation, paid plans, admin analytics, PDF delivery, AI cost controls, and operational guardrails needed for a real SaaS product.

## What The App Does

- Generate screenplay scenes with streamed AI output.
- Continue an existing screenplay with `generate-next`.
- Improve dialogue while preserving screenplay structure.
- Rewrite scenes with Pro/Premium style presets.
- Suggest cinematic shot ideas.
- Recommend movie reference scenes for tone and structure.
- Generate Tamil story drafts through the document/story endpoint.
- Maintain project story memory for summaries, characters, scenes, arcs, and continuity notes.
- Manage saved projects, subscriptions, user profiles, and organization context.
- Export or email screenplay PDFs.
- Track usage and exact AI API cost by plan, provider, model, and endpoint.
- Enforce task-specific live token caps, monthly AI credit budgets, paid credit top-ups, per-user daily limits, per-IP limits, and Free lifetime project creation credits.

## Core Stack

- Framework: Next.js 15 App Router
- Language: TypeScript
- Styling: Tailwind CSS
- UI primitives: Radix UI and shadcn/ui
- Database and auth: Supabase
- Rate limiting: Upstash Redis
- Payments: Razorpay
- Email: Resend
- AI generation: direct OpenAI, Gemini, and Anthropic router
- Story memory: LangChain.js, OpenAI embeddings, and Supabase pgvector
- Monitoring: Vercel Analytics, Speed Insights, and optional Sentry

## AI Model Setup

Streaming and JSON writing endpoints pass through `src/modules/ai/application/generation-service.ts`, then use `src/modules/ai/infrastructure/provider-router.ts` for direct OpenAI, Gemini, and Anthropic routing by task complexity.

- Simple tasks: Gemini 2.5 Flash-Lite, GPT-4o mini, or Claude Haiku.
- Standard tasks: Gemini 2.5 Flash, GPT-5.4 mini, or Claude Haiku.
- Complex tasks: GPT-5.4 first, then Claude Sonnet 4.6; Gemini 3.1 Pro Preview is behind `AI_ENABLE_GEMINI_3_1_PRO=true`.
- `GenerationService` classifies the task, retrieves project story context, enforces live output caps, calls the provider router, and records usage metadata.
- Story memory uses `text-embedding-3-small` by default and falls back to project fields plus the recent screenplay tail when pgvector chunks are missing or unavailable.
- Monthly AI credit budgets live in `src/modules/ai/domain/costing.ts`: Free 100K credits, Pro 600K credits, Premium 2M credits. One AI credit equals one total AI token.
- Pro and Premium users can buy 100K non-expiring extra AI credits for ₹99 after included monthly credits are exhausted.
- Budget behavior: 70% warning, 85% model downgrade, 100% hard cap.
- Style rewrite is available to Pro and Premium users.

See [docs/ai-cost-and-project-quotas.md](docs/ai-cost-and-project-quotas.md) for the routing, budget, cost, and quota source of truth.

## Main Product Areas

### Public Marketing Site

- Static, fast-rendering cinematic landing page
- Feature and workflow sections
- Monthly and yearly pricing toggle
- CTA and conversion-focused sections
- Client-side navbar auth detection, so the public homepage does not block first paint on Supabase Auth

### Authenticated Dashboard

- Project list and project detail flows
- Subscription status and upgrade surface
- Settings and profile management
- Organization switcher and member management under `/dashboard/org`
- Admin dashboard for users granted in `master_admin.users`
- **Master Admin** (optional subdomain): deeper metrics, user/payment/subscription/usage tables, AI Cost dashboard, audit view, and CSV exports at `/master-admin` when the request `Host` is listed in `ADMIN_HOSTS`

### Screenplay Editor

- Scene setup form
- Live streamed screenplay generation
- Dialogue improvement
- Style rewrite presets for paid plans
- Scene continuation
- Shot suggestions
- Reference scene recommendations
- Autosave to saved projects
- Browser PDF export
- Server-side PDF email delivery

### Backend Platform

- Supabase-backed auth and persistence
- OTP-first signup, password + OTP sign-in, and OTP-based password reset
- Organization IAM with active-org scoping for project APIs
- Atomic project quota enforcement, including Free lifetime creation credits
- Middleware WAF, CSRF checks, security headers, and narrow route matching
- Redis-backed rate limits
- Razorpay order creation, verification, and webhook reconciliation
- Subscription expiry cron job
- Usage logging, monthly rollups, and cost accounting for AI endpoints

## Architecture Overview

```text
Browser
  -> Next.js app
  -> Middleware auth checks for protected/auth/admin/API routes
  -> API routes and Server Components
     -> core/http + core/errors helpers
     -> modules/* application services
     -> modules/* infrastructure repositories
     -> Redis rate limiting
     -> Supabase auth and data access
     -> OpenAI / Gemini / Anthropic / Razorpay / Resend
```

### Important Backend Patterns

- Authenticated AI routes check the current user before model calls.
- Public marketing pages should not perform server-side Supabase Auth checks before rendering. Keep `/` static, outside middleware, and let the navbar resolve auth client-side.
- Feature code is being migrated into `modules/*` with `domain`, `application`, `infrastructure`, and optional `ui` layers. `src/app/` should stay as the routing layer.
- Effective plan is derived from subscription state, so expired or inactive subscriptions fall back safely.
- AI endpoints apply both IP-based and per-user daily limits.
- AI endpoints apply monthly AI credit budgets before provider calls and write exact cost data to `usage_logs` plus `ai_usage_monthly`.
- Project creation goes through the org-scoped service and `create_project_with_quota` RPC; do not insert projects directly from new application code.
- Admin, webhook, and cron handlers use the Supabase service role inside the handler, not at module scope.
- **Operator privileges** are stored in `master_admin.users` (see [docs/admin-operators.md](docs/admin-operators.md)), not in env email lists.

## Environment Variables

Copy `.env.example` to `.env.local` and fill in the values relevant to your setup.

### Required For Local Development

```bash
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
OPENAI_API_KEY=...
GEMINI_API_KEY=...
ANTHROPIC_API_KEY=...
RAZORPAY_KEY_ID=...
RAZORPAY_KEY_SECRET=...
```

### Required For Production Features

```bash
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
RAZORPAY_WEBHOOK_SECRET=...
RESEND_API_KEY=...
RESEND_FROM_EMAIL=...
QSTASH_TOKEN=...
QSTASH_CURRENT_SIGNING_KEY=...
QSTASH_NEXT_SIGNING_KEY=...
CRON_SECRET=...
# Master Admin: comma-separated hosts that may serve /master-admin (e.g. admin.yourdomain.com,localhost:3000)
ADMIN_HOSTS=localhost:3000
# Master Admin fraud detection: HMAC secret for hash-only IP/device correlation
FRAUD_SIGNAL_HASH_SECRET=...
# Grant operators in SQL: INSERT INTO master_admin.users (user_id) VALUES ('<auth.users uuid>');
```

### Optional Or Feature-Specific

```bash
AI_SIMPLE_MODELS=gemini:gemini-2.5-flash-lite,openai:gpt-4o-mini
AI_STANDARD_MODELS=gemini:gemini-2.5-flash,openai:gpt-5.4-mini
AI_COMPLEX_MODELS=openai:gpt-5.4,anthropic:claude-sonnet-4-6
AI_ENABLE_GEMINI_3_1_PRO=false
AI_EXCHANGE_RATE_INR_PER_USD=95
AI_BUDGET_FAIL_OPEN=false
AI_PROMPT_CACHE_TTL_HOURS=24
AI_CREDIT_TOPUP_PRICE_PAISE=9900
AI_EMBEDDING_MODEL=text-embedding-3-small
AI_EMBEDDING_DIMENSIONS=1536
STORY_MEMORY_TOP_K=8
STORY_MEMORY_MAX_CONTEXT_TOKENS=3000
AI_PROVIDER_MOCK=false
MAX_TOKENS=8000
SUPABASE_DATABASE_URL=...
AUTH_OTP_SECRET=...
MASTER_ADMIN_OTP_SECRET=...
REQUIRE_AAL2_FOR_MASTER_ADMIN=0
REQUIRE_AAL2_FOR_IAM_ADMIN=0
ALLOW_AI_WITHOUT_REDIS=1
AI_BATCH_JOB_SECRET=...
STORY_MEMORY_JOB_SECRET=...
ENABLE_E2E_TEST_ROUTES=false
E2E_TEST_SECRET=...
WAF_ENABLED=true
WAF_DRY_RUN=true
```

`OPENAI_API_KEY` is also required for story memory embeddings, even when generation traffic is routed to Gemini or Anthropic.

### Pricing Configuration

```bash
PRO_MONTHLY_PRICE_PAISE=119900
PRO_ANNUAL_PRICE_PAISE=1151000
PREMIUM_MONTHLY_PRICE_PAISE=399900
PREMIUM_ANNUAL_PRICE_PAISE=3839000
PDF_CLEAN_EXPORT_PRICE_PAISE=9900
```

## Getting Started

### Prerequisites

- Node.js 18+
- npm
- Supabase project
- Upstash Redis database for production-like rate limiting

### Install

```bash
npm install
```

### Configure

```bash
cp .env.example .env.local
```

Populate `.env.local` with your project values.

### Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Available Scripts

- `npm run dev` starts the development server.
- `npm run build` creates a production build.
- `npm run start` runs the production build.
- `npm run lint` runs the Next.js ESLint command.
- `npm run typecheck` runs `tsc --noEmit`.
- `npm run test:security` runs the Vitest security suite for payment, database, AI routing, and quota edge cases.
- `npm run test:e2e` runs the Playwright Release 1 smoke flows with deterministic AI provider mode.
- `npm run test:evals` runs offline deterministic AI eval fixtures; it must not call live providers.
- `npm run db:types` regenerates Supabase database types from the local database.
- `npm run audit:ci` fails only on critical npm audit findings.

There is no broad `npm test` script; use the focused scripts above.

## Database Setup

Fresh Supabase setup now uses one consolidated schema file only: `supabase/database.sql`.

It defines:

- `vector` extension for story memory embeddings
- `user_auth.otp_challenges` (normal signup/signin/password-reset OTP challenges)
- `master_admin.users` (platform operators; isolated from customer analytics lists)
- `master_admin.audit_log` (Master Admin request audit trail)
- `master_admin.business_events` and `master_admin.security_events` (product/payment/security audit trails)
- `master_admin.otp_challenges` (Master Admin sign-in OTP challenges)
- `master_admin.payment_post_process_jobs` (idempotent async subscription side effects)
- `profiles`
- `organizations`, `organization_members`, `organization_invites`, `organization_security_policies`, `scim_provisioned_users`, and `iam_audit_log`
- `subscriptions`
- `subscription_events`
- `billing_customers`, `billing_subscription_ledger`, `billing_invoices`, and `billing_refunds`
- `razorpay_payments`
- `pdf_export_purchases`
- `account_export_requests`, `account_deletion_requests`, `support_tickets`, and `user_consents`
- `project_comments` and `project_activity_events`
- `projects`
- `project_creation_usage`
- `ai_credit_topup_purchases`
- `ai_credit_reservations`
- `ai_credit_reservation_allocations`
- `project_memory_status`
- `project_story_memory`
- `documents`
- `usage_logs`
- `ai_usage_monthly`
- `ai_prompt_cache_entries`
- `ai_batch_jobs`
- `ai_generation_feedback`
- storage bucket `documents`
- indexes and constraints
- row-level security policies
- helper triggers, defaults, and RPCs including `match_project_story_memory`, `apply_ai_credit_topup_payment`, `reserve_ai_credit_topup`, `finalize_ai_credit_reservation`, and `release_ai_credit_reservation`

For a new Supabase project, apply `supabase/database.sql` once in the Supabase SQL Editor.

After applying the SQL, expose these schemas in Supabase Dashboard -> API settings so server-side Supabase JS `.schema(...)` calls can reach them:

```text
user_auth
master_admin
```

## Admin operators and Master Admin

**Full guide:** [docs/admin-operators.md](docs/admin-operators.md)

Summary:

1. **`master_admin.users`** — one row per operator (`user_id` = `auth.users.id`). Grant with SQL after auth users exist; **`ADMIN_EMAILS` is not used**.
2. **`SUPABASE_SERVICE_ROLE_KEY`** — required so middleware and routes can verify membership.
3. **`ADMIN_HOSTS`** — comma-separated allowed `Host` values for **`/master-admin`** and **`/api/master-admin`** only. Empty = 404 on those routes everywhere. Local dev typically includes `localhost:3000` (and `127.0.0.1:3000` if you use that origin).
4. **`/dashboard/admin`** uses the same DB operator check but is **not** host-gated.
5. **Master Admin sign-in** uses the same `email + password -> OTP -> session` pattern, but stores OTPs in `master_admin.otp_challenges`.

Master Admin is a **separate surface** from the marketing site: it lives under `/master-admin` and is only reachable when the browser **`Host`** matches **`ADMIN_HOSTS`**. If `ADMIN_HOSTS` is empty, those routes return **404** on every host (fail closed).

### Deployment checklist (Vercel + DNS)

1. Add your admin hostname to the Vercel project (e.g. **Settings → Domains**): `admin.yourdomain.com`.
2. Create a DNS `CNAME` (or `A`/`ALIAS` as Vercel instructs) so `admin.yourdomain.com` points to the deployment.
3. Set **`ADMIN_HOSTS`** in Vercel to that hostname exactly as clients send it (usually `admin.yourdomain.com` without port).
4. **`INSERT` your operator `user_id`(s) into `master_admin.users`** (see [docs/admin-operators.md](docs/admin-operators.md)).
5. Open `https://admin.yourdomain.com/master-admin` after signing in (session cookies are scoped to that host on first visit; sign in on the admin host or rely on your auth cookie domain if you configure it).

Do not link Master Admin from the public homepage unless you intend to expose the URL.

## API Surface

Current top-level API groups:

- `src/app/api/admin`
- `src/app/api/ai`
- `src/app/api/auth`
- `src/app/api/business`
- `src/app/api/cron`
- `src/app/api/documents`
- `src/app/api/generate`
- `src/app/api/generate-next`
- `src/app/api/improve-dialogue`
- `src/app/api/jobs`
- `src/app/api/master-admin`
- `src/app/api/movie-references`
- `src/app/api/org`
- `src/app/api/projects`
- `src/app/api/razorpay`
- `src/app/api/rewrite-style`
- `src/app/api/shots`
- `src/app/api/subscription`
- `src/app/api/user`

Internal async routes include `src/app/api/jobs/ai-batch` and `src/app/api/jobs/story-memory`. The project-scoped debug rebuild route is `src/app/api/projects/[id]/memory/rebuild`.
AI credit usage is exposed at `src/app/api/ai/credits`.

## Repository Structure

```text
src/app/
  (home)/                Public landing pages
  api/                   Route handlers
  dashboard/             Protected dashboard, projects, org, settings, billing
  (master-admin)/        Master Admin shell (host-gated via ADMIN_HOSTS)
  editor/                Screenplay editor page
  signin/ signup/        Auth screens
  verify-code/           OTP entry after signup, signin, and Master Admin signin
  forgot-password/       Password reset request
  reset-password/        OTP-based password reset

core/
  errors/                Shared application/HTTP error helpers
  http/                  JSON, cache, and validation helpers
  logger/                Cross-cutting logging wrapper

modules/
  account/               Profile domain schema, service, repository
  ai/                    Generation service, routing policy, budget/cost domain
  projects/              Project domain schema, service, repository, hook
  story-memory/          LangChain embeddings, pgvector repository, indexing jobs

src/shared/components/
  auth/                  Auth forms and shells
  master-admin/          Master Admin UI helpers
  org/                   Organization switcher and member table
  ui/                    Shared UI primitives
  screenplay-editor.tsx  Editor rendering and export actions

src/shared/hooks/
  useRazorpay.ts
  useScreenplayStream.ts
  useUser.ts

src/modules/
  admin-privileges.ts   # Operator check (master_admin.users + service role)
  admin-stats.ts
  admin-host.ts         # ADMIN_HOSTS parsing for Master Admin
  ai-costing.ts         # AI model pricing, AI credit budgets, and cost calculations
  ai-router.ts          # Direct provider routing, fallback, streaming, and budget checks
  ai-usage.ts           # Request usage logging and monthly budget rollups
  ai-rate-limits.ts
  ai-batch-jobs.ts
  ai-prompt-cache.ts
  ai-task-policy.ts
  auth/                 # OTP, auth API, safe error, and sign-out helpers
  email.ts
  iam/                  # Active org, role, permission, MFA, and API guards
  master-admin-audit.ts
  master-admin-api-guard.ts
  master-admin-csv.ts
  master-admin-queries.ts
  ratelimit.ts
  security/             # Middleware WAF, API security, and WAF logging
  screenplay-pdf.ts
  screenplay-print-html.ts
  subscription.ts
  supabase/

docs/
  README.md
  admin-operators.md
  ai-cost-and-project-quotas.md
  auth-and-billing-current-behavior.md
  enterprise-product-logic.md
  iam-enterprise.md
  security-architecture.md
  performance-architecture.md
  supabase-auth-email-templates.md

supabase/
  database.sql

emails/
  supabase-*.html        Legacy/reference Supabase hosted email templates

infra/
  *.tf                   Terraform Cloudflare configuration

types/
  database.ts
  project.ts
```

## Billing Notes

- Free, Pro, and Premium plans are supported.
- Free includes 3 lifetime project creations. Deleting a Free project does not restore credits.
- Pro and Premium use active project slots, so paid users can delete and recreate while staying under their active slot limits.
- Project creation is enforced atomically through `create_project_with_quota` and the `enforce_project_limit_before_insert` trigger.
- Pro and Premium support monthly and annual pricing.
- Paid plan checkout starts in `POST /api/billing/subscriptions` and uses Razorpay Subscriptions.
- One-time clean PDF exports and AI credit top-ups still start in `/api/razorpay/create-order`.
- Client-side payment signature validation for order-based purchases happens in `/api/razorpay/verify`.
- Subscription entitlement writes are webhook-source-of-truth through Razorpay `subscription.*` events sent to `/api/razorpay/webhook`.
- Billing history is available from `/api/billing/history`; invoice detail is available from `/api/billing/invoices/:id`.
- Free users can download watermarked PDFs for free or buy one clean PDF download for the current saved project for ₹99.
- Clean PDF purchases are webhook-created in `pdf_export_purchases` and consumed atomically by `consume_pdf_export_purchase`.
- Pro and Premium users download clean PDFs without the ₹99 prompt; Free email PDFs remain watermarked.
- One-time payment ledger rows are stored in `razorpay_payments`; recurring subscription history is stored in `billing_subscription_ledger` and invoice rows in `billing_invoices`.
- `GET /api/subscription` reads the current row with private cache headers. `POST /api/subscription` is intentionally disabled; plan changes must go through checkout.
- Subscription expiry and dunning maintenance runs on `/api/cron/check-subscriptions`; enterprise cleanup runs on `/api/cron/cleanup-enterprise`.

## Enterprise Product Notes

- Owners manage billing, SSO, SCIM, tenant security policy, and destructive account/org actions.
- Admins manage members and projects but cannot manage billing or tenant security policy.
- Organization invites support create/list/resend/revoke/accept APIs with hashed invite tokens.
- Supabase SAML SSO starts at `POST /api/auth/sso/start` and completes through `/auth/callback`.
- Custom SCIM provisioning is available under `/api/scim/v2/:orgId/Users` with hashed bearer tokens.
- Private organization collaboration includes project comments and activity feeds. External share/review links are intentionally out of scope.
- Public legal pages are available at `/terms`, `/privacy`, `/refund-policy`, and `/fair-usage`.

## Auth Notes

- Signup flow: `email + password -> OTP -> account verified`. Writers Block stores the challenge in `user_auth.otp_challenges` and sends the code through Resend.
- Sign-in flow: `email + password -> OTP -> session`. Password verification happens first; the browser session is withheld until OTP succeeds.
- Password reset flow: `email -> OTP -> new password`. It does not use Supabase PKCE recovery links.
- Master Admin sign-in uses the same password + OTP shape, but the operator check and OTP challenge live in the isolated `master_admin` schema.
- `AUTH_OTP_SECRET` and `MASTER_ADMIN_OTP_SECRET` are recommended for encrypting OTP payloads. They fall back to server-only keys when unset; production should set explicit secrets.
- Supabase hosted **Confirm signup**, **Magic link**, and recovery-link emails are not used by the normal app auth flow.
- The HTML files under `emails/` are legacy/reference templates only. The live business OTP emails are composed in code and sent through Resend.
- For auth-sensitive server paths, prefer Supabase `getUser()` semantics over trusting `getSession()`.

## Performance And Reliability Notes

- Rate limits are enforced with Upstash Redis.
- The public homepage is statically prerendered and intentionally excluded from the middleware matcher. Do not add blocking server auth calls to `/`; use client-side auth detection in the navbar for guest vs signed-in links.
- `npm run build` was verified on May 4, 2026; see [docs/performance-architecture.md](docs/performance-architecture.md) for the current route-size baseline.
- Screenplay streaming batches client updates and pauses autosave during generation to protect INP on long outputs.
- The editor renders plain streaming text while generation is active, then resumes structured screenplay parsing after generation settles.
- Database indexes in `supabase/database.sql` cover project pagination, admin date scans, subscription filters, email search, and Razorpay history.
- `project_creation_usage` and `ai_usage_monthly` keep quota checks fast without scanning project or usage history on every request.
- API routes set explicit cache headers.
- Motion-aware UI respects reduced-motion preferences.
- CI currently runs lint, typecheck, critical `npm audit`, dependency review on PRs, Semgrep, CodeQL, and manual OWASP ZAP baseline scans.
- The app includes error boundaries and defensive fallback handling around external services.
- See [docs/performance-architecture.md](docs/performance-architecture.md) for the latest build baseline, bottlenecks, and measurement workflow.

## Deployment

Recommended target: Vercel.

### Production Checklist

- Add all required environment variables.
- Apply `supabase/database.sql`.
- Expose `user_auth` and `master_admin` in Supabase API settings.
- Configure direct AI provider keys (`OPENAI_API_KEY`, `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`).
- Configure story memory env vars and ensure pgvector objects from `supabase/database.sql` are applied.
- Configure QStash signing for `/api/jobs/story-memory` and `/api/jobs/ai-batch`, or set the direct worker fallback secrets intentionally.
- Configure Razorpay webhook to `/api/razorpay/webhook` with both `payment.captured` and `subscription.*` events.
- Configure Razorpay Subscription plan IDs: `RAZORPAY_PLAN_PRO_MONTHLY`, `RAZORPAY_PLAN_PRO_ANNUAL`, `RAZORPAY_PLAN_PREMIUM_MONTHLY`, and `RAZORPAY_PLAN_PREMIUM_ANNUAL`.
- Configure and verify the Resend sender domain for auth OTPs, PDFs, and billing notifications.
- Grant at least one row in `master_admin.users` before using admin routes.
- Decide whether to enforce `REQUIRE_AAL2_FOR_MASTER_ADMIN` and `REQUIRE_AAL2_FOR_IAM_ADMIN` after operators/users enroll TOTP.
- Confirm `CRON_SECRET` is present for cron endpoints.
- Keep Razorpay webhook, cron, authenticated HTML, and Master Admin responses uncached at any CDN layer.
- Run `npm run build` before deployment.

## Known Documentation Notes

- `CLAUDE.md` is maintainer guidance for code agents and has been aligned with the current stack.
- `docs/README.md` is the index for architecture, operations, security, performance, IAM, and auth/billing docs.
- `docs/admin-operators.md` describes `master_admin.users`, `ADMIN_HOSTS`, and troubleshooting for admin surfaces.
- `docs/auth-and-billing-current-behavior.md` is the source of truth for OTP auth, homepage auth rendering, Razorpay webhook writes, and plan billing behavior.
- `docs/ai-cost-and-project-quotas.md` is the source of truth for GenerationService, story memory, AI routing, AI credits/top-ups, cost tracking, Free lifetime project credits, and project quota enforcement.
- `docs/security-architecture.md` describes WAF, middleware, IAM, rate limits, and incident response.
- `docs/iam-enterprise.md` describes organization IAM, tenant policy, MFA, SSO, SCIM, and permission checks.
- `docs/enterprise-product-logic.md` describes enterprise invites, tenant policy, recurring billing, collaboration, support/legal, and admin job health.
- `docs/performance-architecture.md` describes current Core Web Vitals targets, build baseline, middleware scope, editor streaming behavior, and database performance work.

## License

MIT

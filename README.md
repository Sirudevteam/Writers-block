# Writers Block

Writers Block is a production-focused AI screenplay writing platform built with Next.js 14, Supabase, Upstash Redis, Razorpay, and Replicate. It supports Tamil-first screenplay workflows, English-friendly UI, streaming AI generation, paid plans, admin analytics, PDF delivery, and operational guardrails needed for a real SaaS product.

## What The App Does

- Generate screenplay scenes with streamed AI output.
- Continue an existing screenplay with `generate-next`.
- Improve dialogue while preserving screenplay structure.
- Suggest cinematic shot ideas.
- Recommend movie reference scenes for tone and structure.
- Manage saved projects, subscriptions, and user profiles.
- Export or email screenplay PDFs.
- Track usage by plan and enforce per-user plus per-IP rate limits.

## Core Stack

- Framework: Next.js 14 App Router
- Language: TypeScript
- Styling: Tailwind CSS
- UI primitives: Radix UI and shadcn/ui
- Database and auth: Supabase
- Rate limiting: Upstash Redis
- Payments: Razorpay
- Email: Resend
- AI generation: Replicate
- Reference-scene matching: Anthropic
- Monitoring: Vercel Analytics and Speed Insights

## AI Model Setup

All streaming screenplay endpoints use Replicate. The current default model is `google/gemini-2.5-flash`, configurable with `REPLICATE_MODEL`.

- Default: `google/gemini-2.5-flash`
- Supported override pattern: any compatible Replicate text model
- Shared tuning env: `MAX_TOKENS`
- Movie references use `ANTHROPIC_API_KEY`

## Main Product Areas

### Public Marketing Site

- Cinematic landing page
- Feature and workflow sections
- Monthly and yearly pricing toggle
- CTA and conversion-focused sections

### Authenticated Dashboard

- Project list and project detail flows
- Subscription status and upgrade surface
- Settings and profile management
- Admin dashboard for users granted in `public.master_admin_users`
- **Master Admin** (optional subdomain): deeper metrics and tables at `/master-admin` when the request `Host` is listed in `ADMIN_HOSTS` (see [Master Admin (subdomain)](#master-admin-subdomain))

### Screenplay Editor

- Scene setup form
- Live streamed screenplay generation
- Dialogue improvement
- Scene continuation
- Shot suggestions
- Reference scene recommendations
- Browser PDF export
- Server-side PDF email delivery

### Backend Platform

- Supabase-backed auth and persistence
- Redis-backed rate limits
- Razorpay order creation, verification, and webhook reconciliation
- Subscription expiry cron job
- Usage logging for AI endpoints

## Architecture Overview

```text
Browser
  -> Next.js app
  -> Middleware auth checks
  -> API routes
     -> Redis rate limiting
     -> Supabase auth and data access
     -> Replicate / Anthropic / Razorpay / Resend
```

### Important Backend Patterns

- Authenticated AI routes check the current user before model calls.
- AI routes reserve monthly included/top-up credits in Postgres before calling Replicate, so concurrent requests cannot race past the monthly budget.
- Effective plan is derived from subscription state, so expired or inactive subscriptions fall back safely.
- AI endpoints apply both IP-based and per-user daily limits.
- Settled AI credit reservations write usage events to `usage_logs`.
- Admin, webhook, and cron handlers use the Supabase service role inside the handler, not at module scope.
- **Operator privileges** are stored in `public.master_admin_users` (see [docs/admin-operators.md](docs/admin-operators.md)), not in env email lists.

## Environment Variables

Copy `.env.example` to `.env.local` and fill in the values relevant to your setup.

### Required For Local Development

```bash
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
REPLICATE_API_TOKEN=...
RAZORPAY_KEY_ID=...
RAZORPAY_KEY_SECRET=...
```

### Required For Production Features

```bash
SUPABASE_SERVICE_ROLE_KEY=...
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
RAZORPAY_WEBHOOK_SECRET=...
RESEND_API_KEY=...
RESEND_FROM_EMAIL=...
CRON_SECRET=...
# Master Admin: comma-separated hosts that may serve /master-admin (e.g. admin.yourdomain.com,localhost:3000)
ADMIN_HOSTS=localhost:3000
# Grant operators in SQL: INSERT INTO public.master_admin_users (user_id) VALUES ('<auth.users uuid>');
```

### Optional Or Feature-Specific

```bash
REPLICATE_MODEL=google/gemini-2.5-flash
MAX_TOKENS=8000
ANTHROPIC_API_KEY=...
SUPABASE_DATABASE_URL=...
QSTASH_TOKEN=...
QSTASH_CURRENT_SIGNING_KEY=...
QSTASH_NEXT_SIGNING_KEY=...
DISABLE_RATE_LIMIT=false
ALLOW_AI_WITHOUT_REDIS=1
DEBUG=false
```

### Pricing Configuration

```bash
PRO_MONTHLY_PRICE_PAISE=119900
PRO_ANNUAL_PRICE_PAISE=1151000
PREMIUM_MONTHLY_PRICE_PAISE=399900
PREMIUM_ANNUAL_PRICE_PAISE=3839000
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

There is currently no `test` script configured in `package.json`.

## Database Setup

The schema source of truth is `supabase/database.sql`.

It defines:

- `profiles`
- `master_admin_users` (platform operators; isolated from customer analytics lists)
- `subscriptions`
- `projects`
- `documents`
- `usage_logs`
- indexes and constraints
- row-level security policies
- helper triggers and defaults

Apply the SQL in the Supabase SQL Editor for your project.

## Admin operators and Master Admin

**Full guide:** [docs/admin-operators.md](docs/admin-operators.md)

Summary:

1. **`public.master_admin_users`** — one row per operator (`user_id` = `auth.users.id`). Grant with SQL after auth users exist; **`ADMIN_EMAILS` is not used**.
2. **`SUPABASE_SERVICE_ROLE_KEY`** — required so middleware and routes can verify membership.
3. **`ADMIN_HOSTS`** — comma-separated allowed `Host` values for **`/master-admin`** and **`/api/master-admin`** only. Empty = 404 on those routes everywhere. Local dev typically includes `localhost:3000` (and `127.0.0.1:3000` if you use that origin).
4. **`/dashboard/admin`** uses the same DB operator check but is **not** host-gated.

Master Admin is a **separate surface** from the marketing site: it lives under `/master-admin` and is only reachable when the browser **`Host`** matches **`ADMIN_HOSTS`**. If `ADMIN_HOSTS` is empty, those routes return **404** on every host (fail closed).

### Deployment checklist (Vercel + DNS)

1. Add your admin hostname to the Vercel project (e.g. **Settings → Domains**): `admin.yourdomain.com`.
2. Create a DNS `CNAME` (or `A`/`ALIAS` as Vercel instructs) so `admin.yourdomain.com` points to the deployment.
3. Set **`ADMIN_HOSTS`** in Vercel to that hostname exactly as clients send it (usually `admin.yourdomain.com` without port).
4. **`INSERT` your operator `user_id`(s) into `public.master_admin_users`** (see [docs/admin-operators.md](docs/admin-operators.md)).
5. Open `https://admin.yourdomain.com/master-admin` after signing in (session cookies are scoped to that host on first visit; sign in on the admin host or rely on your auth cookie domain if you configure it).

Do not link Master Admin from the public homepage unless you intend to expose the URL.

## API Surface

Current top-level API groups:

- `app/api/admin`
- `app/api/master-admin`
- `app/api/cron`
- `app/api/documents`
- `app/api/generate`
- `app/api/generate-next`
- `app/api/improve-dialogue`
- `app/api/movie-references`
- `app/api/projects`
- `app/api/razorpay`
- `app/api/shots`
- `app/api/subscription`
- `app/api/user`

## Repository Structure

```text
app/
  (home)/                Public landing pages
  api/                   Route handlers
  auth/                  Auth callback flow
  dashboard/             Protected app pages
  (master-admin)/        Master Admin shell (host-gated via ADMIN_HOSTS)
  editor/                Screenplay editor page
  signin/ signup/        Auth screens

components/
  ui/                    Shared UI primitives
  screenplay-editor.tsx  Editor rendering and export actions

hooks/
  useRazorpay.ts
  useProjects.ts
  useUser.ts

lib/
  admin-privileges.ts   # Operator check (master_admin_users + service role)
  admin-stats.ts
  admin-host.ts         # ADMIN_HOSTS parsing for Master Admin
  ai-rate-limits.ts
  email.ts
  master-admin-queries.ts
  ratelimit.ts
  replicate-model.ts
  screenplay-pdf.ts
  screenplay-print-html.ts
  subscription.ts
  supabase/

docs/
  admin-operators.md
  supabase-auth-email-templates.md

supabase/
  database.sql

types/
  database.ts
  project.ts
```

## Billing Notes

- Free, Pro, and Premium plans are supported.
- Pro and Premium support monthly and annual pricing.
- Checkout starts in `/api/razorpay/create-order`.
- Payment verification happens in `/api/razorpay/verify`.
- Webhook reconciliation happens in `/api/razorpay/webhook`.
- Subscription-expiry maintenance runs through `vercel.json` on `/api/cron/check-subscriptions`.

## AI Credit Notes

- One AI credit equals one reserved request estimate.
- `reserve_ai_credit` runs in Postgres and locks the user's subscription row before calculating available monthly included and top-up credits.
- AI routes call the reservation RPC before starting Replicate. If the reservation fails or credits are exhausted, the provider call is not made.
- If a provider call starts and then fails, disconnects, or is cancelled, the reservation is charged as `failed_charged` using the reserved estimate.
- If failure happens before the provider starts, the reservation is released.
- Free users are blocked from paid-only rewrite/batch-rewrite endpoints before provider calls.
- Apply `supabase/database.sql` before deploying these route changes; routes fail closed if the reservation RPCs are unavailable.

## Performance And Reliability Notes

- Rate limits are enforced with Upstash Redis.
- Server components use cached query helpers where applicable.
- API routes set explicit cache headers.
- Motion-aware UI respects reduced-motion preferences.
- The app includes error boundaries and defensive fallback handling around external services.

## Deployment

Recommended target: Vercel.

### Production Checklist

- Add all required environment variables.
- Apply `supabase/database.sql`.
- Confirm `reserve_ai_credit`, `mark_ai_credit_provider_started`, and `settle_ai_credit_reservation` exist before enabling AI routes in production.
- Configure Razorpay webhook to `/api/razorpay/webhook`.
- Configure Resend sender domain if emailing PDFs or billing notifications.
- Grant at least one row in `master_admin_users` before using admin routes.
- Confirm `CRON_SECRET` is present for cron endpoints.
- Run `npm run build` before deployment.

## Known Documentation Notes

- `UX_AUDIT_REPORT.md` is a point-in-time product audit, not a live source of truth for implementation details.
- `CLAUDE.md` is maintainer guidance for code agents and has been aligned with the current stack.
- `docs/admin-operators.md` describes `master_admin_users`, `ADMIN_HOSTS`, and troubleshooting for admin surfaces.

## License

MIT

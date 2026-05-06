# Current Platform Handbook

**Last updated:** May 6, 2026

This is the merged operating summary for Writers Block. Use it as the first document when checking whether frontend behavior, backend routes, security controls, billing, AI spend, and database rules agree with each other.

Detailed docs remain as focused references. This handbook points to those docs instead of duplicating every implementation detail.

## Product Surface

Writers Block is a Next.js 15 App Router application backed by Supabase, Upstash Redis, Razorpay, Resend, QStash, and direct OpenAI/Gemini/Anthropic routing.

Primary user surfaces:

- `/`: public marketing page with nonce-backed JSON-LD scripts.
- `/signin`, `/signup`, `/verify-code`, `/forgot-password`, `/reset-password`: app-owned OTP auth flows.
- `/dashboard`: protected user dashboard.
- `/dashboard/org`: organization membership and tenant controls.
- `/dashboard/subscription`: subscription, AI credit, top-up, and billing UI.
- `/dashboard/settings`: profile, security, MFA, and account controls.
- `/editor`: screenplay editor, AI tools, Story Bible, story memory, and PDF actions.
- `/master-admin`: host-gated platform operator surface.

## Request Flow

```text
Browser
  -> Cloudflare / deployment edge
  -> Next.js middleware
     -> request id
     -> nonce-backed CSP
     -> app WAF
     -> CSRF checks
     -> Supabase session refresh/getUser
     -> route policy gates
  -> App Router page or API route
  -> module application service
  -> Supabase / Redis / AI provider / Razorpay / Resend / QStash
```

Middleware now covers non-static pages and API routes so HTML responses can receive per-request CSP nonces. Static assets, Next internals, image files, maps, fonts, robots, and sitemap are excluded.

Route policy:

| Class | Routes | Primary gate |
|---|---|---|
| Public API | `/api/auth/*`, `/api/support/tickets` | route-level validation and rate limits |
| Machine API | `/api/razorpay/webhook`, `/api/cron/*`, `/api/jobs/*`, `/api/scim/*` | HMAC/shared secret, cron secret, QStash signature, or SCIM bearer |
| Master Admin API | `/api/master-admin/*` | host allowlist, session, operator row, optional AAL2 |
| Protected API | all other `/api/*` | Supabase `getUser()` in middleware before route code |

## Security Baseline

Implemented controls:

- App WAF inspects path, query, and headers before auth/session refresh.
- CSRF blocks cross-origin state-changing browser requests except machine-auth routes.
- CSP is built in middleware with per-request script nonces.
- Script attributes are blocked with `script-src-attr 'none'`.
- `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, and `frame-ancestors 'self'` are present.
- Upstash-backed API throttles fail closed in production when Redis is missing or unreachable.
- Auth OTPs lock after repeated failures and are also protected by IP/account throttles.
- SCIM has per-org/client-IP throttling before bearer validation.
- Anonymous support ticket creation has a separate public-intake throttle.
- Sentry scrubbing removes sensitive headers, IP address, sensitive query values, and sensitive request-body fields.
- Postgres `SECURITY DEFINER` functions use explicit `search_path` declarations.

Secrets:

- `AUTH_OTP_SECRET` is required in production for user OTP payload encryption.
- `MASTER_ADMIN_OTP_SECRET` is required in production for Master Admin OTP payload encryption.
- `CRON_SECRET` protects cron routes.
- `INTERNAL_API_SECRET` is an optional shared fallback for app-owned background job routes.
- Razorpay webhook verification uses `RAZORPAY_WEBHOOK_SECRET` and the raw webhook body.

See [security-architecture.md](security-architecture.md).

## Auth And IAM

Normal auth:

- Signup: `email + password -> signup OTP -> email confirmed -> signin`.
- Sign-in: `email + password -> signin OTP -> session cookies`.
- Password reset: `email -> reset OTP -> new password`.
- Supabase hosted Confirm signup, Magic link, and recovery-link emails are not used for the normal product flow.

Enterprise auth:

- Organizations are the tenant boundary.
- Roles are `owner`, `admin`, `member`, and `billing`.
- Owners control billing, SSO, SCIM, tenant security policy, and destructive account/org actions.
- `guardOrgApi(...)` enforces active org, permission, MFA/AAL2, SSO/password policy, and session duration.
- SCIM tokens are generated once, stored as SHA-256 hashes, and used only as bearer credentials on `/api/scim/v2/:orgId/Users`.

See [auth-and-billing-current-behavior.md](auth-and-billing-current-behavior.md) and [iam-enterprise.md](iam-enterprise.md).

## Billing And Payments

Recurring paid plans:

- Paid plan checkout uses `POST /api/billing/subscriptions`.
- Razorpay Subscriptions are the source of truth for recurring paid entitlement.
- `subscription.*` webhook events update `subscriptions`, `billing_subscription_ledger`, and `billing_invoices`.
- `/api/subscription` is read-only for current entitlement state; client-side plan writes are intentionally disabled.

One-time payments:

- Clean PDF export and AI credit top-up still use `/api/razorpay/create-order`.
- `/api/razorpay/verify` validates checkout-returned order signatures for one-time orders.
- `/api/razorpay/webhook` applies clean PDF purchases and AI credit top-ups after HMAC, timestamp, ownership, order, status, and amount validation.

Required Razorpay webhook events:

- `payment.captured`
- `subscription.*`

See [auth-and-billing-current-behavior.md](auth-and-billing-current-behavior.md).

## AI, Quotas, And Story Memory

AI generation runs through `GenerationService` and the direct provider router:

- Simple: Gemini 2.5 Flash-Lite, GPT-4o mini, or Claude Haiku.
- Standard: Gemini 2.5 Flash, GPT-5.4 mini, or Claude Haiku.
- Complex: GPT-5.4 first, then Claude Sonnet 4.6.

Plan limits:

| Plan | Projects | Monthly AI credits | Daily generation limit |
|---|---|---:|---:|
| Free | 3 lifetime project creations | 100K | 5/day |
| Pro | 25 active project slots | 600K | 50/day |
| Premium | effectively unlimited active slots | 2M | 200/day |

AI budget states:

- 70%: warning headers.
- 85%: downgrade one complexity tier.
- 100%: block before provider spend unless a paid top-up reservation covers projected overage.

Story memory and Story Bible:

- Story Bible entries are editable user-owned screenplay intelligence.
- Vector story memory is derived infrastructure.
- Project saves queue memory rebuilds; `/api/jobs/story-memory` processes indexing asynchronously.
- Generation falls back to project fields and screenplay tail when vector memory is missing or unavailable.

See [ai-cost-and-project-quotas.md](ai-cost-and-project-quotas.md).

## Database Source Of Truth

The database source is one file:

```text
supabase/database.sql
```

After applying the schema, expose these Supabase schemas in API settings:

```text
user_auth
master_admin
```

Regenerate TypeScript DB types after schema changes:

```bash
npm run db:types
```

See [database-migrations.md](database-migrations.md).

## Operational Checks

Before merging backend, security, billing, AI, or schema changes:

```bash
npm run typecheck
npm run test:security
npm run build
```

For AI eval work:

```bash
npm run test:evals
```

For browser smoke flows:

```bash
npm run test:e2e
```

Production deployment checklist lives in [../README.md](../README.md#deployment).

## Documentation Ownership

- Start here for the current platform shape.
- Use [README.md](README.md) as the docs directory index.
- Keep `.env.example`, `README.md`, this handbook, and the focused docs in sync when routes, secrets, schema, or product rules change.
- Prefer updating an existing source-of-truth doc over adding a new overlapping document.

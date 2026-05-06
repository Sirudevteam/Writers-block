# Security Architecture

**Last updated:** May 5, 2026

Writers Block implements a defense-in-depth security architecture with multiple layers of protection.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    INTERNET (User Requests)                     │
└──────────────────────────────┬──────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────┐
│  Layer 1: Cloudflare Edge                                       │
│  ├─ DDoS Mitigation (automatic)                                 │
│  ├─ Bot Management (JS challenge, fight mode)                   │
│  ├─ Managed WAF (OWASP CRS + Cloudflare Specials)               │
│  ├─ Custom Firewall Rules (attack tools, empty UA, rate limits) │
│  ├─ SSL/TLS Termination (strict mode, TLS 1.2+)                │
│  └─ Geo-blocking (configurable)                                 │
└──────────────────────────────┬──────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────┐
│  Layer 2: Next.js Middleware WAF                                │
│  ├─ SQLi pattern detection (20+ regex rules)                    │
│  ├─ XSS pattern detection (18+ regex rules)                     │
│  ├─ Path traversal detection (14+ patterns)                     │
│  ├─ Malicious bot User-Agent blocking (25+ signatures)          │
│  ├─ Request shape validation (URL length, query params, headers)│
│  └─ Configurable: dry-run, IP allowlist, country blocking       │
└──────────────────────────────┬──────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────┐
│  Layer 3: Security Headers                                      │
│  ├─ Content-Security-Policy (strict with nonce support)         │
│  ├─ Strict-Transport-Security (2-year HSTS + preload)           │
│  ├─ Permissions-Policy (deny camera, mic, geolocation)          │
│  ├─ Cross-Origin-Opener-Policy (same-origin)                    │
│  ├─ Cross-Origin-Resource-Policy (same-origin)                  │
│  ├─ X-Frame-Options, X-Content-Type-Options, X-XSS-Protection  │
│  └─ Referrer-Policy (origin-when-cross-origin)                  │
└──────────────────────────────┬──────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────┐
│  Layer 4: Authentication & Authorization                        │
│  ├─ Supabase Auth (session management, JWT)                     │
│  ├─ Middleware route guards (/dashboard, /editor, /master-admin)│
│  ├─ IAM: Role-based access control (owner/admin/member/billing) │
│  ├─ IAM: Permission-based authorization (org:read, project:write│
│  ├─ MFA enforcement (AAL2 for Master Admin, sensitive ops)      │
│  ├─ HMAC verification (Razorpay signatures; internal reserved)  │
│  └─ Anti-CSRF validation (Origin + Sec-Fetch-Site)              │
└──────────────────────────────┬──────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────┐
│  Layer 5: Rate Limiting                                         │
│  ├─ IP-based: 100 req/min (general API), 10 req/hr (AI gen)    │
│  ├─ Auth-specific: 25 req/15min (anti-brute-force)              │
│  ├─ Per-user plan-based: Free(5/day), Pro(50/day), Premium(200/day) │
│  └─ Upstash Redis sliding window (production-only enforcement)  │
└──────────────────────────────┬──────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────┐
│  Layer 6: Application Security                                  │
│  ├─ Input validation (Zod schemas on high-risk API routes)      │
│  ├─ Supabase Row-Level Security (RLS) on all tables             │
│  ├─ Service Role key server-side only (never exposed to client) │
│  ├─ Sentry PII scrubbing (cookies, auth headers, IPs stripped)  │
│  └─ Cron secret validation (Bearer token on /api/cron/*)        │
└─────────────────────────────────────────────────────────────────┘
```

## WAF Configuration

## Middleware Scope

`middleware.ts` is intentionally scoped to protected app routes, auth pages, Master Admin, and API routes. The public homepage `/` is statically prerendered and is not included in the middleware matcher.

Current matcher intent:

- `/dashboard`, `/dashboard/:path*`
- `/editor`, `/editor/:path*`
- `/signin`, `/signup`
- `/forgot-password`, `/reset-password`
- `/verify-code` is the active OTP page for signup, signin, password reset, and Master Admin OTP flows
- `/master-admin`, `/master-admin/:path*`
- `/api/:path*`

Do not add `/` back to the matcher unless there is a concrete request-time security requirement. Public-page security headers are applied from `next.config.js`, and keeping `/` outside middleware protects homepage TTFB and LCP.

### API Route Policy

All API routes pass through a centralized middleware policy before route handlers run:

- Public: `/api/auth/*`, `/api/support/tickets`
- Machine-auth: `/api/razorpay/webhook`, `/api/cron/*`, `/api/jobs/*`, `/api/scim/*`
- Master Admin: `/api/master-admin/*`
- Protected: every other `/api/*` route

Protected APIs require a Supabase Auth session in middleware and return `401` before route code runs when no session is present. Route handlers still enforce the domain-specific checks: org IAM, Master Admin operator access, Razorpay HMAC validation, service-role-only RPCs, and endpoint-specific rate limits.

Middleware also adds `X-Request-ID` to responses it handles so blocked and passed-through protected requests can be correlated with platform logs.

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `WAF_ENABLED` | `true` | Master kill switch — set to `false` to disable |
| `WAF_DRY_RUN` | production: `false`; non-production: `true` | Log detections without blocking. Set `true` temporarily during rollout/tuning. |
| `WAF_ALLOWED_IPS` | _(empty)_ | Comma-separated IPs that bypass WAF |
| `WAF_BLOCKED_COUNTRIES` | _(empty)_ | Comma-separated ISO country codes to block |

### Handling False Positives

1. Check logs for `⚠️ WAF DETECTED` entries with the attack category and pattern index
2. Add the affected IP to `WAF_ALLOWED_IPS` for immediate relief
3. If a pattern is too aggressive, file an issue to tune it in `src/core/security/waf-patterns.ts`

### Going Live (Disabling Dry-Run)

1. Deploy with `WAF_DRY_RUN=true` for at least 48 hours
2. Monitor logs for false positives on legitimate user traffic
3. Tune patterns if needed
4. Set `WAF_DRY_RUN=false` to enable blocking

## HMAC Verification

The app currently validates HMAC signatures for payment flows:

- `/api/razorpay/verify` checks the client-returned `razorpay_order_id|razorpay_payment_id` signature for UX validation.
- `/api/razorpay/webhook` checks `x-razorpay-signature` against `RAZORPAY_WEBHOOK_SECRET` before applying subscription state, AI credit top-ups, or clean PDF purchases.

Payment hardening rules:

- Razorpay Subscriptions are the paid-plan path. Subscription webhook events are mapped into `subscriptions`, `billing_subscription_ledger`, and `billing_invoices`.
- Legacy one-time order paths remain for clean PDF exports and AI credit top-ups.
- Order webhooks validate timestamp freshness, order id, payment status, captured amount, expected server-side price, user id, org id, and project id where applicable.
- Legacy one-time subscription activation is still guarded by service-role RPC `public.apply_subscription_payment(...)`; recurring subscription entitlement state is driven by Razorpay `subscription.*` webhooks.
- Clean PDF export purchases are inserted by the webhook only, then consumed atomically through service-role RPC `public.consume_pdf_export_purchase(...)`.
- Replay, duplicate, mismatch, invalid signature, pending webhook, and already-consumed paths are logged to Master Admin security/business events.
- Razorpay webhooks are not throttled, but all non-webhook payment routes have focused rate limits.

`INTERNAL_API_SECRET` remains a reserved environment variable in `.env.example`; no route currently enforces app-owned internal request signing with it. Cron endpoints are protected by `CRON_SECRET` bearer checks instead. Add a concrete validator before relying on `INTERNAL_API_SECRET` for production authorization.

## Quota and Spend Abuse Controls

Project creation is not trusted to the client.

- Free users receive 3 lifetime project creation credits.
- Deleting a Free project does not restore credits.
- Paid plans use active project slots.
- `POST /api/projects` calls the service-role-only `public.create_project_with_quota(...)` RPC.
- The `public.enforce_project_limit_before_insert()` trigger enforces active slots and Free lifetime credits inside the same transaction as the insert.
- The trigger takes a per-user advisory transaction lock, so parallel project-create requests cannot race past the Free lifetime limit.
- Direct authenticated inserts into `public.projects` remain protected by the trigger even if a client bypasses the normal API route.

AI spend is controlled before provider calls.

- AI routes check daily per-user and per-IP rate limits.
- AI routes check monthly AI credit budgets from `ai_usage_monthly` before provider calls.
- At 70% monthly usage the route returns warning headers.
- At 85% monthly usage the router downgrades one complexity tier.
- At 100% monthly usage the route hard-blocks before provider spend unless a Pro/Premium paid credit top-up reservation covers projected overage.
- Provider, model, token usage, latency, status, and cost are written to `usage_logs`.

See [ai-cost-and-project-quotas.md](./ai-cost-and-project-quotas.md) for the product rules and operational test cases.

PDF export abuse controls:

- `POST /api/projects/:id/export-pdf` is authenticated, org-scoped, and separately rate limited.
- Free watermarked export does not require payment.
- Free clean export requires an unconsumed ₹99 purchase for the same user, org, and project.
- Pro/Premium clean export does not require the ₹99 purchase.
- Email PDF behavior is intentionally separate; Free email PDFs remain watermarked.

## OAuth/OIDC, SAML SSO, and SCIM

User identity is handled by Supabase Auth.

Email/password is implemented in-app with OTP confirmation:
- Signup creates the Supabase user with the admin API, then Writers Block sends and verifies an app-owned OTP on `/verify-code`.
- Signup OTP verification confirms the email only; it does not store the signup password in the challenge or auto-create a browser session.
- Sign-in verifies password first, withholds the Supabase session, then Writers Block sends and verifies an app-owned OTP on `/verify-code?mode=signin`.
- Password reset uses `email -> OTP -> new password`, revokes existing app sessions, and does not rely on Supabase PKCE recovery links.
- Master Admin sign-in uses password + OTP, with operator grants and OTP challenges isolated in the `master_admin` schema.
- Normal signup/signin/reset must not rely on Supabase hosted **Confirm signup**, **Magic link**, or recovery-link email templates.
- Auth endpoints use IP and account-keyed throttles; OTP challenge rows also track failed attempts and lock after repeated invalid codes.

Auth/control-plane schemas:
- `user_auth.otp_challenges` stores normal user signup/signin/password-reset OTP challenges.
- `master_admin.users` stores platform operator grants.
- `master_admin.otp_challenges` stores Master Admin OTP challenges.
- `master_admin.audit_log` stores successful Master Admin request audit rows.

After schema deployment, expose `user_auth` and `master_admin` in Supabase Dashboard -> API settings for server-side `.schema(...)` queries.

Supabase SAML SSO is wired for enterprise organizations:

- `POST /api/auth/sso/start` starts Supabase `signInWithSSO`.
- `/auth/callback` exchanges the Supabase auth code and joins organizations by exact invite or verified-domain policy.
- SSO access is bound to Supabase user UUID plus org membership; email alone is never the authorization boundary.
- Tenant security policy can require MFA, require SSO, disable password login, and cap session duration.

Custom SCIM is app-owned:

- `/api/scim/v2/:orgId/Users` is classified as machine-authenticated and bypasses browser CSRF checks.
- SCIM bearer tokens are stored as SHA-256 hashes only.
- Deprovisioning removes org membership and revokes app sessions.

Provider client secrets must stay in Supabase/provider configuration, not in `NEXT_PUBLIC_*` environment variables.

## Audit Logging

Three audit systems run in parallel:

1. **WAF Event Log** (`src/core/security/waf-logger.ts`)
   - All detected/blocked attacks
   - Privacy-preserving IP hashing (SHA-256 prefix)
   - Optional Redis counters for attack frequency tracking

2. **IAM Audit Log** (`src/modules/iam/application/audit.ts`)
   - Administrative actions (member invite/remove, role changes)
   - Stored in `iam_audit_log` Supabase table
   - IP hashed consistently

3. **Master Admin Audit Log** (`master_admin.audit_log`)
   - Successful Master Admin requests after host, session, operator, and optional MFA gates
   - Written with the Supabase service role only
   - IP is stored as a SHA-256 prefix, not raw IP

Payment and product security events are also written through `master_admin.security_events` and `master_admin.business_events`, including invalid payment signatures, payment mismatches, webhook failures, clean PDF purchases, consumed purchases, delayed webhooks, and export/download events.

## CI/CD Security Scanning

| Tool | Trigger | What it checks |
|---|---|---|
| **CI quality** | Push/PR to main/master | `npm ci`, lint, typecheck, critical `npm audit` |
| **Dependency Review** | PRs | New dependency vulnerabilities and license risk |
| **Semgrep** | Push/PR to main | SAST: OWASP Top 10, JS/TS/React patterns |
| **CodeQL** | Push/PR to main + weekly | SAST: Code quality and security queries |
| **OWASP ZAP** | Manual dispatch | DAST: Runtime vulnerability scanning |
| **Dependabot** | Weekly | Dependency vulnerability alerts |

## Infrastructure as Code

All Cloudflare infrastructure is managed via Terraform:

- **Location**: `infra/` directory
- **State**: Terraform Cloud (`siru-ai-labs/writersblock-production`)
- **Changes**: Via PR → `terraform plan` → review → `terraform apply`
- **Docs**: See `infra/README.md` for operations guide

## Incident Response

### WAF Event

1. Check WAF logs for the attack category and pattern
2. If legitimate traffic is blocked, add IP to `WAF_ALLOWED_IPS`
3. If under active attack, set `WAF_DRY_RUN=false` if not already
4. Review Cloudflare analytics for attack scope

### Credential Compromise

1. Rotate the compromised key immediately via Terraform Cloud / Cloudflare dashboard
2. If `SUPABASE_SERVICE_ROLE_KEY`: Regenerate in Supabase dashboard, update Terraform
3. If `RAZORPAY_WEBHOOK_SECRET`: rotate in Razorpay Dashboard and deployment env together.
4. If `INTERNAL_API_SECRET` is introduced in future validators, rotate it and redeploy every caller and callee.
5. Review IAM and Master Admin audit logs for unauthorized access during the exposure window.

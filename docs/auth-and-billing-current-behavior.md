# Current Auth and Billing Behavior

**Last updated:** May 4, 2026

This document reflects the current production behavior after the 2026 auth and payment hardening pass.

## Signup Code

Signup is **code-first**.

Current flow:
1. `POST /api/auth/sign-up`
2. The server creates the Supabase user with the admin API, without asking Supabase to send auth email
3. The server creates an app-owned `signup` OTP challenge in `user_auth.otp_challenges`
4. Writers Block sends the 6-digit code through Resend
5. The user lands on `/verify-code`
6. `POST /api/auth/verify-code`
7. The server consumes the app-owned OTP and confirms the Supabase email
8. The user is sent back to `/signin`; the first browser session is created only after the normal password + sign-in OTP flow

Important notes:
- Treat the signup email as a code-delivery email, not a sign-in link.
- Supabase hosted **Confirm signup** email is not used by the normal business flow.
- The app no longer provides a signup confirmation-link callback route.
- Resending should keep the user in the `/verify-code` flow with the newest code.

Related files:
- [src/app/api/auth/sign-up/route.ts](../src/app/api/auth/sign-up/route.ts)
- [src/app/api/auth/resend-signup-code/route.ts](../src/app/api/auth/resend-signup-code/route.ts)
- [src/app/api/auth/verify-code/route.ts](../src/app/api/auth/verify-code/route.ts)
- [src/app/verify-code/page.tsx](../src/app/verify-code/page.tsx)
- [src/modules/auth/presentation/components/code-verification-form.tsx](../src/modules/auth/presentation/components/code-verification-form.tsx)

## OTP Secrets

OTP challenge payloads are encrypted server-side when a flow must temporarily hold password-equivalent session material.

- Sign-up challenges do not store passwords or session payloads.
- Sign-in challenges use `AUTH_OTP_SECRET` to encrypt the withheld Supabase session.
- Password-reset challenges do not store passwords or session payloads.
- Master Admin challenges use `MASTER_ADMIN_OTP_SECRET`.
- If those are unset, the code falls back to `SUPABASE_SERVICE_ROLE_KEY` and then `NEXTAUTH_SECRET` where supported.

Production deployments should set explicit OTP secrets so sign-in session-payload encryption is not tied to unrelated provider keys.

OTP challenges lock after repeated invalid attempts. IP throttles and account-keyed throttles are both applied before OTP verification.

## Login

Login uses **password + OTP** after account creation.

Current flow:
1. `POST /api/auth/sign-in`
2. The server verifies email/password with `signInWithPassword`
3. The temporary password session is encrypted into an app-owned `signin` OTP challenge
4. The response withholds browser session cookies
5. Writers Block sends the 6-digit code through Resend
6. The user lands on `/verify-code?mode=signin`
7. `POST /api/auth/verify-code`
8. The server consumes the app-owned OTP and sets HTTP-only cookies from the withheld session

Important notes:
- Password alone does not create a browser session.
- Email OTP alone does not create or access an account unless the password step already succeeded.
- Supabase hosted **Magic link** email is not used by the normal business flow.
- New accounts still require email/password creation first, followed by signup OTP verification.
- The Supabase SSR/browser setup remains PKCE-capable; session cookies are still written by server-side auth routes.

Related files:
- [src/app/api/auth/sign-in/route.ts](../src/app/api/auth/sign-in/route.ts)
- [src/app/api/auth/verify-code/route.ts](../src/app/api/auth/verify-code/route.ts)
- [src/modules/auth/presentation/components/sign-in-form.tsx](../src/modules/auth/presentation/components/sign-in-form.tsx)
- [src/modules/auth/presentation/components/code-verification-form.tsx](../src/modules/auth/presentation/components/code-verification-form.tsx)

## Password Reset

Password reset is **OTP-based**, not link/PKCE-based.

Current flow:
1. `POST /api/auth/request-password-reset`
2. The server creates an app-owned `password_reset` OTP challenge in `user_auth.otp_challenges`
3. Writers Block sends the 6-digit reset code through Resend
4. The user lands on `/reset-password`
5. The user enters email, OTP, and new password
6. `POST /api/auth/reset-password`
7. The server consumes the OTP, revokes existing app sessions, and updates the Supabase Auth password with the admin API

Important notes:
- Do not reintroduce `exchangeCodeForSession` for password reset.
- The deleted PKCE recovery-code route should stay deleted unless the product intentionally returns to link-based recovery.
- Supabase hosted recovery-link email is not used by the normal business flow.

Related files:
- [src/app/api/auth/request-password-reset/route.ts](../src/app/api/auth/request-password-reset/route.ts)
- [src/app/api/auth/reset-password/route.ts](../src/app/api/auth/reset-password/route.ts)
- [src/app/reset-password/page.tsx](../src/app/reset-password/page.tsx)

## Master Admin Login

Master Admin login uses the same **password + OTP** posture as normal sign-in, but the control-plane data is isolated.

Current flow:
1. `POST /api/auth/master-admin-sign-in`
2. The server verifies email/password with Supabase Auth
3. The server checks operator membership in `master_admin.users`
4. The temporary Supabase session is encrypted into `master_admin.otp_challenges`
5. Writers Block sends the Master Admin OTP through Resend
6. The user lands on `/verify-code?mode=master-admin`
7. `POST /api/auth/verify-code`
8. The server consumes the Master Admin OTP and sets HTTP-only cookies

Important notes:
- Normal user OTPs live in `user_auth.otp_challenges`.
- Master Admin OTPs live in `master_admin.otp_challenges`.
- Operator privileges live in `master_admin.users`; they are not derived from profiles, env email lists, or subscription plan.

Related files:
- [src/app/api/auth/master-admin-sign-in/route.ts](../src/app/api/auth/master-admin-sign-in/route.ts)
- [src/modules/auth/master-admin-otp-challenges.ts](../src/modules/auth/infrastructure/master-admin-otp-challenges.ts)
- [docs/admin-operators.md](./admin-operators.md)

## Supabase Schema Requirements

The auth/control-plane tables are intentionally separated from normal app data:

- `user_auth.otp_challenges`: signup, signin, and password-reset OTP challenges
- `master_admin.users`: platform operator grants
- `master_admin.audit_log`: successful Master Admin request audit trail
- `master_admin.otp_challenges`: Master Admin sign-in OTP challenges

Plan, quota, and AI-cost tables live in `public`:

- `project_creation_usage`: durable Free lifetime project creation credits keyed by `user_id`
- `usage_logs`: request-level AI usage and cost records
- `ai_usage_monthly`: per-user monthly AI rollups for fast budget checks

After running `supabase/database.sql`, expose both custom schemas in Supabase Dashboard -> API settings:

```text
user_auth
master_admin
```

Without this, service-role Supabase JS `.schema(...)` queries can fail even though the tables exist.

## Server-Side Auth Guidance

For auth-sensitive server paths, prefer `getUser()` semantics over `getSession()`.

Why:
- `getUser()` revalidates the authenticated user
- `getSession()` is not the trust boundary for server authorization checks
- middleware refresh keeps cookies current, but server auth paths should still rely on user validation

Related files:
- [src/infrastructure/db/supabase/server-auth.ts](../src/infrastructure/db/supabase/server-auth.ts)
- [src/app/dashboard/layout.tsx](../src/app/dashboard/layout.tsx)
- [src/app/api/user/profile/route.ts](../src/app/api/user/profile/route.ts)
- [modules/account/application/profile-service.ts](../modules/account/application/profile-service.ts)

## Razorpay Subscription Flow

Paid plans now use **Razorpay Subscriptions**. Subscription webhooks are the source of truth for entitlement status.

Current flow:
1. The client creates a Razorpay subscription through `POST /api/billing/subscriptions`.
2. The route creates or updates the org billing customer and calls `razorpay.subscriptions.create(...)`.
3. Razorpay Checkout completes subscription authentication/payment outside the app.
4. Razorpay sends `subscription.*` events to `POST /api/razorpay/webhook`.
5. The webhook validates the HMAC signature and event timestamp.
6. The webhook maps subscription state into `subscriptions.status`, `billing_subscription_ledger`, and `billing_invoices`.
7. Subscription cache invalidation happens from the webhook path.
8. The client reads `/api/subscription` and `/api/billing/history` for entitlement and billing history.

Important notes:
- The webhook is the source of truth for paid subscription entitlement writes.
- `/api/razorpay/verify` still exists for one-time order validation and legacy checkout UX, but recurring subscription state is driven by `subscription.*` webhooks.
- Webhook timestamp validation uses the Razorpay event payload timestamp, not an undocumented header.
- Subscription ledger rows are recorded in `billing_subscription_ledger`; invoices are synced into `billing_invoices`.
- Entitlement statuses map to `active`, `trialing`, `past_due`, `cancelled`, and `expired`.
- Failed recurring payments keep paid entitlements during a seven day grace period; `/api/cron/check-subscriptions` downgrades to Free after grace expiry.
- One-time clean PDF export and AI credit top-up purchases remain Razorpay order-based.
- `GET /api/subscription` reads the current row with private cache headers. `POST /api/subscription` is intentionally disabled so clients cannot write plan state directly.

Related files:
- [src/app/api/billing/subscriptions/route.ts](../src/app/api/billing/subscriptions/route.ts)
- [src/app/api/billing/history/route.ts](../src/app/api/billing/history/route.ts)
- [src/app/api/razorpay/verify/route.ts](../src/app/api/razorpay/verify/route.ts)
- [src/app/api/razorpay/webhook/route.ts](../src/app/api/razorpay/webhook/route.ts)
- [src/modules/billing/application/razorpay-subscriptions.ts](../src/modules/billing/application/razorpay-subscriptions.ts)
- [src/app/dashboard/subscription/page.tsx](../src/app/dashboard/subscription/page.tsx)
- [src/modules/billing/infrastructure/subscription-plan-cache.ts](../src/modules/billing/infrastructure/subscription-plan-cache.ts)
- [src/app/api/subscription/route.ts](../src/app/api/subscription/route.ts)

## ₹99 Clean PDF Export Flow

Free users have two download choices for saved projects:

| Option | Payment | Watermark |
|---|---:|---|
| Watermarked PDF | Free | Yes |
| Clean PDF | ₹99 one-time purchase | No |

Pro and Premium users can download clean PDFs without the ₹99 prompt. Email PDF behavior is unchanged: Free email PDFs remain watermarked, while Pro/Premium email PDFs are clean.

Current clean-export flow:

1. The editor ensures the project is saved and has a project id.
2. The client creates a Razorpay order through `POST /api/razorpay/create-order` with `{ purpose: "pdf_clean_export", projectId }`.
3. Razorpay Checkout returns payment identifiers to the client.
4. The client calls `POST /api/razorpay/verify` for signature and ownership validation.
5. The Razorpay webhook creates one `pdf_export_purchases` row after HMAC, timestamp, amount, order, user, org, and project validation.
6. The client requests `POST /api/projects/:id/export-pdf` with `mode: "clean"` and `paymentId`.
7. The route consumes the purchase atomically through `public.consume_pdf_export_purchase(...)` and returns an `application/pdf` attachment.

Important notes:

- ₹99 buys one clean PDF download for one saved project.
- Reusing the same `razorpay_payment_id` after consumption returns a conflict.
- Pending webhook state fails safely; the client retries after payment verification until the purchase row exists.
- `pdf_export_purchases` has user-readable RLS only; writes and consumption happen through service-role server code.
- Clean PDF purchase events use separate business event names such as `pdf_export.order_created`, `pdf_export.verified`, `pdf_export.payment_applied`, and `pdf_export.downloaded`.
- The generated PDF uses the Writers Block branded screenplay template in both PDFKit and browser print HTML paths.

Related files:

- [src/app/api/projects/[id]/export-pdf/route.ts](../src/app/api/projects/%5Bid%5D/export-pdf/route.ts)
- [src/app/api/razorpay/create-order/route.ts](../src/app/api/razorpay/create-order/route.ts)
- [src/app/api/razorpay/verify/route.ts](../src/app/api/razorpay/verify/route.ts)
- [src/app/api/razorpay/webhook/route.ts](../src/app/api/razorpay/webhook/route.ts)
- [src/modules/billing/presentation/hooks/use-razorpay.ts](../src/modules/billing/presentation/hooks/use-razorpay.ts)
- [src/app/editor/page.tsx](../src/app/editor/page.tsx)
- [src/modules/screenplay-pdf.ts](../src/modules/editor/infrastructure/screenplay-pdf.ts)
- [src/modules/screenplay-print-html.ts](../src/modules/editor/domain/screenplay-print-html.ts)

## Plan Limits and Project Creation

Current project rules:

| Plan | Project policy |
|---|---|
| Free | 3 lifetime project creations |
| Pro | 25 active project slots |
| Premium | Effectively unlimited active slots |

Free project credits are not reusable. If a Free user creates 3 projects, deletes all 3, and tries to create another, the server must return 403 and the UI must disable creation after quota refresh.

Paid plans keep the active-slot model. Pro and Premium users can delete projects and create new projects while their active project count is below the plan limit.

Current create flow:

1. Client reads `GET /api/projects`
2. Response includes `{ items, nextCursor, hasMore, quota }`
3. UI uses `quota.canCreate` and `quota.blockedReason`
4. Client posts `POST /api/projects`
5. Route resolves active organization and calls the service-role-only RPC `public.create_project_with_quota(...)`
6. The database trigger `public.enforce_project_limit_before_insert()` takes a per-user advisory transaction lock, checks active slots, increments Free lifetime usage only for effective Free plan creations, and inserts the project atomically
7. The API returns `{ project, quota }`

Important notes:

- Do not implement project-create limits only in client code or application code.
- Do not query project rows by `user_id` alone for new app features; project APIs are org-scoped and use `org_id`.
- Keep hard delete behavior for now, but Free deletion must not decrement `project_creation_usage.free_lifetime_created`.
- Historical Free lifetime usage is backfilled from `master_admin.business_events` `project.created` rows where available, falling back to current project count only when no event history exists for that user.

Related files:

- [src/app/api/projects/route.ts](../src/app/api/projects/route.ts)
- [modules/projects/application/project-service.ts](../modules/projects/application/project-service.ts)
- [modules/projects/infrastructure/project-repository.ts](../modules/projects/infrastructure/project-repository.ts)
- [modules/projects/ui/use-projects.ts](../modules/projects/ui/use-projects.ts)
- [supabase/database.sql](../supabase/database.sql)
- [docs/ai-cost-and-project-quotas.md](./ai-cost-and-project-quotas.md)

## AI Cost and Monthly Budgets

AI routes use direct provider routing and monthly AI credit budgets in addition to daily anti-abuse limits.

Current monthly budgets:

| Plan | Monthly AI credits |
|---|---:|
| Free | 100K credits |
| Pro | 600K credits |
| Premium | 2M credits |

One AI credit equals one total AI token. Pro and Premium users can buy 100K non-expiring extra AI credits for ₹99 after included credits are exhausted.

Budget states:

- 70%: warning
- 85%: downgrade one complexity tier
- 100%: hard cap

Request-level usage and exact estimated/provider cost is stored in `usage_logs`; monthly rollups are stored in `ai_usage_monthly`.

Related docs:

- [docs/ai-cost-and-project-quotas.md](./ai-cost-and-project-quotas.md)

## Auth OTP Email Ownership

Writers Block owns signup/signin OTP email delivery via `sendAuthOtpEmail(...)`.
If a user receives a Supabase verification link or magic link for normal signup/signin, a code path has regressed to `supabase.auth.signUp`, `supabase.auth.signInWithOtp`, or `supabase.auth.resend`.

Related docs:
- [docs/supabase-auth-email-templates.md](./supabase-auth-email-templates.md)
- [emails/README.md](../emails/README.md)

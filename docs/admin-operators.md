# Admin operators (`master_admin.users`)

**Last updated:** May 4, 2026

Platform admin access is **not** controlled by an email allowlist in environment variables. Operators are rows in **`master_admin.users`**, keyed by **`auth.users.id`**.

| Surface | Path | Extra gate |
|--------|------|------------|
| In-app admin | `/dashboard/admin`, `GET /api/admin/stats` | Signed-in user’s id must exist in `master_admin.users` |
| Master Admin UI + APIs | `/master-admin/*`, `/api/master-admin/*` | Same **plus** request `Host` must appear in **`ADMIN_HOSTS`** |
| Master Admin CSV exports | `/api/master-admin/export/users`, `/api/master-admin/export/payments`, `/api/master-admin/export/audit`, `/api/master-admin/export/business`, `/api/master-admin/export/security`, `/api/master-admin/export/fraud` | Same gates as Master Admin APIs; exports are capped at 2,000 rows per request |

Implementation references: [`src/modules/master-admin/security/admin-privileges.ts`](../src/modules/master-admin/security/admin-privileges.ts), [`middleware.ts`](../src/middleware.ts), [`src/modules/master-admin/security/admin-host.ts`](../src/modules/master-admin/security/admin-host.ts).

## Schema

Defined in [`supabase/database.sql`](../supabase/database.sql):

- **`user_id`** — `UUID`, primary key, `REFERENCES auth.users(id) ON DELETE CASCADE`
- **`created_at`** — `TIMESTAMPTZ`
- **`note`** — optional `TEXT` (e.g. role label)

**RLS** is enabled with **no policies** for the `authenticated` role, so only the **Supabase service role** can read or write this table from server code. That matches how the app checks privileges (service role + `userHasAdminPrivileges`).

## Requirements

1. **`SUPABASE_SERVICE_ROLE_KEY`** must be set wherever the app runs (local `.env.local`, Vercel, etc.). Middleware and API routes use it to verify operator membership.
2. Schema must include `master_admin.users` (apply or re-run the relevant section from `supabase/database.sql`).
3. At least one **`INSERT`** for each operator account (see below).
4. Supabase API settings must expose the `master_admin` schema for server-side `.schema("master_admin")` queries. The app also exposes `user_auth` for normal auth OTPs.

## Grant access

1. In Supabase: **Authentication → Users** — copy the user’s UUID.
2. In **SQL Editor**:

```sql
INSERT INTO master_admin.users (user_id, note)
VALUES ('00000000-0000-0000-0000-000000000000', 'founder')
ON CONFLICT (user_id) DO NOTHING;
```

Replace the UUID with the real id. Use `ON CONFLICT` if you re-run scripts idempotently.

## Revoke access

```sql
DELETE FROM master_admin.users WHERE user_id = '00000000-0000-0000-0000-000000000000';
```

## Relation to `profiles`

Operators are normal Supabase users: they usually still have a **`profiles`** row and **`subscriptions`** row (created by `handle_new_user`). **Product analytics** in Master Admin (user list, signup trend, top users by usage, legacy admin “total users”) **exclude** ids present in `master_admin.users` so operator activity is not mixed with customer metrics.

## Master Admin host allowlist (`ADMIN_HOSTS`)

Comma-separated **`Host`** header values (include port in local dev, e.g. `localhost:3000`, `127.0.0.1:3000`). If **`ADMIN_HOSTS`** is empty, **`/master-admin`** and **`/api/master-admin`** return **404** on every host (fail closed).

`/dashboard/admin` is **not** host-gated; any allowed operator can open it on the main app origin.

## Host header trust (threat model)

Master Admin uses the HTTP **`Host`** header matched against **`ADMIN_HOSTS`**.

- On **Vercel** and typical CDNs, `Host` is the public hostname the client connected to; clients cannot safely spoof it for TLS connections to your domain.
- If you terminate TLS on a **custom reverse proxy**, configure it so downstream apps see the **original external host** (or an allowlisted internal host you add to `ADMIN_HOSTS`). Misconfiguration could expose Master Admin on an unintended hostname.
- **Optional hardening:** use a dedicated DNS name (e.g. `admin.example.com`), a separate deployment if needed, and/or an **edge IP allowlist** (Vercel Firewall, Cloudflare) for that hostname if operators are VPN/office-only.

## MFA for operators

**Multi-factor authentication (TOTP)** materially reduces account takeover risk for high-privilege sessions.

1. In **Supabase Dashboard → Authentication → Providers / MFA**, enable MFA (TOTP) per [Supabase MFA docs](https://supabase.com/docs/guides/auth/auth-mfa).
2. Have each operator enroll a factor on their account (e.g. via your app’s account/security UI or Supabase-hosted flows, depending on your setup).
3. Production enforces AAL2 by default. Local/staging deployments can set **`REQUIRE_AAL2_FOR_MASTER_ADMIN=1`** to match production.

Set **`REQUIRE_AAL2_FOR_MASTER_ADMIN=0`** only for a documented production break-glass window.

Operators who sign in with password only while enforcement is on will be redirected to sign-in with `?error=mfa_required` (pages) or receive **403** with `code: aal2_required` (APIs).

## Audit log (`master_admin.audit_log`)

Successful Master Admin requests (after host, session, operator row, and optional MFA checks) append a row for **compliance and incident review**. The table is defined in [`supabase/database.sql`](../supabase/database.sql).

- **RLS:** enabled; **no** `authenticated` policies (same pattern as `master_admin.users`) — only the **service role** can insert/select from app code.
- **Columns (PII-minimal):** `user_id`, `method`, `route` (path + query, truncated), `host`, `ip_hash` (SHA-256 prefix of client IP, not raw IP), `created_at`.
- **Retention:** manage in your warehouse or periodic SQL deletes if the table grows large.

Apply the schema in Supabase SQL Editor if the table is not present yet.

## Performance notes

Master Admin customer lists, exports, usage summaries, and payment tables rely on indexes in [`supabase/database.sql`](../supabase/database.sql), including:

- `profiles_created_at_idx`
- `profiles_email_trgm_idx`
- `subscriptions_updated_at_idx`
- `subscriptions_status_plan_updated_idx`
- `usage_logs_created_at_idx`
- `ai_usage_monthly_month_idx`
- `project_creation_usage_updated_idx`
- `razorpay_payments_created_at_idx`
- `billing_subscription_ledger_user_created_idx`
- `billing_invoices_user_created_idx`
- `pdf_export_purchases_user_created_idx`
- `pdf_export_purchases_project_created_idx`
- `pdf_export_purchases_unconsumed_idx`

The AI Cost page (`/master-admin/ai-cost`) reads usage and cost data from `usage_logs`, `ai_usage_monthly`, pricing constants in `src/modules/ai/domain/costing.ts`, and subscription revenue helpers. If admin pages become slow at higher data volume, move daily buckets, top-user calculations, and cost projections from application-side sampling in `src/modules/master-admin/infrastructure/admin-queries.ts` into SQL RPCs or rollup tables.

## Job health and repair

Master Admin job operations are exposed through:

- `GET /api/master-admin/jobs/health`: payment post-process jobs, AI batch jobs, story memory jobs, stale reservations, and recent webhook failures.
- `POST /api/master-admin/jobs/repair`: release expired reservations, retry a payment job, unlock stale AI batch jobs, or unlock stale story memory jobs.

These routes require the same Master Admin host, session, operator, and MFA gates as the rest of `/api/master-admin/*`.

## Export and audit behavior

- CSV exports use `Cache-Control: private, no-store` and include `X-Export-Row-Count` plus `X-Export-Row-Cap` response headers.
- Export actions also write IAM audit rows with `platform.export.*` action names when the signed-in operator is available.
- Successful Master Admin page/API requests write `master_admin.audit_log` after host, session, operator, and optional MFA checks pass.

## Master Admin OTP isolation

Master Admin sign-in does not reuse normal user OTP rows.

- Operator grants: `master_admin.users`
- Master Admin OTP challenges: `master_admin.otp_challenges`
- Normal signup/signin/reset OTP challenges: `user_auth.otp_challenges`

This keeps the high-privilege login path separate from normal user authentication data while still using Supabase Auth as the underlying identity/session provider.

## Troubleshooting

| Symptom | Likely cause |
|--------|----------------|
| 404 on `/master-admin` | Host not in `ADMIN_HOSTS`, or variable unset |
| Redirect to `/dashboard` or 403 on Master Admin APIs | User id not in `master_admin.users`, or missing/invalid service role key |
| 403 `aal2_required` on Master Admin | Production requires AAL2, or `REQUIRE_AAL2_FOR_MASTER_ADMIN=1` is set and the session is AAL1 — sign out and sign in again after completing MFA challenge |
| Audit rows missing | `SUPABASE_SERVICE_ROLE_KEY` unset in middleware/runtime, or `master_admin.audit_log` table not created |
| AI Cost page shows no usage | `usage_logs` / `ai_usage_monthly` not created, AI routes not calling `recordAiUsage`, or the date range has no AI traffic |
| Locked out after deploy | Table missing, or no rows; run schema + `INSERT` |
| Operators still “missing” from Users list | By design — excluded from customer-facing lists when they appear in `master_admin.users` |

## Deprecated configuration

**`ADMIN_EMAILS`** is no longer read by the application. Remove it from env files to avoid confusion.

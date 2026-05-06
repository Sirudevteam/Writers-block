# Auth OTP Email Ownership

**Last updated:** May 4, 2026

Writers Block no longer uses Supabase hosted auth email templates for the core signup/signin OTP flow.

The business rule is:
- Writers Block creates and stores short-lived OTP challenges in `user_auth.otp_challenges`.
- Writers Block sends signup/signin/password-reset codes through `src/infrastructure/email/email-service.ts` using Resend.
- Master Admin OTP challenges are stored separately in `master_admin.otp_challenges`.
- Supabase Auth remains the identity and session provider only.
- Supabase **Confirm signup**, **Magic link**, and recovery-link emails should not be part of normal app auth.

This avoids the product confusion where Supabase sends an email named "Confirm signup" or "Magic link" while the app expects a code-entry workflow.

## Current Flow

Signup:
1. `/api/auth/sign-up` validates name, email, password, and consent.
2. The server creates a Supabase user with `admin.createUser(...)`.
3. The server creates an app-owned `signup` OTP challenge.
4. The server sends `Your Writers Block signup code` with `sendAuthOtpEmail(...)`.
5. `/api/auth/verify-code` consumes the OTP and confirms the Supabase email.
6. The user returns to `/signin`; session cookies are created only after the normal password + sign-in OTP flow.

Signin:
1. `/api/auth/sign-in` validates the password using Supabase.
2. The server withholds session cookies.
3. The server creates an app-owned `signin` OTP challenge with the encrypted session payload.
4. The server sends `Your Writers Block sign-in code` with `sendAuthOtpEmail(...)`.
5. `/api/auth/verify-code?mode=signin` consumes the OTP and sets HTTP-only cookies.

Password reset:
1. `/api/auth/request-password-reset` validates the email.
2. The server creates a `password_reset` OTP challenge in `user_auth.otp_challenges`.
3. The server sends `Your Writers Block password reset code` with `sendAuthOtpEmail(...)`.
4. `/api/auth/reset-password` consumes the OTP, revokes existing app sessions, and updates the password with the Supabase admin API.

Master Admin:
1. `/api/auth/master-admin-sign-in` validates password first.
2. The server checks `master_admin.users`.
3. The server creates a Master Admin OTP challenge in `master_admin.otp_challenges`.
4. `/api/auth/verify-code?mode=master-admin` consumes the OTP and sets HTTP-only cookies.

## Required Infrastructure

Run the schema in `supabase/database.sql` so `user_auth.otp_challenges` exists.
In Supabase Dashboard -> API settings, expose the `user_auth` and `master_admin` schemas so server-side Supabase JS `.schema(...)` calls can reach them.

Set these server environment variables:
- `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `AUTH_OTP_SECRET` recommended; falls back to `SUPABASE_SERVICE_ROLE_KEY`
- `MASTER_ADMIN_OTP_SECRET` optional; falls back to `AUTH_OTP_SECRET` or `SUPABASE_SERVICE_ROLE_KEY`

In production, set explicit OTP secrets instead of relying on provider keys as encryption secrets.

Sign-up and password-reset challenges do not store passwords. Sign-in and Master Admin challenges temporarily store encrypted Supabase session payloads until OTP verification succeeds or the challenge expires.

## Supabase Templates

Supabase templates in `emails/supabase-*.html` are now legacy/reference material for hosted auth flows. They are not used by the normal signup/signin/reset business flow.

If users receive a Supabase-branded verification or recovery link for normal app auth, some code path has regressed to hosted Supabase email delivery. The current auth API routes should not do that.

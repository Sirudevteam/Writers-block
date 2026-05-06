# Email templates

**Last updated:** May 4, 2026

- **Resend (app):** Branded layout is built in code via [`../src/modules/email-theme.ts`](../src/modules/email-theme.ts) and used from [`../src/infrastructure/email/email-service.ts`](../src/infrastructure/email/email-service.ts).
- **Supabase Auth:** These HTML files are **not** used by the app at runtime. Copy them into the [Supabase Dashboard](https://supabase.com/docs/guides/auth/auth-email-templates) under `Authentication -> Email Templates`.
- **Current behavior docs:** See [`../docs/supabase-auth-email-templates.md`](../docs/supabase-auth-email-templates.md) and [`../docs/auth-and-billing-current-behavior.md`](../docs/auth-and-billing-current-behavior.md).
- **Admin operators:** Who can open `/dashboard/admin` and Master Admin is configured in the database, not via email templates. See [`../docs/admin-operators.md`](../docs/admin-operators.md).
- **Runtime email types:** signup/signin/reset OTPs, Master Admin OTPs, payment confirmations, expiry warnings, and screenplay PDF delivery are composed and sent from app code through Resend.

| File | Supabase template |
|------|-------------------|
| [supabase-confirm-signup.html](supabase-confirm-signup.html) | Legacy/reference Confirm signup template; normal signup OTP is sent by Resend |
| [supabase-magic-link.html](supabase-magic-link.html) | Legacy/reference Magic link template; normal sign-in OTP is sent by Resend |
| [supabase-reset-password.html](supabase-reset-password.html) | Legacy/reference recovery template; normal reset uses `email -> OTP -> new password` |
| [supabase-change-email.html](supabase-change-email.html) | Change email address |

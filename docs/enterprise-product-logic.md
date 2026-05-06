# Enterprise Product Logic

Implemented scope:

- Organization invites with hashed tokens, resend/revoke/accept, expiry, and audit events.
- Organization security policy for verified domains, MFA, SSO, password-login disablement, session duration, and SCIM token rotation.
- Supabase SAML SSO start/callback flow with invite-or-domain joins bound to Supabase user UUID plus org membership.
- Custom SCIM v2 user provisioning with hashed bearer tokens, pending provisioned users, membership sync, deprovisioning, and session revocation.
- Razorpay Subscriptions for paid plan checkout, cancellation, reactivation, invoice/ledger sync, webhook-driven status, and seven day dunning grace.
- Private org collaboration through project comments and activity events.
- Account export, account deletion request, revoke-all-sessions, support tickets, legal policy pages, consent tracking, and Master Admin job health/repair APIs.

Out of scope for this phase:

- External review links or public sharing.
- Replacing one-time Razorpay orders for clean PDF exports and AI credit top-ups.
- Automatic deletion of Supabase Auth users after an account deletion request; requests are recorded and sessions are revoked for operations review.

Operational notes:

- Configure Razorpay subscription plan IDs with `RAZORPAY_PLAN_PRO_MONTHLY`, `RAZORPAY_PLAN_PRO_ANNUAL`, `RAZORPAY_PLAN_PREMIUM_MONTHLY`, and `RAZORPAY_PLAN_PREMIUM_ANNUAL`.
- Razorpay subscription webhooks must include `subscription.*` events in addition to the existing `payment.captured` event.
- SCIM tokens are only shown once when rotating through `PATCH /api/org/security-policy` with `rotateScimToken: true`.
- `GET /api/cron/cleanup-enterprise` should run on a trusted schedule with `CRON_SECRET`.

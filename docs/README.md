# Writers Block Documentation

**Last updated:** May 6, 2026

This directory is the managed documentation set for the current product and platform. Start with the handbook, then use the focused references for implementation details.

## Read Order

| Step | Document | Use it for |
|---:|---|---|
| 1 | [current-platform-handbook.md](current-platform-handbook.md) | Merged product, backend, security, billing, AI, database, and operations summary |
| 2 | [security-architecture.md](security-architecture.md) | Defense-in-depth controls, middleware, CSP, route policy, WAF, rate limits, secrets, audit, incident response |
| 3 | [auth-and-billing-current-behavior.md](auth-and-billing-current-behavior.md) | OTP auth, Master Admin sign-in, Razorpay Subscriptions, one-time payments, PDF export, plan state |
| 4 | [ai-cost-and-project-quotas.md](ai-cost-and-project-quotas.md) | GenerationService, AI routing, budgets, top-ups, story memory, Story Bible, project quotas |
| 5 | [iam-enterprise.md](iam-enterprise.md) | Organization IAM, tenant policy, MFA/AAL2, SSO, SCIM |
| 6 | [database-migrations.md](database-migrations.md) | Single Supabase schema source, setup, DB type regeneration |
| 7 | [performance-architecture.md](performance-architecture.md) | Current build baseline, middleware/rendering cost, bottlenecks, measurement workflow |

## Focused References

| Document | Purpose |
|---|---|
| [admin-operators.md](admin-operators.md) | Granting, revoking, and troubleshooting `master_admin.users` operator access |
| [enterprise-product-logic.md](enterprise-product-logic.md) | Enterprise feature scope and operational notes across invites, SSO/SCIM, billing, support, collaboration, cleanup |
| [gap-closure-roadmap.md](gap-closure-roadmap.md) | Release sequencing and remaining product/engineering roadmap |
| [supabase-auth-email-templates.md](supabase-auth-email-templates.md) | Why hosted Supabase auth emails are reference-only and Resend owns runtime OTP email |
| [system-architecture-rules.md](system-architecture-rules.md) | Long-term enterprise architecture principles and current monolith mapping |

## Related Repository Docs

| Location | Purpose |
|---|---|
| [../README.md](../README.md) | Product overview, setup, scripts, deployment checklist |
| [../CLAUDE.md](../CLAUDE.md) | Maintainer and code-agent guidance |
| [../emails/README.md](../emails/README.md) | Runtime Resend email ownership and legacy Supabase template files |
| [../infra/README.md](../infra/README.md) | Terraform and Cloudflare operations |
| [../.env.example](../.env.example) | Environment variable catalog |

## Source-Of-Truth Rules

- Current platform behavior belongs first in [current-platform-handbook.md](current-platform-handbook.md).
- Detailed security behavior belongs in [security-architecture.md](security-architecture.md).
- Detailed auth and payment behavior belongs in [auth-and-billing-current-behavior.md](auth-and-billing-current-behavior.md).
- Detailed AI, cost, story memory, Story Bible, and project quota behavior belongs in [ai-cost-and-project-quotas.md](ai-cost-and-project-quotas.md).
- Detailed IAM, SSO, and SCIM behavior belongs in [iam-enterprise.md](iam-enterprise.md).
- Database schema changes belong in `supabase/database.sql`; do not create parallel SQL migration docs while this repo uses the single-file baseline.
- Environment variable changes must update `.env.example`, [../README.md](../README.md), and the relevant focused doc in the same change.

## Documentation Maintenance Checklist

Run this checklist when changing backend behavior, product rules, secrets, database schema, or deployment requirements:

1. Update the focused source-of-truth doc.
2. Update [current-platform-handbook.md](current-platform-handbook.md) if the change affects a cross-system flow.
3. Update [../README.md](../README.md) for setup, env vars, scripts, or deployment changes.
4. Update `.env.example` for new, renamed, or newly-required env vars.
5. Update [performance-architecture.md](performance-architecture.md) only after running `npm run build`.
6. Update security tests when the doc describes a security invariant that should never regress.
7. Prefer editing an existing doc over adding another overlapping document.

## Current Non-Negotiables

- Middleware covers non-static pages and API routes to provide request ids, nonce-backed CSP, WAF, CSRF, route policy, and session gates.
- Protected APIs require Supabase `getUser()` before route handlers run.
- Public API routes must be explicitly classified in `src/core/security/api-route-policy.ts`.
- Machine API routes must use Razorpay HMAC, cron secret, QStash signature, SCIM bearer, or app-owned shared secret validation.
- `AUTH_OTP_SECRET` and `MASTER_ADMIN_OTP_SECRET` are required in production.
- Razorpay webhook setup must include `payment.captured` and `subscription.*`.
- Free project limits are lifetime creation credits, not active reusable slots.
- Story Bible entries are user-owned source data; vector memory is derived infrastructure.
- `npm run typecheck`, `npm run test:security`, and `npm run build` must pass before relying on docs that describe current production behavior.

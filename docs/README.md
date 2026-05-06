# Writers Block Documentation

**Last updated:** May 6, 2026

This directory contains the operational and architecture notes that should stay aligned with production behavior. Use this file as the index before changing auth, billing, IAM, security, performance, or infrastructure code.

## Sources Of Truth

| Document | Purpose |
|---|---|
| [auth-and-billing-current-behavior.md](auth-and-billing-current-behavior.md) | Current OTP auth, Master Admin sign-in, server auth, Razorpay webhook behavior, subscriptions, and ₹99 clean PDF export behavior |
| [ai-cost-and-project-quotas.md](ai-cost-and-project-quotas.md) | GenerationService flow, story memory, direct-provider AI routing, monthly AI credits, paid top-ups, prompt caching, batch jobs, feedback, Free lifetime project credits, and project quota enforcement |
| [admin-operators.md](admin-operators.md) | Granting, revoking, and troubleshooting `master_admin.users` operator access |
| [iam-enterprise.md](iam-enterprise.md) | Organization IAM, active org scoping, MFA flags, and module boundaries |
| [enterprise-product-logic.md](enterprise-product-logic.md) | Enterprise product implementation: invites, tenant policy, SSO/SCIM, Razorpay Subscriptions, collaboration, support/legal, and admin job health |
| [system-architecture-rules.md](system-architecture-rules.md) | Enterprise-grade web/mobile system flow across client, CDN/WAF, gateway, identity, authorization, services, data, observability, and scalability layers |
| [security-architecture.md](security-architecture.md) | Defense-in-depth model, middleware scope, WAF, rate limits, audit logs, and incident response |
| [performance-architecture.md](performance-architecture.md) | Current build baseline, Core Web Vitals targets, middleware scope, streaming behavior, and DB indexes |
| [database-migrations.md](database-migrations.md) | Single Supabase schema setup, hygiene rules, and DB type regeneration |
| [gap-closure-roadmap.md](gap-closure-roadmap.md) | Sequenced Release 1-4 product and engineering roadmap, including Story Bible and E2E/eval foundations |
| [supabase-auth-email-templates.md](supabase-auth-email-templates.md) | Supabase hosted email template status and why runtime auth uses Resend OTPs |

## Related Documentation

| Location | Purpose |
|---|---|
| [../README.md](../README.md) | Product overview, setup, architecture, scripts, and deployment checklist |
| [../CLAUDE.md](../CLAUDE.md) | Maintainer and code-agent guidance for architecture, performance, and common tasks |
| [../emails/README.md](../emails/README.md) | Runtime Resend email ownership and legacy Supabase template files |
| [../infra/README.md](../infra/README.md) | Terraform and Cloudflare operations guide |
| [../.env.example](../.env.example) | Environment variable catalog for local and production deployments |

## Documentation Rules

- Keep public routes, API paths, database schema names, and env var names exact.
- Treat `supabase/database.sql` as the single Supabase schema source of truth.
- Keep `/` documented as a static public page outside the middleware matcher unless the code intentionally changes.
- Keep Razorpay subscription entitlement writes documented as webhook-source-of-truth unless that business rule intentionally changes.
- Keep SSO/SCIM and organization security policy routes documented in IAM and security docs when route policy changes.
- Keep ₹99 clean PDF purchases documented as webhook-created and atomically consumed by service-role RPC.
- Keep Free project limits documented as lifetime creation credits, not reusable active slots.
- Keep AI provider routing documented as direct OpenAI/Gemini/Anthropic only.
- Keep story memory env vars, pgvector schema, and `/api/jobs/story-memory` worker behavior in sync across `.env.example`, `supabase/database.sql`, and [ai-cost-and-project-quotas.md](ai-cost-and-project-quotas.md).
- Keep Story Bible routes, RLS policies, and DB types in sync across `supabase/database.sql`, [database-migrations.md](database-migrations.md), and editor UI.
- Re-run `npm run build` before changing bundle-size or route baseline numbers in performance docs.
- Keep `README.md`, `.env.example`, and this index in sync when new route groups, custom schemas, or required env vars are added.
- Mark uncertain removals as "needs confirmation" rather than deleting historical context.

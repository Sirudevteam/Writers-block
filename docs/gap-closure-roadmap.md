# Gap-Closure Roadmap

**Last updated:** May 6, 2026

This roadmap keeps the remaining product and engineering gaps sequenced. Release 1 is implementation-ready and is the current milestone; Releases 2-4 stay documented until Release 1 is stable.

## Release 1: Production Foundation + Editable Story Bible

Status: implemented in this milestone.

- Schema discipline: one fresh Supabase baseline in `supabase/database.sql`.
- DB type hygiene: `npm run db:types` added and `src/infrastructure/db/types/database.ts` updated for Story Bible and AI credit ledger tables.
- Editable Story Bible:
  - Table: `project_story_bible_entries`
  - Kinds: `character`, `scene`, `arc`, `continuity_note`, `style_rule`
  - Routes: `GET/POST /api/projects/[id]/story-bible`, `PATCH/DELETE /api/projects/[id]/story-bible/[entryId]`
  - Editor panel: Characters, Scenes, Arcs, Continuity, Style
  - AI behavior: pinned entries are included before vector memory; Story Bible edits queue memory rebuilds.
- AI credit UX:
  - Credit history API: `GET /api/ai/credits/history`
  - Subscription dashboard shows included credits, low-credit warnings, top-up CTA, and top-up history.
  - Master Admin payments view shows top-up purchases and reservation health.
- E2E foundation:
  - `@playwright/test`, `playwright.config.ts`, and `npm run test:e2e`
  - Test-only helpers under `/api/test/e2e/*`, guarded by `ENABLE_E2E_TEST_ROUTES=true` and `E2E_TEST_SECRET`
  - Deterministic provider mode with `AI_PROVIDER_MOCK=true`
- Offline eval foundation:
  - `tests/evals/`
  - `npm run test:evals`

## Release 2: AI Quality, Async Ops, Observability

Status: partially implemented in the enterprise logic pass.

- Expand offline evals with more golden screenplay fixtures.
- Master Admin job health and repair APIs are implemented under `/api/master-admin/jobs/*`.
- Scheduled enterprise cleanup is implemented at `/api/cron/cleanup-enterprise`.
- Add correlation ids through API routes, GenerationService, provider router, usage logs, and reservations.
- Add Sentry tags for endpoint, plan, AI task kind, provider, and budget state.
- Add alert queries for provider failures, webhook failures, reservation leaks, job backlog, and memory indexing failures.

## Release 3: Team Workflows And Collaboration

Status: API foundation implemented; dashboard UI polish remains.

- Organization invite create/accept/revoke/resend APIs are implemented.
- Email invite template is implemented through Resend.
- Project comments with resolve/unresolve are implemented.
- Project activity feed API is implemented.
- External share/review links remain out of scope for the private-org phase.

## Release 4: Commercial Polish And Growth

- Billing history API for subscription ledger, invoices, refunds, and customer profile is implemented.
- Support ticket API for billing, AI output, export issues, account recovery, and other issues is implemented.
- Refund/dispute schema foundation is implemented; deeper operator UI remains.
- Public Terms, Privacy, Refund Policy, and Fair Usage Policy pages are implemented.
- First-run onboarding and screenplay templates for Tamil/English workflows.
- Changelog/release notes page.
- Editor panel dynamic imports, bundle analyzer, accessibility checks, and improved mobile editor layout.

## Release Rules

- No live AI provider calls in CI.
- No real Razorpay checkout in E2E.
- Test-only helpers must stay disabled in production.
- Story Bible entries are the user-owned source of truth; vector memory is derived infrastructure.
- SSO/SCIM, team APIs, and private collaboration are now implementation scope; external share links remain deferred.

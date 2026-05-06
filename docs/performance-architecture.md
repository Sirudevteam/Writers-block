# Performance Architecture

**Last updated:** May 5, 2026
**Scope:** Next.js rendering, middleware, API latency, database access, caching, and editor runtime behavior.

## Current Baseline

Latest production build check, verified on May 4, 2026:

```bash
npm run build
```

Observed route sizes:

| Route | First Load JS |
|---|---:|
| `/` | 264 kB |
| `/dashboard` | 277 kB |
| `/dashboard/org` | 225 kB |
| `/dashboard/projects` | 331 kB |
| `/dashboard/settings` | 294 kB |
| `/dashboard/subscription` | 298 kB |
| `/editor` | 354 kB |
| `/master-admin` | 225 kB |
| `/master-admin/ai-cost` | 187 kB |
| `/signin` | 202 kB |
| `/signup` | 203 kB |
| `/verify-code` | 202 kB |

Shared first-load JS is 184 kB. Middleware bundle size is 152 kB, but the matcher intentionally excludes `/` so the static public homepage does not pay middleware, WAF, or Supabase auth overhead on first request.

## Performance Targets

| Metric | Target |
|---|---:|
| LCP | < 2.5s |
| CLS | < 0.1 |
| INP | < 200ms |
| TTFB | < 500ms |

## Implemented Optimizations

### Static Homepage TTFB

The public homepage is statically prerendered and is not included in the middleware matcher.

Do not add `/` back to `middleware.ts` unless the public page truly needs request-time auth or WAF behavior. Security headers for public pages are applied by `next.config.js`.

### Streaming Editor Runtime

AI screenplay streaming is batched in `src/modules/editor/presentation/hooks/use-screenplay-stream.ts` with `requestAnimationFrame`. This prevents per-token or per-chunk React updates from forcing repeated full editor re-renders.

While generation is active:
- autosave is disabled through `useAutoSave({ enabled: !isGenerating })`
- the editor renders plain streaming text
- screenplay parsing resumes after generation settles

This protects INP on long scripts and lower-end mobile devices.

### Database Indexes

`supabase/database.sql` includes indexes for hot paths:

- cursor-paginated project lists by org and `updated_at`
- Free lifetime project creation usage by user
- profile lookup and trigram email search
- admin date scans on profiles, subscriptions, usage logs, AI usage monthly rollups, Razorpay payments
- subscription expiry cron lookups
- subscription event history
- Master Admin SQL aggregation RPCs for usage, funnel, MRR, and top-user reporting
- story memory lookup through `project_memory_status`, `project_story_memory`, and the HNSW pgvector embedding index

When adding a new high-cardinality filter, add the matching index in `supabase/database.sql` and run `ANALYZE` after applying it.

### API Cache Headers

Mutation and sensitive routes return `no-store`. Read routes that are user-specific but cacheable use private cache headers, for example project list and subscription reads.

Master Admin reporting APIs still return `private, no-store`, but expensive overview/usage/funnel payloads are cached server-side in Upstash Redis for 30 seconds after operator authorization.

### Dashboard First Load

`/dashboard` preloads the active tenant's first project page, quota object, profile, and subscription from a server component. The client project hook hydrates from that page and skips the duplicate first-load `/api/projects` request.

Project create checks do not scan deleted history on every request. Free lifetime usage is held in `project_creation_usage`, and the insert trigger uses an advisory transaction lock so parallel create requests near the limit serialize per user.

### AI Budget Checks

AI routes read `ai_usage_monthly` before provider calls. This avoids summing `usage_logs` during user-facing requests and lets the router return warning, downgrade, or blocked states with predictable latency.

AI prompt cache metadata is stored in `ai_prompt_cache_entries`; cache hit/miss accounting stays in `usage_logs`.

Non-real-time AI batch jobs are queued in `ai_batch_jobs` and processed through QStash-style job routes instead of running synchronously in the user request.

Story memory indexing is also async. Project saves queue `project_memory_status` work when the screenplay content hash changes, and `/api/jobs/story-memory` rebuilds pgvector chunks outside the user-facing save/generation path. AI generation reads only relevant memory chunks, capped by `STORY_MEMORY_MAX_CONTEXT_TOKENS`, and falls back to project fields plus the recent screenplay tail when memory is empty or unavailable.

`usage_logs` remains the request-level audit table. If write volume becomes a bottleneck, move `recordAiUsage(...)` to a queue or batch worker, but keep `ai_usage_monthly` fresh enough for budget enforcement.

### Razorpay Webhook Critical Path

The Razorpay webhook validates events and applies critical billing state synchronously. Recurring paid plans are driven by Razorpay `subscription.*` webhooks into `subscriptions`, `billing_subscription_ledger`, and `billing_invoices`. One-time clean PDF purchases still write `pdf_export_purchases`, and AI credit top-ups still use the top-up payment RPC. Legacy one-time subscription payment side effects still use `master_admin.payment_post_process_jobs` where that path is exercised.

### Security Scanning And Build Gates

CI runs lint, typecheck, critical `npm audit`, dependency review on PRs, Semgrep SAST, CodeQL, and a manually triggered OWASP ZAP baseline scan. Keep these checks green before relying on local performance numbers.

## Current Bottlenecks

### Bundle Size

The largest user-facing bundles remain:
- `/editor`: 354 kB first-load JS
- `/dashboard/projects`: 331 kB first-load JS
- `/`: 264 kB first-load JS

Primary causes:
- global root client providers
- `framer-motion` on above-the-fold marketing and app pages
- large editor UI surface in a single client page
- multiple font families in the root layout

Recommended next tranche:
1. Split editor side panels and reference panels with `next/dynamic`.
2. Move non-critical marketing animations to CSS or lazy client islands.
3. Keep only critical fonts in the root layout; move secondary fonts to route-specific use where possible.
4. Add bundle analyzer support before major UI work.

### Middleware Size

Middleware is still large because it contains WAF, auth, Master Admin gates, CSRF checks, and audit hooks.

Keep the matcher narrow:
- protected app routes
- auth pages that need redirect behavior
- Master Admin routes
- API routes

Avoid matching static marketing pages unless there is a concrete security requirement.

### Admin Analytics

Master Admin daily buckets, endpoint breakdowns, top users, funnel counts, MRR groups, and AI Cost summaries are aggregated from indexed tables or SQL RPCs instead of sampling large row sets into application memory. At larger scale, move these RPCs behind rollup tables or materialized views.

## Measurement Workflow

Local production smoke:

```bash
npm run build
npm run start
```

Lighthouse:

```bash
npx lighthouse http://localhost:3000 --preset=desktop --view
npx lighthouse http://localhost:3000/editor --preset=desktop --view
```

Bundle inspection:

```bash
npm run build
Get-ChildItem -Recurse .next/static/chunks -File |
  Sort-Object Length -Descending |
  Select-Object -First 20 Name,Length
```

## Performance Checklist

- Keep `/` static and outside middleware.
- Do not call Supabase auth from public marketing Server Components.
- Batch SSE/client stream updates before setting React state.
- Do not autosave every stream chunk.
- Use cursor pagination for growing lists.
- Use rollup tables for budget checks and financial dashboards.
- Keep user-specific API responses `private` or `no-store`.
- Add indexes with every new large filter/sort.
- Keep story memory embedding/indexing async; do not generate embeddings inside project save or live generation requests.
- Avoid doing admin analytics over unbounded row sets in application memory.
- Run `npm run build` before merging user-facing UI changes.

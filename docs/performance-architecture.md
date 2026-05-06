# Performance Architecture

**Last updated:** May 6, 2026
**Scope:** Next.js rendering, middleware, API latency, database access, caching, and editor runtime behavior.

## Current Build Baseline

Latest local production build check:

```bash
npm run build
```

Verified on May 6, 2026.

| Route | Rendering | First Load JS |
|---|---|---:|
| `/` | dynamic | 265 kB |
| `/dashboard` | dynamic | 278 kB |
| `/dashboard/org` | dynamic | 225 kB |
| `/dashboard/projects` | dynamic | 333 kB |
| `/dashboard/settings` | dynamic | 295 kB |
| `/dashboard/subscription` | dynamic | 300 kB |
| `/editor` | dynamic | 384 kB |
| `/master-admin` | dynamic | 226 kB |
| `/master-admin/ai-cost` | dynamic | 187 kB |
| `/signin` | dynamic | 203 kB |
| `/signup` | dynamic | 203 kB |
| `/verify-code` | dynamic | 203 kB |

Shared first-load JS is 185 kB. Middleware bundle size is 153 kB.

The homepage is dynamic because it receives a request nonce for CSP-protected JSON-LD scripts. It must still avoid server-side Supabase Auth checks and other blocking product queries before render.

## Performance Targets

| Metric | Target |
|---|---:|
| LCP | < 2.5s |
| CLS | < 0.1 |
| INP | < 200ms |
| TTFB | < 500ms for protected/product pages; monitor `/` after nonce-CSP rollout |

## Middleware Cost

Middleware covers non-static pages and API routes to provide:

- request id
- nonce-backed CSP
- WAF inspection
- CSRF checks
- Supabase session refresh
- route policy gates
- Master Admin/account-status gates

Static assets, Next internals, image files, maps, fonts, `robots.txt`, and `sitemap.xml` are excluded. Keep those exclusions intact.

Do not add server-side Supabase Auth checks to public marketing Server Components. The navbar should continue resolving auth client-side.

## Implemented Optimizations

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

Master Admin reporting APIs return `private, no-store`, but expensive overview/usage/funnel payloads are cached server-side in Upstash Redis for 30 seconds after operator authorization.

### Dashboard First Load

`/dashboard` preloads the active tenant's first project page, quota object, profile, and subscription from a server component. The client project hook hydrates from that page and skips the duplicate first-load `/api/projects` request.

Project create checks do not scan deleted history on every request. Free lifetime usage is held in `project_creation_usage`, and the insert trigger uses an advisory transaction lock so parallel create requests near the limit serialize per user.

### AI Budget Checks

AI routes read `ai_usage_monthly` before provider calls. This avoids summing `usage_logs` during user-facing requests and lets the router return warning, downgrade, or blocked states with predictable latency.

AI prompt cache metadata is stored in `ai_prompt_cache_entries`; cache hit/miss accounting stays in `usage_logs`.

Non-real-time AI batch jobs are queued in `ai_batch_jobs` and processed through signed job routes instead of running synchronously in the user request.

Story memory indexing is async. Project saves queue `project_memory_status` work when the screenplay content hash changes, and `/api/jobs/story-memory` rebuilds pgvector chunks outside the user-facing save/generation path. AI generation reads only relevant memory chunks, capped by `STORY_MEMORY_MAX_CONTEXT_TOKENS`, and falls back to project fields plus the recent screenplay tail when memory is empty or unavailable.

### Razorpay Webhook Critical Path

The Razorpay webhook validates events and applies critical billing state synchronously. Recurring paid plans are driven by Razorpay `subscription.*` webhooks into `subscriptions`, `billing_subscription_ledger`, and `billing_invoices`. One-time clean PDF purchases still write `pdf_export_purchases`, and AI credit top-ups still use the top-up payment RPC.

Post-payment side effects that are not entitlement-critical can run through `/api/jobs/razorpay-post-payment`.

## Current Bottlenecks

The largest user-facing bundles are:

- `/editor`: 384 kB first-load JS
- `/dashboard/projects`: 333 kB first-load JS
- `/dashboard/subscription`: 300 kB first-load JS
- `/dashboard/settings`: 295 kB first-load JS
- `/`: 265 kB first-load JS

Primary causes:

- global root client providers
- `framer-motion` on above-the-fold marketing and app pages
- large editor UI surface in a single client page
- multiple font families in the root layout
- middleware nonce-CSP makes the homepage dynamic

Recommended next tranche:

1. Split editor side panels and reference panels with `next/dynamic`.
2. Move non-critical marketing animations to CSS or lazy client islands.
3. Keep only critical fonts in the root layout; move secondary fonts to route-specific use where possible.
4. Add bundle analyzer support before major UI work.
5. Track homepage TTFB after nonce-CSP rollout and remove avoidable server work from `/`.

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

```powershell
npm run build
Get-ChildItem -Recurse .next/static/chunks -File |
  Sort-Object Length -Descending |
  Select-Object -First 20 Name,Length
```

## Performance Checklist

- Keep middleware static-asset exclusions intact.
- Do not call Supabase Auth from public marketing Server Components.
- Batch SSE/client stream updates before setting React state.
- Do not autosave every stream chunk.
- Use cursor pagination for growing lists.
- Use rollup tables for budget checks and financial dashboards.
- Keep user-specific API responses `private` or `no-store`.
- Add indexes with every new large filter/sort.
- Keep story memory embedding/indexing async; do not generate embeddings inside project save or live generation requests.
- Avoid doing admin analytics over unbounded row sets in application memory.
- Run `npm run build` before merging user-facing UI changes.

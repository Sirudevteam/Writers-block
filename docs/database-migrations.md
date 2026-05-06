# Database Schema

**Last updated:** May 6, 2026

The Supabase database is bootstrapped from one consolidated schema:

```text
supabase/database.sql
```

There is intentionally no mirrored SQL migration copy. Do not add separate delta migrations while the project is being rebuilt from a fresh Supabase database.

## Fresh Supabase Setup

1. Create the new Supabase project.
2. Open Supabase SQL Editor.
3. Run `supabase/database.sql` from top to bottom.
4. In Supabase Dashboard -> API settings, expose these schemas:

```text
user_auth
master_admin
```

5. Copy the new project URL, anon key, and service-role key into `.env.local` or production env vars.
6. Regenerate DB types after the schema is applied:

```bash
npm run db:types
```

7. Run:

```bash
npm run typecheck
npm run test:security
npm run build
```

## Schema Hygiene

- Treat `supabase/database.sql` as the source of truth.
- Keep the schema as exactly one SQL file: `supabase/database.sql`.
- For any schema change, edit `supabase/database.sql`, regenerate DB types, and run the verification commands.
- The schema is idempotent where practical, but a fresh database is still the intended target for this single-file baseline.

## DB Type Hygiene

The committed type file is:

```text
src/infrastructure/db/types/database.ts
```

Regenerate it after every schema change:

```bash
npm run db:types
```

If using a remote project instead of the local Supabase stack, run the equivalent Supabase CLI command with the project id and replace the same type file.

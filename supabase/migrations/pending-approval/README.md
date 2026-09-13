# `pending-approval/` — migrations held out of the auto-apply path

Migrations in this directory are **written, reviewed, and deliberately not deployable.**

The Supabase CLI only reads `.sql` files at the top level of `supabase/migrations/`, so
anything here is invisible to `supabase db push` and to the `deploy-supabase` CI job.
Verified: with this directory populated, `supabase db push --dry-run` reports
`Remote database is up to date`.

## Why this exists

B14-A fixed the `deploy-supabase` job so that it actually runs. That was the right fix,
and it means **any migration sitting in `supabase/migrations/` is applied to production
automatically on the next merge to `main`** — no further human gate.

For an additive migration that is fine. For a destructive one awaiting approval and
staging validation, it is not. This directory is where such a migration waits.

## Currently held

### `20260913000001_xp_event_uniqueness_b8e.sql` — B8-E / F-COR-3

**Blocked on:** staging validation. There is no staging Supabase project (P0-1).

Deletes 31 `theory_read` concurrency duplicates, removes 310 XP across 13 users, and
adds a partial unique index over six once-only source types. Scope approved 2026-09-13;
staging validation is the outstanding gate.

Full context: [`docs/PENDING_B8E_MIGRATION.md`](../../../docs/PENDING_B8E_MIGRATION.md).

## Releasing a held migration

Only after its gates are satisfied:

```bash
git mv supabase/migrations/pending-approval/<file>.sql supabase/migrations/
npx supabase db push --dry-run   # confirm it is now listed as pending
```

Then merge. The CI job applies it.

**Do not move a file out of here to "test something".** The next merge to `main` applies
it to production.

# `pending-approval/` — migrations held out of the auto-apply path

Migrations placed here are **written, reviewed, and deliberately not deployable.**

The Supabase CLI only reads `.sql` files at the top level of `supabase/migrations/`, so
anything here is invisible to `supabase db push` and to the `deploy-supabase` CI job.

## Why this exists

B14-A fixed the `deploy-supabase` job so that it actually runs. That means **any
migration sitting in `supabase/migrations/` is applied to production automatically on the
next merge to `main`** — with no further human gate.

For an additive migration that is fine. For a destructive one awaiting approval, it is
not. This directory is where such a migration waits.

## Currently held

**Nothing.** The directory is empty by design; it stays in the repository so the next
destructive migration has an obvious place to wait.

## Previously held

`20260913000001_xp_event_uniqueness_b8e.sql` (B8-E / F-COR-3) was held here until it was
approved and **applied to production on 2026-09-13 at 18:15:34Z**. It now lives in
`supabase/migrations/` as part of the applied history.

Execution record, including preflight numbers and the full post-migration
reconciliation: [`docs/archive/B8E_XP_UNIQUENESS_EXECUTION.md`](../../../docs/archive/B8E_XP_UNIQUENESS_EXECUTION.md).

## Holding a migration

```bash
git mv supabase/migrations/<file>.sql supabase/migrations/pending-approval/
npx supabase db push --dry-run   # must report upToDate
```

## Releasing one

Only after its gates are satisfied — approval, backup, and whatever validation the change
demands:

```bash
git mv supabase/migrations/pending-approval/<file>.sql supabase/migrations/
npx supabase db push --dry-run   # confirm it is now the expected pending migration
npx supabase db push
```

**Do not move a file out of here to "test something".** The next merge to `main` applies
it to production.

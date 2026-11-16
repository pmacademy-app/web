---
trigger: glob
globs: "supabase/**/*.sql"
---

# Database migration rules

These apply to every SQL file under `supabase/`.

## How migrations reach production
- The `deploy-supabase` job in `.github/workflows/ci.yml` runs `supabase db push --include-all` on every push to `main`. Every top-level `.sql` file in `supabase/migrations/` is applied to production on merge, with no human gate.
- The Supabase CLI never reads the subfolders `rollback/`, `validation/` and `pending-approval/`.

## Where a new migration goes
- Write every new migration in `supabase/migrations/pending-approval/<timestamp>_<name>.sql`. Never add a top-level file. The owner releases it.
- Ship two companions in the same change:
  - `supabase/migrations/pending-approval/rollback/<timestamp>_<name>.down.sql`: undoes it and is safe to re-run.
  - `supabase/migrations/pending-approval/validation/<timestamp>_<name>_validation.sql`: read-only checks that prove it applied. Required whenever grants, policies, RLS or functions change.
- Add a short section for it to `supabase/migrations/pending-approval/README.md`: what it does, preconditions, run order, undo.
- Timestamps use the `YYYYMMDDHHMMSS` form and must sort after every existing file. Use the exact file name your task brief assigns.
- To test a held migration in CI, add its file name to `supabase/tests/held-migrations.txt` (the `db-local` job applies the list after `supabase db reset`). Never list files that need Vault secrets or pg_cron.

## Writing the SQL
- Make it idempotent: `IF NOT EXISTS`, `CREATE OR REPLACE`, `DROP ... IF EXISTS`, unschedule-if-exists for pg_cron.
- `SECURITY DEFINER` functions set `search_path = ''` (or a pinned list) and use fully qualified names.
- New functions start closed: `REVOKE ALL ... FROM PUBLIC, anon, authenticated`, then grant to `service_role` only, unless the brief says otherwise.
- App writes go through the service-role client. Do not add learner write policies without a brief that asks for it.
- Destructive changes (DROP, DELETE, column type changes) need an export step in the README section and the owner's approval.
- Header comment: purpose, finding ID, preconditions, rollback path, validation path. No em-dashes.

## Tests that read migration text
- `apps/web/lib/__tests__/rls.test.ts` reads the files in `supabase/migrations/`.
- `apps/web/lib/__tests__/sec07-users-writes-session-free.test.ts` reads files in `pending-approval/`.
- Search for others before renaming or moving a file: `git grep -n -e <file name> -- apps/web/lib/__tests__`.

## Never
- Never run any `supabase` command: `supabase/.temp/` shows the local CLI is linked to production. CI runs the local database job; the owner runs SQL in production.
- Never move a file out of `pending-approval/` to test something. The next merge applies it.
- Never edit a migration that is already at the top level (it is applied history). Write a new one.
- Never put real emails, user ids or secrets in SQL files.

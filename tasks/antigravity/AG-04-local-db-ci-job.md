# AG-04: Real-Postgres CI job with a grant allowlist check

- **IDs closed:** plan PR-15 part 1 (ENG-05 part, security report "Process" grant-allowlist check)
- **Milestone:** M1 Platform safety
- **Depends on:** AG-03 (both edit `ci.yml`)
- **Size:** M
- **Parallel-safe:** no (edits `ci.yml`)

## Why
All three Critical/High database findings were grants that let `anon` or `authenticated` reach something they should not. No CI step replays the migrations or checks grants. Migrations are only exercised when they hit production.

## Current state (verified 2026-11-13)
- `supabase/` holds `config.toml`, `migrations/` (70 top-level `.sql`), `post-deploy/`, `seed.sql`, `templates/`. There is no `supabase/tests/`.
- `supabase db reset` replays only top-level files. Held files in `supabase/migrations/pending-approval/` are never applied, so later tasks that add held migrations (AG-26, AG-29, AG-31 and others) need a way to test them.
- `.github/workflows/ci.yml` has jobs `build-and-validate`, `e2e`, `security-audit`, `deploy-supabase`. None starts a local database.
- `apps/web/scripts/gen-db-types.js:6` generates types from the production project id into `apps/web/types/database.ts`. No drift check exists.
- `apps/web/lib/__tests__/rls.test.ts` checks migration text only.
- `supabase/.temp/linked-project.json` exists: the local CLI is linked to production. Agents must not run any `supabase` command; CI runs them on a throwaway runner.

## Files in scope
- `.github/workflows/ci.yml` (new job `db-local`)
- `supabase/tests/grant_allowlist.sql` and its allowlist (new)
- `supabase/tests/held-migrations.txt` (new): ordered list of held files to apply after reset
- `scripts/ci/apply-held-migrations.sh` (new)
- `scripts/ci/check-db-types-drift.sh` or `.ts` (new)
- `docs/TESTING.md` (short section)

## Out of scope
- pgTAP behaviour tests (AG-05).
- Any migration change. If replay fails, stop and report the failing file and error.
- `deploy-supabase` and production.

## Steps
1. Read `supabase/config.toml` and the Supabase CLI docs for `supabase start`, `supabase db reset` and `supabase gen types typescript --local`.
2. Add job `db-local` (pull requests and pushes): checkout, `supabase/setup-cli@v1` pinned to the version AG-03 chose, `supabase start` (exclude unneeded services with `-x` if supported), `supabase db reset`. The runner is never linked: do not pass `--linked` or a project ref.
3. Held migrations, opt-in: `apply-held-migrations.sh` reads `supabase/tests/held-migrations.txt` and applies each listed file with `psql` against the local database, in order, failing on error. Start the list with the held files that need no Vault secret or pg_cron, for example `20261027000001_users_username_check.sql`, `20261027000002_lock_public_users.sql`, `20261112000001_drop_waitlist_table.sql`, `20261112000002_remove_retired_notification_flags.sql` (check each one first). Never list `20261024000003_schedule_cron_jobs_pg_cron.sql`, `20261030000001_cron_heartbeat_deadman.sql` or `admin_backfill_from_admin_emails.sql`. Then run each listed file's validation script if it is safe on an empty database.
4. Grant allowlist: list every object in schema `public` (tables, views, sequences, functions) where `anon` or `authenticated` has any privilege. Compare against the allowlist and `RAISE EXCEPTION` on anything not listed. Build the first allowlist from the local database after step 3, then review each entry in the plan; every learner-facing read must be justified by RLS.
5. Types drift: after step 3, `supabase gen types typescript --local` into a temp file and diff against `apps/web/types/database.ts`. The committed file must equal top-level migrations plus the listed held ones. If it differs only by objects that exist only in production, report that instead of forcing it, and decide with the user.
6. Document in `docs/TESTING.md`: what runs, how a task adds its held migration to the list, how to update the allowlist.

## Acceptance checks
- CI `db-local` is green on the pull request. The user opens the PR; you report the expected steps.
- You run no `supabase` command; CI is the proof. (A local run is the owner's choice, outside this checklist; see `tasks/antigravity/README.md` setup step 4.)
- From the repo root: `git grep -n -e db-local -- .github/workflows/ci.yml` shows the job; `git grep -n -e linked -- .github/workflows/ci.yml` shows `--linked` only inside `deploy-supabase`.
- `git grep -n --untracked -e pg_cron -e deadman -e admin_backfill -- supabase/tests/held-migrations.txt` prints nothing.
- From `apps/web`: `npx vitest run lib/__tests__/rls.test.ts` passes; `npm run lint` passes.
- Allowlist reviewed: every entry has a one-line reason.

## Safety
- Never run `git push`, any `supabase` command, or anything against production.
- Every top-level `.sql` in `supabase/migrations/` auto-applies to production on merge. Do not add or edit migrations here. Test SQL lives in `supabase/tests/`, which the CLI does not push.
- Do not edit `audit/`, `08-IMPLEMENTATION-PLAN.md`, `content/` or `backups/`. Never read `.env*` files.
- Do not start a dev server. Do not run the full `npm test` or `npm run build`.
- No em-dashes in comments or docs.

Start by producing an Implementation Plan artifact for review. Do not edit files until it is approved.

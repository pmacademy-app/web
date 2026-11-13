# AG-01: Rollback, validation and drift test for the held dead-man cron check

- **IDs closed:** plan PR-11 follow-up (ENG-01, audit W3); plan rule 3 (every migration ships rollback and validation)
- **Milestone:** M1 Platform safety
- **Depends on:** none
- **Size:** S
- **Parallel-safe:** yes, but AG-01, AG-02 and AG-14 all edit `supabase/migrations/pending-approval/README.md`: merge them one at a time

## Why
The held migration `20261030000001_cron_heartbeat_deadman.sql` names a rollback file and a validation file that do not exist, and claims a drift test that does not exist. The owner cannot apply it safely until both companions and the test are in place.

## Current state (verified 2026-11-12)
- `supabase/migrations/pending-approval/20261030000001_cron_heartbeat_deadman.sql:66-67` points at `pending-approval/rollback/20261030000001_cron_heartbeat_deadman.down.sql` and `pending-approval/validation/20261030000001_cron_heartbeat_deadman_validation.sql`. Neither file exists (the `pending-approval/rollback/` folder holds only five other files).
- The same header (lines 20-22) says `eng01-cron-heartbeat.test.ts` parses this file for interval drift. It does not: `git grep -n -e deadman -- apps/web/lib/__tests__/eng01-cron-heartbeat.test.ts` prints nothing.
- `apps/web/lib/monitoring/cron-heartbeat.ts:19` and `:48-50` say the dead-man SQL repeats the intervals in `CRON_JOB_DEFINITIONS`.
- `supabase/migrations/pending-approval/README.md` has no section for this file.
- The migration creates `private.check_cron_heartbeats_deadman()`, schedules `prodily-deadman-cron-heartbeats`, and writes `public.system_settings` keys `cron_deadman_alert:<job>`.

## Files in scope
- `supabase/migrations/pending-approval/rollback/20261030000001_cron_heartbeat_deadman.down.sql` (new)
- `supabase/migrations/pending-approval/validation/20261030000001_cron_heartbeat_deadman_validation.sql` (new)
- `supabase/migrations/pending-approval/README.md` (add one section)
- `apps/web/lib/__tests__/eng01-deadman-sql-drift.test.ts` (new)
- `supabase/migrations/pending-approval/20261030000001_cron_heartbeat_deadman.sql` (header comment only, to name the new test file)
- `apps/web/lib/monitoring/cron-heartbeat.ts` (comments at `:19-20` and `:48-51` only; `:51` wrongly says `eng01-cron-heartbeat.test.ts` checks drift)

## Out of scope
- Any change to the function body or schedule in the migration.
- `20261024000003_schedule_cron_jobs_pg_cron.sql` and its companions.
- Applying anything to a database.

## Steps
1. Read the whole migration and the existing pair for `20261024000003` (`pending-approval/rollback/` and `pending-approval/validation/`) to copy their style.
2. Write the rollback: unschedule `prodily-deadman-cron-heartbeats` if it exists, `DROP FUNCTION IF EXISTS private.check_cron_heartbeats_deadman()`, delete `system_settings` rows whose key starts with `cron_deadman_alert:`. Do not drop `pg_cron`, `pg_net`, the `private` schema, or Vault secrets (other jobs use them). Make it safe to re-run.
3. Write the validation as numbered read-only queries:
   1. the cron job exists with schedule `*/15 * * * *` and is active;
   2. the function exists, is `SECURITY DEFINER`, has a pinned `search_path`, and `anon`/`authenticated` cannot execute it (`has_function_privilege`);
   3. recent runs in `cron.job_run_details` for that job succeeded;
   4. the Vault secret `cron_alert_webhook_url` exists (name only, never select the decrypted value).
   End query 1 with a `DO $$ ... RAISE NOTICE 'validation passed'` block like the 20261024000003 file.
4. Write the drift test: read the migration with `fs.readFileSync`, parse the job list and interval minutes from the SQL, and assert they equal `CRON_JOB_DEFINITIONS` in `apps/web/lib/monitoring/cron-heartbeat.ts` (jobs with an interval only; `retry-failed` is excluded). Also assert the rollback and validation files exist.
5. Update the migration header to name `eng01-deadman-sql-drift.test.ts` instead of `eng01-cron-heartbeat.test.ts`, and fix the matching comments in `cron-heartbeat.ts`. Comments only.
6. Add a README section under "Currently held": purpose, prerequisites (20261024000003 applied and Vault secret `cron_alert_webhook_url` created), run, validate, undo.

## Acceptance checks (from `apps/web`)
- `npx vitest run lib/__tests__/eng01-deadman-sql-drift.test.ts lib/__tests__/eng01-cron-heartbeat.test.ts` passes.
- Change one interval in a scratch copy of the SQL string inside the test (not the file) to prove the test fails on drift, then remove that scratch code.
- `npm run typecheck` and `npm run lint` pass.
- `git -C ../.. status --short -- supabase/migrations/pending-approval` lists the two new files.
- `node ../../scripts/agent/check-guards.mjs` prints `guards: OK` (no new or edited top-level migration, no em-dashes).

## Safety
- Never run `git push`, any `supabase` command, or anything against production. The user owns the branch and the pull request.
- Every top-level `.sql` in `supabase/migrations/` auto-applies to production on merge. Keep all SQL in `pending-approval/`.
- Do not edit `audit/`, `08-IMPLEMENTATION-PLAN.md`, `content/` or `backups/`. Never read `.env*` files.
- Do not start a dev server. Do not run the full `npm test` or `npm run build`.
- No dark mode. No em-dashes in comments, SQL or docs.

Start by producing an Implementation Plan artifact for review. Do not edit files until it is approved.

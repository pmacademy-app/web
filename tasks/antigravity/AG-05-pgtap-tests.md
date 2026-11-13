# AG-05: pgTAP tests for RLS, RPCs and triggers

- **IDs closed:** plan PR-15 part 2 (ENG-05, CQ-33 part)
- **Milestone:** M1 Platform safety
- **Depends on:** AG-04 (the `db-local` job)
- **Size:** M
- **Parallel-safe:** no with other `ci.yml` tasks (AG-07, AG-32); it adds one step to `db-local`

## Why
Unit tests mock Supabase, so they cannot prove that RLS blocks a learner, that a SECURITY DEFINER function is closed, or that the privileged-column trigger fires. These are the controls that failed in the audit.

## Current state (verified 2026-11-12)
- No `supabase/tests/` pgTAP files exist (AG-04 adds only the grant allowlist).
- SECURITY DEFINER functions defined in migrations include `record_lesson_quiz_completion`, `claim_email_queue_items`, `consume_rate_limit`, `reserve_provider_email_quota`, `guard_privileged_user_columns`, the `admin_*` analytics functions and `get_admin_dashboard_summary` (`git grep -n -i -E -e 'create (or replace )?function' -- 'supabase/migrations/*.sql'`).
- The quiz RPC is called only with the service-role client: `apps/web/lib/academy/lessons-db.ts` (search `record_lesson_quiz_completion`).
- Trigger `guard_privileged_user_columns` comes from `supabase/migrations/20261010000001_guard_privileged_user_columns.sql` and later `20261020000001_guard_auth_provider_and_consent_columns.sql`.
- `capstone_submissions` is SELECT-only for clients since `20261024000002_lock_users_and_capstone_client_writes.sql`.

## Files in scope
- `supabase/tests/*.test.sql` (new pgTAP files)
- `.github/workflows/ci.yml` (one step in `db-local`: `supabase test db`)
- `docs/TESTING.md` (how to add a pgTAP test)

## Out of scope
- Changing any migration or policy. If a test proves a hole, mark it `todo` in pgTAP, keep CI green, and report it with the evidence. A fix is a separate held migration the owner approves.
- JS unit tests (AG-06).

## Steps
1. Read the Supabase docs on `supabase test db` and pgTAP. Use `tests.authenticate_as` style helpers only if the docs show them for the CLI version AG-03 pinned; otherwise set `request.jwt.claims` and `SET LOCAL ROLE authenticated` by hand.
2. Write one file per area:
   - `rpc_grants.test.sql`: `anon` and `authenticated` cannot execute each SECURITY DEFINER function above except an explicit, commented allowlist; `service_role` can execute `record_lesson_quiz_completion`.
   - `users_rls.test.sql`: a learner reads only their own `users` row; cannot update `is_admin`, `xp`, `level` or other guarded columns (trigger raises); cannot insert or update rows (the held `20261027000002_lock_public_users` is applied by AG-04's `supabase/tests/held-migrations.txt` step; if it is not in that list, mark the assertion `todo` with a note).
   - `capstone_rls.test.sql`: a learner can select own submissions, cannot insert, update or delete.
   - `notifications_rls.test.sql`: a learner cannot update another learner's in-app notifications, and only allowed columns of their own (see `20261013000002_restrict_in_app_notification_updates.sql`).
   - `quiz_rpc.test.sql`: `record_lesson_quiz_completion` called twice with the same input does not double-award XP (uniqueness from `20260913000001_xp_event_uniqueness_b8e.sql`).
3. Seed only the rows each test needs inside a transaction that rolls back. No real emails or names.
4. Add `supabase test db` after the grant check in `db-local`.

## Acceptance checks
- CI `db-local` job green on the pull request, with the pgTAP plan count printed.
- You run no `supabase` command (the local CLI is linked to production); CI is the proof. A local run is the owner's choice, outside this checklist.
- Each test file starts with `SELECT plan(n);` and ends with `SELECT * FROM finish();`.
- Any `todo` test is listed in your report with the policy or grant it exposes.
- From `apps/web`: `npm run lint` passes (no app code changed).

## Safety
- Never run `git push`, any `supabase` command, or anything against production.
- Every top-level `.sql` in `supabase/migrations/` auto-applies to production on merge. Do not touch `supabase/migrations/`.
- Do not edit `audit/`, `08-IMPLEMENTATION-PLAN.md`, `content/` or `backups/`. Never read `.env*` files.
- Do not start a dev server. Do not run the full `npm test` or `npm run build`.
- No em-dashes in comments or docs.

Start by producing an Implementation Plan artifact for review. Do not edit files until it is approved.

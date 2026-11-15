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

## Companion files: `rollback/` and `validation/`

A held migration keeps its rollback and validation scripts next to it, in the same layout the
top level uses:

- `pending-approval/<ts>_<name>.sql`: the migration
- `pending-approval/rollback/<ts>_<name>.down.sql`: undoes it, safe to re-run
- `pending-approval/validation/<ts>_<name>_validation.sql`: checks it after it is applied

When a held migration is released into `supabase/migrations/`, move its two companions into
`supabase/migrations/rollback/` and `supabase/migrations/validation/` in the same commit.
Neither subfolder is read by the Supabase CLI, here or at the top level.

## Currently held

Phase 2 (owner steps and their order: [`docs/ops/phase2-owner-runbook.md`](../../../docs/ops/phase2-owner-runbook.md)).

### `20261024000003_schedule_cron_jobs_pg_cron.sql` (ENG-01, applied by hand, never moved)

Schedules the six `/api/cron/*` jobs in Supabase `pg_cron` + `pg_net` (free tier), reading
`CRON_SECRET` and the site URL from Supabase Vault at run time. The jobs and cadence match
`CRON_JOB_DEFINITIONS` in `apps/web/lib/monitoring/cron-heartbeat.ts` and the GitHub workflow.
`retry-failed` stays manual.

This one is **owner-run in the SQL editor, not released through `db push`**: it needs two Vault
secrets that only the owner can create, and its self-check refuses to finish without them.
Leave the file here after applying it; the database, not the migration history, is the record.

1. In the Supabase dashboard Vault page (Integrations > Vault), create `cron_secret` (same
   value as `CRON_SECRET` in Vercel Production) and `site_url` (`https://prodily.app`, no path).
2. Paste the migration into the SQL editor and run it. It ends with a self-check that raises,
   and rolls everything back, if a job, the helper's privileges or a secret is wrong.
3. Run query 1 of `validation/20261024000003_schedule_cron_jobs_pg_cron_validation.sql`, then
   queries 2 to 4 after 15 minutes.
4. Watch the admin System page heartbeats for 24 hours before the GitHub `schedule:` block is
   removed (a separate follow-up). Both schedulers running at once is safe: each job dedupes on
   an idempotency key.

If applied before AG-14, re-run it once so process-broadcasts uses POST.

Undo: `rollback/20261024000003_schedule_cron_jobs_pg_cron.down.sql`.

### `20261027000001_users_username_check.sql` (CQ-24)

Adds a CHECK constraint on `public.users.username`. Run its pre-check first: the constraint
fails to apply if any existing username breaks the rule. Steps in the runbook, step (f).

### `20261027000002_lock_public_users.sql` (Q1, SEC-07 part 2)

Revokes learner writes to `public.users` through PostgREST. Apply only **after** the code that
stops writing `public.users` with a learner session is deployed, then confirm a learner-token
`PATCH /rest/v1/users` is refused. Steps in the runbook, step (g).

### `20261030000001_cron_heartbeat_deadman.sql` (ENG-01, audit W3, applied by hand, never moved)

Adds an in-database dead-man check for the cron heartbeats. The app's own stale check runs inside
the five-minute `process-email-queue` route, so it goes quiet when the scheduler or Vercel stops.
This job, `prodily-deadman-cron-heartbeats`, runs `private.check_cron_heartbeats_deadman()` every
15 minutes, reads the same `cron_heartbeat:<job>` rows and posts one alert per outage to a webhook.
It stores its alert markers under `cron_deadman_alert:<job>` in `public.system_settings`. The job
intervals in the SQL repeat `CRON_JOB_DEFINITIONS`; `apps/web/lib/__tests__/eng01-deadman-sql-drift.test.ts`
fails if they drift. It does not cover pg_cron or the database itself stopping (see the header).

Prerequisites:

- `20261024000003_schedule_cron_jobs_pg_cron.sql` is applied and its validation passes.
- The Vault secret `cron_alert_webhook_url` exists: an https webhook URL whose only power is
  posting to one alert channel (for example the same value as `ALERT_WEBHOOK_URL` in Vercel).

Run:

1. In the Supabase dashboard Vault page (Integrations > Vault), create `cron_alert_webhook_url`.
2. Paste the migration into the SQL editor and run it. It ends with a self-check that raises, and
   rolls everything back, if the job, the function, its privileges or the secret is wrong.
3. Run query 1 of `validation/20261030000001_cron_heartbeat_deadman_validation.sql`, then queries
   2 and 4. Run query 3 after 30 minutes, when the job has run at least twice.

Leave the file here after applying it, like 20261024000003.

Undo: `rollback/20261030000001_cron_heartbeat_deadman.down.sql` unschedules the job, drops the
function and deletes the `cron_deadman_alert:*` markers (bookkeeping only, no export needed). It
keeps pg_cron, pg_net, the `private` schema and the Vault secret, which other jobs use.

Post-Phase 3 cleanup (branch `chore/post-phase3-cleanup`). Both are owner-run in the SQL editor,
in this order, and only after that branch is deployed. They are independent, so either can be
skipped or delayed.

### 1. `20261112000001_drop_waitlist_table.sql`

Drops `public.waitlist`. The `/api/waitlist` route was removed on the branch and no UI posted to
it. **Destructive: export the rows first.** They are personal data (names and emails), so keep the
export outside the repository and never commit it.

1. Deploy the branch, so nothing can insert any more.
2. Export: `SELECT * FROM public.waitlist ORDER BY created_at;` and download the result as CSV.
   Note `SELECT count(*) FROM public.waitlist;` to check the export against it. Do not paste the
   exported rows into chat, tickets or AI agents. The CSV lands on local disk: delete it when
   done (it is the only copy of the rows, so keep it until you are sure no rollback is needed).
3. Run the migration in the SQL editor.
4. Run `validation/20261112000001_drop_waitlist_table_validation.sql` (read-only).

Undo: `rollback/20261112000001_drop_waitlist_table.down.sql` re-creates the empty table with its
RLS policies and comment. It does not restore rows; re-import the CSV for that.

### 2. `20261112000002_remove_retired_notification_flags.sql`

Removes `ACHIEVEMENT_EMAIL_ENABLED` and `PORTFOLIO_EMAILS_ENABLED`, which nothing read at run time,
from the live flag store (the `feature_flags` row of `public.system_settings`) and from the unused
`public.notification_feature_flags` table. Apply only after the branch is deployed: older code
writes both keys back whenever an admin toggles any flag.

1. Optional: note the current values (query in the migration header). They are not kept.
2. Run the migration in the SQL editor.
3. Run `validation/20261112000002_remove_retired_notification_flags_validation.sql` (read-only).
4. After applying, redeploy (or restart) all instances, then re-run the validation after the next
   admin flag toggle.

Undo: `rollback/20261112000002_remove_retired_notification_flags.down.sql` puts both keys back as
`true`. The previous values cannot be recovered.

### `20261113000001_scrub_dead_letter_auth_links.sql` (ADR-005 gap, SEC-17, AG-02, one-off)

Replaces `template_variables` with the marker `{"_scrubbed": "dead_letter"}` on every
`email_queue` row with status `dead_letter` or `failed` and a `template_key` starting with
`auth.`. Those rows still hold one-time verification and password-reset links that admins can
read. The AG-02 app change already scrubs new dead letters
(`apps/web/lib/notifications/queue/processor.ts`); this cleans up the rows written before it.
The column is `NOT NULL`, so the marker is written instead of `NULL`. `updated_at` is left alone so
the retention clock does not restart. Rows that can still be sent (pending, retrying, processing)
are not touched.

1. Deploy the AG-02 change first, so nothing writes unscrubbed dead letters any more and admin
   retry refuses scrubbed auth rows.
2. Optional: run the count query in the migration header to see how many rows will change.
3. Run the migration in the SQL editor. Its self-check raises if any matching row still carries a
   variable.
4. Run `validation/20261113000001_scrub_dead_letter_auth_links_validation.sql` (read-only, expects 0).

No export step: the only data removed is the expired links, and exporting them would copy the
secret this removes. Leave the file here after applying it.

Undo: `rollback/20261113000001_scrub_dead_letter_auth_links.down.sql` is a documented no-op. The
scrubbed links cannot be restored, and they had expired anyway. A learner who still needs the
email requests a new one.

### `20261113000002_before_user_created_allow_signups.sql` (SEC-09, AG-12, database signup gate)

Adds `public.hook_before_user_created(event jsonb)` returning `jsonb` to enforce the platform signup toggle directly in the database. When `public.system_settings` `product_settings.allowSignups` is `false`, the hook blocks the registration with HTTP 403: "New learner registrations are currently closed. Please check back later."

Privileges: execute granted only to `supabase_auth_admin`; revoked from `PUBLIC`, `anon`, and `authenticated`. Runs as `SECURITY DEFINER` with fixed `search_path = public, pg_temp`.

Prerequisites:
- Verify that Supabase Auth Hooks are available on the active plan.
- The AG-12 app change is deployed.

Run:
1. Paste `supabase/migrations/pending-approval/20261113000002_before_user_created_allow_signups.sql` into the Supabase SQL editor and run it.
2. In Supabase Dashboard: Auth > Hooks > Before User Created: select `public.hook_before_user_created`.
3. Run `validation/20261113000002_before_user_created_allow_signups_validation.sql` (transaction rollback check).

Undo:
1. In Supabase Dashboard: Auth > Hooks: remove the Before User Created hook assignment.
2. Run `rollback/20261113000002_before_user_created_allow_signups.down.sql` in the SQL editor to drop the function.

### `20261113000003_backfill_onboarding_completed.sql` (SEC-21, AG-13, onboarding backfill)

Backfills `public.users.onboarding_completed = true` for learners whose onboarding was recorded only in `auth.users.raw_user_meta_data->>'onboarding_complete'` prior to the switch to `app_metadata` and database-backed flags. Touches only rows where `public.users.onboarding_completed` is not true, `goal` is null, and `curriculum_access_override` is not true. Safe no-op if count is zero.

Prerequisites:
- Apply this migration before or immediately alongside deploying the AG-13 code change, so legacy users who completed onboarding are not redirected to /onboarding.

Run:
1. Optional pre-check: run `validation/20261113000003_backfill_onboarding_completed_validation.sql` to check how many rows will be updated.
2. Paste `supabase/migrations/pending-approval/20261113000003_backfill_onboarding_completed.sql` into the Supabase SQL editor and run it.
3. Re-run `validation/20261113000003_backfill_onboarding_completed_validation.sql` (expects count = 0).

Undo:
`rollback/20261113000003_backfill_onboarding_completed.down.sql`.

### `20261113000004_capstone_review_feedback.sql` (PROD-03, AG-26, capstone review feedback and resubmission)

Adds nullable `review_scores jsonb`, `review_feedback text`, `revision_count int not null default 0`, and `review_history jsonb` to `public.capstone_submissions`. Adds check constraints on feedback length (maximum 4000 characters) and revision count (non-negative).

Privileges: Writes remain restricted to service role only. Learners read their own rows through existing SELECT RLS policies.

Prerequisites:
- Apply this migration before or alongside deploying the AG-26 code change.

Run:
1. Paste `supabase/migrations/pending-approval/20261113000004_capstone_review_feedback.sql` into the Supabase SQL editor and run it.
2. Run `validation/20261113000004_capstone_review_feedback_validation.sql` (schema verification and privilege checks).

Undo:
Run `rollback/20261113000004_capstone_review_feedback.down.sql` in the SQL editor.

### `20261113000007_leaderboard_weekly_rpc.sql` (ENG-08, ENG-10, AG-31, weekly leaderboard RPC and DB size telemetry)

Adds `public.get_weekly_leaderboard(p_week_start timestamptz, p_limit int, p_offset int)` returning the ranked weekly leaderboard aggregated in the database engine instead of loading all users, lessons, and XP rows into server memory. Also provides `public.get_database_size_bytes()` returning `bigint` for monitoring database size against the Supabase 500 MB free tier limit.

Privileges: Executable only by `service_role`. Execution revoked from `PUBLIC`, `anon`, and `authenticated`. Fixed `search_path = public, pg_temp`.

Run:
1. Paste `supabase/migrations/pending-approval/20261113000007_leaderboard_weekly_rpc.sql` into the Supabase SQL editor and run it.
2. Run `validation/20261113000007_leaderboard_weekly_rpc_validation.sql` (read-only verification of functions and covering indexes).

Undo:
Run `rollback/20261113000007_leaderboard_weekly_rpc.down.sql` in the SQL editor.

### `20261113000008_drop_duplicate_indexes.sql` (ENG-08, AG-31, drop redundant duplicate indexes)

Drops duplicate or redundant indexes to save database storage on the free tier. Contains detection query in header and conditionally drops duplicate indexes if present.

Run:
1. Paste `supabase/migrations/pending-approval/20261113000008_drop_duplicate_indexes.sql` into the Supabase SQL editor and run it.
2. Run `validation/20261113000008_drop_duplicate_indexes_validation.sql`.

Undo:
Run `rollback/20261113000008_drop_duplicate_indexes.down.sql` in the SQL editor.

## Ops snippets (owner-run, never migrations)

These files also live here because this folder is invisible to `supabase db push`. They are
run by hand in the Supabase SQL editor and must **never** be moved into
`supabase/migrations/`.

### `admin_backfill_from_admin_emails.sql`

Admin access now comes only from `public.users.is_admin` (and the server-signed
`app_metadata.is_admin` claim the proxy trusts). The `ADMIN_EMAILS` environment variable is
no longer read. Anyone who was an admin only through `ADMIN_EMAILS` loses access when that
change deploys.

**Run this snippet before deploying the admin-by-flag change.** It never promotes by email:
email verification is off in production and login auto-confirms accounts, so anyone who
signed up first with an `ADMIN_EMAILS` address has a confirmed account for it. You review the
candidates and promote by user id. The SQL editor shows only the last result, so select one
step at a time and run the selection.

1. Open the Supabase SQL editor (staging first if you can, then production). Paste the file.
   Do not commit real addresses or ids back to the repository.
2. **STEP 1 (read-only), review candidates.** Replace `replace-me@example.invalid` with the
   addresses from the old `ADMIN_EMAILS` value and run STEP 1. For each row, check
   `created_at`, `last_sign_in_at` and `provider` and decide whether the account is
   genuinely yours. `email_confirmed_at` is not proof of ownership.
3. **Paste UUIDs.** Copy the `user_id` of each account you confirmed into the array literal in
   STEP 2 and the same list into STEP 3, replacing the placeholder
   `00000000-0000-0000-0000-000000000000`.
4. **STEP 2 (read-only), preview.** Run it and check the would-be roster: `promote` rows are
   the changes, `stays admin` rows are existing admins, and `id not found` must not appear.
5. **STEP 3, dry run.** Run it as shipped. It ends with `ROLLBACK;`, so it only proves the
   guard passes (it refuses the placeholder, an empty list, or an id with no profile row).
6. **STEP 3, COMMIT.** Change the final `ROLLBACK;` to `COMMIT;` and run STEP 3 again.
7. **STEP 4 (read-only), final roster.** Run it and check every row. Demote anything wrong
   at once with `UPDATE public.users SET is_admin = false WHERE id = '<uuid>';`.

The `guard_privileged_user_columns` trigger only blocks `authenticated` and `anon`, and the
SQL editor runs as `postgres`, so the STEP 3 update is allowed. After the backfill, grant or remove
admin access from the admin console (`/admin/users`, role toggle).

## Previously held

`20260913000001_xp_event_uniqueness_b8e.sql` (B8-E / F-COR-3) was held here until it was
approved and **applied to production on 2026-09-13 at 18:15:34Z**. It now lives in
`supabase/migrations/` as part of the applied history.

Its execution record (preflight numbers and the full post-migration reconciliation) was
`docs/archive/B8E_XP_UNIQUENESS_EXECUTION.md`. That file was removed from the repository in
commit `1dbd2a4` (2026-09-18). Read it from history with
`git show 1dbd2a4^:docs/archive/B8E_XP_UNIQUENESS_EXECUTION.md`.

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

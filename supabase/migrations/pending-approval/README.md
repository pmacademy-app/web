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

### `20261027000002_lock_public_users.sql` (Q1, SEC-07 part 2, applied by hand 2026-11-21, never moved)

Revokes learner writes to `public.users` through PostgREST. Apply only **after** the code that
stops writing `public.users` with a learner session is deployed, then confirm a learner-token
`PATCH /rest/v1/users` is refused. Steps in the runbook, step (g).

**Status (2026-11-19): ready to release, apply it first.** Its precondition (T29) is in the code:
`app/api/auth/login/route.ts` signs in on `authClient` and writes through a second, session-less
`createServiceRoleClient()` (`supabase`), and the `token_hash` path of
`app/api/auth/callback/route.ts` runs `verifyOtp` on `authClient` and does every `public.users`
read and write through a separate `admin` client. The PKCE path writes through `admin` too.
Confirm that build is the one deployed to production, then apply this before the 20261119 files
below. Until it is applied a learner can still PATCH their own row, including `current_streak`,
`longest_streak`, `streak_freezes_available` and the onboarding columns, which the column guard
does not cover (audit Q10 below).

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

**Risk (review note 2026-11-19, SQL unchanged):** the backfill trusts
`raw_user_meta_data->>'onboarding_complete'`, and `raw_user_meta_data` is user-editable: any
signed-in learner can set it with `supabase.auth.updateUser({ data: { onboarding_complete: true } })`
using the anon key, today and until the moment this runs. A learner who does so before the
backfill gets `onboarding_completed = true` without finishing onboarding. The impact is small (they
skip the onboarding redirect; no privilege or curriculum access is granted, rows with
`curriculum_access_override` are excluded), but the reviewed SQL does not guard against it. Before
running it, either:

- add a cutoff so only accounts that existed before the switch can match, by appending
  `AND au.created_at < '<AG-13 production deploy timestamp>'::timestamptz` to the `WHERE` of both
  the migration and its validation query (accounts created after the switch can only have
  completed onboarding through the database column), or
- review the candidates first:
  `SELECT au.id, au.created_at, au.updated_at FROM auth.users au JOIN public.users pu ON pu.id = au.id WHERE au.raw_user_meta_data->>'onboarding_complete' = 'true' AND pu.onboarding_completed IS NOT TRUE AND pu.goal IS NULL AND pu.curriculum_access_override IS NOT TRUE ORDER BY au.updated_at DESC;`
  and treat rows whose `updated_at` is after the AG-13 deploy as suspect.

Adding the cutoff changes the reviewed semantics (fewer rows match), so note it in the release.

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
- Apply `20261119000005_drop_anon_portfolio_policies.sql` first. Until it is applied,
  "Public can view public capstones" lets the anon key read every column of every `is_public`
  capstone, so the new review fields would be public the moment they are written.
- Apply this migration before or alongside deploying the AG-26 code change.

Run:
1. Paste `supabase/migrations/pending-approval/20261113000004_capstone_review_feedback.sql` into the Supabase SQL editor and run it.
2. Run `validation/20261113000004_capstone_review_feedback_validation.sql` (schema verification and privilege checks).

Undo:
Run `rollback/20261113000004_capstone_review_feedback.down.sql` in the SQL editor.

### `20261113000005_lesson_mastery.sql` (PROD-02, AG-28, lesson mastery threshold at 70 percent)

Adds `best_score smallint` to `public.user_lesson_progress` and updates `public.record_lesson_quiz_completion` RPC to enforce a 70 percent passing threshold. Scores below 70 percent mark progress as `in_progress`. Existing `completed` rows are grandfathered and never downgraded by subsequent retakes.

Privileges: Executable only by `service_role`. Execution revoked from `PUBLIC`, `anon`, and `authenticated`. Fixed `search_path = public, pg_temp`.

Prerequisites:
- Deploy alongside or before AG-28 code change.

Run:
1. Paste `supabase/migrations/pending-approval/20261113000005_lesson_mastery.sql` into the Supabase SQL editor and run it.
2. Run `validation/20261113000005_lesson_mastery_validation.sql`.

Undo:
Run `rollback/20261113000005_lesson_mastery.down.sql` in the SQL editor.

### `20261113000006_weekly_goal.sql` (PROD-06, PROD-13a, AG-29, weekly goal and session minutes)

Adds `weekly_goal_lessons smallint` (1 to 7) and `session_minutes smallint` (10, 15, 20, 30, 45, 60) columns to `public.users` with check constraints. Used by learner settings, onboarding, weekly recap reports, and in-app milestone nudges.

Privileges: Writes remain restricted to service role only.

Run:
1. Paste `supabase/migrations/pending-approval/20261113000006_weekly_goal.sql` into the Supabase SQL editor and run it.
2. Run `validation/20261113000006_weekly_goal_validation.sql`.

Undo:
Run `rollback/20261113000006_weekly_goal.down.sql` in the SQL editor.

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

### November 2026 database review (20261119000001 to 20261119000006)

**Applied by hand 2026-11-21, never moved:** 20261119000005, 000001, 000002, 000004, 000003, 000006 and 000007, in the order below, in the production SQL editor; every self-check and validation passed. The 000005 validation now accepts "Users can view own reflections" (20261121000001 replaced the FOR ALL policy). Still to do: update `supabase/tests/grant_allowlist.sql` and `supabase/tests/held-migrations.txt` for these (and 20261121000001) and confirm in the CI database replay.

Six independent hardening migrations from the read-only review of the applied migrations, plus one
read-only audit. Each is owner-run in the SQL editor, ends with a self-check that raises (and so
rolls the whole script back) if the end state is wrong, and has a rollback and a read-only
validation next to it. None needs an app change: every table they close is read and written by the
app only through `createServiceRoleClient()`.

Apply order:

1. `20261027000002_lock_public_users.sql` (see above, ready).
2. `20261119000005_drop_anon_portfolio_policies.sql` (L1). **Before `20261113000004`.**
3. `20261119000001_contact_messages_service_only.sql` (M2).
4. `20261119000002_system_announcements_service_only.sql` (M3).
5. `20261119000004_cohort_members_and_friends_lockdown.sql` (M6).
6. `20261119000003_avatars_bucket_hardening.sql` (M5). After applying, upload an avatar from the
   settings page once to confirm uploads still work.
7. `20261119000006_default_privileges_tables_sequences.sql` (L2).
8. `20261119000007_security_events.sql` (security digest, see below). Independent of 1 to 7; it
   revokes its own grants, so it is safe before or after them.
9. Then the rest of the held list (`20261113000004` and later) as already planned.

For each: paste it into the SQL editor and run it, then run its
`validation/<name>_validation.sql` (read-only, raises on failure, prints `<ts> validation passed`).

| File | Finding | What it does | Rollback restores |
| --- | --- | --- | --- |
| `20261119000001_contact_messages_service_only.sql` | M2 | Drops "Anyone can insert contact message"; revokes INSERT, UPDATE, DELETE from PUBLIC, anon, authenticated and SELECT from anon. Learners keep the own-row SELECT. | The policy as 20260810000002 created it, and the anon/authenticated grants. |
| `20261119000002_system_announcements_service_only.sql` | M3 | Drops both policies and revokes ALL from PUBLIC, anon, authenticated. No client read is left (the app reads through the service role and filters the audience in memory). | `GRANT ALL` to anon and authenticated, and both policies as 20260822000001 created them. |
| `20261119000003_avatars_bucket_hardening.sql` | M5 | Sets `file_size_limit = 2097152` and `allowed_mime_types` (png, jpeg, webp, plus `image/jpg` because the avatar service forwards that type unchanged); keeps the bucket public; drops the three learner write policies and the listing SELECT policy. | No size or type limit, and the four storage.objects policies as 20260819000001 created them. |
| `20261119000004_cohort_members_and_friends_lockdown.sql` | M6 | cohort_members: drops the USING (true) SELECT and the join and leave policies, keeps the own-row SELECT, revokes all writes. user_friends: drops all policies, revokes ALL. | The six policies as 20260805000006 created them, and the grants. |
| `20261119000005_drop_anon_portfolio_policies.sql` | L1 | Drops "Public can view public capstones" and "Public can view public reflections"; revokes anon access to both tables. Public portfolios keep working (service role). | anon grants and both policies as 20260728000002 created them. |
| `20261119000006_default_privileges_tables_sequences.sql` | L2 | `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES, SEQUENCES FROM anon, authenticated`. Existing objects keep their grants; service_role keeps its default. A new learner-facing table now needs an explicit GRANT. | The legacy default (`GRANT ALL ON TABLES, SEQUENCES TO anon, authenticated`). |

Every rollback re-opens the hole it undoes; use one only to unblock an outage. No migration here
changes or deletes data, so no export is needed.

After applying each one, delete its rows (marked `removed_by`) from
`supabase/tests/grant_allowlist.sql` in the release commit. If you also add it to
`supabase/tests/held-migrations.txt`, CI replays it and runs its validation (all six validations are
catalog-only and safe on an empty database).

### `20261119000007_security_events.sql` (rule-based daily security summary)

Adds `public.security_event_counts` (daily counters per IST day, event type, app, ip bucket and
subject hash), `public.record_security_event(...)` (SECURITY DEFINER upsert with a 50000-rows-a-day
flood guard) and `public.security_digests` (one summary row per day, written by the admin console).
Both tables have RLS on with no policy; only `service_role` has privileges and EXECUTE. The column
names, the event type list and the function signature are a contract with the admin console.

No app deploy order: `apps/web/lib/security/security-events.ts` already calls the function and, until
this is applied, sees PostgREST `PGRST202` and stops calling for 10 minutes at a time. The retention
sweep skips both tables while they do not exist. The event types and their triggers are listed in
`docs/SECURITY.md` (section 4c).

Run:
1. Paste the migration into the SQL editor and run it. Its self-check raises (and rolls everything
   back) if RLS, the grants, SECURITY DEFINER or the pinned search_path is wrong.
2. Run `validation/20261119000007_security_events_validation.sql` (read-only, catalog only).
3. After the next failed login, `SELECT * FROM public.security_event_counts ORDER BY last_seen DESC LIMIT 5;`
   should show a `login_failed` row with a masked `subject_hint`.

It is in `supabase/tests/held-migrations.txt`, so CI replays it and runs its validation. It adds no
rows to `supabase/tests/grant_allowlist.sql`, because it grants nothing to anon or authenticated.

Undo: `rollback/20261119000007_security_events.down.sql` drops the function and both tables (the
counters are 30-day telemetry, so no export is needed; export `security_digests` first only to keep
past summaries).

### `20261120000001_align_xp_levels.sql` (stored XP level matches the app, applied by hand 2026-11-20, never moved)

Replaces the one-level-per-500-XP formula in `update_user_xp_and_level`, `sync_user_xp_and_level_on_update`
and `sync_user_xp` with `public.xp_level_for_total(int)`, which encodes `LEVEL_THRESHOLDS` from
`apps/web/lib/xp/xp.ts`, then recomputes `users.level` once. Additive, no data loss. Until it is applied the
top bar (stored level) and the level-up notification (app thresholds) can disagree.
Applied in the production SQL editor on 2026-11-20; the validation checks returned true. Kept here so the
CLI does not apply it a second time.
`lib/__tests__/xp-level-sql-parity.test.ts` keeps the two threshold lists identical.

### `20261121000001_reflections_and_prefs_policies.sql` (Plan A step 3, applied by hand 2026-11-21, never moved)

Reflections become select-only for learners (every write is server-side) and the
`user_notification_preferences` update policy gets WITH CHECK. Applied in the production SQL
editor on 2026-11-21; its built-in checks passed. Kept here so the CLI does not apply it again.

### `validation/20261119_past_exposure_audit.sql` (read-only, run once)

Twelve SELECT-only queries that look for use of the holes these and earlier migrations closed:
admins and fellows with no grant in `admin_audit_logs`, quiz XP above the content maximum or for
lessons never attempted (SEC-01 RPC window), broadcasts not created by an admin (SEC-03), fellow
requests approved without an admin reviewer (SEC-06), testimonials published without a moderator
(SEC-05), certificates that fail the issuance prerequisites, `total_xp` or `level` out of step with
`xp_events`, streaks longer than the account is old, contact-form spam, and one-sided friendships or
private cohort joins. Each query states its window and what a hit means. Run it once after the
migrations above, one query at a time, and keep the results out of chat, tickets and AI agents.

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

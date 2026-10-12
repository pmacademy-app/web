# Admin R6 deploy order

This branch (`admin/r6-refresh`) moves the analytics work into the database and adds caching to the admin panel. It adds six new database functions (RPCs) in two migrations: five for the analytics page and one for the overview funnel.

If the code is deployed before they exist, nothing crashes. Every analytics section will show as failed, with zeros, until `20261012000001` is applied, and the overview funnel shows its failed state until `20261013000001` is applied. Apply both first.

## Read first: a push to `main` applies the migrations by itself

`.github/workflows/ci.yml` has a `deploy-supabase` job. On every push to `main`, once `build-and-validate` passes, it runs `supabase db push` against production. This branch sits on Growth R4/R5, so a plain push or merge to `main`:

- applies all six pending migrations (the four in `docs/releases/growth-r5-deploy.md` and the two below) in timestamp order;
- runs none of the checks in either document: no staging validation, no pre-deploy checks, no `EXPLAIN ANALYZE`;
- does not deploy the app. If the host deploys from the same push, the app can be live before the build job has finished and the migrations have run.

If the app is live before the migrations are applied, the notification bell and every notification insert fail until they are (the R5 columns), and the analytics sections and overview funnel show as failed (the functions below).

The one supported path:

1. On the release branch, run the staging validation and the pre-deploy checks from the R5 document, and section 2 below on staging.
2. Still from the release branch, apply the migrations to production with `supabase db push`. Use `db push`, not `psql` or the SQL editor: it records each migration, so CI's push after the merge finds nothing pending.
3. Merge to `main`. CI's `supabase db push` is then a no-op.
4. Run the R5 post-deploy backfill within 24 hours of the app going live, with an explicit UTC offset.

**Open question for the owner:** does the app deploy automatically from `main`? `apps/web/vercel.json` exists, but the hosting integration cannot be seen from the repository. If it does, the merge in step 3 is the app deploy. If it does not, deploy the app by hand after the merge.

## 1. Before deploying the app: apply the migrations

| Migration | What it does |
|---|---|
| `20261012000001_admin_analytics_rpc.sql` | Adds `admin_active_users`, `admin_lesson_completion_stats`, `admin_capstone_stats`, `admin_flashcard_stats` and `admin_user_stats`. |
| `20261013000001_admin_funnel_distinct_users.sql` | Adds `admin_funnel_distinct_users`, which the overview funnel uses to count learners instead of rows. Apply it after the one above. Until it exists, the overview funnel shows its load warning and the other overview blocks still load. |

All six functions are SQL, `STABLE` and `SECURITY INVOKER`, with a fixed `search_path`. They can be executed only by `service_role` and `postgres`.

Both migrations are additive and safe to run on a live database. They add no indexes: the ones they need already exist (`idx_xp_events_user_created`, `idx_user_lesson_progress_status_completed`).

Rollback: revert the app first, then run `supabase/migrations/rollback/20261013000001_admin_funnel_distinct_users.down.sql` and `supabase/migrations/rollback/20261012000001_admin_analytics_rpc.down.sql`.

## 2. After applying: check the timings on staging

Run `EXPLAIN ANALYZE` on each function with a 30-day range:

```sql
EXPLAIN ANALYZE SELECT * FROM admin_active_users(now() - interval '30 days', now());
EXPLAIN ANALYZE SELECT admin_lesson_completion_stats('[]'::jsonb);
EXPLAIN ANALYZE SELECT admin_capstone_stats(now() - interval '30 days', now());
EXPLAIN ANALYZE SELECT admin_user_stats();
EXPLAIN ANALYZE SELECT admin_flashcard_stats();
EXPLAIN ANALYZE SELECT admin_funnel_distinct_users();
```

This gives timing only. The functions set `search_path`, so Postgres does not inline them and `EXPLAIN` shows a single function scan, not the plan inside. To see a plan, run the function body from the migration as plain SQL with literal arguments in place of the parameters.

`admin_lesson_completion_stats` is the heaviest: it reads every completed row in `user_lesson_progress`. With `'[]'` it skips the per-module part; for the real cost, pass the module list the app sends.

`admin_capstone_stats` scans `capstone_submissions` without a `submitted_at` index. That is fine at the current size. Add an index only if it becomes slow.

## 3. Deploy the app

There are no new environment variables.

## 4. Smoke checks (as an admin)

1. **Analytics.** Open `/admin/analytics`.
   - Every tab loads, with no load warning.
   - The numbers match the pre-deploy analytics for the same range (spot-check the overview KPIs).
   - `?tab=growth` shows the Growth tab.
2. **Overview.** Open `/admin`.
   - The header and KPIs appear first, and the system snapshot fills in last.
   - **Refresh** shows fresh numbers.
3. **Moderation.** Open `/admin/moderation`.
   - Each tab loads 25 rows per page.
   - Search, status filters and the Back button behave.
   - Reviewed public capstones show **View public page**, and the link opens the case-study page.
4. **Communications.** Open `/admin/communications?tab=automations`.
   - The nudge results card renders.
   - **Preview today's run (no emails sent)** returns counts. Check that no new `email_queue` or `notification_events` rows appear.
   - The button is limited to 2 runs per minute per admin.
5. **Users.** Open a learner in `/admin/users`. The drawer shows their proof state and next step.
6. **Settings.** In `/admin/settings`, the unused learning fields and the onboarding screen toggle are labelled **Not used by the app yet**.

## Caching

Admin data is now cached briefly:

| Data | Cached for |
|---|---|
| Shell badge counts | 30s |
| Overview blocks | 90s |
| Analytics | 90s |
| Nudge readout | 120s |

Moderation, feedback, contact, email-queue, system-error and Fellow actions refresh the badge counts immediately. The overview **Refresh** button refreshes the overview. A failed load is never cached.

Data older than its limit is recomputed before it is shown, never served stale. So the first overview or analytics load after about 90 seconds idle is slower than the ones that follow.

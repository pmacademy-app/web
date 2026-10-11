# Admin R6 deploy order

This branch (`admin/r6-refresh`) moves the analytics work into the database and adds caching to the admin panel. The analytics page calls five new database functions (RPCs).

If the code is deployed before they exist, nothing crashes. Every analytics section will show as failed, with zeros, until the migration is applied. Apply it first.

## 1. Before deploying the app: apply the migration

| Migration | What it does |
|---|---|
| `20261012000001_admin_analytics_rpc.sql` | Adds `admin_active_users`, `admin_lesson_completion_stats`, `admin_capstone_stats`, `admin_flashcard_stats` and `admin_user_stats`. |

All five functions are SQL, `STABLE` and `SECURITY INVOKER`, with a fixed `search_path`. They can be executed only by `service_role` and `postgres`.

The migration is additive and safe to run on a live database. It adds no indexes: the ones it needs already exist (`idx_xp_events_user_created`, `idx_user_lesson_progress_status_completed`).

Rollback: revert the app first, then run `supabase/migrations/rollback/20261012000001_admin_analytics_rpc.down.sql`.

## 2. After applying: check the query plans on staging

Run `EXPLAIN ANALYZE` on each function with a 30-day range:

```sql
EXPLAIN ANALYZE SELECT * FROM admin_active_users(now() - interval '30 days', now());
EXPLAIN ANALYZE SELECT admin_capstone_stats(now() - interval '30 days', now());
EXPLAIN ANALYZE SELECT admin_user_stats();
EXPLAIN ANALYZE SELECT admin_flashcard_stats();
```

`admin_capstone_stats` scans `capstone_submissions` without a `submitted_at` index. That is fine at the current size. Add an index only if this plan becomes slow.

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

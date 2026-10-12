# Growth R4 + R5 deploy order

The R4/R5 branches add database columns that the new code reads and writes. Deploying the code
before the migrations breaks the notification bell and every notification insert, and the reverse
leaves a short window the backfill must cover. Follow this order.

## Read first: a push to `main` applies the migrations by itself

`.github/workflows/ci.yml` has a `deploy-supabase` job. On every push to `main`, once
`build-and-validate` passes, it runs `supabase db push` against production. So a plain push or
merge to `main`:

- applies all six pending migrations (`20261010000001`, `20261011000001`, `20261011000002`,
  `20261012000001`, `20261013000001`, `20261013000002`) in timestamp order;
- runs none of the checks in this document: no staging validation, no pre-deploy checks, no
  schema-cache reload, no off-peak timing;
- does not deploy the app. If the host deploys from the same push, the app can be live before
  the build job has finished and the migrations have run.

If the app is live before `20261011000001` and `20261011000002` are applied, the notification
bell and every notification insert fail until they are.

The one supported path:

1. On the release branch, run the staging validation and the pre-deploy checks (steps 0 and 1).
2. Still from the release branch, apply the migrations to production with `supabase db push`
   (step 1). Use `db push`, not `psql` or the SQL editor: it records each migration, so CI's push
   after the merge finds nothing pending. CI runs a migration applied by hand a second time, and a
   second run of `20261011000002` after the new code is live marks every achievement read in the
   bell since then as celebrated.
3. Merge to `main` (step 2). CI's `supabase db push` is then a no-op.
4. Run the post-deploy backfill within 24 hours of the app going live, with an explicit UTC
   offset (step 3). Within minutes is better; the script refuses a time more than 24 hours old.

**Open question for the owner:** does the app deploy automatically from `main`?
`apps/web/vercel.json` exists, but the hosting integration cannot be seen from the repository.
If it does, the merge in step 3 is the app deploy and sets its time. If it does not, deploy the app
by hand after the merge.

## 0. Pre-deploy checks

- `select count(*) from in_app_notifications;` `20261011000002` adds a column, backfills it and
  builds an index, and blocks writes to the table while it does (reads too, when the file runs in
  one transaction). The file sets no `lock_timeout`. On a large table apply it off-peak (step 1,
  by hand, before the merge; see "Read first" above).
- `\dp public.in_app_notifications` before `20261013000002`, to record the current grants.
- `select count(*) from users where username !~ '^[A-Za-z0-9_-]{3,30}$';` These users lose the
  notification Share action (the app refuses a username outside that shape).

## 1. Before deploying the app: apply the migrations

Apply in order (all additive or guarded; safe on a live database). Reload the PostgREST schema
cache after each one (`NOTIFY pgrst, 'reload schema';`), or the API does not see the new columns:

| Migration | What it does |
|---|---|
| `20261010000001_guard_privileged_user_columns.sql` | Trigger that stops learners setting `is_admin` / `is_fellow` / admin overrides on their own row. Validate first on staging with `supabase/migrations/validation/r4a0_privileged_columns_validation.sql`. |
| `20261011000001_in_app_notification_secondary_action.sql` | Nullable `secondary_action` column. **Required before the app deploy:** the notifications API selects it, so without it the bell fails to load. |
| `20261011000002_in_app_notification_celebrated_at.sql` | `celebrated_at` column, backfill for already-read achievement rows, partial index. Required before the app deploy: the celebration claim filters on it. |
| `20261013000002_restrict_in_app_notification_updates.sql` | Learners can update only `is_read` / `read_at` on their own notifications (column grant + `WITH CHECK`). No code depends on it, so it can go before or after the app deploy; check `\dp public.in_app_notifications` on staging first and afterwards. The migration checks its own result: it fails if `authenticated` still has table-wide `UPDATE` (a grant made by another role, which `REVOKE` leaves in place). Revoke as that role and apply it again. |

Rollbacks are in `supabase/migrations/rollback/`. Revert the app to the previous release first,
then roll back: the R5 code selects and inserts `secondary_action` and `celebrated_at`, so
dropping them under it breaks the bell and notification inserts. The `celebrated_at` rollback
marks celebrated rows read, so the old code does not celebrate them again.

## 2. Deploy the app

Note the time the new code is fully live (all instances replaced), with an explicit UTC offset,
for example `2026-10-12T09:30:00Z`.

## 3. Right after: run the post-deploy backfill

```
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -v deployed_at="'2026-10-12T09:30:00Z'" -f supabase/post-deploy/r5_celebrated_at_backfill.sql
```

`deployed_at` is the time from step 2 and must carry an explicit UTC offset (`Z` or `+05:30`). The
script refuses a value with no offset, in the future, or more than 24 hours old.

It marks celebrations that the old code claimed between steps 1 and 2 as celebrated, so they are
not shown twice. It never touches rows read after the new code went live.

Two windows remain:

- A row the old code claimed between step 1 and this backfill replays once if the learner opens
  the app before the backfill runs.
- An old instance still serving after the noted time can claim a row the backfill then skips; that
  row replays once.

So run the backfill within minutes of the deploy, and once more, with the same `deployed_at`,
after the old instances have drained. It is safe to re-run.

## 4. Before the nudges go live: dry run

Run the lifecycle cron once with `?dryRun=true&force=true` (cron secret or an admin session). It writes nothing (no email, no in-app, no holdout record) and returns `lifecycleQueued`, `heldOut` and `proofNudges.sent` per nudge: the volume to sign off. Without `force=true` it counts only learners in their delivery hour. A `pagesSkipped` above 0 means a page of learners could not be read and was left out, so the counts are low: run it again.

## 5. Smoke checks

- The bell loads and shows notifications.
- A test learner who completes a module sees the module celebration once.
- Opening a new achievement notification in the bell, then reloading, still shows its celebration once.
- A published capstone opens at `/p/<username>/capstones/<module>`; its link preview shows the case-study card; making the portfolio private turns both into a 404 / the generic card.
- Admin Settings → Learning shows the live XP values (10 / 5 / 2 / 15 by default) before any save.

## Behaviour changes to expect

- Badge notifications and emails now send. They were silently dropped before, so expect new volume.
- Module, badge and level-up emails send once per item, not once ever per learner.
- An admin settings save from a tab opened before the deploy ignores the XP fields. Reload the
  tab, then save.

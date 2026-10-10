# Growth R4 + R5 deploy order

The R4/R5 branches add database columns that the new code reads. Deploying the code before the
migrations breaks the notification bell, and the reverse leaves a short window the backfill must
cover. Follow this order.

## 1. Before deploying the app: apply the migrations

Apply in order (all additive or guarded; safe on a live database):

| Migration | What it does |
|---|---|
| `20261010000001_guard_privileged_user_columns.sql` | Trigger that stops learners setting `is_admin` / `is_fellow` / admin overrides on their own row. Validate first on staging with `supabase/migrations/validation/r4a0_privileged_columns_validation.sql`. |
| `20261011000001_in_app_notification_secondary_action.sql` | Nullable `secondary_action` column. **Required before the app deploy:** the notifications API selects it, so without it the bell fails to load. |
| `20261011000002_in_app_notification_celebrated_at.sql` | `celebrated_at` column, backfill for already-read achievement rows, partial index. Required before the app deploy: the celebration claim filters on it. |

Rollbacks are in `supabase/migrations/rollback/`.

## 2. Deploy the app

Note the time the new code is fully live (all instances replaced).

## 3. Right after: run the post-deploy backfill

```
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -v deployed_at="'<time from step 2, ISO 8601>'" -f supabase/post-deploy/r5_celebrated_at_backfill.sql
```

It marks celebrations that the old code claimed between steps 1 and 2 as celebrated, so they are
not shown twice. It never touches rows read after the new code went live.

## 4. Smoke checks

- The bell loads and shows notifications.
- A test learner who completes a module sees the module celebration once.
- Opening a new achievement notification in the bell, then reloading, still shows its celebration once.

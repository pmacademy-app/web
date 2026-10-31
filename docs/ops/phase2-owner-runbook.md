# Phase 2 owner runbook

The steps in Phase 2 that only the owner can do: dashboard settings, Vault secrets, production SQL and one email. Do them in this order. Each step says how to check it worked.

Nothing here has been applied. Every held SQL file lives in `supabase/migrations/pending-approval/`, which `supabase db push` and CI never read. The SQL editor shows only the last result, so for files with several numbered queries, select one query at a time and run the selection.

Related docs: [`DEPLOYMENT.md`](../DEPLOYMENT.md) §6 (region) and §7 (pg_cron), [`EMAIL_SYSTEM.md`](../EMAIL_SYSTEM.md) §9 (capacity), [`pending-approval/README.md`](../../supabase/migrations/pending-approval/README.md).

---

## (a) Pin the function region (PR-09)

1. Supabase > Project Settings > General: note the region (expected `ap-south-1`).
2. Measure `/api/health` before the change and note the `x-vercel-id` header (commands in [`DEPLOYMENT.md`](../DEPLOYMENT.md) §6).
3. Vercel > Project > Settings > Functions > Function Region: pick the nearest region (`bom1` for `ap-south-1`). Redeploy production.
4. Measure again. **Done when** the second segment of `x-vercel-id` is the new region and the median is lower. Write the values into the table in `DEPLOYMENT.md` §6.

## (b) Move the scheduler to pg_cron (ENG-01)

Do step (d) first if you have not: working reminders send more email.

1. Supabase > Integrations > Vault: create two secrets.
   - `cron_secret`: exactly the value of `CRON_SECRET` in Vercel Production.
   - `site_url`: `https://prodily.app` (no trailing slash, no path).
2. SQL editor: paste and run `pending-approval/20261024000003_schedule_cron_jobs_pg_cron.sql`. It ends with a self-check. If it raises, nothing was applied: fix what the message names (usually a missing secret) and run it again.
3. Run query 1 of `pending-approval/validation/20261024000003_schedule_cron_jobs_pg_cron_validation.sql`. Expect the notice "validation passed" and six rows.
4. After 15 minutes, run queries 2, 3 and 4 of the same file. Expect runs `succeeded`, HTTP `200`, and fresh `cron_heartbeat:*` rows. HTTP `401` means `cron_secret` does not match `CRON_SECRET`.
5. Watch the heartbeats on the admin System page for **24 hours**. Every scheduled job should stay fresh (queue and broadcasts every 5 minutes; reminder, recap and lifecycle hourly; cleanup daily).
6. **Then**, as a separate follow-up change, remove the `schedule:` block from `.github/workflows/notification-scheduler.yml` and keep `workflow_dispatch`. Until that lands the GitHub schedules keep firing too. That double triggering is safe: each job dedupes on an idempotency key and the queue claim is row-locked.

Undo: `pending-approval/rollback/20261024000003_schedule_cron_jobs_pg_cron.down.sql` (keep the GitHub schedule in place first).

## (c) Production environment check

In Vercel > Project > Settings > Environment Variables (Production):

| Variable | Should be | Why |
|---|---|---|
| `RECUT_EXPERIMENT_TREATMENT_PCT` | **unset** (or `100`) | An old `50` keeps half of learners on the full lesson, although the Core recut is ON for everyone (D5) |
| `MODULE_ENTRY_UNLOCK_COHORT_START` | **unset** | A date limits the unlock to learners created after it; the unlock is ON for everyone (D5) |
| `MODULE_ENTRY_UNLOCK_TREATMENT_PCT` | unset (or `100`) | Same reason |
| `RECUT_EXPERIMENT_ENABLED`, `MODULE_ENTRY_UNLOCK_ENABLED` | unset (or `true`) | `false` is the kill switch |
| `CAPSTONE_THRESHOLD_EXPERIMENT_ENABLED` | unset (or `false`) | Stays at 8 of 10 until a product decision |

Redeploy after changing any of them; a running deployment keeps the values it started with.

Then confirm email verification is off (owner decision D2). The code treats a missing value as **on**, so it must be an explicit `false`:

```sql
SELECT value -> 'requireEmailVerification' AS require_email_verification
FROM public.system_settings
WHERE key = 'product_settings';
```

Expect `false`. If it is `true`, or the row or field is missing, turn it off in the admin console (Settings > Product) and run the query again. The setting is cached for up to 5 minutes.

## (d) Email capacity count

Run the read-only query in [`EMAIL_SYSTEM.md`](../EMAIL_SYSTEM.md) §9.3 and fill in the formula in §9.2. The app quota stays at 100 a day (Q3). If the Sunday total (reminders, plus the whole weekly recap batch, plus lifecycle, plus welcome mail) is above 100, decide before step (b) whether you accept reminders being deferred on peak days. Re-run the query a week after step (b) and compare `queued_delivered_per_day_14d` and `waiting_on_quota_now`.

## (e) Correction email for the PM Fellow LinkedIn advice (PR-08)

The August campaign `pm_fellow_linkedin_aug_2026` told 234 Fellows to add "Product Management Fellow, Company: Prodily" under LinkedIn **Experience**. PM Fellow is an award, not a job, so it belongs elsewhere on the profile.

**Recipients.** Exactly the people who got the original email. The send script logged them to `apps/web/scripts/local-campaigns/fellow_linkedin_aug_2026/campaign_pm_fellow_linkedin_aug_2026_log.jsonl` (git-ignored, on the machine that sent it). If that log is gone, the script also wrote each send to `email_queue`:

```sql
SELECT DISTINCT q.to_email
FROM public.email_queue q
WHERE q.event_type = 'marketing.pm_fellow'
  AND q.status = 'delivered'
  AND NOT EXISTS (SELECT 1 FROM public.email_suppressions s WHERE lower(s.email) = lower(q.to_email));
```

**Volume.** 234 is more than one day of the app quota (100) and more than Resend's 100 a day. Split it into three batches on three days (about 78 each), or send it on a day you expect low reminder volume and accept that reminders wait.

**Draft** (plain text, no tracking, from the founder address as in `EMAIL_SYSTEM.md` §8):

> Subject: A correction about PM Fellow on LinkedIn
>
> Hi {{userName}},
>
> In August we suggested adding "Product Management Fellow" at Prodily to the Experience section of your LinkedIn profile. That advice was wrong, and I'm sorry for it.
>
> PM Fellow is an award for finishing the Prodily curriculum. It is not a job or an employment role, and the Experience section is read as a list of jobs. Listing it there can mislead a recruiter, which is the last thing we want for you.
>
> If you added it, please move it:
>
> 1. Open your profile and delete the "Product Management Fellow, Prodily" entry under Experience.
> 2. Add it under Honors & awards (title: Product Management Fellow, issuer: Prodily), or under Licenses & certifications with your Prodily certificate link.
> 3. If your headline says "PM Fellow at Prodily", "Prodily PM Fellow" reads more accurately.
>
> You earned it, and it still deserves a place on your profile. It just belongs in the right section.
>
> Thanks for reading, and congratulations again.
>
> Aditya
> Prodily

## (f) Username rule (CQ-24)

`pending-approval/20261027000001_users_username_check.sql` adds a CHECK on `public.users.username`. The constraint fails to apply if any existing username breaks it, so check first. If the migration file ships its own pre-check query, use that one: it matches the constraint exactly. Otherwise this query mirrors `validateUsername` in `apps/web/lib/portfolio.ts` (3 to 30 characters; letters, digits, `_` and `-`; not a reserved word):

```sql
SELECT id, username, created_at
FROM public.users
WHERE username IS NOT NULL
  AND (
    length(username) NOT BETWEEN 3 AND 30
    OR username !~ '^[A-Za-z0-9_-]+$'
    OR lower(username) IN ('admin', 'api', 'app', 'settings', 'curriculum', 'academy',
                           'login', 'signup', 'dashboard', 'capstones')
  )
ORDER BY created_at;
```

1. If it returns rows, fix each one (rename, or set to `NULL` so the learner picks a new one) and tell the learner if their portfolio link changes.
2. Run it again until it returns nothing.
3. Apply the migration in the SQL editor, then run its validation file from `pending-approval/validation/` if there is one.

## (g) Lock `public.users` (Q1, SEC-07)

Apply `pending-approval/20261027000002_lock_public_users.sql` only **after** the Phase 2 code is deployed to production. Applied against the old code, it breaks first login and email confirmation (see the file's "Release order" note).

1. Staging first if you can: apply it, then run `pending-approval/validation/20261027000002_lock_public_users_validation.sql` (staging only, as its header says).
2. Production: apply it in the SQL editor.
3. Confirm a learner token can no longer write the table. Use a test learner account, never a real learner's credentials:
   ```bash
   # 1. Get a learner access token.
   curl -s "https://<project-ref>.supabase.co/auth/v1/token?grant_type=password" \
     -H "apikey: <anon key>" -H "Content-Type: application/json" \
     -d '{"email":"<test learner email>","password":"<test learner password>"}'
   # 2. Try to change that learner's own row (name set to its current value, so nothing changes if it works).
   curl -s -i -X PATCH "https://<project-ref>.supabase.co/rest/v1/users?id=eq.<test learner id>" \
     -H "apikey: <anon key>" -H "Authorization: Bearer <access_token from step 1>" \
     -H "Content-Type: application/json" -H "Prefer: return=representation" \
     -d '{"name":"<current name>"}'
   ```
   **Done when** step 2 returns `401` or `403` with code `42501` (permission denied). A `200` with a row means the lock is not in place.
4. Smoke-test right after: sign in with email and password, open the dashboard, edit the profile in Settings. All of these write through the server and must still work.

Undo: `pending-approval/rollback/20261027000002_lock_public_users.down.sql`.

## (h) Migrations that apply on their own

These sit at the top level of `supabase/migrations/`, and the `deploy-supabase` CI job applies them to production on the merge to `main`. No owner step, but check that the CI job went green after the merge:

- `20261024000001_product_events.sql`: the server-side product events table and the two admin measurement views.
- `20261024000002_lock_users_and_capstone_client_writes.sql`: learners can no longer write `capstone_submissions` through PostgREST. Despite its name it does not change `public.users`; that is step (g).

Their validation scripts are in `supabase/migrations/validation/` (staging only).

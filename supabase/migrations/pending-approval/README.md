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

## Currently held

**No migrations.** The directory stays in the repository so the next destructive migration
has an obvious place to wait.

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

Execution record, including preflight numbers and the full post-migration
reconciliation: [`docs/archive/B8E_XP_UNIQUENESS_EXECUTION.md`](../../../docs/archive/B8E_XP_UNIQUENESS_EXECUTION.md).

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

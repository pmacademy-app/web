-- OWNER-RUN OPS SNIPPET. NOT A MIGRATION.
--
-- Run this by hand in the Supabase SQL editor (staging first if you can, then production).
-- NEVER move this file into supabase/migrations/. Files at that top level are applied to
-- production automatically on the next merge to main. Paste real emails and user ids only in
-- the SQL editor or a local copy; do not commit them back to the repository.
--
-- Why: admin access now comes only from public.users.is_admin (plus the server-signed
-- app_metadata.is_admin claim the proxy trusts as a fast path). The ADMIN_EMAILS environment
-- variable is no longer read anywhere. Anyone who was an admin only because their address was
-- in ADMIN_EMAILS loses access when that change deploys, unless their users.is_admin is set
-- first. Run this BEFORE deploying the admin-by-flag change to avoid locking yourself out.
--
-- Why two steps instead of "promote by email": email verification is OFF in production and
-- the login path auto-confirms accounts. Anyone could have signed up with an ADMIN_EMAILS
-- address before its real owner did, and that account would have email_confirmed_at set. An
-- email match therefore proves nothing. STEP 1 only lists candidate accounts so you can
-- decide which ones are genuinely yours. STEP 2 previews the result, STEP 3 promotes exactly
-- the user ids you paste (never by email), and STEP 4 prints the final roster.
--
-- The guard_privileged_user_columns trigger (20261017000001, lines 25-65) rejects changes to
-- is_admin only when current_user is 'authenticated' or 'anon'. The SQL editor runs as
-- postgres, so the STEP 3 UPDATE is allowed.
--
-- The SQL editor shows only the LAST statement's result. Run each step on its own: select
-- the step's text in the editor and run the selection.


-- ===========================================================================
-- STEP 1 (read-only). List candidate accounts for the old ADMIN_EMAILS addresses.
--
-- Replace the placeholder with the addresses from the old ADMIN_EMAILS value, one VALUES row
-- per address, for example: ('first-admin@yourdomain.invalid'), ('second-admin@yourdomain.invalid')
--
-- For every row, decide whether the account is genuinely yours:
--   - created_at: does it match when you (not someone else) created the account?
--   - last_sign_in_at: does it match your own recent sign-ins?
--   - provider: is it the sign-in method you actually use (email, google, ...)?
--   - email_confirmed_at: NOT proof of ownership here (auto-confirmed on login).
-- Rows with a NULL user_id mean no account exists for that address. Copy the user_id of each
-- account you have confirmed is yours into STEP 2 and STEP 3.
-- ===========================================================================

WITH wanted(email) AS (
  VALUES
    ('replace-me@example.invalid')
)
SELECT
  lower(trim(w.email)) AS wanted_email,
  a.id AS user_id,
  a.email,
  a.created_at,
  a.last_sign_in_at,
  a.email_confirmed_at,
  a.raw_app_meta_data->>'provider' AS provider,
  u.id IS NOT NULL AS has_profile_row,
  u.is_admin AS already_admin
FROM wanted w
LEFT JOIN auth.users a ON lower(a.email) = lower(trim(w.email))
LEFT JOIN public.users u ON u.id = a.id
ORDER BY wanted_email, a.created_at;


-- ===========================================================================
-- STEP 2 (read-only). Dry run: preview the admin roster the promotion would produce.
--
-- Paste the ids you verified in STEP 1 into the array literal below, comma separated, e.g.
--   '{11111111-2222-3333-4444-555555555555,66666666-7777-8888-9999-000000000000}'::uuid[]
-- Paste the SAME list into STEP 3.
--
-- change = 'promote' rows are the ones STEP 3 would change. id_found = false means the id
-- has no public.users row; STEP 3 will refuse to run until you fix it.
-- ===========================================================================

WITH input(ids) AS (
  SELECT '{00000000-0000-0000-0000-000000000000}'::uuid[]
),
pasted AS (
  SELECT DISTINCT unnest(ids) AS id FROM input
)
SELECT
  CASE
    WHEN u.id IS NULL THEN 'id not found'
    WHEN u.is_admin THEN 'already admin'
    ELSE 'promote'
  END AS change,
  p.id AS user_id,
  u.id IS NOT NULL AS id_found,
  a.email,
  a.created_at,
  a.last_sign_in_at,
  a.raw_app_meta_data->>'provider' AS provider
FROM pasted p
LEFT JOIN public.users u ON u.id = p.id
LEFT JOIN auth.users a ON a.id = p.id
UNION ALL
SELECT
  'stays admin' AS change,
  u.id,
  true,
  a.email,
  a.created_at,
  a.last_sign_in_at,
  a.raw_app_meta_data->>'provider'
FROM public.users u
JOIN auth.users a ON a.id = u.id
WHERE u.is_admin = true
  AND u.id <> ALL((SELECT ids FROM input))
ORDER BY change, created_at;


-- ===========================================================================
-- STEP 3. Promote exactly the ids you previewed in STEP 2.
--
-- Paste the same id list as STEP 2. This step ENDS WITH ROLLBACK ON PURPOSE, so running it
-- unchanged only proves the guard passes and changes nothing. When the STEP 2 preview is
-- exactly right, change the final ROLLBACK; to COMMIT; and run STEP 3 again, then STEP 4.
-- ===========================================================================

BEGIN;

CREATE TEMP TABLE admin_backfill_input ON COMMIT DROP AS
SELECT '{00000000-0000-0000-0000-000000000000}'::uuid[] AS ids;

-- Guard: refuse to run with the placeholder, an empty list, or an id with no profile row.
DO $$
DECLARE
  v_ids uuid[];
  v_missing uuid[];
BEGIN
  SELECT ids INTO v_ids FROM admin_backfill_input;

  IF v_ids IS NULL OR cardinality(v_ids) = 0 THEN
    RAISE EXCEPTION 'admin backfill: the user id list is empty';
  END IF;

  IF '00000000-0000-0000-0000-000000000000'::uuid = ANY(v_ids) THEN
    RAISE EXCEPTION 'admin backfill: replace the placeholder user id 00000000-0000-0000-0000-000000000000 with the ids you verified in STEP 1';
  END IF;

  SELECT array_agg(i) INTO v_missing
  FROM unnest(v_ids) AS i
  WHERE NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = i);

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'admin backfill: no public.users row for id(s) %', v_missing;
  END IF;
END
$$;

UPDATE public.users u
SET is_admin = true
WHERE u.id = ANY((SELECT ids FROM admin_backfill_input))
  AND u.is_admin IS DISTINCT FROM true;

-- Default is a dry run that changes nothing. Change to COMMIT; only after reviewing STEP 2.
ROLLBACK;


-- ===========================================================================
-- STEP 4 (read-only). Final admin roster. Run after STEP 3 has been COMMITted and check
-- every row. If a promoted account looks wrong, demote it right away:
--   UPDATE public.users SET is_admin = false WHERE id = '<uuid>';
-- ===========================================================================

SELECT
  u.id,
  a.email,
  a.created_at,
  a.last_sign_in_at,
  a.email_confirmed_at,
  a.raw_app_meta_data->>'provider' AS provider
FROM public.users u
JOIN auth.users a ON a.id = u.id
WHERE u.is_admin = true
ORDER BY a.created_at;

-- Validation for 20261113000001: dead-lettered and failed auth rows in email_queue hold no
-- template variables (ADR-005 gap, SEC-17).
--
-- READ-ONLY, safe on production. Run it AFTER applying the forward migration. It runs inside one
-- transaction that ends with ROLLBACK, so it changes nothing. It never selects
-- template_variables itself, so it cannot print a link.
--
-- Usage: paste into the Supabase SQL editor and run it, or
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/pending-approval/validation/20261113000001_scrub_dead_letter_auth_links_validation.sql
--
-- Raises on failure. Success prints "20261113000001 validation passed".
-- Expected: 0 rows with a non-empty template_variables for the filters below.
-- The SQL editor shows only the last result. To see the per-template counts, select the final
-- SELECT on its own and run the selection.

BEGIN;

DO $$
DECLARE
  v_left integer;
BEGIN
  SELECT count(*) INTO v_left
  FROM public.email_queue
  WHERE status IN ('dead_letter', 'failed')
    AND template_key LIKE 'auth.%'
    AND (
      jsonb_typeof(template_variables) <> 'object'
      OR (template_variables - '_scrubbed') <> '{}'::jsonb
    );

  IF v_left <> 0 THEN
    RAISE EXCEPTION '20261113000001 FAILED: % dead-lettered or failed auth row(s) still carry template variables', v_left;
  END IF;

  RAISE NOTICE '20261113000001 validation passed';
END $$;

-- Counts per template and status, for the record. Expect remaining_variables = 0 on every row.
SELECT template_key,
       status,
       count(*) AS rows,
       count(*) FILTER (
         WHERE jsonb_typeof(template_variables) <> 'object'
            OR (template_variables - '_scrubbed') <> '{}'::jsonb
       ) AS remaining_variables
FROM public.email_queue
WHERE status IN ('dead_letter', 'failed')
  AND template_key LIKE 'auth.%'
GROUP BY template_key, status
ORDER BY template_key, status;

ROLLBACK;

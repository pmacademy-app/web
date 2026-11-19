-- Validation for 20261119000007: security event counters and daily digests.
--
-- Read-only. Runs inside one transaction and rolls back; it only reads the catalog.
-- Run in the Supabase SQL editor (or psql) as postgres after applying the migration.
-- Every check raises on failure. Success prints "20261119000007 validation passed".

BEGIN;

DO $$
DECLARE
  v_role text;
  v_table text;
  v_type text;
  v_missing text;
  v_check text;
  v_fn constant text := 'public.record_security_event(text, text, text, text, text, text)';
  v_secdef boolean;
  v_config text[];
BEGIN
  -- Columns: name, type and nullability, as the admin console reads them.
  SELECT string_agg(e.col, ', ') INTO v_missing
    FROM (VALUES
      ('security_event_counts', 'day', 'date', 'NO'),
      ('security_event_counts', 'event_type', 'text', 'NO'),
      ('security_event_counts', 'app', 'text', 'NO'),
      ('security_event_counts', 'ip_bucket', 'text', 'NO'),
      ('security_event_counts', 'subject_hash', 'text', 'NO'),
      ('security_event_counts', 'subject_hint', 'text', 'YES'),
      ('security_event_counts', 'sample_path', 'text', 'YES'),
      ('security_event_counts', 'count', 'integer', 'NO'),
      ('security_event_counts', 'first_seen', 'timestamp with time zone', 'NO'),
      ('security_event_counts', 'last_seen', 'timestamp with time zone', 'NO'),
      ('security_digests', 'day', 'date', 'NO'),
      ('security_digests', 'generated_at', 'timestamp with time zone', 'NO'),
      ('security_digests', 'severity', 'text', 'NO'),
      ('security_digests', 'summary', 'jsonb', 'NO'),
      ('security_digests', 'findings', 'jsonb', 'NO')
    ) AS e(tbl, col, typ, nullable)
   WHERE NOT EXISTS (
     SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = e.tbl
        AND c.column_name = e.col
        AND c.data_type = e.typ
        AND c.is_nullable = e.nullable
   );
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION '20261119000007 FAILED: missing or mistyped columns: %', v_missing;
  END IF;

  -- The event type CHECK carries every type the app records.
  SELECT pg_get_constraintdef(oid) INTO v_check
    FROM pg_constraint
   WHERE conrelid = 'public.security_event_counts'::regclass
     AND conname = 'security_event_counts_event_type_check';
  IF v_check IS NULL THEN
    RAISE EXCEPTION '20261119000007 FAILED: security_event_counts_event_type_check is missing';
  END IF;
  FOREACH v_type IN ARRAY ARRAY[
    'login_failed', 'login_rate_limited', 'admin_login_failed', 'admin_login_rate_limited',
    'admin_login_non_admin', 'signup_blocked', 'turnstile_failed', 'password_reset_requested',
    'password_reset_rate_limited', 'origin_rejected', 'webhook_auth_failed', 'email_hook_auth_failed',
    'cron_auth_failed', 'internal_revalidate_auth_failed', 'client_errors_flood', 'quiz_check_rate_limited'
  ] LOOP
    IF position(quote_literal(v_type) IN v_check) = 0 THEN
      RAISE EXCEPTION '20261119000007 FAILED: event type % is not in the CHECK', v_type;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.security_event_counts'::regclass
       AND conname = 'security_event_counts_key'
       AND contype = 'u'
  ) THEN
    RAISE EXCEPTION '20261119000007 FAILED: unique key on security_event_counts is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.security_digests'::regclass
       AND conname = 'security_digests_severity_check'
  ) THEN
    RAISE EXCEPTION '20261119000007 FAILED: severity CHECK on security_digests is missing';
  END IF;

  -- RLS on, no policies, no client privileges, service_role full access.
  FOREACH v_table IN ARRAY ARRAY['public.security_event_counts', 'public.security_digests'] LOOP
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = v_table::regclass) THEN
      RAISE EXCEPTION '20261119000007 FAILED: row level security is off on %', v_table;
    END IF;

    IF EXISTS (
      SELECT 1 FROM pg_policies
       WHERE schemaname = 'public' AND tablename = split_part(v_table, '.', 2)
    ) THEN
      RAISE EXCEPTION '20261119000007 FAILED: % has a policy', v_table;
    END IF;

    FOREACH v_role IN ARRAY ARRAY['public', 'anon', 'authenticated'] LOOP
      IF has_table_privilege(v_role, v_table, 'SELECT')
         OR has_table_privilege(v_role, v_table, 'INSERT')
         OR has_table_privilege(v_role, v_table, 'UPDATE')
         OR has_table_privilege(v_role, v_table, 'DELETE')
         OR has_any_column_privilege(v_role, v_table, 'SELECT, INSERT, UPDATE') THEN
        RAISE EXCEPTION '20261119000007 FAILED: % has a privilege on %', v_role, v_table;
      END IF;
    END LOOP;

    IF NOT has_table_privilege('service_role', v_table, 'SELECT')
       OR NOT has_table_privilege('service_role', v_table, 'INSERT')
       OR NOT has_table_privilege('service_role', v_table, 'UPDATE')
       OR NOT has_table_privilege('service_role', v_table, 'DELETE') THEN
      RAISE EXCEPTION '20261119000007 FAILED: service_role lost access to %', v_table;
    END IF;
  END LOOP;

  -- The function: service role only, SECURITY DEFINER, pinned search_path.
  FOREACH v_role IN ARRAY ARRAY['public', 'anon', 'authenticated'] LOOP
    IF has_function_privilege(v_role, v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION '20261119000007 FAILED: % can execute %', v_role, v_fn;
    END IF;
  END LOOP;

  IF NOT has_function_privilege('service_role', v_fn, 'EXECUTE') THEN
    RAISE EXCEPTION '20261119000007 FAILED: service_role cannot execute %', v_fn;
  END IF;

  SELECT prosecdef, proconfig INTO v_secdef, v_config FROM pg_proc WHERE oid = v_fn::regprocedure;
  IF NOT v_secdef OR v_config IS NULL OR NOT ('search_path=public, pg_temp' = ANY (v_config)) THEN
    RAISE EXCEPTION '20261119000007 FAILED: % is not SECURITY DEFINER with search_path public, pg_temp', v_fn;
  END IF;

  RAISE NOTICE '20261119000007 validation passed';
END $$;

-- For the record: today's busiest counters (empty until the app records events).
SELECT day, event_type, app, count, last_seen
  FROM public.security_event_counts
 ORDER BY day DESC, count DESC
 LIMIT 20;

ROLLBACK;

-- pgTAP tests for RPC and SECURITY DEFINER execution grants (AG-05)
-- Verifies that anon and authenticated cannot execute SECURITY DEFINER functions in schema public.
-- Verifies that service_role can execute record_lesson_quiz_completion.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT extensions.plan(3);

-- 1. anon cannot execute any non-trigger SECURITY DEFINER function in schema public
SELECT extensions.is_empty(
  $$
  SELECT p.oid::regprocedure::text AS sig
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prosecdef
    AND p.prorettype NOT IN ('trigger'::regtype, 'event_trigger'::regtype)
    AND has_function_privilege('anon', p.oid, 'EXECUTE')
  $$,
  'anon has EXECUTE on 0 SECURITY DEFINER functions in public'
);

-- 2. authenticated cannot execute any non-trigger SECURITY DEFINER function in schema public
SELECT extensions.is_empty(
  $$
  SELECT p.oid::regprocedure::text AS sig
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prosecdef
    AND p.prorettype NOT IN ('trigger'::regtype, 'event_trigger'::regtype)
    AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
  $$,
  'authenticated has EXECUTE on 0 SECURITY DEFINER functions in public'
);

-- 3. service_role CAN execute record_lesson_quiz_completion
SELECT extensions.ok(
  has_function_privilege('service_role', 'public.record_lesson_quiz_completion(uuid, text, integer, integer, integer, jsonb, integer, integer)'::regprocedure, 'EXECUTE'),
  'service_role has EXECUTE on record_lesson_quiz_completion'
);

SELECT * FROM extensions.finish();

ROLLBACK;

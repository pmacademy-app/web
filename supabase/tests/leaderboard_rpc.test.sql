-- pgTAP tests for weekly leaderboard and database size RPCs (AG-05)
-- Verifies that get_weekly_leaderboard and get_database_size_bytes exist and are executable by service_role.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT extensions.plan(4);

SELECT extensions.has_function('public', 'get_weekly_leaderboard', ARRAY['timestamp with time zone', 'integer', 'integer']);
SELECT extensions.has_function('public', 'get_database_size_bytes', ARRAY[]::text[]);
SELECT extensions.ok(
  has_function_privilege('service_role', 'public.get_weekly_leaderboard(timestamp with time zone, integer, integer)'::regprocedure, 'EXECUTE'),
  'service_role has EXECUTE on get_weekly_leaderboard'
);
SELECT extensions.ok(
  has_function_privilege('service_role', 'public.get_database_size_bytes()'::regprocedure, 'EXECUTE'),
  'service_role has EXECUTE on get_database_size_bytes'
);

SELECT * FROM extensions.finish();

ROLLBACK;

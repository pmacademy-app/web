BEGIN;
SELECT plan(4);

SELECT has_function('public', 'get_weekly_leaderboard', ARRAY['timestamp with time zone', 'integer', 'integer']);
SELECT has_function('public', 'get_database_size_bytes', ARRAY[]::text[]);
SELECT function_privs_are('public', 'get_weekly_leaderboard', ARRAY['timestamp with time zone', 'integer', 'integer'], 'service_role', ARRAY['EXECUTE']);
SELECT function_privs_are('public', 'get_database_size_bytes', ARRAY[]::text[], 'service_role', ARRAY['EXECUTE']);

SELECT * FROM finish();
ROLLBACK;

-- Validation for 20261121000001: every row returns ok = true.

SET search_path = public, pg_temp;

SELECT 'reflections_no_learner_writes' AS check_name,
       NOT has_table_privilege('authenticated', 'public.reflections', 'INSERT, UPDATE, DELETE') AS ok
UNION ALL
SELECT 'reflections_learner_select', has_table_privilege('authenticated', 'public.reflections', 'SELECT')
UNION ALL
SELECT 'reflections_service_writes', has_table_privilege('service_role', 'public.reflections', 'INSERT, UPDATE, DELETE')
UNION ALL
SELECT 'reflections_own_select_policy',
       EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'reflections'
               AND policyname = 'Users can view own reflections' AND cmd = 'SELECT')
UNION ALL
SELECT 'prefs_update_with_check',
       EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_notification_preferences'
               AND policyname = 'Users can update own preferences' AND with_check IS NOT NULL);

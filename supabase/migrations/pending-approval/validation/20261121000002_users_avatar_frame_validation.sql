-- Validation for 20261121000002: every row returns ok = true.

SET search_path = public, pg_temp;

SELECT 'column_exists' AS check_name,
       EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'avatar_frame'
                  AND is_nullable = 'YES' AND data_type = 'text') AS ok
UNION ALL
SELECT 'check_constraint',
       EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_avatar_frame_check' AND conrelid = 'public.users'::regclass)
UNION ALL
SELECT 'learners_cannot_write',
       NOT has_column_privilege('authenticated', 'public.users', 'avatar_frame', 'UPDATE');

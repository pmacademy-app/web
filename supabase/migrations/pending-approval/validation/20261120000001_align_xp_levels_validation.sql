-- Validation for 20261120000001: every check returns ok = true.

SET search_path = public, pg_temp;

-- 1. The helper matches the app thresholds at every boundary.
SELECT 'thresholds' AS check_name,
       bool_and(public.xp_level_for_total(t.xp) = t.expected) AS ok
FROM (VALUES
  (0, 1), (249, 1), (250, 2), (749, 2), (750, 3), (1499, 3), (1500, 4),
  (2749, 4), (2750, 5), (4499, 5), (4500, 6), (6999, 6), (7000, 7),
  (9999, 7), (10000, 8), (13999, 8), (14000, 9), (100000, 9)
) AS t(xp, expected);

-- 2. No user's stored level disagrees with their total.
SELECT 'stored_levels' AS check_name,
       count(*) = 0 AS ok
FROM public.users
WHERE level IS DISTINCT FROM public.xp_level_for_total(total_xp);

-- 3. The three writers use the helper and keep the pinned search_path.
SELECT 'writers' AS check_name,
       bool_and(
         pg_get_functiondef(p.oid) LIKE '%xp_level_for_total%'
         AND pg_get_functiondef(p.oid) NOT LIKE '%/ 500%'
         AND array_to_string(p.proconfig, ',') LIKE '%search_path=public, pg_temp%'
       ) AS ok
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('update_user_xp_and_level', 'sync_user_xp_and_level_on_update', 'sync_user_xp');

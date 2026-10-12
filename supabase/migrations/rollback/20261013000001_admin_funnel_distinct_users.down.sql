-- Rollback: 20261013000001_admin_funnel_distinct_users.sql
-- Roll back the app code first: once this is gone, the overview funnel shows
-- its load warning (`failed`) until the old code is redeployed.

DROP FUNCTION IF EXISTS public.admin_funnel_distinct_users();

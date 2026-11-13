-- Rollback for 20261031000001_phase3_drop_unused_tables.sql (dead-code Batch 3-C).
--
-- STRUCTURE ONLY. THE ROWS ARE NOT RESTORED. The forward migration dropped these objects with
-- CASCADE and kept no copy, so this brings back empty tables and the function, at the state they
-- were in just before the drop. Restore data from a database backup taken before 20261031000001
-- if it is needed.
--
-- Run it BY HAND in the Supabase SQL editor (or psql), as postgres. It lives in rollback/, which
-- the Supabase CLI never reads, so it is never applied automatically. Safe to re-run: every
-- statement is IF NOT EXISTS, CREATE OR REPLACE, or DROP ... IF EXISTS before CREATE.
--
-- Nothing in the app reads or writes these objects any more. Re-creating them only helps if
-- code that used them is restored too.
--
-- Objects re-created, and the migrations each final state was rebuilt from:
--
--   public.weekly_leaderboard_snapshots
--     20260805000006_create_leaderboards_and_cohorts.sql  table, RLS, "Anyone can view weekly
--                                                         snapshots" SELECT policy
--
--   public.bookmarks
--     20260728000002_create_user_state.sql   table, RLS, "Users manage own bookmarks" policy
--     20260802000001_lesson_id_migration.sql lesson_slug renamed to lesson_id; the unnamed
--                                            UNIQUE (user_id, lesson_slug) replaced by
--                                            bookmarks_user_lesson_unique (user_id, lesson_id)
--     20260813000001_lesson_id_backfill.sql  CHECK bookmarks_lesson_id_check (lesson_id LIKE 'les_%')
--
--   public.email_dead_letter
--     20260806000001_notification_platform_foundation.sql  table
--     20260810000007_supabase_advisor_security_hardening.sql RLS enabled (no policies)
--     20260813000002_service_role_comments.sql             table comment (see note below)
--
--   public.user_notification_timeline
--     20260806000001_notification_platform_foundation.sql  table, idx_user_timeline_user, RLS,
--                                                         "Users can read own timeline" policy
--     20260915000001_retention_hold_b9d.sql                 retention_hold column and comment,
--                                                         idx_user_notification_timeline_retention
--
--   public.sync_user_xp(uuid)
--     20260925000002_phase_t2_backend_reliability.sql  function body (SECURITY DEFINER)
--     20261018000001_lockdown_public_grants.sql        search_path pinned; EXECUTE revoked from
--                                                      PUBLIC, anon, authenticated; granted to
--                                                      service_role only (SEC-01)
--
-- Table grants: no migration ever granted or revoked privileges on these four tables by name, so
-- they held Supabase's default table privileges. Re-creating them as postgres applies the same
-- defaults, so no table GRANT is issued here. RLS is on for all four, with the same policies as
-- before (email_dead_letter has none, so only service_role can reach it).
--
-- sync_user_xp is SECURITY DEFINER and rewrites any user's XP. It comes back service-role only,
-- exactly as 20261018000001 left it. Never grant it to anon or authenticated.
--
-- Comment note: the original email_dead_letter comment used a dash character that the owner's
-- style rule forbids, so it is written here with a colon. The meaning is unchanged.
--
-- Run order with the 20261018000001 rollbacks: rollback/20261018000001_*.down.sql refer to
-- sync_user_xp, which only exists again after this file has run.

SET search_path = public, pg_temp;

-- ---------------------------------------------------------------------------
-- 1. public.weekly_leaderboard_snapshots
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.weekly_leaderboard_snapshots (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start        date NOT NULL,
  user_id           uuid REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  days_studied      int NOT NULL DEFAULT 0,
  lessons_completed int NOT NULL DEFAULT 0,
  xp_earned         int NOT NULL DEFAULT 0,
  rank              int NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (week_start, user_id)
);

ALTER TABLE public.weekly_leaderboard_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view weekly snapshots" ON public.weekly_leaderboard_snapshots;
CREATE POLICY "Anyone can view weekly snapshots"
  ON public.weekly_leaderboard_snapshots FOR SELECT
  USING (true);

-- ---------------------------------------------------------------------------
-- 2. public.bookmarks
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.bookmarks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES public.users(id) ON DELETE CASCADE,
  lesson_id   text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bookmarks_user_lesson_unique UNIQUE (user_id, lesson_id),
  CONSTRAINT bookmarks_lesson_id_check CHECK (lesson_id LIKE 'les_%')
);

ALTER TABLE public.bookmarks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own bookmarks" ON public.bookmarks;
CREATE POLICY "Users manage own bookmarks"
  ON public.bookmarks FOR ALL
  USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 3. public.email_dead_letter
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.email_dead_letter (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  original_queue_id  uuid REFERENCES public.email_queue(id) ON DELETE CASCADE,
  user_id            uuid REFERENCES public.users(id) ON DELETE CASCADE,
  template_key       text NOT NULL,
  template_variables jsonb NOT NULL DEFAULT '{}'::jsonb,
  failure_reason     text,
  all_errors         jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.email_dead_letter ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.email_dead_letter IS 'service-role only by design: no policies intentional';

-- ---------------------------------------------------------------------------
-- 4. public.user_notification_timeline
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.user_notification_timeline (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  event_id          uuid REFERENCES public.notification_events(id) ON DELETE SET NULL,
  channel           text NOT NULL,
  template_key      text NOT NULL,
  template_version  int NOT NULL DEFAULT 1,
  status            text NOT NULL,
  priority          int NOT NULL DEFAULT 5,
  queued_at         timestamptz NOT NULL DEFAULT now(),
  sent_at           timestamptz,
  delivered_at      timestamptz,
  opened_at         timestamptz,
  clicked_at        timestamptz,
  failed_at         timestamptz,
  suppressed_at     timestamptz,
  error_details     text,
  resend_id         text,
  metadata          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- Added later by 20260915000001; kept as a separate statement so a table re-created by an older
-- script still ends up with the column.
ALTER TABLE public.user_notification_timeline
  ADD COLUMN IF NOT EXISTS retention_hold boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.user_notification_timeline.retention_hold IS
  'B9-D: when true this timeline row is exempt from automatic retention deletion at any age.';

CREATE INDEX IF NOT EXISTS idx_user_timeline_user
  ON public.user_notification_timeline (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_notification_timeline_retention
  ON public.user_notification_timeline (created_at)
  WHERE retention_hold = false;

ALTER TABLE public.user_notification_timeline ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own timeline" ON public.user_notification_timeline;
CREATE POLICY "Users can read own timeline"
  ON public.user_notification_timeline FOR SELECT
  USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 5. public.sync_user_xp(uuid): service role only
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sync_user_xp(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actual_xp int;
  v_calculated_level int;
BEGIN
  SELECT coalesce(sum(xp_amount), 0) INTO v_actual_xp
  FROM public.xp_events
  WHERE user_id = p_user_id;

  v_calculated_level := least(9, greatest(1, floor(v_actual_xp / 500) + 1));

  UPDATE public.users
  SET total_xp = v_actual_xp,
      level = v_calculated_level
  WHERE id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_user_xp(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_user_xp(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 6. Self-check
-- ---------------------------------------------------------------------------
-- REVOKE is silent when a grant made by another role survives, so check the result. Read-only.
DO $$
DECLARE
  v_role text;
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'public.weekly_leaderboard_snapshots',
    'public.bookmarks',
    'public.email_dead_letter',
    'public.user_notification_timeline'
  ] LOOP
    IF to_regclass(v_table) IS NULL THEN
      RAISE EXCEPTION '% was not re-created.', v_table;
    END IF;
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = to_regclass(v_table)) THEN
      RAISE EXCEPTION 'RLS is not enabled on %.', v_table;
    END IF;
  END LOOP;

  IF to_regprocedure('public.sync_user_xp(uuid)') IS NULL THEN
    RAISE EXCEPTION 'public.sync_user_xp(uuid) was not re-created.';
  END IF;

  FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF has_function_privilege(v_role, 'public.sync_user_xp(uuid)', 'EXECUTE') THEN
      RAISE EXCEPTION '% can EXECUTE public.sync_user_xp(uuid). Look up the grantor in information_schema.routine_privileges (also check PUBLIC) and revoke it as that role.', v_role;
    END IF;
  END LOOP;

  IF NOT has_function_privilege('service_role', 'public.sync_user_xp(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role cannot EXECUTE public.sync_user_xp(uuid).';
  END IF;
END $$;

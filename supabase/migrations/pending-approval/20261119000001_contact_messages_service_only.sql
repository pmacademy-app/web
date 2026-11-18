-- M2: learners and visitors cannot write public.contact_messages through PostgREST.
--
-- HELD IN pending-approval/. The Supabase CLI does not read this folder, so nothing here runs on
-- merge. The owner applies it by hand in the Supabase SQL editor.
--
-- Why: "Anyone can insert contact message" (20260810000002_create_contact_messages_table.sql:22-25)
-- is FOR INSERT TO public, so anyone holding the public anon key can insert rows straight into the
-- admin support inbox, skipping the /api/contact route's rate limit, validation and email
-- governance, and choosing any `status`, `source`, `user_id` or `admin_notes` value. Every writer
-- uses the service role, which bypasses RLS and needs no policy:
--   * app/api/contact/route.ts (web form, createServiceRoleClient)
--   * app/api/email/webhooks/route.ts (inbound email)
--   * app/api/admin/contact/route.ts and lib/admin/* (admin status updates)
--
-- This migration:
--   1. Drops the "Anyone can insert contact message" policy.
--   2. REVOKEs INSERT, UPDATE and DELETE from PUBLIC, anon and authenticated, and SELECT from
--      PUBLIC and anon (anon never matched a SELECT policy, so its SELECT was inert).
--   3. Keeps "Users can view own contact messages" (SELECT TO authenticated, own rows) and the
--      authenticated SELECT grant. No app code reads it with a learner token, but an own-row
--      read is harmless.
--
-- Idempotent: DROP POLICY IF EXISTS, REVOKE and the self-check can all be re-run. No data is
-- changed. Nothing here grants anything to anon or authenticated.
-- Rollback: rollback/20261119000001_contact_messages_service_only.down.sql (next to this file).
-- Validation: validation/20261119000001_contact_messages_service_only_validation.sql.

SET search_path = public, pg_temp;

DROP POLICY IF EXISTS "Anyone can insert contact message" ON public.contact_messages;

REVOKE INSERT, UPDATE, DELETE ON public.contact_messages FROM PUBLIC, anon, authenticated;
REVOKE SELECT ON public.contact_messages FROM PUBLIC, anon;

-- ---------------------------------------------------------------------------
-- Self-check
-- ---------------------------------------------------------------------------
-- REVOKE says nothing when a grant made by another role stays in place, and a column-level grant
-- made by a different grantor survives a table-level REVOKE. Check the result instead.
DO $$
DECLARE
  v_role text;
BEGIN
  -- 'public' is the PUBLIC pseudo-role in the privilege inquiry functions.
  FOREACH v_role IN ARRAY ARRAY['public', 'anon', 'authenticated'] LOOP
    IF has_table_privilege(v_role, 'public.contact_messages', 'INSERT, UPDATE, DELETE')
       OR has_any_column_privilege(v_role, 'public.contact_messages', 'INSERT, UPDATE') THEN
      RAISE EXCEPTION '% can still write public.contact_messages. Look up the grantor in information_schema.role_table_grants and column_privileges, run REVOKE as that role, then apply this migration again.', v_role;
    END IF;
  END LOOP;

  IF has_table_privilege('anon', 'public.contact_messages', 'SELECT') THEN
    RAISE EXCEPTION 'anon can still SELECT public.contact_messages.';
  END IF;

  IF NOT has_table_privilege('service_role', 'public.contact_messages', 'SELECT, INSERT, UPDATE') THEN
    RAISE EXCEPTION 'service_role cannot read and write public.contact_messages. /api/contact and the admin inbox need it.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'contact_messages'
       AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  ) THEN
    RAISE EXCEPTION 'A write policy is still present on public.contact_messages.';
  END IF;
END $$;

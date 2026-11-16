-- Post-Phase 3 cleanup: drop public.waitlist.
--
-- HELD IN pending-approval/. The Supabase CLI does not read this folder, so nothing here runs on
-- merge. The owner applies it by hand in the Supabase SQL editor once the steps below are done.
--
-- Why: the pre-launch waitlist is closed. No UI posts to it, and the /api/waitlist route was
-- removed on branch chore/post-phase3-cleanup. The table is the only thing left.
--
-- BEFORE APPLYING (owner):
--   1. Deploy the code that removes /api/waitlist first. Until then the old route can still insert.
--   2. EXPORT THE ROWS. They are personal data (names and email addresses). Run
--        SELECT * FROM public.waitlist ORDER BY created_at;
--      in the SQL editor and download the result as CSV, or use the Table Editor export. Keep the
--      file outside the repository, store it under the same rules as other user data, and delete it
--      when it is no longer needed. Never commit it.
--   3. Optional: record the row count (SELECT count(*) FROM public.waitlist;) so the export can be
--      checked against it.
--
-- This is destructive and the data cannot be recovered from the migration history:
-- rollback/20261112000001_drop_waitlist_table.down.sql re-creates the empty table only.
--
-- Afterwards run validation/20261112000001_drop_waitlist_table_validation.sql.
--
-- Idempotent: DROP TABLE IF EXISTS. No CASCADE: nothing is known to depend on the table, so if
-- something does, the drop fails loudly instead of taking that object with it.

SET search_path = public, pg_temp;

DROP TABLE IF EXISTS public.waitlist;

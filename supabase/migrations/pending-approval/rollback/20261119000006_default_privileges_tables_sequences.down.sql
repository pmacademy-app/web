-- Rollback for 20261119000006: default privileges for tables and sequences (L2).
--
-- Restores Supabase's legacy defaults for the postgres role in schema public: ALL on new tables
-- and sequences for anon and authenticated. Existing objects are not touched (the forward migration
-- did not touch them either).
--
-- Rolling back means every table created afterwards starts readable and writable by the anon key
-- until a migration revokes it, so only do this if a tool or migration that cannot be changed
-- depends on the old default. No data is changed. Re-runnable.

SET search_path = public, pg_temp;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated;

-- Rollback for 20261124000001: unused table privileges (TRUNCATE, REFERENCES, TRIGGER).
--
-- Gives anon and authenticated TRUNCATE, REFERENCES and TRIGGER on every table and view in schema
-- public again, as Supabase's legacy default did. This re-opens TRUNCATE, which ignores row level
-- security, so only use it if a tool that cannot be changed turns out to need one of these
-- privileges. No data is changed. Re-runnable.

SET search_path = public, pg_temp;

GRANT TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public TO anon, authenticated;

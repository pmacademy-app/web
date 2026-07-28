-- PM Academy — Waitlist Column Rename Alteration
-- Migration: 20260728000003_alter_waitlist_column.sql

SET search_path TO public, extensions, auth;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'waitlist' AND column_name = 'current_role'
  ) THEN
    ALTER TABLE waitlist RENAME COLUMN "current_role" TO "career_position";
  END IF;
END $$;

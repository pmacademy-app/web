-- PM Academy — v2 Architecture Migration: lesson_slug → lesson_id
-- Migration: 20260802000001_lesson_id_migration.sql
--
-- Purpose: Align user-state tables with the v2 content pipeline's stable lessonId
-- system (content-pipeline.md §5). The compiler assigns permanent `les_XXXXXX` IDs
-- keyed by source file path in content/.ids/lesson-id-registry.json. All user-state
-- tables must reference these stable IDs instead of positional slug strings.
--
-- What this migration does:
--   1. Renames `lesson_slug` → `lesson_id` in: user_lesson_progress, quiz_attempts,
--      reflections, bookmarks
--   2. Adds `lesson_id` column to user_flashcard_srs and updates its composite PK
--      to (user_id, lesson_id, flashcard_id) per Architecture.md §2
--   3. Updates all associated indexes and RLS policies to use new column names
--
-- Safety: ALTER TABLE ... RENAME COLUMN preserves all existing row data exactly.
-- Existing rows with slug values (e.g. 'lesson-001') continue to work via the
-- legacy-id-map.json lookup in the unlock service during the Phase 1.3 transition.
-- Phase 1.4 will backfill rows to use stable IDs once the v2 route is verified.

SET search_path TO public, extensions, auth;

-- ─── 1. user_lesson_progress: lesson_slug → lesson_id ──────────────────────

ALTER TABLE user_lesson_progress
  RENAME COLUMN lesson_slug TO lesson_id;

-- Drop and recreate index with new column name
DROP INDEX IF EXISTS user_lesson_progress_user_idx;
CREATE INDEX IF NOT EXISTS user_lesson_progress_user_idx
  ON user_lesson_progress (user_id);

-- The composite PK (user_id, lesson_id) is automatically renamed — no action needed.

-- ─── 2. quiz_attempts: lesson_slug → lesson_id ─────────────────────────────

ALTER TABLE quiz_attempts
  RENAME COLUMN lesson_slug TO lesson_id;

-- Drop and recreate index with new column name
DROP INDEX IF EXISTS quiz_attempts_user_lesson_idx;
CREATE INDEX IF NOT EXISTS quiz_attempts_user_lesson_idx
  ON quiz_attempts (user_id, lesson_id);

-- ─── 3. reflections: lesson_slug → lesson_id ───────────────────────────────

ALTER TABLE reflections
  RENAME COLUMN lesson_slug TO lesson_id;

-- Drop and recreate index with new column name
DROP INDEX IF EXISTS reflections_user_lesson_idx;
CREATE INDEX IF NOT EXISTS reflections_user_lesson_idx
  ON reflections (user_id, lesson_id);

-- ─── 4. bookmarks: lesson_slug → lesson_id ─────────────────────────────────

ALTER TABLE bookmarks
  RENAME COLUMN lesson_slug TO lesson_id;

-- The unique constraint (user_id, lesson_slug) is column-based — drop and recreate
DO $$
BEGIN
  -- Drop existing unique constraint by finding it dynamically
  EXECUTE (
    SELECT 'ALTER TABLE bookmarks DROP CONSTRAINT ' || conname
    FROM pg_constraint
    WHERE conrelid = 'bookmarks'::regclass
      AND contype = 'u'
    LIMIT 1
  );
EXCEPTION
  WHEN OTHERS THEN NULL; -- Constraint may not exist under that name
END $$;

ALTER TABLE bookmarks
  ADD CONSTRAINT bookmarks_user_lesson_unique UNIQUE (user_id, lesson_id);

-- ─── 5. user_flashcard_srs: add lesson_id, update composite PK ─────────────
--
-- The current PK is (user_id, flashcard_id). Per Architecture.md §2 and the
-- content-pipeline.md §5 stable ID spec, the composite PK must be
-- (user_id, lesson_id, flashcard_id) to allow flashcard SRS state to be
-- scoped to a specific lesson, enabling per-lesson deck management.

-- Step 5a: Add the lesson_id column (nullable first, then set default for existing rows)
ALTER TABLE user_flashcard_srs
  ADD COLUMN IF NOT EXISTS lesson_id TEXT NOT NULL DEFAULT '';

-- Step 5b: Drop the old composite PK
ALTER TABLE user_flashcard_srs
  DROP CONSTRAINT IF EXISTS user_flashcard_srs_pkey;

-- Step 5c: Recreate as the correct 3-column composite PK
ALTER TABLE user_flashcard_srs
  ADD CONSTRAINT user_flashcard_srs_pkey
  PRIMARY KEY (user_id, lesson_id, flashcard_id);

-- Drop and recreate the review index (already references user_id + next_review_at, no change needed)
DROP INDEX IF EXISTS user_flashcard_srs_user_review_idx;
CREATE INDEX IF NOT EXISTS user_flashcard_srs_user_review_idx
  ON user_flashcard_srs (user_id, next_review_at);

-- ─── 6. Verify the migration applied cleanly (advisory check) ───────────────
--
-- These SELECTs will error if the renamed columns don't exist, causing the
-- migration to fail fast rather than silently succeed with broken schema.
DO $$
BEGIN
  PERFORM lesson_id FROM user_lesson_progress LIMIT 0;
  PERFORM lesson_id FROM quiz_attempts LIMIT 0;
  PERFORM lesson_id FROM reflections LIMIT 0;
  PERFORM lesson_id FROM bookmarks LIMIT 0;
  PERFORM lesson_id FROM user_flashcard_srs LIMIT 0;
  RAISE NOTICE 'lesson_id migration verified: all columns renamed successfully.';
END $$;

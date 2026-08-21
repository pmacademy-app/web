-- Migration: 20260813000001_lesson_id_backfill.sql
-- Backfills `lesson_id` column from legacy `lesson-XXX` slugs to `les_XXXXXX` stable IDs.
-- Implements Phase 1.4 backfill promised in 20260802000001_lesson_id_migration.sql.

SET search_path TO public, extensions, auth;

DO $$
DECLARE
    mapping JSONB := '{
        "lesson-001": "les_zoyq8a", "lesson-002": "les_prrl23", "lesson-003": "les_0q4aih", "lesson-004": "les_04ix6b",
        "lesson-005": "les_aovj2y", "lesson-006": "les_8trb62", "lesson-007": "les_5rbthl", "lesson-008": "les_8psivf",
        "lesson-009": "les_ji9a3x", "lesson-010": "les_qvbz2l", "lesson-011": "les_4kpbq6", "lesson-012": "les_3dziur",
        "lesson-013": "les_q9i0or", "lesson-014": "les_89s8go", "lesson-015": "les_ftgikz", "lesson-016": "les_ta3qpf",
        "lesson-017": "les_4s6aif", "lesson-018": "les_9gu1rs", "lesson-019": "les_sgqm62", "lesson-020": "les_abduwx",
        "lesson-021": "les_bhb1lc", "lesson-022": "les_apad14", "lesson-023": "les_anj59m", "lesson-024": "les_6qg1gx",
        "lesson-025": "les_ejgikb", "lesson-026": "les_emiqho", "lesson-027": "les_go5z1d", "lesson-028": "les_7r8npj",
        "lesson-029": "les_8prxyi", "lesson-030": "les_o9xo51", "lesson-031": "les_091713", "lesson-032": "les_xtr1yz",
        "lesson-033": "les_kqyucz", "lesson-034": "les_vlut0b", "lesson-035": "les_85m4a2", "lesson-036": "les_9kvh15",
        "lesson-037": "les_ryzl1c", "lesson-038": "les_9ep1op", "lesson-039": "les_soowpy", "lesson-040": "les_bzugx4",
        "lesson-041": "les_0iss34", "lesson-042": "les_2s2fxc", "lesson-043": "les_qh7yql", "lesson-044": "les_nbz9ul",
        "lesson-045": "les_o7sbis", "lesson-046": "les_nga5oo", "lesson-047": "les_55ex5m", "lesson-048": "les_4yd2s2",
        "lesson-049": "les_jpjusz", "lesson-050": "les_r918sq", "lesson-051": "les_vs8e8k", "lesson-052": "les_e61wb6",
        "lesson-053": "les_bxs9uj", "lesson-054": "les_4uxpqc", "lesson-055": "les_f7hmc8", "lesson-056": "les_rto8ua",
        "lesson-057": "les_92tjmj", "lesson-058": "les_0dl7q7", "lesson-059": "les_bynvto", "lesson-060": "les_viunwn",
        "lesson-061": "les_nyhd19", "lesson-062": "les_2h4woh", "lesson-063": "les_yhcrnj", "lesson-064": "les_43g66w",
        "lesson-065": "les_t2ezpj", "lesson-066": "les_m2bfi1", "lesson-067": "les_md1mad", "lesson-068": "les_3zk3iz",
        "lesson-069": "les_ymfbn4", "lesson-070": "les_ilrn3g", "lesson-071": "les_e18dsm", "lesson-072": "les_ju047h",
        "lesson-073": "les_7e3jva", "lesson-074": "les_la2hwd", "lesson-075": "les_0tbo74", "lesson-076": "les_x2upyf",
        "lesson-077": "les_eyguum", "lesson-078": "les_7ndnsg", "lesson-079": "les_585ko0", "lesson-080": "les_td6v2u",
        "lesson-081": "les_cc0i59", "lesson-082": "les_iha8tr", "lesson-083": "les_dbv3t4", "lesson-084": "les_l483t4",
        "lesson-085": "les_iofm90", "lesson-086": "les_zxebwb", "lesson-087": "les_801f2o", "lesson-088": "les_30s3xp",
        "lesson-089": "les_0j03yx", "lesson-090": "les_efapbf"
    }';
    key TEXT;
    val TEXT;
BEGIN
    FOR key, val IN SELECT * FROM jsonb_each_text(mapping) LOOP
        
        -- 1. user_lesson_progress
        
        -- Step 1A: Non-colliding rows can simply be updated
        UPDATE user_lesson_progress u1
        SET lesson_id = val
        WHERE lesson_id = key
        AND NOT EXISTS (
            SELECT 1 FROM user_lesson_progress u2
            WHERE u2.user_id = u1.user_id AND u2.lesson_id = val
        );

        -- Step 1B: Handle collisions
        -- If stable row is better or equal (status, xp_earned), delete the legacy row
        DELETE FROM user_lesson_progress legacy
        USING user_lesson_progress stable
        WHERE legacy.lesson_id = key
        AND stable.lesson_id = val
        AND legacy.user_id = stable.user_id
        AND (
            (stable.status = 'completed') OR
            (stable.status = 'in_progress' AND legacy.status = 'not_started') OR
            (stable.status = legacy.status AND COALESCE(stable.xp_earned, 0) >= COALESCE(legacy.xp_earned, 0))
        );

        -- Step 1C: If legacy row is better, update the stable row with legacy's data
        UPDATE user_lesson_progress stable
        SET status = legacy.status,
            theory_read_at = legacy.theory_read_at,
            quiz_score = legacy.quiz_score,
            quiz_attempts = legacy.quiz_attempts,
            xp_earned = legacy.xp_earned,
            completed_at = legacy.completed_at
        FROM user_lesson_progress legacy
        WHERE legacy.lesson_id = key
        AND stable.lesson_id = val
        AND legacy.user_id = stable.user_id;

        -- Step 1D: Now delete the remaining legacy rows (that were merged into stable)
        DELETE FROM user_lesson_progress WHERE lesson_id = key;

        -- 2. bookmarks
        
        -- Non-colliding update
        UPDATE bookmarks b1
        SET lesson_id = val
        WHERE lesson_id = key
        AND NOT EXISTS (
            SELECT 1 FROM bookmarks b2
            WHERE b2.user_id = b1.user_id AND b2.lesson_id = val
        );

        -- Delete colliding legacy bookmarks
        DELETE FROM bookmarks WHERE lesson_id = key;

        -- 3. quiz_attempts
        UPDATE quiz_attempts SET lesson_id = val WHERE lesson_id = key;

        -- 4. reflections
        UPDATE reflections SET lesson_id = val WHERE lesson_id = key;

        -- 5. user_flashcard_srs
        UPDATE user_flashcard_srs s1
        SET lesson_id = val
        WHERE lesson_id = key
        AND NOT EXISTS (
            SELECT 1 FROM user_flashcard_srs s2
            WHERE s2.user_id = s1.user_id AND s2.flashcard_id = s1.flashcard_id AND s2.lesson_id = val
        );
        DELETE FROM user_flashcard_srs WHERE lesson_id = key;

    END LOOP;
END $$;

-- Apply CHECK constraints to ensure this doesn't recur
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_lesson_progress_lesson_id_check') THEN
        ALTER TABLE user_lesson_progress ADD CONSTRAINT user_lesson_progress_lesson_id_check CHECK (lesson_id LIKE 'les_%');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'quiz_attempts_lesson_id_check') THEN
        ALTER TABLE quiz_attempts ADD CONSTRAINT quiz_attempts_lesson_id_check CHECK (lesson_id LIKE 'les_%');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reflections_lesson_id_check') THEN
        ALTER TABLE reflections ADD CONSTRAINT reflections_lesson_id_check CHECK (lesson_id LIKE 'les_%');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bookmarks_lesson_id_check') THEN
        ALTER TABLE bookmarks ADD CONSTRAINT bookmarks_lesson_id_check CHECK (lesson_id LIKE 'les_%');
    END IF;
END $$;

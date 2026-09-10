-- ============================================================================
-- Batch B6: Queue & Scheduler Reliability
-- 
-- 1. Atomic stale processing item reclamation RPC:
--    Reclaims orphaned or stuck 'processing' rows whose worker lease expired
--    (default: > 15 minutes / 900 seconds).
--    - Items with attempt_count >= max_attempts are transitioned to 'dead_letter'
--    - Items with attempt_count < max_attempts are transitioned to 'retrying'
--      with a randomized jittered next_retry_at (0..30s) and processing_at cleared.
--
-- 2. Partial indexes for queue performance:
--    - idx_email_queue_processing_stale on (processing_at) WHERE status = 'processing'
--    - idx_email_queue_claim_lookup on (status, priority, scheduled_at) WHERE status IN ('pending', 'retrying')
-- ============================================================================

-- 1. Atomic Stale Processing Item Reclamation Function
CREATE OR REPLACE FUNCTION public.reclaim_stale_processing_items(
  p_stale_interval_seconds int DEFAULT 900,
  p_max_reclaim int DEFAULT 50
)
RETURNS TABLE (
  id uuid,
  old_status text,
  new_status text,
  attempt_count int,
  max_attempts int
) AS $$
BEGIN
  RETURN QUERY
  WITH stale_rows AS (
    SELECT q.id, q.status, q.attempt_count, q.max_attempts
    FROM public.email_queue q
    WHERE q.status = 'processing'
      AND q.processing_at IS NOT NULL
      AND q.processing_at <= NOW() - (p_stale_interval_seconds || ' seconds')::interval
    ORDER BY q.processing_at ASC
    LIMIT p_max_reclaim
    FOR UPDATE SKIP LOCKED
  ),
  reclaimed AS (
    UPDATE public.email_queue q
    SET status = CASE
          WHEN q.attempt_count >= q.max_attempts THEN 'dead_letter'
          ELSE 'retrying'
        END,
        error_message = CASE
          WHEN q.attempt_count >= q.max_attempts THEN 'Processing lease expired: max attempts reached'
          ELSE 'Processing lease expired: reclaimed for retry'
        END,
        failed_at = CASE
          WHEN q.attempt_count >= q.max_attempts THEN NOW()
          ELSE q.failed_at
        END,
        next_retry_at = CASE
          WHEN q.attempt_count >= q.max_attempts THEN NULL
          ELSE NOW() + (random() * 30 || ' seconds')::interval
        END,
        processing_at = NULL,
        updated_at = NOW()
    FROM stale_rows
    WHERE q.id = stale_rows.id
    RETURNING q.id, stale_rows.status AS prev_status, q.status AS curr_status, q.attempt_count, q.max_attempts
  )
  SELECT r.id, r.prev_status, r.curr_status, r.attempt_count, r.max_attempts
  FROM reclaimed r;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Security & privilege hardening for reclaim function
ALTER FUNCTION public.reclaim_stale_processing_items(int, int) SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION public.reclaim_stale_processing_items(int, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reclaim_stale_processing_items(int, int) TO service_role, postgres;
COMMENT ON FUNCTION public.reclaim_stale_processing_items(int, int) IS
  'B6: Atomically reclaims orphaned or stuck email queue rows whose worker processing lease has expired.';

-- 2. Performance indexes
-- Fast lookup for stale processing items during reclamation passes
CREATE INDEX IF NOT EXISTS idx_email_queue_processing_stale
  ON public.email_queue (processing_at)
  WHERE status = 'processing';

-- Fast composite index for queue claiming queries
CREATE INDEX IF NOT EXISTS idx_email_queue_claim_lookup
  ON public.email_queue (status, priority, scheduled_at)
  WHERE status IN ('pending', 'retrying');

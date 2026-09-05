-- Migration: 20260905000001_create_fellow_requests.sql
-- PM Fellow Request workflow: lets eligible learners request Fellow status while
-- keeping final approval under admin control (existing is_fellow toggle is reused
-- on approval — this table only tracks the request/review state machine).

SET search_path TO public, extensions, auth;

CREATE TABLE IF NOT EXISTS public.fellow_requests (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status            text        NOT NULL DEFAULT 'pending'
                                 CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_at      timestamptz NOT NULL DEFAULT now(),
  reviewed_by       uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_at       timestamptz,
  rejection_reason  text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- A user may have at most one ACTIVE (pending) request at a time — enforced at the
-- database level so a race between two rapid submissions cannot create duplicates.
CREATE UNIQUE INDEX IF NOT EXISTS idx_fellow_requests_one_pending_per_user
  ON public.fellow_requests (user_id)
  WHERE status = 'pending';

-- Efficient lookup of a user's latest request (used to derive their current state).
CREATE INDEX IF NOT EXISTS idx_fellow_requests_user_requested_at
  ON public.fellow_requests (user_id, requested_at DESC);

-- Efficient admin queue lookup by status.
CREATE INDEX IF NOT EXISTS idx_fellow_requests_status
  ON public.fellow_requests (status, requested_at DESC);

ALTER TABLE public.fellow_requests ENABLE ROW LEVEL SECURITY;

-- Users can view their own requests.
CREATE POLICY "Users can view own fellow requests"
  ON public.fellow_requests FOR SELECT
  USING (auth.uid() = user_id);

-- Users can submit their own requests (server-side eligibility check happens in the API route).
CREATE POLICY "Users can submit own fellow requests"
  ON public.fellow_requests FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Service role (admin API routes) has full access for review/approval.
CREATE POLICY "Service role has full access to fellow_requests"
  ON public.fellow_requests
  FOR ALL
  USING (true)
  WITH CHECK (true);

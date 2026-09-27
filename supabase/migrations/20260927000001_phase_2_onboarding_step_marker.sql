-- Migration: Phase 2 — onboarding step marker for per-step funnel drop-off
--
-- IMPLEMENTATION_PLAN.md §"Phase 2 — Make the funnel visible", item 3 identifies the
-- one genuinely new instrumentation this phase adds: the onboarding wizard is a
-- four-step client component that writes only the final `onboarding_completed` flag,
-- so its intermediate steps leave no server trace. Phase 5 (E3) needs per-step
-- drop-off to know which step to cut; Phase 2 makes it measurable.
--
-- `onboarding_step_reached` records the furthest wizard step a learner advanced to
-- (1..4). It is written monotonically by the wizard as the learner progresses.
--
-- Deliberately NULLABLE with no backfill and no default. A NULL means the account
-- predates this instrumentation (created before 2026-09-27) — it is NOT a drop-off
-- and MUST be excluded from step-level analysis, never counted at step 0. The funnel
-- aggregation (`lib/admin/funnel-aggregation.ts:computeOnboardingStepFunnel`) enforces
-- this: it reports pre-instrumentation accounts as a separate excluded count. See
-- IMPLEMENTATION_PLAN.md §7 risk R15.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS onboarding_step_reached smallint;

COMMENT ON COLUMN public.users.onboarding_step_reached IS
'Furthest onboarding-wizard step (1-4) the learner reached, written monotonically by the wizard. NULL = account predates Phase 2 step instrumentation (2026-09-27); such accounts are EXCLUDED from per-step drop-off analysis, never counted as a step-0 drop-off. Additive, no backfill.';

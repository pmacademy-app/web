# ADR-009 — Phase 7: Make the Payoff Visible (capstone visibility, threshold experiment, review expectation, IA consolidation)

- **Status:** Accepted (threshold experiment-gated; flag defaults to control)
- **Date:** 2026-09-30
- **Phase:** 7 — "Make the payoff visible"
- **Builds on:** [ADR-008](ADR-008-phase-6-module-entry-unlock.md) (Phase 6). Lesson access and capstone eligibility remain **separate concerns**; nothing here makes a capstone submittable because a lesson is openable.

## Context

Capstones are Prodily's strongest differentiator against free PM content — nine fully-specified deliverables with scenarios, requirements and starter templates in `config/capstones.ts` — yet a learner met one only after completing ~8 of 10 module lessons. They were, in the blueprint's words, "an unreachable rumour." Phase 7 makes the capstone → portfolio → certificate payoff a **visible destination from the first session**, tests whether earlier *eligibility* increases artifact production, sets an honest expectation for what happens after submission, and removes the duplicate product surface deferred from earlier phases.

### Source-document divergence (important)

The two source docs disagreed on Phase 7's scope, and this ADR records how it was resolved. (Both source files — the implementation plan and the product-improvement blueprint — were retired on 2026-10-01; their durable content now lives in [`../PHASE_HISTORY.md`](../PHASE_HISTORY.md). The quotes below are preserved verbatim as the record of the divergence.)

- **The implementation plan (authoritative), Phase 7** listed: 7.1 surface the capstone, 7.2 **review SLA**, 7.3 removals (`dueCount`, dead nav), 7.4 fix the feedback instrument. Its Definition-of-Done said *"submission gating unchanged (still 8 of 10)."* It contained **no** threshold experiment.
- **The blueprint, §7.2 ("Reconsider the 8-of-10 threshold")** explicitly called for an experiment: *"Test a lower threshold (e.g. 4 lessons) for one module with a cohort."*

The Phase 7 task combines both: surface the capstone (7.1), **run the threshold experiment** (blueprint 7.2), make the review expectation explicit (plan 7.2), and consolidate surface (plan 7.3 / blueprint 7.4). We implemented all four. The threshold experiment therefore ships **defaulting to control (8 of 10)** — the plan's authoritative behaviour is the baseline, and the experiment is an opt-in overlay. **This divergence needs a product owner's sign-off before the flag is enabled in production** (see Risks).

## Decision

### 7.1 — Surface the capstone from lesson 1 (visibility ≠ eligibility)

A new lightweight, contextual component, `LessonCapstonePreview` (`components/capstones/LessonCapstonePreview.tsx`), renders inside the lesson experience (next to the existing feedback widget in `lesson-content.tsx`). It shows the module's real capstone — deliverable type, title, why it matters, progress toward eligibility, and what remains — and links to the capstone page. The locked capstone workspace page (`/capstones/[module]`) was also changed from a bare lock wall into an honest **preview** (scenario, requirements, progress bar), and the `CapstoneCard` locked state now shows progress.

**Visibility is strictly separate from eligibility.** These surfaces only *show* the destination; none exposes a submit or draft control. All progress values are **server-derived** and display-only. Submission stays gated server-side (below), so surfacing the capstone earlier cannot grant access.

### 7.2 — Capstone eligibility threshold experiment

- **Control (default):** 8 of 10 module lessons completed → eligible. Byte-for-byte the pre-Phase-7 gate.
- **Treatment:** **4** of 10 module lessons completed → eligible. The value comes from the blueprint's "e.g. 4 lessons"; `4` is the default and the task's stated example. Configurable via `CAPSTONE_THRESHOLD_TREATMENT_LESSONS`, clamped to `[1, 8]` (a value above control is refused, since it would *reduce* access).

**Mechanism** (`lib/capstone-threshold-experiment.ts`) mirrors the proven Phase 4 recut / Phase 6 module-entry pattern — no general experiment platform exists, and the plan calls for the smallest phase-specific mechanism:

- **Flag:** `CAPSTONE_THRESHOLD_EXPERIMENT_ENABLED` (env), **defaults to control (off).** Enabling it is the whole rollout; disabling it is the whole rollback — no code deploy.
- **Cohort:** new signups only, via `CAPSTONE_THRESHOLD_COHORT_START` (ISO date). Learners created before it are always control. Derived from `users.created_at` — **no new state.**
- **Assignment:** deterministic SHA-256 bucket of `users.id` (`"capstone_threshold:<id>"`, independent of the recut and module-entry buckets), split by `CAPSTONE_THRESHOLD_TREATMENT_PCT` (default 100 within the cohort). The server reconstructs the same variant everywhere; nothing is persisted.

**Eligibility enforcement is server-side and single-sourced.** `resolveCapstoneThreshold(supabase, userId)` (`lib/capstones-db.ts`) resolves the gate for a learner and is the one place the threshold is decided. It is consumed by `getModuleCapstonesOverview`, `loadCapstoneSubmission`, and — authoritatively — the `saveDraftAction` / `submitCapstoneAction` gates. `deriveCapstoneStatus` takes the resolved threshold (default 8, so every existing caller/test is unchanged). A direct API request from an ineligible learner is rejected with `CAPSTONE_LOCKED` regardless of any client state. When the flag is off, `resolveCapstoneThreshold` short-circuits to control **without issuing any query**, so baseline behaviour and existing tests are untouched; any read failure **fails closed to control**.

**Safety:** the treatment threshold is strictly *lower* than control, so a treated learner is only ever eligible **earlier**, never later. No learner — treatment or control — loses access they had; existing capstone progress and submissions are untouched (the gate guards only *new* draft/submission creation). XP, lesson completion, badges and streak semantics are unchanged.

### 7.3 — Review expectation (honest, not a fabricated SLA)

Capstone review is manual admin work with no staffed, guaranteed turnaround, and `capstone_submissions` has no reviewer-assignment or due-by machinery. Per the plan's instruction — *"If no real SLA can be guaranteed … do not invent a promise; make the UI expectation explicit and honest"* — we **do not invent an SLA**. A centralized constant, `CAPSTONE_REVIEW_EXPECTATION` (`lib/capstones.ts`), states that submission itself is complete and valuable (saved to portfolio, XP awarded immediately) and that review is **manual and best-effort with no guaranteed window**. It is shown in the submission confirmation modal and the post-submission workspace card. Centralizing it means a real SLA, if the business later commits to one, is a one-line change.

### 7.4 — Removals / consolidation

- **Duplicate routes.** `/badges` vs `/progress/badges` and `/capstones` vs `/progress/capstones` were genuine duplicates. **Canonical = the top-level `/badges` and `/capstones`**, because they are the richer surfaces, the primary-nav entries, and — decisively for capstones — the `/capstones/[module]` editor already lives beneath `/capstones`, so redirecting the parent away would be incoherent. `/progress/badges` and `/progress/capstones` now issue **`permanentRedirect` (HTTP 308)** to the canonical routes, preserving existing bookmarks/deep links, and are removed from the Progress submenu in `Sidebar.tsx`. (This differs from the plan's framing of "completing vansh_dec's migration into `/progress`"; the hard constraints — canonical by architecture/links, preserve deep links, delete no functionality — pointed the other way. Recorded as a deliberate deviation.)
- **"Explore Prodily" CTA.** Already resolved in Phase 3/6 — onboarding's primary CTA routes to the recommended lesson (`/dashboard` fallback) and the secondary is "Explore Curriculum" → `/academy`. No dead-end dashboard remains; no change needed.
- **Feedback instrument.** Added a **length dimension** (`too_long`, an issue tag) and a **one-question churn survey** (`length_would_churn` / `length_would_not_churn`, deliberately *not* issue tags so they never pollute the clarity/needs-review metric) to `LessonFeedbackWidget` and the service whitelist. Stored in the existing `tags` array — **additive, no schema migration, existing rows stay valid.**
- **Hardcoded `dueCount: 5`.** The cron daily-reminder path already used the real SRS count (Phase 1.6). The remaining offender — the admin `run-now` daily-reminder path — now computes `getDueCardsCount` per user and suppresses the send at zero, mirroring the cron. (The value in `lib/admin/template-variables.ts` is an explicit preview *sample* for the template editor, not reminder messaging, and is left as documentation.)

## Measurement (Phase 2 funnel, server-side; not GA4)

Because assignment is deterministic from `users.id` + `created_at`, cohorts are reconstructable with no persisted assignment and no new event stream. `computeCapstoneThresholdExperimentSummary` (`lib/admin/capstone-threshold-experiment.ts`) segments per-learner rows — assembled from `capstone_submissions` + `user_lesson_progress` + `users.created_at` — by variant and computes, per arm: eligibility rate, capstone-1 start rate, **capstone-1 submission rate (primary)**, capstone-1 review-completion rate, any-capstone submission rate, and mean lessons completed at D30 (retention proxy). Like the Phase 6 aggregator, it is a pure function ready for offline/admin analysis — **no new analytics platform**. The one signal not derivable from existing rows is a capstone visibility *impression* (the preview renders inline and leaves no row); it is proxied by the eligible population / lesson-1 reach and intentionally not shipped as a new event stream.

## Rollback

- **Threshold experiment:** set `CAPSTONE_THRESHOLD_EXPERIMENT_ENABLED=false` (or unset). Everyone reverts to 8-of-10 instantly, no deploy. Because treatment only ever *lowered* the bar, rollback cannot revoke a submission a learner already made; a treated learner mid-way (4–7 lessons, no submission) simply sees the capstone locked again until 8 — no data loss.
- **Visibility (7.1), review copy (7.3), feedback tags & IA redirects (7.4):** plain reverts. The feedback tags are additive and nullable-safe; no migration to unwind. The redirects are page-level; removing them restores the old routes.

## Consequences

- The capstone payoff is visible and legible from lesson 1, with accurate progress, without unlocking submission.
- Submission eligibility is server-enforced from one resolver; UI and server cannot drift.
- The review expectation is honest — no promise the operation cannot keep.
- One canonical home per concept for badges and capstones; deep links preserved via 308s.
- The feedback instrument can finally detect "too long" and length-driven churn.
- No schema migration; no new tables, columns, or event streams.

## Risks / open decisions

- **Plan vs blueprint divergence (needs product sign-off).** The authoritative plan says keep 8-of-10; the blueprint asks for the experiment. The experiment ships **off by default**, so the shipped baseline matches the plan. Turning the flag on is a product decision.
- **Lowering the threshold trades artifact *volume* for artifact depth/quality** — a 4-lesson learner has seen less of the module. The measurement captures submission and retention by arm so the trade-off is observable; guardrail: no increase in blocked-submission errors, and watch review load.
- **Review SLA is an operational decision.** The honest "best-effort" copy is correct today; if the team commits to a real turnaround, update `CAPSTONE_REVIEW_EXPECTATION`.

## Alternatives considered

- **Change 8 → 4 globally** — rejected; the blueprint calls for an experiment, and a global change would both contradict the plan and remove the ability to measure the trade-off.
- **Persist a cohort/threshold column** — rejected; deterministically derivable from `users.id` + `created_at`, so it would be redundant state (same reasoning as ADR-008).
- **Add a `feedback.churn` column** — rejected in favour of additive tags; the plan permits an additive column but tags require zero migration and carry zero data-loss risk, which the validation gate weighs heavily.
- **Make `/progress/*` canonical** — rejected; would redirect the richer surface to the thinner one and orphan the `/capstones/[module]` editor beneath a redirected parent.

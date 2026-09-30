# Phase 8 — Proposal & Specification (draft, not started)

**Date:** 2026-09-30
**Author:** prepared after Phase 7 implementation (branch `prodily-phase-7-payoff`)
**Status:** PROPOSED — not implemented, not scheduled. This is a specification to be turned into an implementation prompt later.
**Companion docs:** [`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md), [`PRODUCT_IMPROVEMENT_BLUEPRINT.md`](PRODUCT_IMPROVEMENT_BLUEPRINT.md), [`PRODUCT_AUDIT_2026-09-24.md`](PRODUCT_AUDIT_2026-09-24.md), [`decisions/ADR-009-phase-7-make-payoff-visible.md`](decisions/ADR-009-phase-7-make-payoff-visible.md)

---

## 0. Naming reconciliation (read first)

`IMPLEMENTATION_PLAN.md` **already defines a "Phase 8 — Reduce auth friction (Google OAuth)"**, but it is **CONDITIONAL**: its own entry gate forbids starting it until Phase 2 funnel data (from a *deployed* build) shows signup→verified is a >25% drop, plus a security review. **That data does not exist yet** — nothing from Phases 6–7 is deployed, and no experiment has been read. So OAuth is not startable today by its own rule.

This proposal therefore keeps OAuth as the **conditional** track (renumbered **Phase 9** below to avoid confusion) and proposes a **new Phase 8** that is startable now, is pure "connect existing value," and — usefully — **produces exactly the funnel/abuse data that OAuth's gate requires.** Phase 8 unblocks the decision about Phase 9.

---

## 1. The core problem Phase 8 solves

Phases 4, 6 and 7 each shipped a **cohort experiment** (recut, module-entry unlock, capstone threshold) and each is **flag-off, undeployed, and unreadable**:

- **Recut (Phase 4):** assignment only (`lib/academy/experiment.ts`). **No measurement aggregator at all.**
- **Module-entry (Phase 6):** a pure aggregator (`lib/admin/module-entry-experiment.ts`) exists but **is wired to nothing** — no row-assembly query, no admin surface.
- **Capstone threshold (Phase 7):** a pure aggregator (`lib/admin/capstone-threshold-experiment.ts`) exists but **is wired to nothing** either.

The plan's thesis is "the team can see all of it in one server-side funnel." That is half-built: the Phase 2 activation funnel is live (`/admin/(console)/analytics/funnel`, `FunnelService`), but the **per-experiment control-vs-treatment readouts are orphaned pure functions.** Consequence: **none of the last three experiments can be concluded**, so the ship/kill decisions they were built to inform (recut, unlock, 8→4 threshold) cannot be made, and OAuth's data gate cannot be evaluated.

Phase 7 also **exposed** a second gap. It made capstones visible and (under treatment) easier to reach, which raises submission volume — but the review pipeline is still: manual approve/reject, **no `reviewed_at` timestamp**, **no `capstone.reviewed` learner notification** (only `capstone.submitted` exists), and no aging/prioritization. The honest "review is best-effort" copy Phase 7 added is truthful precisely because the loop does not close.

**Phase 8 = read the results, then close the loop.** Both halves connect capabilities that already exist rather than building new product surface.

---

## 2. Prioritized Phase 8 roadmap

| # | Item | Type | Effort | Schema | Why now |
|---|------|------|--------|--------|---------|
| **8.1** | **Experiment readout surface** — wire all three experiment aggregators into the admin funnel with row-assembly queries | Permanent (internal tooling) | S–M | None | Without it, Phases 4/6/7 are unconcludable; it also generates OAuth's gate data |
| **8.2** | **Close the capstone review loop** — `reviewed_at` timestamp, `capstone.reviewed` learner notification, admin review aging | Permanent | S–M | One additive nullable column | Phase 7 raises submission volume at the product's best moment; the loop must close |
| **8.3** | **(Conditional) evaluate & possibly commit a capstone review SLA** | Permanent copy change | XS | None | Only once 8.2 makes turnaround measurable |
| **Phase 9 (deferred)** | **Google OAuth** — the plan's original conditional Phase 8 | New integration | M | None | Blocked on its entry gate; 8.1 provides the data to evaluate it |

Recommended Phase 8 scope: **8.1 + 8.2 (+ 8.3 as a fast follow when data exists).** OAuth stays out of Phase 8.

---

## 3. Item detail

### 8.1 — Experiment readout surface (PRIMARY)

1. **Problem.** The recut, module-entry, and capstone-threshold experiments cannot be read. Two aggregators are orphaned; the recut has none. No control-vs-treatment number is visible anywhere, so no experiment can be concluded and no ship/kill decision can be made.
2. **Evidence.** `lib/admin/module-entry-experiment.ts` and `lib/admin/capstone-threshold-experiment.ts` are pure functions referenced only by their tests; `lib/academy/experiment.ts` (recut) has no aggregator; the live admin funnel (`FunnelService` → `/admin/(console)/analytics/funnel`) covers the global activation funnel but not experiment arms. Plan §5 ("Data & Measurement") and every phase's "Success metrics / Experiment design" assume a readable comparison that does not yet exist.
3. **Proposed solution.** Add an `ExperimentReadoutService` (mirroring `FunnelService`) that assembles **one row per learner** from existing tables (`users.created_at`, `user_lesson_progress`, `capstone_submissions`, `xp_events`, `quiz_attempts`) and calls the existing aggregators; add a recut aggregator to match the other two; render all three on a new admin analytics page (`/admin/(console)/analytics/experiments`) reusing the funnel page pattern and `revalidate = 0`. Segment by the **deterministic** variant so no assignment state is needed.
4. **Why after Phase 7.** All three experiments now exist; this is the first moment all of them are present to read together, and it is a prerequisite to concluding any of them.
5. **Impact.** The team can finally decide: keep/kill the recut, the module-entry unlock, and the 8→4 threshold; and read signup→verified loss (OAuth's gate).
6. **Measurement.** The surface *is* the measurement. Acceptance = each experiment shows n, primary metric, and guardrails per arm, reproducing the aggregators' outputs on real rows.
7. **Risks/tradeoffs.** Aggregation query cost on large tables — bounded by admin-only access, cohort-window filters, and `revalidate = 0` caching; assemble rows in one grouped query, not per-learner. No learner-facing change.
8. **Schema/DB.** **None** — everything derives from existing tables (the deliberate design of all three aggregators).
9. **Experiment or permanent.** **Permanent** internal tooling.

### 8.2 — Close the capstone review loop (SECONDARY; exposed by Phase 7)

1. **Problem.** Submitting a capstone is the product's best moment, but after submission nothing reaches the learner: no notification when it is reviewed, no way to measure or manage turnaround. Phase 7 increases submission volume and visibility, so the gap gets worse exactly where it hurts most.
2. **Evidence.** `capstone_submissions` has no `reviewed_at`/`reviewer` column (schema: content, id, is_public, module_slug, status, submitted_at, user_id); `ModerationService.reviewCapstone` sets `status: 'reviewed'` with **no timestamp**; the notification catalog has `capstone.submitted` but **no `capstone.reviewed`**; blueprint §7.3 and plan §7.2 both flag manual review with no turnaround; ADR-009 (7.3) ships an honest "best-effort" message *because* the loop is open.
3. **Proposed solution.** (a) Additive nullable `reviewed_at timestamptz` (and optionally `reviewed_by uuid`) on `capstone_submissions`, set by `reviewCapstone`. (b) A `capstone.reviewed` notification (in-app + email, reusing the existing dispatcher/templates and the `portfolio` category) to the learner on approve/reject, with tone-appropriate copy for each. (c) Admin `CapstonesView`: show pending submissions **oldest-first with days-waiting**, so "best-effort" is actually managed.
4. **Why after Phase 7.** Closing the loop is only worth it once submissions actually arrive; Phase 7 (visibility + optional lower threshold) is what makes them arrive, and 8.1 quantifies the volume.
5. **Impact.** Removes the "I submitted my best work and now nothing happens" failure; likely lifts return-after-submission and portfolio publication; makes the review promise honest *and* kept.
6. **Measurement.** Median/95p review turnaround (now measurable via `reviewed_at`); % reviewed within N days; learner return within 7 days of a `capstone.reviewed` notification (via existing notification + progress tables).
7. **Risks/tradeoffs.** Extra notification volume (bounded by submission count); reject-path copy must be constructive; backfill not needed (old rows keep `reviewed_at = null`).
8. **Schema/DB.** **Yes — one additive, nullable column** (`reviewed_at`, optional `reviewed_by`). Additive, no backfill; existing rows stay valid. Follows the plan's "additive, nullable, no backfill" rule.
9. **Experiment or permanent.** **Permanent.**

### 8.3 — Commit a real review SLA (conditional fast-follow)

Once 8.2 has ~2–4 weeks of `reviewed_at` data, decide whether the operation can commit to a concrete turnaround (e.g. "reviewed within 5 business days"). If yes, replace the honest "best-effort" wording in `CAPSTONE_REVIEW_EXPECTATION` (one constant) with the committed window and add an aging alert for submissions approaching it. If no, keep the honest copy. **Data-driven; no guess.** No schema change.

### Phase 9 (deferred) — Google OAuth

The plan's original Phase 8. **Keep it conditional and out of Phase 8.** Its entry gate (signup→verified >25% loss on a deployed funnel + security review of the 2026-09 signup-abuse incidents + Phases 3–6 shipped) is not yet satisfiable because nothing is deployed and the funnel-by-arm data does not exist. **8.1 produces that data.** Revisit OAuth only after 8.1 is live and the gate is verified. No scope change to the plan's existing Phase 8 spec (§Phase 8 of the plan) — it is simply renumbered and gated.

---

## 4. Explicitly out of scope for Phase 8

To honor the "connect existing value, don't build unnecessary features" principle:

- No new learner-facing feature surfaces (no new gamification, social, or content systems).
- No change to Phase 6 or Phase 7 behavior (unlock rule, threshold experiment, capstone gating, feedback widget, redirects).
- No relaxation of verification/Turnstile/rate-limiting (that is Phase 9/OAuth, gated).
- No new analytics platform — reuse the Phase 2 server-side funnel substrate.

---

## 5. Implementation-ready spec summary (for a future Claude Code prompt)

> **Phase 8 — Close the measurement & review loops.** Branch `prodily-phase-8-close-the-loop` from Phase 7 HEAD.
>
> **8.1 Experiment readouts.** Add `lib/admin/recut-experiment.ts` (aggregator mirroring the other two). Add `lib/admin/experiment-readout-service.ts` that assembles per-learner rows in single grouped queries from `users`, `user_lesson_progress`, `capstone_submissions`, `quiz_attempts`, `xp_events` and returns the three experiment summaries. Add admin page `app/admin/(console)/analytics/experiments/page.tsx` + a view component, reusing the funnel page pattern (`revalidate = 0`, admin-gated). Tests: aggregator determinism, row-assembly correctness on fixtures, arm segmentation matches the assignment functions. No schema change.
>
> **8.2 Capstone review loop.** Migration: additive nullable `reviewed_at timestamptz` (+ optional `reviewed_by uuid`) on `capstone_submissions` (no backfill). Set it in `ModerationService.reviewCapstone`. Add `capstone.reviewed` to the notification event catalog + connectors + in-app service + an email template; dispatch on approve/reject with distinct copy. Update `CapstonesView` to sort pending oldest-first with days-waiting. Tests: timestamp set on review, notification dispatched once per review (idempotent), aging sort, existing capstone-integrity + notification suites unchanged.
>
> **8.3 (fast-follow, data-gated).** After turnaround data exists, optionally commit an SLA in `CAPSTONE_REVIEW_EXPECTATION` + aging alert.
>
> **Guardrails:** no change to Phase 6/7 behavior; no new learner feature surface; additive schema only; full CI (typecheck, lint, tests, build) green; ADR-010 documenting the review-loop schema change.

---

## 6. Remaining roadmap gaps after Phase 7 (verified against the codebase)

**Unresolved / open:**

1. **Deployment & experiment runs.** Phases 6 and 7 are implemented, flag-off, **not deployed**; neither cohort experiment has been run, so their hypotheses (unlock → more D30 learning; 8→4 → more artifacts) are **unvalidated**. (Verified: flags default off; branches undeployed.)
2. **Experiment readouts missing** (→ Phase 8.1). Recut has no aggregator; module-entry and capstone-threshold aggregators are unwired. (Verified.)
3. **Capstone review loop open** (→ Phase 8.2). No `reviewed_at`, no `capstone.reviewed` notification, no aging. (Verified.)
4. **OAuth (plan Phase 8) not startable** — data gate unmet until a deployed funnel exists. (Verified: gate text in plan §Phase 8.)
5. **`ActivationFunnelView` label "Requires 8 of 10"** is a static control-baseline descriptor; under a live threshold treatment it would understate eligibility for treated users. Minor; only matters if the Phase 7 flag is enabled. (Verified in `components/admin/ActivationFunnelView.tsx`.)
6. **`lib/admin/template-variables.ts` `dueCount: 5`** remains as an explicit preview *sample* for the template editor (not reminder messaging). Intentional; noted for completeness. (Verified.)

**Confirmed resolved (do not re-open):**

- Phase 7.1 capstone visibility, 7.2 threshold experiment (flag-off), 7.3 honest review expectation, 7.4 route consolidation + feedback length/churn tags + admin reminder `dueCount` — all implemented and tested on `prodily-phase-7-payoff`.
- "Explore Prodily" dead-end — resolved in Phase 3/6 (onboarding CTAs swapped; secondary is "Explore Curriculum" → `/academy`).
- Cron daily-reminder hardcoded `dueCount` — fixed in Phase 1.6 (real SRS count + suppress at zero).

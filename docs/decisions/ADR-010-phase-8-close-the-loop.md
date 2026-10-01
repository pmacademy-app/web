# ADR-010 — Phase 8: Read the Results, Close the Loop (experiment readout + capstone review lifecycle)

- **Status:** Accepted (implemented on `prodily-phase-8-close-the-loop`; not deployed)
- **Date:** 2026-10-01
- **Phase:** 8 — "Read the results, close the loop"
- **Builds on:** [ADR-008](ADR-008-phase-6-module-entry-unlock.md) (Phase 6 module-entry unlock), [ADR-009](ADR-009-phase-7-make-payoff-visible.md) (Phase 7 payoff visibility + capstone-threshold experiment). Source spec: [`docs/PHASE_8_PROPOSAL.md`](../PHASE_8_PROPOSAL.md).

## Context

Phases 4, 6 and 7 each shipped a **cohort experiment** (recut, module-entry unlock, capstone threshold), each flag-off and undeployed. Two problems followed, both of which Phase 8 closes by **connecting capabilities that already existed** rather than building new product surface:

1. **The experiments were unreadable.** The recut (`lib/academy/experiment.ts`) had no aggregator at all; the module-entry (`lib/admin/module-entry-experiment.ts`) and capstone-threshold (`lib/admin/capstone-threshold-experiment.ts`) aggregators existed but were pure functions referenced only by their tests — wired to no query and no admin surface. No control-vs-treatment number was visible anywhere, so no experiment could be concluded.
2. **The capstone review loop was open.** Phase 7 made capstones visible from lesson 1 and (under treatment) reachable earlier, raising submission volume at the product's best moment — but `capstone_submissions` had no `reviewed_at`, there was no `capstone.reviewed` learner notification (only `capstone.submitted`), and no aging/prioritisation. The honest "best-effort" review copy Phase 7 added was truthful precisely because the loop did not close.

Phase 8 does **not** reintroduce OAuth. The plan's original "Phase 8 — Google OAuth" is **conditional** on a >25% signup→verified loss measured on a *deployed* funnel plus a security review — data that does not exist yet. It is **renumbered Phase 9 and deferred**; Phase 8.1 is what produces the funnel-by-arm data its gate requires.

## Decision

### 8.1 — Experiment readout surface

A new **`ExperimentReadoutService`** (`lib/admin/experiment-readout-service.ts`) mirrors `FunnelService`: it reads the authoritative, server-side rows the app already writes (`users`, `user_lesson_progress`, `capstone_submissions`) in a small number of grouped `fetchAllRows` calls, assembles **one row per learner**, and calls the three aggregators. A **new recut aggregator** (`lib/admin/recut-experiment.ts`) was added to match the other two, so all three read the same way. The results render on a new admin page **`/admin/(console)/analytics/experiments`** (`revalidate = 0`) via `ExperimentReadoutView`, reusing the funnel page's pattern and admin components.

Decisions and their rationale:

- **Reuse, don't re-derive.** All arithmetic stays in the aggregators; the service only assembles rows and the view only presents. No experiment calculation is duplicated in the UI.
- **Admin-only by construction.** The only caller is an RSC inside the `(console)` route group, which `AdminConsoleLayout` gates before it runs. **There is deliberately no API route**, so the data has no learner-facing surface (enforced by a test that greps `app/api` for any reference to the service).
- **Deterministic arms, no new state.** Every experiment's assignment is a deterministic function of `users.id` (+ `created_at` for cohort-gated ones), so the arms are reconstructed with no persisted assignment and no new event stream. The aggregators segment the **whole** population by the variant each learner *would* receive, so the comparison is readable while every flag is still off.
- **Honest gaps.** The module-entry "recommended module completed" metric is **not derivable from progress rows alone** (it needs each learner's onboarding recommendation), so it is reported as `n/a` rather than fabricated. Arms with `n < 20` are flagged "low n" and the surface states plainly that these are **raw rates only — no statistical-significance or causal claim**. Empty cohorts render zeros, never estimates, and a DB failure degrades to a `failed` state.

### 8.2 — Close the capstone review loop

- **Schema (one additive migration).** `20261001000001_phase8_capstone_review_loop.sql` adds nullable **`reviewed_at timestamptz`** and **`reviewed_by uuid`** to `capstone_submissions`, plus a partial index on the awaiting-review set. Additive, nullable, **no backfill**; existing rows stay valid (NULL = not yet reviewed through this loop). No data is modified or deleted; no new table.
- **Lifecycle.** `ModerationService.reviewCapstone` now reads the row first, stamps `reviewed_at`/`reviewed_by` **only on the first review** (preserved across any later approve↔reject change, so turnaround measures the first decision), and is **idempotent**: repeating the action never moves the timestamp and never sends a second notification.
- **Notification.** A new **`capstone.reviewed`** event (`portfolio` category) is dispatched to the **submitting learner** on the first review, reusing the existing dispatcher, event catalog, in-app connector and read/unread conventions. It links the learner to `/capstones/[module]`. It is **in-app only** — email was explicitly kept out of scope for this loop. Duplicate delivery is prevented twice over: a domain-level "first review only" guard **and** a stable idempotency key (`capstone-reviewed-<submissionId>`).
- **Aging visibility.** The admin queue (`CapstonesView`) sorts the longest-waiting unreviewed submissions **oldest-first** and shows each submission's **real elapsed age** via a pure `computeReviewAge` helper (`lib/admin/capstone-review-aging.ts`). The drawer shows the same. Emphasis tiers (`fresh`/`waiting`/`aging`) describe **elapsed time only** — they are **not** a promised SLA or deadline.

### 8.3 — Review SLA (intentionally deferred)

**No SLA is invented.** The centralized `CAPSTONE_REVIEW_EXPECTATION` copy (honest "best-effort, no guaranteed window") is **unchanged**, and the UI stays consistent with Phase 7. A real SLA is deferred until enough `reviewed_at` turnaround data exists to commit to one from observed operational capacity; the aging visibility from 8.2 is what makes that data collectable.

## Preserved (no regression)

No Phase 6 or Phase 7 behaviour changed. The threshold experiment still defaults to control (8 of 10); `resolveCapstoneThreshold` and server-side enforcement are untouched; all experiment flags remain **off by default**. The review-expectation copy is unchanged. The change is strictly additive: three new read-only files for 8.1, one additive migration + a closed notification/aging loop for 8.2.

## Consequences

- The team can finally conclude the recut, module-entry unlock, and 8→4 threshold experiments, and read signup→lesson-1 loss — the input Phase 9 (OAuth) needs.
- Submitting a capstone now reaches the learner when it is reviewed, and review turnaround is measurable and manageable for the first time.
- No promise the operation cannot keep: the review expectation stays honest until data justifies an SLA.
- No schema redesign, no new analytics platform, no new tables beyond two additive columns.

## Risks / open decisions

- **Experiments still unread in production.** The readout is built, but nothing is deployed and no experiment has been run; the hypotheses remain unvalidated until a deployment exists. Enabling any flag remains a product decision (ADR-009 risk carried forward).
- **SLA remains an operational decision** (8.3), deferred by design until `reviewed_at` data accrues.
- **Phase 9 (OAuth) stays gated** on a deployed funnel + security review.

## Alternatives considered

- **A separate analytics dashboard architecture for the readout** — rejected; reuses the Phase 2 server-side funnel substrate and admin components per the proposal's "no new analytics platform".
- **A dedicated `capstone_reviews` table** — rejected; the lifecycle is `submitted → reviewed` on one row, so two additive columns are the minimal correct change (same "additive, nullable, no backfill" discipline as ADR-008/009).
- **Expanding `capstone.reviewed` to email** — rejected for this phase; the agreed loop is an in-app close, and silently adding email would expand scope.
- **Inventing aging SLA thresholds** — rejected; the proposal defines none, so the UI shows actual elapsed time and defers a real SLA to 8.3.

# Phase History, Experiments & Invariants — Prodily

**Last updated:** 2026-10-01
**Status:** Authoritative durable record of the activation-improvement programme (Phases 0–8) and the deferred Phase 9.

> **Why this file exists.** The three large planning/source files that drove this programme —
> `IMPLEMENTATION_PLAN.md` (the roadmap), `PRODUCT_IMPROVEMENT_BLUEPRINT.md` (the "why"), and
> `PRODUCT_AUDIT_2026-09-24.md` (the audit) — were **retired on 2026-10-01** once their work was
> implemented. This file plus the ADRs (`docs/decisions/ADR-007…ADR-010`) are their durable
> replacement. **Code comments and older ADRs that cite those three filenames for rationale refer to
> decisions now recorded here and in the ADRs** — the citations are historical provenance, not live
> links. Deployment specifics live in [`DEPLOYMENT.md`](DEPLOYMENT.md).

---

## Phase ledger

| Phase | Objective | Status | Record |
|---|---|---|---|
| 0.A | Land existing work (legal/consent, curriculum UX, progress IA) | **DONE** | git history |
| 0.B | Replace assumptions with baseline data | **DONE** | [`BASELINE_QUERIES.md`](BASELINE_QUERIES.md) |
| 0.C | Homepage redesign (sell the product that exists) | **DONE** | git history |
| 1 | Reconnect the return path (lifecycle email, invert reminder audience) | **DONE** | git history |
| 2 | Make the funnel visible (server-side admin funnel; `onboarding_step_reached`) | **DONE** | `FunnelService`, `/admin/analytics/funnel` |
| 3 | Fix the first session (onboarding CTAs, completion on quiz, flashcards-before-quiz, promote `/review`) | **DONE** | git history |
| 4 | Re-cut the unit of work (Core/Deep-dive split, 5-of-15 quiz, honest time estimates, **A/B**) | **DONE** | [ADR-007](decisions/ADR-007-phase-4a-collapse-entrance.md) |
| 5 | Reduce the surface before value (one-screen onboarding; progress IA consolidation) | **DONE** | ADR-007 |
| 6 | Make the path real (recommendation routing; module-entry unlock; lock affordances) | **IMPLEMENTED (flag off; not deployed)** | [ADR-008](decisions/ADR-008-phase-6-module-entry-unlock.md) |
| 7 | Make the payoff visible (capstone visible from lesson 1; threshold experiment; honest review expectation; IA consolidation) | **IMPLEMENTED (flag off; not deployed)** | [ADR-009](decisions/ADR-009-phase-7-make-payoff-visible.md) |
| 8 | Read the results, close the loop (experiment readout; capstone review lifecycle) | **IMPLEMENTED (flag off; not deployed)** | [ADR-010](decisions/ADR-010-phase-8-close-the-loop.md), [`PHASE_8_PROPOSAL.md`](PHASE_8_PROPOSAL.md) |
| 9 *(deferred)* | Reduce auth friction (Google OAuth) | **NOT STARTED — gated** | see below |

Phases 6, 7 and 8 are code-complete on their branches with all experiment flags **off by default**; none is deployed and no experiment has been run.

---

## Why this programme existed — root causes (2026-09-24 audit)

Baseline at audit time: 396 registered users, 76 (19%) had completed their first lesson; some engaged users stayed only 2–3 days. The audit identified five root causes, all now addressed:

| Root cause | Addressed by |
|---|---|
| **RC1 — ~12 screens before the first idea** | Onboarding collapsed to one screen (Phase 5); 8-step tour deferred; CTAs swapped (Phase 3) |
| **RC2 — 40-minute unit of work** | Core/Deep-dive split, 5-of-15 quiz, ~7-min Core path (Phase 4, A/B) |
| **RC3 — personalization was theater** | Recommendation persisted + derived routing; **module-entry unlock** (Phase 6) |
| **RC4 — retention channel disconnected** | Preference resolution, pagination, timezone-aware crons; defaults flipped, reminder audience inverted, lifecycle sequences (Phase 1) |
| **RC5 — learning loop never closed** | Completion screen on quiz, flashcards-before-quiz, theory-gate errors surfaced (Phase 3); capstone made a visible destination (Phase 7); experiments made readable + review loop closed (Phase 8) |

---

## What each recent phase changed

### Phase 6 — Make the path real (ADR-008)

- **Recommendation-based module routing.** A learner's recommended module is **derived** from their onboarding goal (no new column); onboarding and dashboard route to the recommended lesson.
- **Module-entry unlock model (experiment).** *Why it exists:* the strict global-sequential lock made the practising-PM persona unservable — they could not reach a relevant module without grinding earlier ones. The experiment lets a learner **enter any module's first lesson**, while **intra-module lessons stay sequentially locked** until their prerequisite is complete.
- **Existing-user access preservation (grandfathering).** Any lesson a learner has **already opened stays open** regardless of flag state. Turning the flag off can never re-lock previously-earned access (risk R9, prevented by design).
- **Academy + Search lock states.** Academy shows accurate lock affordances; Search communicates available vs locked lessons rather than 404-ing.
- **Public lesson / authenticated routes.** Public sample-lesson behaviour is unchanged; authenticated access respects the unlock model.
- **Experiment behaviour.** Deterministic cohort assignment from `users.id` (+ `created_at` cohort gate); **defaults to control** (global-sequential lock). Env: `MODULE_ENTRY_UNLOCK_*` (see [`DEPLOYMENT.md`](DEPLOYMENT.md)).
- **Measurement.** Pure aggregator `lib/admin/module-entry-experiment.ts`; surfaced in Phase 8.1.

### Phase 7 — Make the payoff visible (ADR-009)

- **Capstone preview from lesson 1.** `LessonCapstonePreview` shows the module's real capstone (type, title, why it matters, progress to eligibility) inside the lesson; the locked capstone page is an honest **preview**, not a bare lock wall. **Visibility ≠ eligibility** — no preview exposes a submit/draft control.
- **Threshold experiment.** *Why it exists:* the blueprint hypothesised that **producing an artifact**, not finishing lessons, is the strongest activation event, and asked to test a lower eligibility gate. **Control = 8 of 10** module lessons (unchanged, plan-authoritative). **Treatment = 4 of 10** (`CAPSTONE_THRESHOLD_TREATMENT_LESSONS`, clamped 1–8; a value above control is refused). Treatment only ever grants eligibility **earlier**, never later — no learner loses access.
- **Server-side threshold enforcement.** `resolveCapstoneThreshold(supabase, userId)` (`lib/capstones-db.ts`) is the single source of truth, consumed by the overview, load, and the authoritative draft/submit gates. A direct API request from an ineligible learner is rejected with `CAPSTONE_LOCKED` regardless of client state. Flag off ⇒ short-circuits to control with no query; any read failure **fails closed to control**.
- **Review expectation (no fabricated SLA).** `CAPSTONE_REVIEW_EXPECTATION` (`lib/capstones.ts`) states submission is already complete/valuable (portfolio + XP immediate) and that review is **manual, best-effort, no guaranteed window**. Centralised so a real SLA is a one-line change.
- **Duplicate route consolidation.** `/progress/badges` and `/progress/capstones` issue **308 permanent redirects** to canonical `/badges` and `/capstones`; removed from the Progress submenu.
- **Feedback improvements.** Added a `too_long` length tag and a `length_would_churn` / `length_would_not_churn` one-question survey to the feedback widget (stored in the existing `tags` array — additive, no migration).
- **Real SRS due count.** The admin `run-now` daily-reminder path computes the real `getDueCardsCount` per user and suppresses the send at zero (mirroring the cron fixed in Phase 1.6).

### Phase 8 — Read the results, close the loop (ADR-010)

- **Admin experiment readout.** `ExperimentReadoutService` assembles one row per learner from `users` + `user_lesson_progress` + `capstone_submissions` and calls **all three** experiment aggregators — **recut (Phase 4)**, **module-entry (Phase 6)**, **capstone-threshold (Phase 7)** — surfaced on admin-only `/admin/analytics/experiments`. The recut aggregator (`lib/admin/recut-experiment.ts`) was added here to complete the trio. **Descriptive rates only** — no significance/causal claim; empty and low-n cohorts handled honestly; **no API route / no learner-facing surface**; no schema change.
- **Capstone review lifecycle.** Additive `reviewed_at` + `reviewed_by` on `capstone_submissions` (migration `20261001000001`, nullable, no backfill). `ModerationService.reviewCapstone` stamps the **first** review idempotently (preserved across later approve↔reject) and is safe to repeat.
- **`capstone.reviewed` notification.** New **in-app** notification to the submitting learner on first review, linking to `/capstones/[module]`; idempotent (domain guard + stable key `capstone-reviewed-<id>`). Email deliberately out of scope.
- **Admin review aging.** Queue sorts longest-waiting unreviewed **oldest-first** and shows real elapsed age (`computeReviewAge`); tiers are descriptive elapsed-time buckets, **not** an SLA.
- **Deferred SLA (8.3).** No SLA invented; review-expectation copy unchanged. A real SLA waits until enough `reviewed_at` turnaround data exists.

---

## Phase 9 (deferred) — Google OAuth

The original plan's "Phase 8 — Reduce auth friction". **Renumbered Phase 9 and kept deferred/gated.** Entry gate (all three): (1) a **deployed** Phase 2 funnel shows signup→verified is a >25% drop; (2) a security review of the 2026-09 signup-abuse incidents concludes OAuth does not reopen the vector; (3) Phases 3–6 shipped. None is satisfiable yet (nothing deployed). **Do not relax email verification for password signups.** Phase 8.1's readout is what will produce the gate's funnel-by-arm data.

---

## Durable invariants (do not regress)

- **All experiment flags default OFF.** Recut, module-entry unlock, and capstone-threshold ship flag-off; enabling any is a product decision. Enabling the capstone-threshold flag additionally needs product sign-off (plan-vs-blueprint divergence, ADR-009).
- **Lesson access ≠ capstone eligibility.** Opening a lesson never makes a capstone submittable; the two are separate concerns with separate gates.
- **Capstone eligibility is server-enforced from one resolver.** UI and server cannot drift; ineligible submits are rejected server-side.
- **Grandfathering.** Already-opened lessons stay open across any module-entry flag change.
- **Fail-closed.** Threshold read failures fall back to control (8-of-10); Turnstile/verification failures fail closed.
- **Admin-only surfaces.** The experiment readout and all moderation/review actions are admin-authorized server-side; no learner route exposes experiment data or the review mutation.
- **Additive schema only.** Every phase's schema change is additive + nullable with no backfill; existing rows stay valid.
- **No fabricated promises.** No review SLA is promised; aging shows actual elapsed time.

---

## Risk & rollback highlights (Phases 6–8)

| Risk | Mitigation | Rollback |
|---|---|---|
| Unlock scatters learners / lowers completion (R8) | First-lesson-completion guardrail; cohort test | Flag off **with grandfathering** |
| Reverting unlock re-locks opened lessons (R9) | Grandfathering built into the flag from the start | Prevented by design |
| Lower threshold trades artifact volume for depth | Submission + retention measured per arm; watch review load | Flag off (cannot revoke an existing submission) |
| Underpowered experiments read as conclusive (R17) | Readout labels raw rates, flags low-n, makes no significance claim | Reporting discipline |
| Migration deployed after its consuming code (R1) | **Apply migration → verify → deploy code** | Additive migration stays; revert deploy |
| OAuth reopens signup-abuse vector (R10, Phase 9) | Security review is an entry gate; verification unchanged for password signups | Disable provider in Supabase |

Rollback for every experiment is **flag-off, no deploy**. In-app review-loop pieces (copy, notification, aging) are plain reverts; the migration is additive and can stay applied.

---

## Deployment & migration requirements

See [`DEPLOYMENT.md`](DEPLOYMENT.md) → "Phase 6–8 deployment" for the full checklist and manual QA. In short: **apply migration `20261001000001_phase8_capstone_review_loop.sql` before deploying the Phase 8 code**; keep every experiment flag unset/`false`; `IN_APP_NOTIFICATIONS_ENABLED` is a DB feature flag (default on), not an env var.

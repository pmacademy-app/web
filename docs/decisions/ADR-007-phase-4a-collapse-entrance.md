# ADR-007: Phase 4A — Collapse the Entrance (onboarding, tour, portfolio identity, auth)

## Status
Accepted (main-app / Phase 4A scope only)

## Date
2026-09-27

## Context

Phase 4 of the product improvement plan ("Collapse the entrance") aims to shorten the distance
between *"I signed up"* and *"I can start learning"*. In the (now-retired) product improvement blueprint
this was Phase 4 (4.1–4.4); the implementation plan re-sequenced the
same work as **Phase 5** (one-screen onboarding, tour deferral, IA consolidation) and the auth-friction /
Google OAuth work (conditional). This ADR records the decisions made for the **main-app
Phase 4A** slice only. Admin (4B), UI-polish (4C) and the `/progress` IA consolidation (plan 5.3)
are out of this slice.

Before implementation, the existing entrance was traced end to end:

- **Onboarding** was a 4-step client wizard (`app/onboarding/OnboardingWizard.tsx`). Step 1 required a
  **username** and **display name** (plus optional avatar, bio and four social/portfolio URLs); step 2
  required **experience + goal**; step 3 required **topics + learning preference**; step 4 was a
  recommendation summary. The hard blockers lived server-side in `submitOnboarding`
  (`app/onboarding/actions.ts`), which required `username` and `name`, and client-side in the
  per-step `nextStep` gate.
- **Onboarding completion** is signalled by `users.onboarding_completed` (DB) plus
  `user_metadata.onboarding_complete`; `app/(app)/layout.tsx` also treats a non-null `profile.goal`
  as complete, and `proxy.ts` redirects incomplete learners to `/onboarding`.
- **The 8-step Quick Start tour** (`components/quick-start/*`) auto-fired on the first authenticated
  page after onboarding, before the learner reached any lesson. It was already skippable, and
  `trackQuickStartSkipped` already existed.
- **Auth**: email/password with mandatory verification, Turnstile and rate limiting; two 2026-09
  signup-abuse incident investigations are recorded under `docs/audits/`.

### Phase 0 evidence status

The Phase 0.3 decision query (registered vs. ever-opened-a-lesson vs. activated) exists as SQL and
tested pure functions ([`docs/BASELINE_QUERIES.md`](../BASELINE_QUERIES.md) §1;
`lib/admin/baseline-aggregation.ts`), but **no baseline report has been generated** — `docs/reports/`
does not exist, and the funnel numbers are consent-limited via GA4 gating. The concrete
"non-activators never created a progress row" split is therefore **not available as a result** in the
repository. Phase 4A proceeds regardless because the plan authorises this work independently of the
0.3 ordering question (0.3 only decides whether Phase 4 *precedes* the lesson-recut phase, not
whether it happens), and every change here is additive and reversible.

## Decision

### 4.1 / 4.3 — One-screen onboarding; portfolio identity deferred

Collapse onboarding to a single screen collecting **goal + experience** — the two inputs that make
the learning path meaningful and that drive the completion signal (`profile.goal`). Username, display
name, avatar, bio and social/portfolio URLs are **deferred**, not removed: they are collected later in
**Settings → Portfolio**, which validates them identically (`lib/portfolio.ts:validateUsername`,
`validateWritableUrl`). Topics and learning-preference collection are also dropped from the required
path.

`submitOnboarding` now requires only `goal` + `career_role`. Deferred fields are validated *if
supplied* (so a malformed username is still rejected, and an older client that still posts the full
form keeps working) but are written **only when a non-empty value is present**, so a new learner's
identity columns stay NULL and a resuming learner's existing data is never overwritten with blanks.

**NULL-username safety (plan R7) — verified before implementation.** `users.username` is already
nullable and `ensureUserProfile` already creates rows without one, so NULL usernames already existed
pre-onboarding. Every consumer tolerates NULL: certificates fall back to `user_<id>`
(`certificates-db.ts`), the leaderboard carries `username ?? null` and renders no `/p/` link in the
table, referral resolution accepts a UUID (`referral-service.ts`), the public portfolio route is
looked up *by* username (a NULL-username learner simply has no public page yet, which is the point of
deferral), and portfolio readiness treats a missing username as an incomplete checklist item by
design.

### 4.2 — Quick Start tour removed from the entrance (auto-launch disabled, kept manual)

The tour no longer auto-fires. Auto-launch is gated behind
`QUICK_START_AUTO_LAUNCH_ENABLED = false` (`components/quick-start/quick-start-steps.ts`); the tour and
all eight steps are preserved and remain reachable on demand via the existing Topbar "Quick Start"
control (`openQuickStart('manual')`), and the skip path is untouched.

This is the smallest change consistent with the objective. The blueprint conditions the remove-vs-defer
choice on reading `trackQuickStartSkipped` skip-rate data first; that data is GA4/consent-gated and no
baseline report exists, so the evidence to justify full removal or a defer-to-after-lesson-1 rule is not
available. Disabling auto-launch removes the tour from the entrance without deleting reusable
infrastructure and without building a new post-lesson trigger that could itself become a blocker. The
flag makes it a one-line change to re-enable auto-launch or to switch to a deferred rule once Phase 2
funnel data exists.

### 4.4 — Google OAuth: reviewed and deferred

Google OAuth is **not implemented in Phase 4A.** It is now the deferred **Phase 9** (see
[`../PHASE_HISTORY.md`](../PHASE_HISTORY.md)), explicitly **conditional**, and none of its three
entry-gate conditions are met:

1. Phase 2's server-side funnel is not yet providing a measured signup→verified drop rate (>25% is the
   trigger).
2. The required security review of the two 2026-09 signup-abuse incident investigations
   (`docs/audits/`) has not been conducted for an OAuth change.
3. The prerequisite phases have not all shipped.

Email verification, Turnstile and rate limiting are **unchanged** — the plan and the incident record
both warn against relaxing verification, and this slice weakens no authentication or abuse control.

## Consequences

- New learners reach their first learning action after two choices instead of a four-step identity
  form and an auto-firing tour.
- **Existing users are unaffected**: they already have `onboarding_complete` (so `proxy.ts` never
  routes them back through onboarding) and their usernames/profiles are preserved. No migration is
  required or created; no columns are removed.
- Deferred fields remain fully functional in Settings → Portfolio, so nothing about the portfolio,
  leaderboard, certificate or referral surfaces is lost — only the *timing* of the ask changes.
- The Phase 2 per-step onboarding marker (`recordOnboardingStep`) is retained; with a single screen it
  records step 1.
- Learning-path logic, lesson completion rules, quiz/theory/flashcard/streak/review mechanics, and the
  capstone are untouched.

## Reversibility

- Onboarding and server-action changes are pure behaviour changes with no schema migration — revert the
  commit to restore the 4-step wizard. The `submitOnboarding` change is backward compatible with the
  old client payload.
- The tour is a single feature-flag flip (`QUICK_START_AUTO_LAUNCH_ENABLED`).
- No production migration is applied; none is needed.

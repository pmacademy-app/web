# ADR-008 — Phase 6: Module-Entry Unlock & Recommendation Routing

- **Status:** Accepted (experiment-gated; flag defaults to control)
- **Date:** 2026-09-30
- **Phase:** 6 — "Make the Path Real"
- **Supersedes (in part):** the `lib/personalization/path-resolver.ts` invariant that personalization "NEVER skips, reorders, or bypasses any lesson" — see [Amended invariant](#amended-invariant).

## Context

Two long-standing gaps motivated Phase 6:

1. **The recommendation was cosmetic.** Onboarding computes a recommended module
   (`resolvePersonalizedPath`), but "Start Learning" routed to `/dashboard` and the module was
   surfaced only as a badge. Where the learner actually went never depended on it.
2. **A global sequential lock wall.** `isLessonUnlocked` required the *global* previous lesson
   to be complete, so a new learner could open only Lesson 1; every other lesson link — and any
   recommended non-foundations module — led to a lock screen.

The blueprint identified the primary risk of relaxing the lock: **unlocking multiple entry
points may scatter learners and reduce total completion.** So the change had to be
cohort-tested and reversible without a deploy, and it must not lose any existing progress or
weaken capstone gating.

## Decision

### Old model (control, unchanged)
Global sequential: lesson _N_ requires **all** globally-earlier lessons complete. Retained
verbatim as the control arm.

### New model (treatment)
Module-entry unlock:

- Every module's **first lesson** (by global order) is unlocked.
- Within a module, lesson _N_ requires the **previous lesson in the same module**.
- Cross-module sequencing is dropped; **intra-module sequencing is preserved.**

A single pure resolver, `resolveLessonAccess` (`lib/curriculum-access.ts`), computes per-lesson
state (`completed | in_progress | unlocked | locked`) for **both** arms and is shared by the
Academy list, the Search overlay, the lesson-page gate, the onboarding router and the proxy —
so no two surfaces can disagree.

### What stays sequential / unchanged
- Intra-module lesson order (treatment).
- The entire control arm (byte-for-byte the pre-Phase-6 gate).
- Lesson completion, XP, streaks, badges, skill radar, certificates, quiz mastery — untouched.

### Capstone gating unchanged
Capstone eligibility is derived purely from the count of **completed** lessons in a module
(`deriveCapstoneStatus`, the "8 of 10" gate). The unlock model changes only which lessons a
learner may **open**; opening a lesson creates an `in_progress` row, never a `completed` one, so
early access cannot unlock a capstone. Server-side draft/submit gating in `capstones-db` is
unchanged and remains authoritative. Regression tests: `module-entry-capstone-integrity.test.ts`.

### Experiment: control vs treatment
- **Flag:** `MODULE_ENTRY_UNLOCK_ENABLED` (env), **defaults to control (off).** Enabling it is
  the whole rollout; disabling it is the whole rollback — no code deploy. Mirrors the proven
  Phase 4 recut pattern (`lib/academy/experiment.ts`), because no general experiment platform
  exists and the plan calls for the smallest phase-specific mechanism.
- **Cohort:** new signups only, via `MODULE_ENTRY_UNLOCK_COHORT_START` (ISO date). Learners
  created before it are always control. Derived from `users.created_at` — **no new state.**
- **Assignment:** deterministic SHA-256 bucket of `users.id`, split by
  `MODULE_ENTRY_UNLOCK_TREATMENT_PCT` (default 100 within the cohort). The server reconstructs
  the same variant everywhere; nothing is persisted.

### Recommendation routing
"Start Learning" now routes to the recommended module's **entry lesson when accessible**
(always so under treatment) and otherwise falls back deterministically to the learner's first
actionable lesson (Lesson 1 for a new learner) — never a lock wall, never the collapsed
`/academy`. Computed server-side in `submitOnboarding` (`resolveStartLearningTarget`), so the
recommendation is a single source of truth and always resolves to a real existing lesson.
**No `recommendedModuleSlug` column** — it is derived at read time from the already-persisted
`goal` / `career_role` / `onboarding_topics`.

### Public-lesson paradox (proxy)
The public `/lessons/<slug>` page is a read-only, statically-cached preview. Previously the
proxy redirected **every** authenticated visitor to the interactive `/academy` lesson, where the
gate could drop them onto a lock wall for content they could already read. Now the proxy
redirects **only when the interactive lesson is accessible**, computed with the **control** model
(a strict subset of treatment access, so a redirect can never produce a lock wall under either
arm) plus grandfathering/override. When not yet accessible, the learner keeps reading the public
preview. The preview exposes no progress/quiz/XP mutation, so nothing authenticated leaks.

## Grandfathering / rollback safety

`resolveLessonAccess` grants access to any lesson the learner has already **opened** (has any
`user_lesson_progress` row for), **independent of the flag**. Opening an unlocked lesson fires
`markInProgress()` → an `in_progress` row. So a treatment learner who opened a module-entry
lesson keeps it if the flag is later switched back to control; only the *next*, unopened lesson
re-locks. This needs **no migration** — the grandfathering signal is existing progress state.

New access is a **strict superset** of control access (the resolver only ever adds
accessibility: override → opened → treatment-entry → control-baseline). Therefore **no existing
learner can lose access** that today's model grants (Step 4), and the control arm is unchanged.

## Measurement (Phase 2 funnel, server-side; not GA4)

Because assignment is deterministic from `users.id` + `created_at`, cohorts are reconstructable
with no persisted assignment and no new event stream. `computeModuleEntryExperimentSummary`
(`lib/admin/module-entry-experiment.ts`) segments per-learner rows — assembled from
`user_lesson_progress` + `users.created_at` — by variant and computes:

- **Primary:** mean lessons completed per learner at **D30** (Phase 6 aims to raise *total*
  learning, not just Lesson-1 activation).
- **Guardrail (most important):** first-lesson completion rate — **must not fall.**
- **Secondary/guardrails:** Module-1 completion rate, recommended-module completion rate,
  module-switching rate (share touching >1 module), completion concentration by module.

The one signal **not** derivable from progress rows is a **lock-screen impression** (a lock view
leaves no row). It is deliberately **not** added as a new event stream in this phase, to honour
"prefer deriving metrics from existing tables" and "no new analytics platform." If the
experiment needs it, add a single lightweight server event later; it is the only genuinely new
signal and is called out here rather than shipped silently.

## <a name="amended-invariant"></a>Amended invariant

`lib/personalization/path-resolver.ts` documented a "HARD ARCHITECTURAL INVARIANT" that
personalization "NEVER skips, reorders, or bypasses any lesson," and `curriculum-access.ts`
stated "No lesson is unlocked, reordered, or skipped." **Phase 6 intentionally amends this for
the treatment arm:** module-entry access may unlock a later module's entry lesson ahead of
earlier modules. The amendment is bounded — it never reorders lessons **within** a module, never
changes completion/XP/quiz semantics, never weakens capstone gating, and is gated behind the
`module_entry_unlock` flag (control preserves the original invariant exactly). The historical
audit is left unchanged; this ADR is the record of the amendment.

## Consequences

- Recommendation now determines the post-onboarding destination (treatment).
- Learners can start any module's first lesson (treatment); intra-module order still holds.
- Academy and Search clearly communicate locked / unlocked / in-progress / completed, with
  accessible (non-colour-only) affordances.
- Reversible without a deploy; rollback cannot revoke already-opened lessons.
- No schema migration; no new tables, columns, or event streams.

## Alternatives considered

- **Persist `recommendedModuleSlug`** — rejected; deterministically derivable from existing
  fields, so it would be redundant state.
- **DB-backed global feature flag** (`globalFeatureFlagService`) — rejected for this; it is a
  global on/off with no per-user cohort, whereas Phase 6 needs deterministic new-signup cohort
  assignment. Reused pattern: the env-based deterministic split.
- **Move the `/lessons` redirect into the public page** — rejected; that page is static/SSG and
  reads no auth, so making it per-user dynamic would deopt marketing caching. The proxy is the
  only place that knows auth for that route.
- **Make every lesson globally accessible** — rejected; explicitly out of scope and would remove
  intra-module progression.

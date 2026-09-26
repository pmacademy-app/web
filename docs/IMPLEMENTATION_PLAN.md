# Prodily Product Improvement — Implementation Plan

**Status:** Source of truth for implementing the improvements identified in [`PRODUCT_AUDIT_2026-09-24.md`](PRODUCT_AUDIT_2026-09-24.md) and [`PRODUCT_IMPROVEMENT_BLUEPRINT.md`](PRODUCT_IMPROVEMENT_BLUEPRINT.md).
**Date:** 2026-09-24
**Repository state at authoring:** `main` @ `origin/main`; `vansh_dec` 6 commits ahead, 0 behind **[FACT]**
**No code has been written for this plan.**

---

## Implementation Philosophy

Prodily does not have a feature problem. It has 548,536 words of excellent curriculum, a working spaced-repetition engine, nine specified capstone deliverables, portfolios, certificates, streaks with freezes, badges, a leaderboard, and an industrial-grade notification platform. **Almost none of it is connected to a person who just signed up.**

This plan therefore adds as little as possible. Every phase **fixes, connects, repositions, simplifies, or removes** something that already ships. Where a genuinely new technical capability is proposed, it is called out explicitly and justified against an existing product promise that cannot otherwise be kept.

Four rules govern execution:

1. **Every phase produces a measurable improvement.** A phase that cannot state its metric does not ship.
2. **Every phase leaves `main` deployable.** No phase depends on an unfinished later phase. No long-lived branches.
3. **Expected outcomes are hypotheses until measured.** Where impact is uncertain, the phase ships behind an experiment with pre-declared success *and* kill criteria. Kill criteria are honoured.
4. **Existing users are first-class.** Every stateful change states explicitly how an existing learner experiences it versus a new one.

Evidence grades used throughout:

| Grade | Meaning |
|---|---|
| **[FACT]** | Verified by reading this repository; file cited. |
| **[INFERENCE]** | Follows from facts plus standard product reasoning. Not observed. |
| **[HYPOTHESIS]** | Unverified. An experiment is defined. |

---

# 1. Current State & Baseline

## 1.1 Headline findings

| # | Finding | Grade |
|---|---|---|
| F1 | **The inbox channel is dead.** `queue/processor.ts:104` builds `createDefaultNotificationPreferences()` instead of reading `user_notification_preferences`; those defaults set `learning.email=false` and `achievements.email=false`; `medium`/`low` priority cannot bypass preferences. Daily reminder, weekly recap, module-complete, badge-earned and level-up are all dropped before send. | **[FACT]** |
| F2 | **The reminder audience is inverted.** `daily-reminder/route.ts:73` filters `.gt('current_streak', 0).limit(100)` — it mails only the already-engaged, goes silent when a streak breaks, and caps at 100 of 396 users. `dueCount: 5` is hardcoded into the body. | **[FACT]** |
| F3 | **No lifecycle sequence exists** for signed-up-never-started, started-never-finished, or lapsed. A stalled user receives verify + welcome, then nothing. | **[FACT]** |
| F4 | **The activation task is ~40 minutes.** Avg lesson 6,095 words / 34 min `estimatedReadingTime`, 21 content blocks, then a 15-question quiz. Smallest lesson is 5,231 words — there is no short lesson to start on. | **[FACT]** |
| F5 | **The completion screen almost never renders.** `completedThisSession` is set only by `handleReflectionComplete` (line 468). Finish the quiz, skip the optional reflection, and the user sits on the quiz tab. Post-quiz CTA is "Continue to Flashcards →", not "Next lesson". | **[FACT]** |
| F6 | **Retrieval practice is placed after "done".** Flashcard and Reflection tabs require `status === 'completed'`. | **[FACT]** |
| F7 | **Completion ignores mastery.** `recordQuizAttemptAction` calls `completeLesson()` regardless of score — 0/15 completes a lesson and unlocks the next. The sequential lock therefore enforces order, not competence. | **[FACT]** |
| F8 | **Signing up reduces content access.** `/lessons/*` is absent from `isAppPage` in `proxy.ts` and `generateStaticParams` statically generates all 90 lessons publicly; `proxy.ts:185` redirects *authenticated* users to the locked `/academy/...`. A logged-out stranger reads all 90 lessons; a registered user reads one. | **[FACT]** |
| F9 | **Personalization is cosmetic.** `computeRecommendation()` renders a "Recommended Match" badge that is never persisted and never routes. `path-resolver.ts` declares it never reorders. Output = one badge + one sentence. | **[FACT]** |
| F10 | **The funnel is uninstrumented, and now consent-gated too.** `lib/analytics.ts` has no signup / verification / onboarding-step events, and `vansh_dec` hard-gates GA4 and GTM behind cookie consent via `ConsentGatedAnalytics`. `trackEvent` no-ops when `window.gtag` is absent. **Any GA4-based funnel will measure only consenting visitors.** | **[FACT]** |
| F11 | **The short daily loop already exists and works.** `srs.ts:137` — unreviewed cards are due immediately; `flashcards-service.ts:65` unlocks cards for `in_progress` lessons; `markInProgress()` fires on first lesson open; `flashcards-service.ts:279` updates the streak. **Opening lesson 1 creates a ~7-card, ~3-minute streak-preserving loop.** It is simply never promoted. | **[FACT]** |
| F12 | **Duplicate destinations.** `/badges` and `/progress/badges` both call `getUserBadgesData`; `/capstones` and `/progress/capstones` likewise. The `/progress/*` variants were created by `vansh_dec`. | **[FACT]** |

## 1.2 Corrections to the audit — carried forward

The blueprint corrected the audit. Two further corrections were made while authoring this plan; both change the work.

| Correction | Detail | Consequence for this plan |
|---|---|---|
| **C1 — the new-user dashboard is not empty** | `ContinueLearningCard:56` renders `FirstSessionKickoffCard` when `totalLessonsCompleted === 0` — a full-width "Start Your First Lesson: {title}" card with streak and XP framing **[FACT]**. The audit called this "three empty cards"; that was wrong. | The real defect is narrower and cheaper: **onboarding's CTAs are backwards.** "Start Learning" (primary) → `/academy` (nine collapsed accordions, 0% pie); "Explore Prodily" (secondary) → `/dashboard`, which has the strong kickoff card **[FACT]**. Phase 3 swaps them rather than building anything. |
| **C2 — measurement cannot be GA4-based** | F10. GA4 fires only after cookie consent. | The funnel spine in Phase 2 must be **server-side**, derived from tables that already exist: `users`, `user_lesson_progress`, `xp_events`, `quiz_attempts`, `notification_events`, `email_queue`. GA4 remains for consenting-visitor marketing analytics only. This is a correction to the blueprint's Phase 6. |

Corrections already made in the blueprint and retained: corpus is 548,536 words (not ~600k); the short loop exists (F11); in-app notifications *do* fire — only the inbox is dead.

## 1.3 Baseline metrics

| Metric | Value | Source |
|---|---|---|
| Registered users | 396 | reported |
| First lesson completed | 76 (**19%**) | reported |
| Observed retention | some users active 2–3 days | reported |
| Lifecycle emails reaching learners | **~0%** | **[FACT]** F1–F3 |
| Median time to first completion | unknown; **~40 min** structural floor | **[INFERENCE]** F4 |
| D1 / D7 return | **unknown** | no instrumentation, F10 |
| `/review` weekly usage | **unknown** | no instrumentation |
| Capstone-1 submissions | **assumed ~0** | **[INFERENCE]** — requires 8 of 10 module lessons |

**Every "unknown" above is resolved by Phase 0.B before any behavioural change ships.**

## 1.4 Current `main` and `vansh_dec`

**`main`** — `origin/main`. `b10a-b14b/error-boundaries-logout-ci-security` is **0 commits ahead of main**, i.e. already merged **[FACT]**; the note in `docs/INDEX.md` calling it unmerged is stale and should be corrected in Phase 0.A.

**`vansh_dec`** — 6 commits, **146 files, +4,220 / −1,149**, 0 behind `main`, local and `origin/vansh_dec` identical **[FACT]**. A fast-forward merge is available.

Contents **[FACT, from `git diff --stat main..vansh_dec`]**:

| Area | Change | Interaction with this plan |
|---|---|---|
| **Legal / cookie consent** | New `lib/legal/{consent,cookie-consent,legal-config}.ts`, `hooks/use-cookie-consent.ts`, `components/legal/{CookieConsentBanner,ConsentGatedAnalytics,CookiePreferencesButton}.tsx`, `app/layout.tsx` wiring, `app/api/auth/signup/route.ts` consent capture, updated privacy/terms pages, **659 lines of new consent tests** | **Direct dependency.** Drives correction C2. Phase 2 must be server-side. |
| **Migration** | `supabase/migrations/20260923000001_signup_legal_consent.sql` + `types/database.ts` + `docs/DATABASE.md` | **Must be applied before the 0.A deploy** — the signup route writes the new columns. |
| **Curriculum UX** | `app/(app)/academy/page.tsx` (567 lines), `CurriculumModuleIcon`, `module-card` | Phase 6 edits this file. Merge first to avoid conflict. |
| **Search** | `SearchOverlay.tsx` (384 lines) | Phase 6 adds lock affordances here. Merge first. |
| **Progress IA** | New `/progress/{badges,capstones,certificates,metrics,milestones,radar}` subpages, `ProgressSectionDropdown`, `Sidebar` +150 | **Creates F12's duplicates.** Phase 5 *finishes* this migration; it does not undo it. |
| **Leaderboard / settings / notifications polish** | popovers, settings revamp, notification cards | No interaction. |
| **Marketing** | light touches to `hero`, `why`, `journey`, `portfolio`, `final-cta`, `footer`, `navbar` | **Phase 0.C rebuilds this area. Must merge 0.A first.** |
| **CI** | `dependabot-auto-merge.yml`, dependabot grouping | No interaction. |

**Sequencing consequence: `vansh_dec` merges to `main` before any other work in this plan begins.** Phases 0.C, 5 and 6 all edit files it touches.

---

# 2. Overall Phase Map

| Phase | Objective | Major work | Expected outcome | Depends on | Changes user-facing behaviour? |
|---|---|---|---|---|---|
| **0.A** | Land existing work cleanly | Merge `vansh_dec`; apply its migration; correct stale docs | `main` contains legal/consent, curriculum UX, progress IA | — | Yes (already-built work goes live) |
| **0.B** | Replace assumptions with data | Read-only baseline queries; one-page funnel truth | Every "unknown" in §1.3 resolved; phase order confirmed | 0.A | **No** |
| **0.C** | Sell the product that exists | Homepage redesign — minimal, modern, high-clarity | Higher visit → signup rate | 0.A | Yes (marketing only) |
| **1** | Reconnect the return path | Read stored prefs; enable learning/achievement email; invert reminder audience; suppress zero-activity recap and zero-due-card reminders; three lifecycle sequences | Lapsed users are contacted at all — including the ~320 already churned | 0.A, 0.B | Yes (email) |
| **2** | Make the funnel visible | Server-side funnel view in the existing admin console | Every later decision measurable despite consent gating | 0.A, 0.B | **No** (admin-only) |
| **3** | Fix the first session and close the loop | Swap onboarding CTAs; render completion on quiz; flashcards before quiz; surface theory-gate failure; promote `/review` | Lesson-1 → lesson-2 rate rises; the 3-min loop becomes reachable | 2 | Yes |
| **4** | Re-cut the unit of work | Core (~7 min) / Deep-dive split via `getBlocksForTab`; 5-of-15 quiz; honest time estimates | Time-to-first-completion 40 min → <10 min | 2, 3 | Yes — **A/B** |
| **5** | Reduce the surface before value | One-screen onboarding; defer the 8-step tour; finish the progress IA consolidation | Fewer screens and destinations before first value | 2, 4 | Yes |
| **6** | Make the path real | Persist the recommendation; module-entry unlock model; lock affordances in academy + search | Search works; practising-PM persona becomes servable | 4, 5 | Yes — **cohort test** |
| **7** | Make the payoff visible | Capstone visible from lesson 1; review SLA; removals | Application becomes a destination, not a rumour | 4 | Yes |
| **8** *(conditional)* | Reduce auth friction | Google OAuth — **only if** Phase 2 proves verification is a major drop point | Lower signup abandonment without weakening abuse controls | 2 + security review | Yes |

**Sequencing rationale.** 0.A first because six later work items edit files it touches. 0.B before every behavioural phase because three of its queries can reorder the plan. Phase 1 before Phase 2 because its effect is measurable from `email_queue` and `notification_events` without new instrumentation, and it is the only phase that reaches users who have already left. Phase 2 before 3–7 because those are behavioural and unmeasurable without it. Phase 4 before 5 and 6 because both may become unnecessary if shortening the lesson alone fixes activation. Phase 8 last, conditional, and gated on a security review.

---

# 3. Detailed Implementation Plan

---

## Phase 0.A — Integrate `vansh_dec` into `main`

### Objective
Land the six existing `vansh_dec` commits on `main`, deployed and verified, so every subsequent phase branches from a single current baseline.

### Why this phase exists
`vansh_dec` is 6 commits / 146 files ahead of `main` **[FACT]** and touches `app/(app)/academy/page.tsx`, `SearchOverlay.tsx`, the progress IA, the marketing sections and `app/layout.tsx` — files that Phases 0.C, 5 and 6 all modify. Branching any new work from `main` before this merge guarantees conflicts in the largest files in the plan. It also carries a database migration that must reach production before its consuming code does.

### Scope
Merge and verification only. **No new product work.** Two documentation corrections are in scope because they are factual errors that would mislead later phases.

### Exact implementation work
1. `git checkout main && git pull`, then `git merge --ff-only vansh_dec` — a fast-forward is available (0 behind) **[FACT]**. If it is no longer available, rebase `vansh_dec` on `main` and re-run CI before merging.
2. Apply `supabase/migrations/20260923000001_signup_legal_consent.sql` to production **before** deploying the merge commit.
3. Verify `types/database.ts` matches the applied schema (`npm run db:types`, diff must be empty).
4. Correct `docs/INDEX.md`: `b10a-b14b/error-boundaries-logout-ci-security` is **already merged** (0 commits ahead of `main`) **[FACT]**; the "not merged / awaits merge" banner is stale.
5. Record the pre-merge production commit SHA for rollback.

### Existing functionality affected
Legal/cookie consent, signup consent capture, curriculum UX, search, progress IA, sidebar, settings, leaderboard, notifications, marketing polish — all shipping as authored. Nothing is repositioned or removed in this phase.

### Repository areas
`supabase/migrations/20260923000001_signup_legal_consent.sql` · `apps/web/types/database.ts` · `apps/web/app/api/auth/signup/route.ts` · `apps/web/app/layout.tsx` · `apps/web/lib/legal/*` · `apps/web/components/legal/*` · `apps/web/app/(app)/academy/page.tsx` · `apps/web/components/search/SearchOverlay.tsx` · `apps/web/app/(app)/progress/*` · `docs/INDEX.md`, `docs/DATABASE.md`

### Database / migration considerations
One migration, additive (new consent columns on signup). **Order is mandatory: migration → deploy.** The signup route writes these columns; deploying code first produces signup failures on the single most critical path in the product.

**Existing users:** rows created before the migration will have NULL consent columns. Confirm during QA that `lib/legal/consent.ts` and the signup route tolerate NULL for pre-existing users and do not block login or any app route. If they do not, that is a **blocking** defect for this phase.

### Analytics / events
None added. Note for the record that this merge is what makes GA4 consent-gated (F10) — the direct cause of correction C2.

### Tests required
Full existing CI must pass **[FACT: `.github/workflows/ci.yml`]**: `content:build` → `lint` → `typecheck` → `test` → `test:a11y` → brand-hardening checks → production build; plus the `e2e` job (signup→XP and session-lifecycle specs). The 659 new lines of consent tests in `vansh_dec` must pass on `main`.

### Security / performance / accessibility
- **Security:** the consent gate and signup consent capture are the security-relevant surface. Confirm signup still enforces Turnstile and rate limiting — `incident-2026-09-09-signup-abuse.test.ts` and `signup-rate-limiting.test.ts` are both modified by this branch **[FACT]** and must pass.
- **Performance:** GA4/GTM no longer load pre-consent, so LCP should improve or hold.
- **Accessibility:** the cookie banner is a new persistent overlay. `npm run test:a11y` must pass, plus manual keyboard-trap and screen-reader checks on the banner.

### Manual QA checklist
- [ ] Fresh incognito visit → consent banner appears; declining injects no `googletagmanager.com` / `google-analytics.com` request (verify in Network tab)
- [ ] Accepting loads GA4; `_ga` cookie appears only after acceptance
- [ ] Signup completes end to end with consent captured
- [ ] **Pre-existing account (NULL consent columns) can log in and reach `/dashboard`, `/academy`, a lesson, and `/settings`**
- [ ] `/academy` renders; module accordions and CTAs work
- [ ] Search overlay opens (Ctrl+K), returns results, navigates
- [ ] All six `/progress/*` subpages render
- [ ] Homepage renders unchanged from `vansh_dec` intent
- [ ] Cookie preferences can be reopened and changed

### Production validation
Within 24 h of deploy: zero new `logSystemError` entries in category `auth`; signup success rate unchanged versus the prior week; no spike in 500s on `/api/auth/signup`; consent banner acceptance rate recorded as the **Phase 2 GA4 coverage baseline**.

### Success metrics
Deployment completes; signup success rate does not regress; no new error classes. **This phase is not expected to move product metrics** and must not be judged on them.

### Experiment design
None. No hypothesis is being tested.

### Rollback plan
Revert the merge commit and redeploy. **The migration is additive and is not rolled back** — new columns remain, unused, which is safe. Pre-merge SHA recorded in step 5.

### Dependencies
None. This is the root of the plan.

### Definition of Done
Merged to `main`, migration applied, deployed, QA checklist complete, 24 h clean, `docs/INDEX.md` corrected.

### Merge-to-main gate
Full CI green including `e2e`; migration applied to production **and** verified on a staging copy first; NULL-consent regression check passed.

### Post-deployment verification
24 h observation window on auth errors and signup success before Phase 0.B begins.

---

## Phase 0.B — Baseline: replace assumptions with data

### Objective
Resolve every "unknown" in §1.3 and confirm or kill the plan's central claims **before** any behavioural change ships.

### Why this phase exists
Three findings drive the majority of this plan and all three are answerable today from stored data. Shipping Phase 1 without 0.B.1 means never knowing whether the email fix caused the change. More importantly, **0.B.3 can reorder the plan.**

### Scope
**Read-only.** Queries and one report. No code merged to `main` except, optionally, the queries themselves committed as documentation.

### Exact implementation work

| # | Question | Method | Decision it informs |
|---|---|---|---|
| 0.B.1 | Are retention emails actually being dropped? | `select skipped_reason, count(*) from notification_events where skipped_reason like 'user_preference_disabled%' group by 1` — `recordSkippedEvent` (processor.ts:215) writes this row on every block **[FACT]** | Confirms or kills F1 |
| 0.B.2 | Has any learning/achievement email ever sent? | `email_queue` where `template_key` in the five affected templates and `status='sent'` | Independent confirmation of F1 |
| 0.B.3 | **Split the 320 non-activators** | `users` left join `user_lesson_progress`: no row at all vs. `in_progress` on lesson 1 | **"Never opened" ⇒ entrance problem (Phase 5 moves earlier). "Opened and bounced" ⇒ length problem (Phase 4 confirmed).** |
| 0.B.4 | How many stall at the theory engagement gate? | `user_lesson_progress` where `theory_read_at IS NULL AND quiz_attempts = 0 AND status='in_progress'` | Sizes item 3.4 |
| 0.B.5 | Time from signup to first completion | `users.created_at` → earliest `user_lesson_progress.completed_at` | Baseline for the headline metric |
| 0.B.6 | Is anyone using `/review`? | `xp_events where source_type='flashcard'`, distinct users, last 30 d | Tests F11's "hidden, not unwanted" premise — gates item 3.5 |
| 0.B.7 | Quiz score distribution on lesson 1 | `quiz_attempts` grouped by user for `les_zoyq8a` | Guardrail baseline for Phase 4 |
| 0.B.8 | Capstone reality | `capstone_submissions` count by status | Baseline for Phase 7 |
| 0.B.9 | Consent acceptance rate | from 0.A observation | **Quantifies how unrepresentative GA4 is** — confirms C2 |

### Existing functionality affected
None.

### Repository areas
`docs/` only — commit the queries as `docs/BASELINE_QUERIES.md` so they are re-runnable and the measurement is reproducible.

### Database considerations
Read-only. Run against a replica or with statement timeouts if any query is expensive on `quiz_attempts` (the largest table).

### Tests / analytics / security
None required. Handle exported data as personal data — aggregate only, no raw email addresses in the report.

### Manual QA checklist
- [ ] Each query returns a result and the numbers reconcile with the reported 396 / 76
- [ ] Report distinguishes measured numbers from estimates

### Production validation
Not applicable — nothing deploys.

### Success metrics
A one-page baseline report exists and every §1.3 "unknown" has a number.

### Experiment design
Not an experiment; this is the instrument that makes later experiments interpretable.

### Rollback plan
Not applicable.

### Dependencies
0.A (so the queries run against the same schema production will have).

### Definition of Done
Report circulated; **phase order re-confirmed or amended in writing** per 0.B.3.

### Merge-to-main gate
Documentation-only PR; standard CI.

### Post-deployment verification
Not applicable.

---

## Phase 0.C — Homepage redesign

### Objective
Turn the existing homepage into a minimal, modern, high-clarity landing experience that communicates what Prodily is, who it is for, the outcome, what makes the learning different, the capabilities that already exist, and why to start — with one primary and one sensible secondary CTA, and credible proof that is **real**.

### Why this phase exists
The homepage is the top of every funnel in this plan; improving conversion below it while leaving it untouched wastes the later gains. It is also the only Phase 0 item that can change a product metric, and it is **fully decoupled** from app state, onboarding, progression and notifications — so it can ship, be measured, and be reverted without touching anything Phases 1–8 depend on.

### Audit of the current homepage **[FACT]**

Composition of `app/(marketing)/page.tsx`: `Hero → Portfolio → Why → Curriculum → Experience → Journey → FinalCTA`. Total marketing section code: **2,152 lines**, of which `experience.tsx` alone is 453 and `hero-workbench.tsx` 260.

**What already works and must be preserved:**
- The hero headline is genuinely good: *"The structured path from 'I want to break into PM' to a portfolio that proves you can."* It states the outcome, not the feature.
- Four honest value anchors: 90 Lessons · 9 Capstones · 7 Competencies · ₹0 Tuition.
- Two CTAs already exist: `HeroCtaLink` → `/signup`, and "Explore Curriculum" → `/curriculum`.
- `HeroWorkbench` is a real product visual, not stock art.
- The `Why` section's three-way comparison (fragmented self-study / expensive bootcamps / Prodily) is a clear, defensible positioning device.

**Defects to fix:**

| # | Defect | Evidence |
|---|---|---|
| H1 | **Density below the fold.** `experience.tsx` at 453 lines and `journey-timeline.tsx` at 213 carry the explanatory load in prose and multi-step interactive widgets. The page explains rather than demonstrates. | **[FACT]** line counts; **[INFERENCE]** on effect |
| H2 | **Major existing capabilities are absent from the page.** Verified certificates, the public portfolio at `/p/[username]`, spaced repetition as a retention mechanism, streaks, badges, the leaderboard/cohorts, the skill radar and the searchable glossary all exist and ship — several are never mentioned. | **[FACT]** routes and configs exist |
| H3 | **Real proof exists and is not used.** `/reviews` renders `FeedbackAdminService.getPublishedTestimonials()` — genuine admin-published learner testimonials. `testimonials.tsx` and `faq.tsx` exist but are **not rendered on the homepage**. | **[FACT]** |
| H4 | **Sample lessons are effectively hidden.** All 90 lessons are publicly readable at `/lessons/<slug>`; the homepage links to exactly one, from a small link inside the curriculum section. The strongest possible proof of quality — the writing itself — is nearly invisible. | **[FACT]** F8 |
| H5 | **Time expectations conflict with the product.** `/academy` says "~45 Hours"; onboarding says "~18–24 Hours"; the true reading-only figure is 45.7 h. Any figure placed on the homepage must match what Phase 4 makes true. | **[FACT]** |
| H6 | **Ad-hoc hex colours** (`#70685A`, `#DED8CB`, `#F2EFE7`, `#18553E`) are used inline in `hero.tsx` rather than design tokens. | **[FACT]** |

### Scope
Marketing route group only: `app/(marketing)/page.tsx` and `components/marketing/sections/*`. **Out of scope:** `/curriculum`, `/about`, `/faq`, `/reviews`, navbar, footer, and every authenticated surface.

### Exact implementation work

1. **Restructure the page to seven short sections**, each answering exactly one question, none longer than one screen on desktop:

   | Section | Question answered | Built from |
   |---|---|---|
   | Hero | What is it, who is it for, what do I get? | Keep the existing headline, subheadline, the four anchors, both CTAs, and `HeroWorkbench`. Tighten the subheadline. |
   | Proof-by-sample | Is the content any good? | **Surface a real lesson.** Link 2–3 of the existing public sample lessons (`les_zoyq8a`, `les_prrl23`, `les_0q4aih` — the three already marked indexable **[FACT]**) with a genuine excerpt. Fixes H4. |
   | How the learning works | What makes this different? | Condense `experience.tsx` from 453 lines to a compact four-step strip: **read → recall → apply → retain**, naming the real mechanics (interactive quizzes, SM-2 spaced repetition, capstone deliverables, skill tracking). |
   | What you build | What is the outcome? | Keep `portfolio.tsx` + `portfolio-showcase.tsx`. Add the two existing outcome artefacts currently unmentioned: the **public portfolio** at `/p/[username]` and the **verified certificate** at `/verify/[id]`. Fixes part of H2. |
   | The curriculum | Is it substantial? | Keep `curriculum.tsx`; state the real shape (9 modules, 90 lessons, 9 capstones). **Do not state an hours figure until Phase 4 fixes H5** — or state the range honestly. |
   | Why Prodily | Why not YouTube or a bootcamp? | Keep `why.tsx` as-is. It is the strongest section on the page. |
   | Start | Why now? | Keep `final-cta.tsx`. Primary CTA **"Start Learning Free" → `/signup`**; secondary **"Read a sample lesson" → a public lesson** (a stronger, lower-commitment second step than "Explore Curriculum"). |

2. **Add real proof, conditionally.** Render published testimonials from `FeedbackAdminService.getPublishedTestimonials()` **only when at least three exist**; otherwise render nothing. Fixes H3 without inventing anything.

3. **Remove, do not rewrite.** `journey.tsx` / `journey-timeline.tsx` duplicate the "how the learning works" narrative — drop one. Reduce `experience.tsx`'s interactive widgets to a single representative demo.

4. **Tokenise colours.** Replace inline hex with `theme/tokens.ts` values. Fixes H6 and keeps the brand-hardening CI check satisfied.

5. **Add honest capability signalling** for streaks, badges, leaderboard and glossary — as a single compact row, not new sections. These exist; they are supporting detail, not the pitch.

### Claims policy — binding
Every number and claim must be traceable to the repository: 90 lessons, 9 modules, 9 capstones, 7 competencies, ₹0 tuition, verified certificates, public portfolios, spaced repetition, streaks, badges, leaderboard — **all verified to exist [FACT]**.
**Forbidden:** learner counts, outcome statistics, hiring or salary claims, invented testimonials, any hours figure that contradicts the product, and any capability not currently shipping. The homepage sells what exists.

### Existing functionality affected
`experience.tsx` condensed; one of `journey.tsx`/`journey-timeline.tsx` removed from the homepage; `testimonials.tsx` conditionally introduced; hero and final-CTA copy tightened; secondary CTA repointed.

### Repository areas
`apps/web/app/(marketing)/page.tsx` · `components/marketing/sections/{hero,hero-cta,hero-workbench,why,curriculum,experience,journey,journey-timeline,portfolio,portfolio-showcase,testimonials,final-cta}.tsx` · `apps/web/theme/tokens.ts` · `lib/admin/feedback-service.ts` (read-only consumer)

### Database considerations
None. Testimonials are already fetched through `unstable_cache` **[FACT]**.

### Analytics / events
`trackHeroCTAClick` already exists **[FACT]** — reuse it for both CTAs with distinct location values. **Do not build new GA4 events here**: per C2, GA4 covers only consenting visitors. The authoritative conversion measure is the server-side `users.created_at` rate from Phase 2. Vercel Analytics (cookieless, ungated **[FACT]**) supplies pageviews.

### Security / performance / accessibility
- **Performance:** the homepage is `revalidate = 3600` and renders no data **[FACT]**. Adding a testimonials fetch introduces a data dependency — keep it cached and never let it block render. **Guardrail: LCP must not regress.** `HeroWorkbench` is the LCP surface; do not add anything above it.
- **Accessibility:** `npm run test:a11y` must pass. Preserve `aria-labelledby` on sections, maintain heading order, honour `prefers-reduced-motion` (existing `motion-reduce:` classes must survive the rewrite).
- **Security:** none — no new inputs.

### Manual QA checklist
- [ ] 360px, 768px, 1440px: no horizontal scroll, no overlap
- [ ] Light and dark mode
- [ ] Keyboard-only traversal of both CTAs and all links; visible focus rings
- [ ] `prefers-reduced-motion` disables animation
- [ ] Zero testimonials → section absent, no empty shell
- [ ] Every stated claim traced to a repository fact (checklist signed off)
- [ ] Sample-lesson links resolve for a logged-out visitor **and** redirect correctly for a logged-in one (`proxy.ts:185` **[FACT]**)
- [ ] LCP measured before and after

### Production validation
7 days: visit → signup conversion (server-side, from `users.created_at` against Vercel Analytics pageviews); bounce rate; LCP; sample-lesson click-through.

### Success metrics
- **Primary:** visit → signup rate. **Target: +20% relative** over the pre-change 14-day baseline.
- **Secondary:** scroll depth; sample-lesson clicks.
- **Guardrail:** LCP must not regress by more than 10%; signup **quality** must not degrade (Phase 2 will later confirm these signups still activate — an early warning that the page is overselling).

### Experiment design
**[HYPOTHESIS]** that a shorter, clearer page converts better. At current traffic an A/B test is unlikely to reach significance quickly, so ship as a **before/after comparison with a 14-day pre-period and a 14-day post-period**, and state plainly that the result is directional. **Kill criterion:** if signup rate falls or bounce rises materially over 14 days, revert to the previous homepage — it is a single revert of a self-contained route group.

### Rollback plan
Revert the marketing-only commit. No state, no migration, no coupling. **The safest rollback in the entire plan.**

### Dependencies
0.A (it touches marketing files). Independent of 0.B.

### Definition of Done
Seven sections shipped; claims checklist signed; a11y and brand-hardening CI green; LCP measured; testimonials render conditionally.

### Merge-to-main gate
Full CI including `test:a11y` and brand hardening; claims checklist signed by a second reviewer; LCP before/after recorded on a preview deploy.

### Post-deployment verification
14-day observation before Phase 1's email sends begin, so the two effects do not overlap in the signup numbers.

---

## Phase 1 — Reconnect the return path

### Objective
Make the notification platform actually deliver to learners' inboxes, and target the people who need contacting.

### Why this phase exists
F1–F3 are **[FACT]**-grade, small, and the **only** work in this plan that can reach the ~320 users who already churned. Highest leverage per hour in the repository.

### Scope
Notification queue preference resolution, default preferences, the two learning crons, and three lifecycle sequences built from existing templates and the existing admin broadcast/audience-filter machinery. **No new email templates unless 1.5 proves one is unavoidable.**

### Exact implementation work
1. **1.1** — In `enqueueNotificationItem`, load the user's row from `user_notification_preferences` (the table exists and is written by `/api/settings/notifications` and the unsubscribe route **[FACT]**), falling back to defaults only when absent. Fixes F1(a) and makes the settings page functional.
2. **1.2** — Change `createDefaultNotificationPreferences` so `learning.email` and `achievements.email` default to `true`. The file's own header already documents this intent; the code contradicts it **[FACT]**.
3. **1.3** — Rewrite the `daily-reminder` audience: select users whose last activity is before today rather than `.gt('current_streak', 0)`; remove `.limit(100)` and paginate; pass the **real** due count from `getReviewQueueData` instead of the hardcoded `5` **[FACT]**.
4. **1.4** — In `weekly-recap`, skip users with zero activity in the window rather than mailing them a "0 lessons, 0 XP" summary.
5. **1.5** — Three lifecycle sequences using existing audience filters (`lib/admin/user-filter-query.ts` already supports inactivity filtering **[FACT]**): **D+1** signed-up-never-started · **D+3** started-never-finished · **streak-broken** comeback.
6. **1.6 — Suppress the daily reminder when the real due count is zero.** *(Added in review.)* `learning.daily_reminder` is a *review and streak* email **[FACT]**. Inverting the audience in 1.3 means it would be sent to users who have never opened a lesson — who by definition have **no** due cards (`flashcards-service.ts:65` unlocks cards only for started lessons **[FACT]**). Sending "you have cards waiting" to someone with none is the same defect as 1.4's zero-activity recap, reintroduced through the back door. Either suppress the send when `dueCount === 0`, or route that segment to the D+1 never-started sequence in 1.5 instead. **1.3 must not ship without this.**

### Existing functionality fixed / repositioned
The email queue, dual providers, governance, retries, idempotency, the five dropped templates, the settings preferences page, the unsubscribe route, the two crons and the GitHub Actions scheduler — all already built, currently delivering nothing.

### Repository areas
`lib/notifications/queue/processor.ts` · `lib/notifications/preferences/defaults.ts` · `app/api/cron/daily-reminder/route.ts` · `app/api/cron/weekly-recap/route.ts` · `lib/notifications/automations/service.ts` · `lib/admin/user-filter-query.ts` · `lib/flashcards-service.ts` (read-only, for due counts)

### Database considerations
**No schema change.** `user_notification_preferences` already exists. Users without a row fall back to defaults — this is the backwards-compatibility path and must be explicitly tested.

**Existing vs new users:** existing users have had learning email effectively off and mostly have no preferences row. After 1.1 + 1.2 they begin receiving milestone and reminder email **for the first time**. This is the single largest behavioural change to the existing base in the plan and is the reason for the staged rollout below. Any user who has explicitly disabled a category (or used the unsubscribe link) **must** have that honoured — 1.1 lands before 1.2 in the same release for exactly this reason.

### Analytics / events
No client events. Measurement is server-side from `email_queue.status` and `notification_events.skipped_reason` — both already written **[FACT]**.

### Tests required
Existing suites `test:notifications`, `test:email`, `test:recap` must pass. New unit tests:
- a stored preference with `learning.email=false` **blocks** the send (regression guard on 1.1)
- a user with **no** preferences row receives the new defaults
- an unsubscribed user is never sent to
- the daily-reminder audience query selects lapsed users and excludes today-active users
- pagination covers >100 users
- weekly recap skips zero-activity users
- idempotency keys prevent duplicate sends across cron reruns

### Security / performance / accessibility
- **Security/compliance:** unsubscribe must work from every new send. Verify the unsubscribe token path end to end before enabling.
- **Performance:** removing `.limit(100)` increases queue volume. Confirm the free-tier provider quota and the existing rate-limit policy tolerate 396 users, and that `email-governance.ts` daily quotas still apply.
- **Reputation risk:** see rollout.

### Manual QA checklist
- [ ] Test account with `learning.email=false` receives nothing
- [ ] Test account with no preferences row receives the reminder
- [ ] Unsubscribe link works and is honoured on the next run
- [ ] Reminder shows the **real** due count
- [ ] **User with zero due cards receives no review reminder (1.6)**
- [ ] Zero-activity user receives no weekly recap
- [ ] A simulated highly-active user does not exceed the per-user weekly cap (R4b)
- [ ] Cron reruns produce no duplicates
- [ ] Rendered email checked in two clients

### Production validation
- `select skipped_reason, count(*) ... group by 1` — the `user_preference_disabled:learning` count must drop to ~0 for users who have not opted out
- `email_queue` sent counts per template become non-zero
- Complaint and unsubscribe rates monitored daily for the first week

### Success metrics
- **Primary:** D7 reactivation of users idle 3–14 days. **[HYPOTHESIS]** — see §6, Experiment E1.
- **Secondary:** email → session rate; lesson-1 completion among the previously-stalled segment.
- **Guardrails:** unsubscribe rate **< 2%** per send; spam complaint rate **< 0.1%**; provider quota not exceeded; **per-user weekly email count within the governance cap (R4b)**.

### Experiment design
**E1 in §6.** 1.1–1.4 are fact-driven repairs and ship without a holdout — a correctly-addressed reminder that currently does not send is not a hypothesis. **1.5 is a hypothesis and ships with a 30% holdout.**

### Rollout strategy
**Staged, mandatory.**
1. Deploy 1.1 + 1.2 with the admin global pause **active** — code live, nothing sending.
2. Release to a **50-user cohort**. Observe 72 h: deliverability, unsubscribes, complaints.
3. If guardrails hold, widen to all users. Deploy 1.3 + 1.4.
4. Deploy 1.5 with its holdout.

### Rollback plan
The existing **admin global pause** halts all non-critical email immediately without a deploy **[FACT: `EmailAutomationsService.isGlobalPauseActive`]**. This is the primary rollback. Code revert is secondary. Per-automation toggles allow disabling a single template.

### Dependencies
0.A (schema/branch baseline), 0.B.1–0.B.2 (confirm F1 before fixing it).

### Contingency if 0.B kills F1
*(Added in review.)* If 0.B.1 returns few `user_preference_disabled` rows **and** 0.B.2 shows learning emails have been sending, then F1 is wrong and this phase collapses to **1.3, 1.5 and 1.6 only** — the audience inversion and the missing sequences, which are independently **[FACT]**-grade from the cron source and unaffected by whether the preference gate fires. Do not implement 1.1/1.2 "just in case": changing preference resolution when it is already working risks breaking honoured opt-outs. **Re-scope this phase in writing before starting it.**

### Definition of Done
Guardrails held through the 50-user cohort and the full rollout; `skipped_reason` blocks eliminated; three sequences live with holdout instrumented; zero-due-card suppression verified.

### Merge-to-main gate
CI green; new preference-regression tests present; global pause verified working on staging; unsubscribe path verified end to end; **per-user weekly cap confirmed to exist and to apply (R4b)**; **1.6 shipped in the same release as 1.3**.

### Post-deployment verification
Daily for 7 days: unsubscribe rate, complaint rate, provider quota, queue dead-letter count.

---

## Phase 2 — Make the funnel visible

### Objective
Build a **server-side** funnel from signup to continued learning, surfaced in the existing admin console.

### Why this phase exists
F10 plus correction C2: there is no signup/verification/onboarding instrumentation, and `vansh_dec` now hard-gates GA4 behind consent, so any client-side funnel measures an unrepresentative subset. Phases 3–7 are behavioural and uninterpretable without this.

### Scope
Aggregation and one admin view. **No new tracking infrastructure and no new analytics product** — every step is derivable from tables that already exist.

### Exact implementation work
1. A server-side funnel aggregation reading existing tables:

   | Step | Source **[FACT]** |
   |---|---|
   | Signed up | `users.created_at` |
   | Email verified | Supabase auth `email_confirmed_at` (already read in `proxy.ts`) |
   | Onboarding completed | `users.onboarding_completed` |
   | First lesson opened | `user_lesson_progress` row exists |
   | Theory read | `theory_read_at` non-null |
   | First lesson completed | `status='completed'` |
   | Returned D1/D7 | `xp_events.created_at` distinct days |
   | Continued learning | completed-lesson count distribution |
   | Review habit | `xp_events where source_type='flashcard'` |
   | Capstone | `capstone_submissions` |

2. Render as one page in the existing admin console, alongside the existing analytics workspace.
3. **The one genuinely new capability in this phase, justified:** onboarding is a four-step client wizard whose intermediate steps leave **no server trace** — only the final `onboarding_completed` flag **[FACT]**. Phase 5 needs per-step drop-off to know which step to cut. Persist a lightweight step marker (a column on `users` or a small event row) written by the existing wizard. This is instrumentation required to keep an existing promise measurable, not a product feature; it adds no user-facing surface.
4. Read the **already-existing** `trackQuickStartSkipped` signal for tour data before Phase 5 **[FACT]**.

### Existing functionality repositioned
`lib/analytics.ts` is demoted to marketing-only and documented as consent-limited. The admin analytics workspace gains the learner funnel it lacks.

### Repository areas
`lib/admin/*` (new aggregation, consistent with `users-aggregation.ts`) · `app/admin/(console)/analytics/*` · `app/onboarding/OnboardingWizard.tsx` + `actions.ts` (step marker) · `types/database.ts`

### Database considerations
One additive column or one small table for onboarding step markers. Additive, nullable, no backfill. **Existing users:** no marker; the funnel shows them as "pre-instrumentation" and they are excluded from step-level analysis rather than counted as drop-offs — a defect worth calling out explicitly, because miscounting them would corrupt Phase 5's decision.

### Analytics / events
This phase *is* the analytics work. No GA4 events added.

### Tests required
Unit tests on the aggregation with fixture users at each funnel stage; a test that pre-instrumentation users are excluded, not miscounted; admin RBAC test that the view is admin-only.

### Security / performance / accessibility
- **Security:** admin-only, behind existing RBAC. Aggregate counts only — no per-user PII in the view.
- **Performance:** aggregate queries over `xp_events` and `quiz_attempts` could be heavy. Cache with `unstable_cache` and index-check before shipping.
- **Privacy:** this is first-party aggregate measurement of your own service and is not consent-gated in the way third-party analytics is — but document it in the privacy policy that `vansh_dec` just updated.

### Manual QA checklist
- [ ] Funnel numbers reconcile with the Phase 0.B baseline queries
- [ ] Non-admin cannot reach the page
- [ ] Pre-instrumentation users are labelled, not counted as drop-offs
- [ ] Page loads in under 2 s with production-sized data

### Production validation
Funnel matches 0.B within a small tolerance. Any discrepancy is a defect in the aggregation, not a finding.

### Success metrics
Every funnel step has a live number; onboarding step drop-off is visible. **This phase does not move product metrics and must not be judged on them.**

### Experiment design
None — this is the measurement instrument.

### Rollback plan
Revert. The additive column stays (unused, harmless).

### Dependencies
0.A, 0.B.

### Definition of Done
Funnel live, reconciled with 0.B, onboarding step drop-off visible.

### Merge-to-main gate
CI green; reconciliation with 0.B documented; RBAC test present.

### Post-deployment verification
Compare a week of funnel output against 0.B before Phase 3 relies on it.

---

## Phase 3 — Fix the first session and close the loop

### Objective
Make the first session end somewhere, and make the existing 3-minute daily loop reachable.

### Why this phase exists
F5, F6, F11 and correction C1 are all **[FACT]**-grade, cheap, and sit on the highest-intent moment in the product. The completion screen is already designed and written and almost never renders.

### Scope
The lesson shell, the onboarding completion handler, and the dashboard/review positioning. **No content changes** — Phase 4 handles content.

### Exact implementation work
1. **3.1 — Swap the onboarding CTAs.** Per C1, "Start Learning" (primary) currently goes to `/academy` (nine collapsed accordions, 0% pie) while "Explore Prodily" (secondary) goes to `/dashboard`, which renders the strong `FirstSessionKickoffCard` **[FACT]**. Make `/dashboard` the primary destination, or route straight to lesson 1. **Two-line change; potentially the cheapest win in the plan.**
2. **3.2 — Render the completion screen on quiz completion**, not on reflection. Set `completedThisSession` when the quiz submission returns completed, not only from `handleReflectionComplete` **[FACT]**.
3. **3.3 — Repoint the post-quiz CTA** to **"Next lesson: {title}"**; demote flashcards and reflection to secondary actions.
4. **3.4 — Surface the theory-gate failure.** `handleTheoryComplete` catches the 400 and advances silently **[FACT]** — show what is required (≥45 s active, ≥80% scroll) instead of failing invisibly.
5. **3.5 — Promote `/review` as the daily action.** Per F11 the loop already works; make it visible on the dashboard for any user with due cards. **Gated on 0.B.6.**
6. **3.6 — Resolve the flashcard unlock inconsistency.** The review hub unlocks `in_progress` cards while the lesson tab requires `completed` **[FACT]**. Align on the review hub's rule: unlock the lesson's flashcard tab after theory is read, before the quiz — putting retrieval practice where it belongs (F6).

### Existing functionality fixed / repositioned
The completion and module-completion screens (already built, rarely seen); the flashcard deck blocks (authored for all 90 lessons, ~6.6 cards each); `/review` and the SM-2 engine; `FirstSessionKickoffCard`.

### Repository areas
`app/(app)/academy/[moduleSlug]/[lessonId]/lesson-content.tsx` · `blocks/quiz/QuizBlock.tsx` · `app/onboarding/OnboardingWizard.tsx` · `components/dashboard/{ContinueLearningCard,FlashcardReviewPromptCard}.tsx` · `hooks/use-lesson-progress-v2.ts`

### Database considerations
**None.** No schema change, no migration, no backfill.

**Existing vs new users:** an existing learner mid-curriculum sees the completion screen on their next quiz and finds flashcards unlocked earlier. Both are additive; no existing progress is invalidated. **Nothing about `status`, XP or unlock state changes** — this is presentation and sequencing only, which is why this phase is safe to ship without an experiment.

### Analytics / events
Reuse the existing `trackLessonCompleted` and `trackQuizCompleted`. The authoritative measure is the Phase 2 server-side funnel — specifically lesson-1-complete → lesson-2-open.

### Tests required
- completion screen renders when the quiz completes **without** a reflection (direct regression guard on F5)
- the module-completion variant still renders at lessons 10/20/…/90
- flashcard tab unlocks after `theory_read_at`, not `completed`
- theory-gate failure surfaces a message and does **not** silently advance
- onboarding primary CTA resolves to the intended destination
- existing `test:srs` and lesson-progress suites pass unchanged

### Security / performance / accessibility
- **Accessibility:** the completion screen becomes a far more frequently seen surface — verify heading order, focus management on transition, and that the `role="tablist"` semantics survive the unlock change. `test:a11y` must pass.
- **Performance:** none.

### Manual QA checklist
- [ ] Complete a quiz, skip reflection → completion screen with "Next lesson" CTA
- [ ] Click through to lesson 2 successfully
- [ ] Lesson 10 → module completion screen with capstone card
- [ ] Flashcards accessible after theory read, before quiz
- [ ] Deliberately fail the theory gate (scroll <80%) → clear message, no silent advance
- [ ] New account → onboarding → primary CTA → lesson 1 or kickoff card
- [ ] Existing mid-curriculum account sees no progress loss

### Production validation
Phase 2 funnel: lesson-1-complete → lesson-2-open rate, before/after; `/review` weekly usage; the 0.B.4 theory-gate-stall cohort shrinks.

### Success metrics
- **Primary:** lesson-1-complete → lesson-2-open. **[HYPOTHESIS]** target **+15pp**.
- **Secondary:** reflection submission rate (may *fall* — acceptable, it is no longer the only exit); `/review` weekly active share.
- **Guardrail:** lesson-1 completion rate must not fall.

### Experiment design
Ships to everyone as a before/after with a 14-day post-period. **Rationale:** each item is a fact-driven repair of a broken or misordered flow, not a design bet, and traffic is too low for a well-powered A/B on a multi-part change. **Kill criterion:** if lesson-2 open rate does not improve at all over 14 days, F5 was not the binding constraint and Phase 4 becomes the priority.

### Rollback plan
Revert. No state, no migration. Items 3.1–3.6 are independently revertable commits — a partial rollback is possible.

### Dependencies
Phase 2 (to measure); 0.B.6 gates item 3.5.

### Definition of Done
All six items shipped, tests green, 14-day measurement complete.

### Merge-to-main gate
CI green including `test:a11y`; the F5 regression test present; existing-user QA passed.

### Post-deployment verification
14 days on the funnel before Phase 4 begins, so the two effects do not overlap.

---

## Phase 4 — Re-cut the unit of work

### Objective
Reduce time-to-first-completion from ~40 minutes to under 10, without rewriting or deleting a single word of curriculum.

### Why this phase exists
F4. Avg 6,095 words + 34 min estimated reading + a 15-question quiz, with no lesson under 5,231 words **[FACT]**. **[INFERENCE]** a 40-minute minimum session cannot sustain a daily habit. This is the highest-expected-impact change in the plan and the least certain — therefore it is an experiment.

### Scope
Block grouping, quiz sampling, and time-estimate copy. **The markdown, the compiler and the content pipeline are untouched.**

### Exact implementation work
1. **4.1 — Core / Deep-dive grouping in `getBlocksForTab`.** All 21 block types already compile as discrete typed blocks **[FACT]**:
   - **Core (~7 min):** `learningObjectives` → `theory` → `mentalModel` → `keyTakeaways`
   - **Deep dive (optional):** `caseStudy`, `companyExample`, `realWorldPerspective`, `interviewPerspective`, `framework`, `cheatSheet`, `glossary`, `resources`, `connections`, `commonMistakes`, `mermaid`
   **Deep dive is visible and labelled — never hidden.** The risk is that learners read it as content removal.
2. **4.2 — Completion = Core + a 5-question quiz** sampled from the existing 15. The other 10 become retry variety and review material — the question bank is reused, not discarded.
3. **4.3 — Reconcile the time estimates** (H5/F-level conflict): `/academy` "~45 Hours", onboarding "~18–24 Hours", true reading-only 45.7 h **[FACT]**. After 4.1 the Core-path number is the honest headline; state it consistently on `/academy`, in onboarding, and on the homepage from 0.C.
4. **4.4 — Count Deep-dive engagement** in the Phase 2 funnel so depth consumption is observable rather than assumed.

### Existing functionality repositioned
The entire content library — regrouped, not rewritten. The quiz block's existing shuffle logic. The `estimatedReadingTime` field (recompute for Core).

### Repository areas
`app/(app)/academy/[moduleSlug]/[lessonId]/lesson-content.tsx` (`getBlocksForTab`) · `blocks/quiz/QuizBlock.tsx` · `lib/academy/lessons-db.ts` (`recordTheoryReadAction` reads `estimatedReadingTime` to compute the engagement threshold **[FACT]** — **this must be recalculated for Core or the ≥45 s gate silently changes meaning**) · `lib/xp/xp.ts` · `app/(app)/academy/page.tsx` · `app/onboarding/OnboardingWizard.tsx`

### Database considerations
**No schema change.** But two state hazards:

- **Completion semantics change.** A lesson completed under the old rules (15 questions) and one completed under the new (5) are both `status='completed'`. **Do not retroactively alter any existing row.** Existing completions stay valid — reducing them would destroy trust and corrupt the skill radar and certificate logic.
- **XP consistency.** `QUIZ_CORRECT` XP is per correct answer **[FACT]**, so a 5-question quiz yields one third of the XP of a 15-question one. Existing users would see later lessons award less than earlier ones, and the leaderboard would mix both scales. **Decide explicitly before implementation:** either scale `QUIZ_CORRECT` so a Core lesson awards comparable XP, or accept and document the change. This is a real cross-cutting risk that touches XP, levels, badges (`xp_1000`, `xp_5000`) and the leaderboard. **Treat it as blocking.**

**Existing vs new users:** existing learners see their next lesson presented as Core + Deep dive. Completed lessons remain completed. If XP is rescaled, existing totals are **not** recomputed — only future awards change.

### Analytics / events
Phase 2 funnel additions: Core completion, Deep-dive open rate, quiz accuracy by variant, time-to-completion.

### Tests required
- Core grouping yields the intended block set for a representative sample of lessons across all 9 modules
- no block type is orphaned — every one of the 21 types appears in exactly one group
- 5-question sampling is deterministic per user per lesson (so a reload is not a new quiz)
- completion fires on the Core path
- **the theory engagement threshold recomputes against Core reading time, not full-lesson time**
- XP regression test encoding whichever decision is taken above
- existing `test:xp`, `test:badges`, `test:leaderboard`, `test:radar` all pass

### Security / performance / accessibility
- **Performance:** fewer blocks render initially — expect an improvement.
- **Accessibility:** Deep dive must be reachable by keyboard and announced as available content, not visually buried.
- **Learning quality:** the central risk. Covered by the guardrail below.

### Manual QA checklist
- [ ] Core reads as a coherent, complete lesson — **not as a truncated one** (subjective review by someone who knows the content)
- [ ] Deep dive is obviously available and clearly labelled
- [ ] Core completion time measured on 5 lessons — is it actually ~7 min?
- [ ] Quiz is 5 questions and reload does not reshuffle
- [ ] Existing completed lessons still show completed
- [ ] XP awarded matches the documented decision
- [ ] Time estimates consistent across homepage, `/academy`, onboarding

### Production validation
Experiment **E2** in §6.

### Success metrics
- **Primary:** signup → first lesson completed. **Target +10pp.**
- **Secondary:** median time to first completion (<10 min); D7 return; lessons completed in week 1.
- **Guardrails:** quiz accuracy must not fall materially versus the 0.B.7 baseline; Deep-dive open rate must be non-trivial (if near zero, the depth that is Prodily's differentiator is being abandoned, which is a strategic loss even if activation improves).

### Experiment design
**E2, §6. A/B on new signups, 50/50, minimum 3 weeks** — the only phase in this plan with a true randomised split, because it is the only one that changes the perceived product rather than repairing a broken flow.

### Rollback plan
Feature-flag the grouping so it reverts without a deploy. No data migration, so rollback is clean — **provided no XP rescale has been applied**. If XP is rescaled, rollback leaves a cohort with differently-scaled XP; document this before shipping and prefer the no-rescale option unless the leaderboard distortion is worse.

### Dependencies
Phase 2 (measurement), Phase 3 (a closed loop, so Phase 4 is measured on a working funnel), 0.B.3 and 0.B.5.

### Definition of Done
Experiment run to its observation period; decision taken and recorded per §6; XP decision documented.

### Merge-to-main gate
CI green; flag defaults to **control**; XP decision documented and tested; content review sign-off that Core reads as complete.

### Post-deployment verification
Weekly experiment readout for 3 weeks; decision gate.

---

## Phase 5 — Reduce the surface before value

### Objective
Cut the number of screens and destinations a learner traverses before and around first value.

### Why this phase exists
Twelve screens precede the first idea **[FACT]**: a mandatory 4-step wizard demanding a public portfolio identity, then an auto-firing 8-step tour selling leaderboards and portfolios to someone with zero investment. Navigation then offers 14 destinations including two genuine duplicate pairs (F12).

### Scope
Onboarding, the quick-start tour, and navigation consolidation. Coherent theme: **reduce the surface a user must traverse before value.** Authentication friction is deliberately **excluded** (Phase 8).

### Exact implementation work
1. **5.1 — Collapse onboarding to one screen:** goal + experience level (the two inputs Phase 6 makes functional). Defer username, avatar, bio and the four social URLs to the point where the portfolio first matters. **Driven by the Phase 2 per-step drop-off data, not by assumption.**
2. **5.2 — Defer or remove the 8-step tour.** Read the existing `trackQuickStartSkipped` data first **[FACT]**. If skip rate is high, remove it; if not, fire it after lesson 1.
3. **5.3 — Finish the progress IA migration.** `vansh_dec` created `/progress/{badges,capstones,...}` alongside the pre-existing `/badges` and `/capstones`, which call the same services **[FACT]**. **This is completing `vansh_dec`'s migration, not undoing it:** pick one canonical home per concept and 301 the other. Preserve deep links — badges and certificates are shared externally.

### Existing functionality simplified / removed
The onboarding wizard (4 steps → 1, remaining fields relocated to the existing profile settings tab, which already collects all of them **[FACT]**); the quick-start tour; one of each duplicate route pair.

### Repository areas
`app/onboarding/{OnboardingWizard.tsx,actions.ts}` · `components/quick-start/*` · `app/(app)/layout.tsx` · `components/layout/Sidebar.tsx` · `components/progress/ProgressSectionDropdown.tsx` · `app/(app)/{badges,capstones}/page.tsx` · `app/(app)/progress/{badges,capstones}/page.tsx` · `components/settings/ProfileSettingsTab.tsx`

### Database considerations
**No schema change**, but a real state hazard: `submitOnboarding` currently writes `username` and requires it **[FACT]**, and `username` powers the public portfolio route `/p/[username]`. Deferring it means users exist **without a username**.

**Mandatory before implementation:** verify every consumer of `users.username` tolerates NULL — the portfolio route, the leaderboard, certificates, referral codes, and admin views. If any assumes non-NULL, either generate a safe placeholder at signup or keep username in the single onboarding screen. **This is the highest-risk state change in Phase 5 and must be resolved before any code is written.**

**Existing vs new users:** existing users already have usernames and onboarding complete — they see no change. Only new signups take the shortened path. Existing users keep their current navigation entry points via redirects.

### Analytics / events
Phase 2 onboarding step markers become the primary evidence. Read `trackQuickStartSkipped` before deciding 5.2.

### Tests required
- onboarding completes with only goal + experience; `onboarding_completed` set correctly
- `proxy.ts` onboarding redirect still functions for both old and new shapes
- a user without a username does not break `/p/[username]`, the leaderboard, certificates or referrals
- redirects from the removed duplicate routes return 301 and land correctly
- profile settings can still set every deferred field
- existing E2E `signup-to-xp` spec updated and passing

### Security / performance / accessibility
- **Security:** fewer collected fields reduces PII surface — a net positive. Ensure the deferred fields still validate identically when collected later.
- **Accessibility:** the single onboarding screen must remain keyboard-navigable with correct labelling; `test:a11y` green.

### Manual QA checklist
- [ ] New signup → one onboarding screen → lands on first value
- [ ] Username-less account traverses dashboard, academy, lesson, leaderboard, settings, portfolio with no error
- [ ] Portfolio publish flow prompts for username at the right moment
- [ ] `/badges` and `/progress/badges` resolve to one canonical page
- [ ] Existing deep links still work
- [ ] Existing user sees no regression

### Production validation
Phase 2 funnel: onboarding start → complete; onboarding complete → first lesson opened; error rate on username-dependent routes.

### Success metrics
- **Primary:** signup → first lesson opened. **[HYPOTHESIS]** target **+15pp**.
- **Secondary:** onboarding completion rate; time from signup to first lesson open.
- **Guardrail:** portfolio publication rate must not collapse (deferring identity must not orphan the portfolio); zero errors on username-dependent routes.

### Experiment design
**E3, §6.** New signups only, so a clean A/B is available. If traffic is insufficient, ship 5.3 (zero-risk redirects) immediately and A/B only 5.1.

### Rollback plan
Revert. **Caveat:** any user who completed the shortened onboarding during the live window may lack a username. Rollback must not strand them — the profile settings path must remain available regardless of which onboarding version is live. Verify this before shipping.

### Dependencies
Phase 2 (step data), Phase 4 (if Phase 4 alone fixes activation, 5.1's scope may shrink), and the NULL-username audit above.

### Definition of Done
Experiment concluded; no username-related errors; duplicates consolidated with working redirects.

### Merge-to-main gate
CI green; NULL-username audit documented with every consumer listed; redirect tests present.

### Post-deployment verification
14 days on onboarding funnel and error rates.

---

## Phase 6 — Make the path real

### Objective
Make the personalization Prodily already promises actually affect where a learner goes, and stop the lock screen being the most-seen page for new users.

### Why this phase exists
F7, F8, F9. The lock enforces order but not competence (0/15 completes a lesson); 89 of 90 lesson links are dead ends for a new user with no lock affordance; search routes into the same wall; the PRD's second persona is architecturally impossible; and a logged-out stranger can read all 90 lessons while a registered user reads one. **The gate protects nothing that is not already public.**

### Scope
The unlock rule, recommendation persistence, and lock affordances. **The curriculum order, the content and all existing progress are unchanged.**

### Exact implementation work
1. **6.1 — Persist `recommendedModuleSlug`** at onboarding (currently computed, displayed, then discarded **[FACT]**) and use it to route the post-onboarding CTA.
2. **6.2 — Change the unlock rule** in `curriculum-access.ts` / `isLessonUnlocked`: **each module's entry lesson is open; sequence is preserved within a module.** Rigour where it teaches something; autonomy where it does not.
3. **6.3 — Add lock affordances** to the academy lesson list and search results so users stop clicking into dead ends. **This is independently valuable and ships even if 6.2 is killed.**
4. **6.4 — Resolve the access paradox.** Once 6.2 ships, revisit `proxy.ts:185`: redirecting an authenticated user from a readable public lesson to a locked one is indefensible. Either allow the read-only public view, or unlock it.

### Existing functionality repositioned
`curriculum-access.ts`, `path-resolver.ts` (whose "never reorders" invariant is **deliberately amended** — document the change in `docs/` as a decision record), the academy page, `SearchOverlay`, the onboarding recommendation.

### Repository areas
`lib/curriculum-access.ts` · `lib/lessons-completion-service.ts` (`isLessonUnlocked`) · `lib/personalization/path-resolver.ts` · `app/(app)/academy/page.tsx` · `app/(app)/academy/[moduleSlug]/[lessonId]/page.tsx` (lock screen) · `components/search/SearchOverlay.tsx` · `app/onboarding/actions.ts` · `proxy.ts`

### Database considerations
One additive column for the persisted recommendation (or reuse existing `users` personalization columns — `goal`, `career_role`, `onboarding_topics` already exist **[FACT]**, so **prefer deriving it at read time via `resolvePersonalizedPath` and store nothing**). Deriving is strongly preferred: no migration, no backfill, no drift.

**Existing vs new users:** every existing learner gains access to 8 additional module-entry lessons immediately. **No progress is lost and nothing is re-locked** — this is purely additive access. Capstone gating (8 of 10 module lessons) is unchanged, so certificates and badges keep their integrity. **The behavioural risk is scattering:** a learner who jumps between modules may complete less overall. That is the guardrail.

### Analytics / events
Phase 2: lessons completed per user over 30 days; module-switching rate; search → lesson-open → completion rate; lock-screen impressions (should fall sharply).

### Tests required
- module-entry lessons unlock without prerequisites; mid-module lessons still require the preceding lesson
- **no existing user loses access to anything** (explicit regression test)
- capstone gating unchanged
- lock screen shows the correct prerequisite for mid-module lessons (preserve the existing `getCanonicalPrerequisiteRange` behaviour)
- search results carry accurate lock state
- existing `curriculum-prerequisite-access.test.ts` and `path-resolver.test.ts` updated to encode the new rule deliberately, not silently

### Security / performance / accessibility
- **Security:** none — the content is already public (F8).
- **Accessibility:** lock affordances must be conveyed non-visually (`aria-disabled` plus text, not colour or icon alone).

### Manual QA checklist
- [ ] New user can open module 2's first lesson directly
- [ ] Lesson 15 (mid-module) still requires lesson 14
- [ ] Existing mid-curriculum user retains everything and gains entry lessons
- [ ] Search shows lock state accurately
- [ ] Capstone still requires 8 of 10
- [ ] Post-onboarding CTA lands on the recommended module's entry lesson

### Production validation
Experiment **E4**, §6.

### Success metrics
- **Primary:** **lessons completed per user at D30.** Deliberately *not* lesson-1 completion — the point is total learning, not funnel-step optics.
- **Secondary:** search → lesson-open → completion; lock-screen impressions; recommended-module completion rate.
- **Guardrail:** **first-lesson completion rate must not fall.** If unlocking causes scattering and lower completion, revert 6.2 and keep 6.1/6.3.

### Experiment design
**E4, §6.** Cohort test on new signups. **This is a genuine product bet with a real downside** — the guardrail is not a formality.

### Rollback plan
Feature-flag the unlock rule. Reverting **re-locks** lessons an existing user may have opened but not completed — a visibly worse experience than never having unlocked. **Mitigation: on revert, grandfather any lesson a user has already opened (`in_progress`) so nobody loses access they had.** This must be implemented as part of the flag, not improvised during an incident.

### Dependencies
Phase 4 (if shorter lessons alone fix activation, 6.2's urgency drops), Phase 5, Phase 2.

### Definition of Done
Experiment concluded; decision recorded; `path-resolver.ts` invariant change documented as a decision record in `docs/decisions/`.

### Merge-to-main gate
CI green; flag defaults to control; grandfathering logic tested; no-access-lost regression test present.

### Post-deployment verification
30-day window — the primary metric is a D30 measure and cannot be read sooner.

---

## Phase 7 — Make the payoff visible

### Objective
Make the capstone → portfolio → certificate outcome a visible destination from the first session rather than an unreachable rumour.

### Why this phase exists
Capstones are the only credible differentiator against free PM content, and they require 8 of 10 module lessons **[FACT]** — roughly 5 hours of reading before Phase 4, less after. Nine fully-specified deliverables with scenarios, requirements and starter templates sit in `config/capstones.ts`, essentially unseen.

### Scope
Capstone visibility, review expectations, and the removals deferred from earlier phases.

### Exact implementation work
1. **7.1 — Surface the capstone from lesson 1.** Show the module's capstone as a visible, locked destination with its real deliverable description from `CAPSTONE_DEFINITIONS` **[FACT]**. Repositioning existing content — not a new feature.
2. **7.2 — Set and display a capstone review SLA.** Review is manual admin work with no stated turnaround **[FACT]**. A submitted capstone that is never reviewed converts the product's best moment into its worst. Either commit to a window and show it, or state plainly that review is best-effort. **Honesty is the requirement; the specific SLA is a business decision.**
3. **7.3 — Removals:** the hardcoded `dueCount: 5` if not already fixed in Phase 1; any dead nav left after 5.3.
4. **7.4 — Fix the feedback instrument.** `LessonFeedbackWidget` measures *clarity* with tags including "Pacing Too Fast" but **no "too long" tag** **[FACT]** — it cannot detect the problem this entire plan addresses. Add a length dimension and a single churn question. **Modifying an existing widget, not building a new one.**

### Existing functionality repositioned
`config/capstones.ts`, the capstone pages, the portfolio, `LessonFeedbackWidget`.

### Repository areas
`config/capstones.ts` · `app/(app)/capstones/*` · `lib/capstones-db.ts` · `components/feedback/LessonFeedbackWidget.tsx` · `app/api/v2/lessons/[lessonId]/feedback/route.ts` · `components/admin/CapstoneReviewDrawer.tsx`

### Database considerations
7.4 may need an additive column on the lesson-feedback table for the new dimension. Additive, nullable, no backfill. Existing feedback rows remain valid.

### Analytics / events
Capstone page views from non-eligible users; capstone-1 start and submission rate; feedback tag distribution including the new length dimension.

### Tests required
- capstone preview renders for a non-eligible user without granting access
- submission gating unchanged (still 8 of 10)
- feedback widget accepts and persists the new dimension; existing rows unaffected
- existing `test:capstones` and `lesson-feedback` suites pass

### Security / performance / accessibility
- **Security:** the preview must not expose submission endpoints to ineligible users — verify the existing `CAPSTONE_LOCKED` server-side guard still rejects **[FACT]**.
- **Accessibility:** locked-state preview conveyed non-visually.

### Manual QA checklist
- [ ] Lesson 1 shows the module capstone as a locked destination with real description
- [ ] Ineligible user cannot save a draft or submit (server rejects)
- [ ] Review SLA displayed on submission
- [ ] Feedback widget shows the length dimension and saves
- [ ] Existing feedback still renders in admin

### Production validation
Capstone preview views; capstone-1 submission rate; length-tag frequency (a direct read on whether Phase 4 went far enough).

### Success metrics
- **Primary:** capstone-1 submission rate among activated users. **Target 10%.**
- **Secondary:** portfolio publication rate; feedback response rate.
- **Guardrail:** no increase in blocked-submission errors.

### Experiment design
**[HYPOTHESIS]** that visibility drives pursuit. Before/after, given the small eligible population. **Additionally recorded for a future decision:** whether capstone-starters retain better than lesson-completers — if they do, Prodily's centre of gravity should shift toward application, which is a strategy finding, not a phase.

### Rollback plan
Revert. Additive column stays.

### Dependencies
Phase 4 (which shortens the distance to eligibility and therefore determines whether anyone reaches this at all).

### Definition of Done
Preview live, SLA displayed or best-effort stated, feedback instrument fixed.

### Merge-to-main gate
CI green; server-side gating regression test present.

### Post-deployment verification
30 days — the eligible population is small and slow-moving.

---

## Phase 8 — Reduce auth friction *(CONDITIONAL — do not start without the gate)*

### Objective
Reduce signup abandonment without weakening abuse controls.

### Entry gate — all three required
1. Phase 2 data shows signup → verified is a **major** drop point (>25% loss).
2. A security review of the two 2026-09 signup-abuse incident investigations referenced in `docs/INDEX.md` **[FACT]** concludes the proposed change does not reopen the vector.
3. Phases 3–6 have shipped and the remaining loss is genuinely at the entrance.

### Why this phase exists — and why it is last
The audit recommended Google OAuth **and** letting unverified users complete lesson 1. **The second half is retracted.** `docs/INDEX.md` references two signup-abuse incidents and "signup-reopening criteria" **[FACT]**; Turnstile and mandatory verification are almost certainly deliberate countermeasures, and `vansh_dec` extends this work further. Relaxing verification could reopen a known, previously-exploited vector.

**Justification for a genuinely new capability.** Google OAuth is a new integration, not a repositioning — so it needs explicit justification. It qualifies because it *removes* the email round-trip while *strengthening* identity assurance (a verified Google identity is stronger evidence than a self-asserted email), improving conversion and abuse resistance together. It is the only auth change in this plan that does not trade safety for friction. **Do not relax email verification for password signups.**

### Scope
One additional auth provider. **No change to Turnstile, rate limiting, or the verification requirement for email/password signups.**

### Exact implementation work
Enable the Supabase Google provider; add the OAuth entry point to `/signup` and `/login`; ensure the OAuth callback establishes the same httpOnly cookie session the existing custom bridge uses; ensure `ensureUserProfile` handles OAuth-sourced profiles; ensure the onboarding redirect and consent capture from `vansh_dec` still apply to OAuth users.

### Repository areas
`app/(auth)/{signup,login}/page.tsx` · `app/api/auth/callback/*` · `lib/auth/session-cookies.ts` · `lib/auth.ts` (`ensureUserProfile`) · `proxy.ts` · `app/api/auth/signup/route.ts` (consent parity)

### Database considerations
No schema change. **State hazard:** an OAuth user arrives with `email_confirmed_at` already set and may have no `username` (interacting with Phase 5). Confirm `ensureUserProfile` creates a complete row. **Account linking:** if an email already exists as a password account, define the behaviour explicitly — silent linking is a security decision, not a convenience.

**Existing vs new users:** existing password accounts are unaffected. Existing users who later sign in with Google on the same email hit the account-linking path — it must be defined, not discovered.

### Tests / QA / validation
E2E OAuth signup → onboarding → first lesson; consent captured for OAuth users; account-linking behaviour tested explicitly; existing `signup-rate-limiting` and `incident-2026-09-09-signup-abuse` suites pass unchanged.

### Success metrics
- **Primary:** signup start → verified account. **Target +20pp for the OAuth path.**
- **Guardrails:** **abuse signals must not rise** — signup rate-limit trips, disposable-domain signups, and signups that never activate. Any increase triggers immediate revert.

### Rollback plan
Disable the provider in Supabase — no deploy needed. **Users who created accounts via OAuth must retain access**; verify a password-reset path exists for them before enabling.

### Definition of Done / merge gate
Security review signed; abuse guardrails instrumented **before** launch; account-linking behaviour documented.

---

# 4. Branch & Merge Strategy

## Principles
1. **One branch per phase, cut from the latest `main` at the moment the phase starts.**
2. **No stacking.** A phase branch is never based on another unmerged phase branch.
3. **Merge → deploy → observe → then start the next phase.** The observation window is part of the phase, not a follow-up.
4. **`main` is always deployable.** No phase leaves behind a dependency on unfinished later work.
5. **Feature-flag anything with a real downside** (Phases 4 and 6) so rollback does not require a deploy.

## Naming
`phase-0a/vansh-dec-integration` · `phase-0b/baseline-measurement` · `phase-0c/homepage-redesign` · `phase-1/email-reconnect` · `phase-2/funnel-instrumentation` · `phase-3/first-session-loop` · `phase-4/lesson-recut` · `phase-5/reduce-surface` · `phase-6/curriculum-access` · `phase-7/capstone-visibility` · `phase-8/oauth`

## Phase 0.A specifically

`vansh_dec` is 6 ahead / 0 behind `main` **[FACT]**, so:

```
git checkout main && git pull
git merge --ff-only vansh_dec
```

A fast-forward preserves the six commits individually, which matters for bisecting a 146-file change. **If `main` has advanced and the fast-forward fails, rebase `vansh_dec` onto `main` and re-run full CI before merging — do not force a merge commit through without a green build.**

Order of operations is mandatory:
1. Open a PR from `vansh_dec` → `main` so CI runs the full suite including `e2e`.
2. **Apply the migration to a staging database and verify; then apply to production.**
3. Merge and deploy.
4. Observe 24 h.
5. Only then cut `phase-0b/...` and `phase-0c/...` from the new `main`.

`vansh_dec` is deleted after the merge. **It must not continue to receive commits** — later work goes in phase branches.

## Parallelism
0.B (read-only) and 0.C (marketing-only) may run in parallel after 0.A because they share no files. **Phases 1 through 8 are strictly sequential.** Each has an observation window whose signal would be corrupted by a concurrent change to the same funnel.

## Per-phase PR requirements
Full CI green (`content:build`, `lint`, `typecheck`, `test`, `test:a11y`, brand hardening, production build; `e2e` where triggered); tests for the specific regression the phase fixes; the phase's Merge-to-main gate satisfied; rollback method stated in the PR description; for flagged phases, the flag defaults to **control** at merge.

---

# 5. Data & Measurement Plan

## 5.1 The measurement substrate — server-side, by necessity

Per correction **C2**: `vansh_dec` hard-gates GA4 and GTM behind cookie consent, and `trackEvent` no-ops without `window.gtag` **[FACT]**. **GA4 therefore cannot be the funnel.** It is retained for marketing analytics on consenting visitors only.

The funnel is derived server-side from tables that already exist **[FACT]**: `users`, `user_lesson_progress`, `quiz_attempts`, `xp_events`, `user_flashcard_srs`, `capstone_submissions`, `email_queue`, `notification_events`. Vercel Analytics (cookieless, ungated **[FACT]**) supplies pageviews for the marketing funnel.

## 5.2 The funnel

| Step | Definition | Source | Baseline |
|---|---|---|---|
| Visit | marketing pageview | Vercel Analytics | 0.C pre-period |
| Signed up | `users.created_at` | `users` | 396 |
| Verified | `email_confirmed_at` non-null | auth | **0.B** |
| Onboarding complete | `users.onboarding_completed` | `users` | **0.B** |
| First lesson opened | `user_lesson_progress` row exists | progress | **0.B.3** |
| Theory read | `theory_read_at` non-null | progress | **0.B.4** |
| **First lesson completed** | `status='completed'` | progress | **76 (19%)** |
| Returned D1 / D7 | distinct `xp_events` days | `xp_events` | **0.B** |
| Continued | completed-lesson count distribution | progress | **0.B** |
| Review habit | `xp_events.source_type='flashcard'` | `xp_events` | **0.B.6** |
| Capstone submitted | `capstone_submissions` | capstones | **0.B.8** |

## 5.3 North-star and supporting metrics

**North star: signup → first lesson completed within 7 days.** Baseline 19%.

| Metric | Baseline | Target | Owning phase |
|---|---|---|---|
| Visit → signup | unknown | +20% rel. | 0.C |
| Signup → first completion | 19% | 45% | 3, 4, 5 |
| Median time to first completion | ~40 min est. | <10 min | 4 |
| Lesson 1 → lesson 2 | unknown | +15pp | 3 |
| D7 return | unknown | 25% | 1, 3 |
| Lifecycle email reach | ~0% | 100% of non-opted-out | 1 |
| Weekly `/review` users | unknown | 40% of active | 3 |
| Lessons completed / user at D30 | unknown | +25% | 4, 6 |
| Capstone-1 submission | ~0 | 10% of activated | 7 |

## 5.4 Cadence
Baseline before each phase merges. Daily guardrails for the first 7 days after Phases 1, 4 and 6. Weekly readouts during experiment windows. Decision gate at the end of each observation window, recorded in writing.

## 5.5 Attribution discipline
Phases are sequential and each carries its own observation window precisely so effects are attributable. **Do not start the next phase during the previous phase's window.** Where an experiment is running, the holdout or control is the comparison — not the historical baseline.

---

# 6. Experiments & Decision Gates

### E1 — Lifecycle sequences (Phase 1.5)
- **Hypothesis:** stalled and lapsed users do not return because nothing asks them to, not because they rejected the product.
- **Change:** three automated sequences (D+1 never-started, D+3 stalled, streak-broken).
- **Control:** 30% holdout per segment, no sequence.
- **Treatment:** 70% receive the sequence.
- **Primary:** D14 return rate per segment.
- **Secondary:** first-lesson completion among the never-started segment.
- **Guardrails:** unsubscribe <2% per send; complaints <0.1%.
- **Observation:** 14 days minimum. **Sample caveat:** the never-started segment is ~320 users, so a 70/30 split gives ~224 vs ~96 — adequate for a large effect, underpowered for a small one. **Read the result as directional and say so.**
- **Success:** ≥5pp lift in the treated group.
- **Kill:** <2pp lift, or any guardrail breached.
- **Decision:** success → make permanent and extend. Kill → silence was not the constraint; prioritise Phase 4 and treat the base as genuinely lapsed.

### E2 — Core / Deep-dive split (Phase 4)
- **Hypothesis:** a ~40-minute first lesson is the primary activation barrier; a ~7-minute Core path materially raises completion without harming learning.
- **Change:** Core completion + 5-question quiz; Deep dive visible and optional.
- **Control:** current full-lesson experience.
- **Treatment:** Core/Deep-dive, 50/50 randomised **on new signups only**.
- **Primary:** signup → first lesson completed.
- **Secondary:** median time to completion; D7 return; lessons completed in week 1; Deep-dive open rate.
- **Guardrails:** quiz accuracy must not fall materially vs the 0.B.7 baseline; Deep-dive open rate must not be near-zero.
- **Observation:** minimum 3 weeks. **At ~400 signups to date, weekly signup volume may make a well-powered split slow — if the projected time to significance exceeds 6 weeks, run it as a sequential before/after with a 3-week pre-period and label the result directional.**
- **Success:** +10pp activation with accuracy guardrail intact.
- **Kill:** no improvement, or accuracy falls materially.
- **Decision:** success → roll to 100%, update all time estimates. Kill → the barrier is the entrance; prioritise Phase 5. **Accuracy guardrail breached → Core is too thin; re-cut it rather than abandoning the idea.**

### E3 — One-screen onboarding (Phase 5.1)
- **Hypothesis:** the 4-step wizard's identity collection is a significant drop point.
- **Change:** goal + experience only; identity deferred.
- **Control:** current 4-step wizard.
- **Treatment:** single screen, 50/50 on new signups.
- **Primary:** signup → first lesson opened.
- **Secondary:** onboarding completion rate; time from signup to first open.
- **Guardrails:** portfolio publication rate must not collapse; zero errors on username-dependent routes.
- **Observation:** 3 weeks.
- **Success:** +15pp on the primary.
- **Kill:** no improvement, or any username-related production error.
- **Decision:** success → roll out. Kill → restore the wizard; the friction was tolerable. **Phase 2 step data should be consulted first and may make this experiment unnecessary** — if a specific step shows the drop, fix that step.

### E4 — Module-entry unlock (Phase 6.2)
- **Hypothesis:** absolute sequential locking suppresses total learning without protecting quality, since completion already ignores quiz score **[FACT]**.
- **Change:** each module's entry lesson open; sequence preserved within a module.
- **Control:** current strict sequence.
- **Treatment:** new-signup cohort, 50/50.
- **Primary:** **lessons completed per user at D30.**
- **Secondary:** search → lesson-open → completion; lock-screen impressions; recommended-module completion.
- **Guardrails:** **first-lesson completion must not fall**; module-1 completion must not fall materially.
- **Observation:** **30 days minimum** — the primary metric is a D30 measure.
- **Success:** +25% lessons completed per user with guardrails intact.
- **Kill:** guardrail breached, or total completion falls.
- **Decision:** success → roll out, keeping intra-module sequence. Kill → revert 6.2 **with grandfathering**, retain 6.1 and 6.3 (which are independently valuable).

### E5 — Homepage redesign (Phase 0.C)
- **Hypothesis:** a shorter, clearer page that shows real lesson content converts better than one that explains at length.
- **Change:** seven focused sections, real sample lessons, real testimonials, honest claims.
- **Control:** current homepage, 14-day pre-period.
- **Treatment:** new homepage, 14-day post-period. **Sequential, not randomised** — traffic is too low for a well-powered split and the page is a single coherent artefact.
- **Primary:** visit → signup rate (server-side).
- **Secondary:** bounce; scroll depth; sample-lesson clicks.
- **Guardrails:** LCP not worse by >10%; signup quality (later activation) not degraded.
- **Success:** +20% relative.
- **Kill:** signup rate falls or bounce rises materially → revert.
- **Decision:** directional by design; state the confidence limits in the readout.

---

# 7. Risk & Rollback Plan

| # | Risk | Phase | Severity | Mitigation | Rollback |
|---|---|---|---|---|---|
| R1 | Migration deployed after its consuming code → signup breaks | 0.A | **Critical** | Migration to staging → verify → production → **then** deploy | Revert deploy; migration is additive and stays |
| R2 | Pre-migration users with NULL consent columns cannot log in | 0.A | **Critical** | Explicit NULL-tolerance QA on an existing account — **blocking** | Revert merge |
| R3 | Turning email on triggers unsubscribes / spam complaints | 1 | High | 50-user cohort, 72 h, guardrails; 1.1 lands before 1.2 so existing opt-outs are honoured | **Admin global pause — no deploy needed** |
| R4 | Removing `.limit(100)` exceeds free-tier email quota | 1 | Medium | Verify quota and `email-governance.ts` limits pre-launch; paginate | Reinstate a higher limit |
| R4b | **Per-user email volume spikes.** Enabling `learning` *and* `achievements` at once means an active learner can receive daily reminder + weekly recap + module complete + badge earned + level up in a single week — from near-silence to five streams **[INFERENCE]** | 1 | High | `email-governance.ts` and `daily-quota-key.ts` already implement per-user rate limiting by priority category **[FACT]** — **verify the effective per-user weekly cap before the 50-user cohort, not after.** If no weekly cap exists, add one before widening | Per-automation toggle disables a single stream without touching the rest |
| R5 | **XP rescaling from a 5-question quiz distorts leaderboard, levels and XP badges** | 4 | **High** | Decide explicitly before implementation; prefer no rescale; never recompute historical XP | Flag off — but a rescaled cohort persists, which is why no-rescale is preferred |
| R6 | Core reads as truncated content; depth (the differentiator) is abandoned | 4 | High | Deep dive visible and labelled; Deep-dive open rate is a guardrail; content-owner sign-off | Flag off |
| R7 | Deferring username strands portfolio, leaderboard, certificates or referrals | 5 | **High** | **NULL-username audit of every consumer before any code is written**; placeholder if needed | Revert — but users created in the window must keep a working path to set one |
| R8 | Unlocking scatters learners and lowers total completion | 6 | Medium | Guardrail on first-lesson completion; cohort test | Flag off **with grandfathering of already-opened lessons** |
| R9 | Reverting the unlock re-locks lessons users have opened | 6 | **High** | Grandfathering built into the flag from the start, not improvised | N/A — prevented by design |
| R10 | OAuth reopens a known signup-abuse vector | 8 | **Critical** | Security review of both incident reports is an entry gate; abuse guardrails instrumented **before** launch; verification unchanged for password signups | Disable provider in Supabase; ensure OAuth users retain a password-reset path |
| R11 | Account-linking on OAuth silently merges accounts | 8 | High | Define behaviour explicitly before enabling | Disable provider |
| R12 | Homepage overclaims relative to the product | 0.C | Medium | Binding claims policy; second-reviewer sign-off; signup-quality guardrail | Revert marketing commit |
| R13 | Homepage testimonials fetch regresses LCP | 0.C | Low | Cached, never blocking, never above the LCP element | Revert |
| R14 | Overlapping phases make effects unattributable | All | **High** | Strictly sequential phases with observation windows; only 0.B and 0.C run in parallel | N/A — process control |
| R15 | Pre-instrumentation users miscounted as onboarding drop-offs | 2 | Medium | Label and exclude them; explicit test | Revert view |
| R16 | Amending the `path-resolver` "never reorders" invariant without a record | 6 | Medium | Decision record in `docs/decisions/` at merge | N/A |
| R17 | Underpowered experiments read as conclusive | 1, 4, 5, 6 | Medium | Sample caveats stated per experiment; directional results labelled as such | N/A — reporting discipline |

---

# 8. Final End-State

After all phases, using only capabilities that exist today:

**A visitor** lands on a short, clear page that says what Prodily is, who it is for and what they will walk away with — then shows them a real lesson rather than describing one. Two CTAs: start free, or read a sample. Every claim is true.

**Signing up** takes a form and one screen: goal and experience level. No product tour precedes the product. Identity for the public portfolio is requested when the portfolio first has something on it.

**The first session** is a ~7-minute Core lesson — objectives, theory, mental model, takeaways — and a 5-question quiz. Deep dive sits alongside it, clearly labelled, for anyone who wants the case studies, company examples, interview framing and frameworks that make Prodily's writing worth reading. **Nothing was deleted; it was sequenced.** First value arrives in under ten minutes.

**Finishing the quiz** lands on a completion screen with the next lesson named and one click away. Flashcards were already met mid-lesson as retrieval practice, not as an afterthought.

**The next day** the learner has a real three-minute option — a handful of due cards that keeps the streak alive — and a reminder that arrives *because* they were away, not because they were present. If they stall, a sequence asks once, usefully, and stops.

**The path** reflects what they said they wanted: the recommended module's entry lesson is where "Start Learning" goes. Any module's first lesson is open. Search finds a framework and opens it. A practising PM can use Prodily as a reference — the second persona in the PRD, finally servable. Within a module, sequence still holds, because there it teaches something.

**The payoff is visible from lesson one:** the module capstone, its real scenario and deliverable, named and waiting. Reaching it produces a portfolio artefact, a public profile and a verified certificate — the outcome the homepage promised, delivered by machinery that already existed.

**And the team can see all of it** — signup to verification to onboarding to first lesson to return to capstone — in one server-side funnel that does not depend on cookie consent, with each change attributable to the phase that shipped it.

No new product was built. The product that existed was connected.

---

# 9. Technical Remediation Track (T1–T5) — Status

> Added 2026-09-26. The technical remediation track ran in parallel to the product
> phases above, on branch `tech-fixes` (baseline `4748e2c` → HEAD). It is a separate
> workstream from Phases 0–8: it hardens security, reliability, performance, UX-state
> and operational resilience of machinery that already ships, rather than changing the
> product surface. Two of its fixes directly discharge findings named in this plan —
> **F1 (the dead inbox channel, `processor.ts` preference resolution)** and **F2 (the
> inverted / capped reminder audience)** — so those findings are now addressed in code,
> though their *product* metrics (activation, return rate) remain to be measured under
> the Phase 0.B baseline once deployed.

### Completed on `tech-fixes` (code + tests + migrations authored; validated locally)

| Phase | Area | Outcome |
|---|---|---|
| **T1** | Security & data integrity | Certificate issuance now enforces curriculum/module prerequisites; client `INSERT` on `certificates` revoked (RLS); admin deletion cascades to `auth.users` with self-/primary-/hierarchy guards; login resolves users via an O(1) `SECURITY DEFINER` RPC instead of `listUsers(1000)`; password-reset retry errors are classified, not leaked. |
| **T2** | Backend reliability | Notification preferences resolved from `user_notification_preferences` (fixes **F1**); XP triggers scoped + ledger-authoritative across INSERT/UPDATE/DELETE with trigger-depth guards; lesson completion wrapped in the atomic `record_lesson_quiz_completion` RPC; progress reset revokes only progress-derived badges and preserves account-level achievements; admin audit false positives removed via silent authorization probes. |
| **T3** | Performance & query | Keyset pagination + batch preference resolution in reminder crons (fixes **F2**'s 100-row ceiling); deterministic `created_at, id` keyset pagination for admin audit; parallelised SRS reads with an O(1) lesson map and batch persistence; supporting indexes. |
| **T4** | UX & state resilience | Dirty-form guard (`beforeunload` + in-app tab confirm), `saveCountRef` stale-response protection, semantic toast feedback; lesson-tab URL sync with `popstate`; surfaced theory-engagement errors; wired flashcard→reflection advance; academy accordion retention. |
| **T5** | Operational resilience | Email bounce/complaint webhook ingestion with Svix/Brevo verification, idempotency, suppression + preference sync; `GET /api/health` DB probe (200/503); single failover implementation (`sendEmailWithFailover`); repeated-failure and backlog alerts; timezone-aware reminder/recap delivery windows; unified retry processing (deprecated redundant `retry-failed` cron). |

### Final-review fixes (2026-09-26, this pass — beyond the five phase reports)

1. **Queue capacity-exhaustion mis-classification (High).** `processor.ts` classified provider failures on the human-readable `error` string instead of `providerCode`. A Brevo `HTTP 400 {"code":"not_enough_credits"}` (no message) was read as a *permanent* bad-request and **dead-lettered** instead of retried. Fixed to classify on `providerCode` (falling back to `error`); regression test added.
2. **Timezone-aware crons never fired for most users (High).** T5.4 added a per-user *local-hour* (and local-day) delivery gate, but the GitHub Actions scheduler still triggered `daily-reminder` once/day (03:30 UTC) and `weekly-recap` once/week (Mon 03:30 UTC). With every default-preference user on UTC/09:00/Sunday-18:00, the gate could never match and **no reminders or recaps were sent**. The scheduler now invokes both endpoints **hourly** (`30 * * * *`); the per-user gate plus the local-date idempotency key make delivery exactly-once. Two stale committed tests that had shipped **red** (`integrity-verification`, `b8g-typed-db-migration`) were reconciled/fixed.
3. **Typed data-layer escape hatch reinstated (Medium).** T2 reintroduced `as unknown as` casts into `lessons-db.ts` and `settings-service.ts`, violating the B8-G invariant. The `record_lesson_quiz_completion` RPC was added to the generated DB types and the casts removed.

### Remaining — production deployment / configuration (NOT complete)

These are **manual, out-of-band** steps. None have been performed; production has not been touched.

- Apply migrations `20260925000001` (T1 security), `20260925000002` (T2 reliability), `20260925000003` (T3 performance), `20260926000001` (T5 operational) to the Supabase production database, in filename order. Each migration file carries its own inline description and safety notes.
- Set/verify env: `BREVO_API_KEY`, `BREVO_WEBHOOK_SECRET`, `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `CRON_SECRET`.
- Deploy `tech-fixes` to Vercel; verify `GET /api/health` returns 200.
- Register webhook endpoints in the Brevo and Resend dashboards → `/api/email/webhooks`.
- Confirm the updated GitHub Actions scheduler is active on the default branch (hourly reminder/recap trigger).
- Backfill per-user `timezone` where available; users without one default to UTC delivery windows (acknowledged operational risk).

### Deferred / non-blocking

- Per-user `preferred_recap_day` / `preferred_recap_hour` are not persisted (no columns); weekly recaps use the Sunday-18:00 local default for all users. Wiring these to the schema is a future enhancement, not a regression.
- Historical certificates forged before the T1 RLS/prerequisite hardening remain in the database; audit/revocation is an optional data-cleanup task.

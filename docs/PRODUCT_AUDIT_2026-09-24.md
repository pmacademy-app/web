# Prodily — Product, UX, Learning & Retention Audit

**Date:** 2026-09-24
**Scope:** Full repository audit from a product / UX / learning-design / engagement / retention perspective.
**Method:** Read the live flows end to end — signup, the auth proxy, onboarding, the academy, the lesson shell, the quiz/XP/completion services, the notification queue, the crons, and the compiled content corpus.
**Constraint:** Diagnosis only. No code changes. Recommendations prioritise fixing what already exists over adding anything new.

**Context:** 396 registered users · 76 have completed their first lesson (19%) · some engaged users stayed only 2–3 days.

---

## The one-sentence diagnosis

**Prodily is engineered as a 600,000-word textbook with a gamification layer on top, but it is marketed, instrumented, and measured as a habit product — and the machinery that would connect the two (personalization, reminders, the completion loop) is built but not wired up.**

The two numbers have two different root causes:

- **396 → 76 (19% activation)** is a *cost-of-entry* problem. A new user passes ~12 screens and a ~40-minute task before the first payoff.
- **"engaged 2–3 days then stopped"** is a *silence* problem. Traced to the wire: **no learning or achievement email ever reaches a user.** Not one. See Root Cause 4 — it is the highest-leverage fix in the repository and it is a handful of lines.

---

## 1. What is genuinely working

Do not break these.

1. **The content is excellent.** `content/lessons/lesson-001.md` is better-written than most paid PM courses — opinionated, structured, honest about failure modes. This is the moat.
2. **The content pipeline is a real asset.** 21 typed block kinds compiled to static JSON with stable `les_` IDs (`apps/web/lib/lesson-loader.ts`, `content/dist/`). This is what makes almost every fix below cheap.
3. **Capstones → portfolio → certificate** is the only credible differentiator against free PM content. Nine real deliverables with requirements and rubrics (`apps/web/config/capstones.ts`).
4. **The mechanics are correctly chosen:** SM-2 spaced repetition, streaks *with freezes* (`apps/web/lib/streaks/streaks.ts`), XP idempotency, skill radar. The designs are right.
5. **Engineering quality is high** — 2,180 tests, error monitoring, email governance, a serious admin console.

The problem is not craft. It is that the craft was spent on depth and infrastructure rather than on the first 10 minutes and the return visit.

---

## 2. Root cause 1 — Activation: twelve screens before the first idea

The path from "Start Learning Free" to understanding one PM concept:

| # | Step | Friction |
|---|---|---|
| 1 | Signup: name, email, password, terms ✓, age ✓, **Turnstile CAPTCHA** | No Google/OAuth anywhere |
| 2 | Leave the product, check email, click verify | `apps/web/proxy.ts:419` hard-redirects unverified users to `/login?error=email_not_confirmed` |
| 3 | Log in again | |
| 4–7 | **4-step mandatory wizard** (`apps/web/app/onboarding/OnboardingWizard.tsx`) — globally unique username, display name, avatar, bio, LinkedIn/X/GitHub/website, experience, goal, ≥1 topic, learning style. No skip; `proxy.ts:431` forces it. | Asking for a *public portfolio identity* from someone who has learned nothing yet |
| 8–15 | **8-step product tour auto-fires** on the first app page (`apps/web/components/quick-start/QuickStartContext.tsx:45`) — leaderboard, capstones, badges, portfolio, settings | Selling features to someone with zero investment |
| 16 | Land on `/academy` — nine **collapsed** accordions, a 0% pie chart | No dominant "Start Lesson 1" CTA; the resume control is a hover-play pie widget |
| 17 | Lesson 1: 22 blocks, ~7,000 words, 25 min estimated read | |
| 18 | Must hit **≥45s active AND ≥80% scroll** to record theory (`apps/web/lib/xp/xp.ts:258`) | Fails **silently** — the client catches the 400 and advances anyway (`lesson-content.tsx`), so the user never learns it did not count |
| 19 | **15-question quiz** | Not 5. Every lesson has exactly 15. |

19% conversion through that is not surprising. It is arguably good.

The "Explore Prodily" button on the last wizard step routes to `/dashboard`, where a new user sees **three empty cards** (0 flashcards due, no capstone, no streak) plus a recent-activity ticker with nothing in it.

---

## 3. Root cause 2 — The unit of work is ~40 minutes

Measured from the compiled corpus (`content/dist/lessons/`):

- **90 lessons, ~600,000 words** (avg ~6,700 words/lesson; largest ~11,000)
- **Average `estimatedReadingTime`: 34 minutes.** Max: 60.
- **1,350 quiz questions** (15 per lesson, no variance)
- 21 block types per lesson: theory → commonMistakes → mentalModel → mermaid → companyExample → realWorldPerspective → caseStudy → framework → interviewPerspective → summary → keyTakeaways → cheatSheet → glossary → resources → connections

Lesson 1 alone is 25 min reading + 15 questions ≈ **40 minutes to first completion.**

Three consequences:

- **The daily habit bar is 40 minutes.** No product retains on a 40-minute minimum session. There is no 5-minute action available to a user with zero completed lessons — flashcards require a started lesson, review is empty, capstones are locked.
- **The time estimates contradict each other.** Onboarding step 4 promises "~18–24 Hours"; `/academy` says "~45 Hours of Structured Practice." The real figure, reading only, is **51 hours** — before 1,350 questions, ~590 flashcards, 90 reflections and 9 capstones. Realistically 80–100 hours. An expectation is set and then violated in week one.
- **The 2–3 day drop-off is exactly what a 40-minute daily ask produces.** Users try it twice, discover the size of the commitment, and leave.

---

## 4. Root cause 3 — Personalization is theater

This is a broken promise rather than a gap.

- Onboarding step 4 shows a **"Recommended Starting Module"** with a "Recommended Match" badge, computed by `computeRecommendation()`. That result is **never persisted and never used for routing.** Both CTAs go to `/academy` or `/dashboard`.
- `apps/web/lib/personalization/path-resolver.ts` states it plainly:

  > *HARD ARCHITECTURAL INVARIANT: This function NEVER skips, reorders, or bypasses any lesson… Only the explanatory `milestoneReason` is personalized.*

  Personalization output is **one badge on the academy page and one sentence on the dashboard.** Everyone walks lessons 1→90 in identical order.
- **Locking is strictly sequential** (`apps/web/lib/curriculum-access.ts`): lesson *N* needs all of 1…*N−1* completed. For a new user, **89 of 90 lesson links are traps** that land on a "Lesson Locked" page — and the academy list renders no lock affordance, so they all look clickable.
- **Search is a dead end.** `SearchOverlay` routes to `/academy/{module}/{lessonId}` (`apps/web/components/search/SearchOverlay.tsx:232`) → lock wall for anything ahead of the user's position.
- **PRD §2 persona 2 — "Practicing PMs: refresh frameworks (RICE, Kano, North Star) via search and flashcards" — is architecturally impossible.** To reach the RICE lesson they must first complete ~28 lessons, ~16 hours of reading. A documented target audience that the core invariant forbids.

Four personalization questions are asked, a personalized plan is shown, and a fixed track is delivered. That is worse than not asking: it converts a neutral experience into a felt bait-and-switch. The onboarding data's only real consumer today is **admin broadcast filtering** (`apps/web/lib/admin/user-filter-query.ts`).

---

## 5. Root cause 4 — The retention channel is disconnected at the wire

**This is the finding to act on first.** Three independent defects stack:

### (a) The queue never loads the user's preferences

`apps/web/lib/notifications/queue/processor.ts:104`:

```ts
const userPrefs = createDefaultNotificationPreferences(params.userId)
```

It constructs *defaults* instead of reading the stored row. Every preference toggle in `/settings` is inert for email.

### (b) Those defaults disable exactly the retention emails

`apps/web/lib/notifications/preferences/defaults.ts` sets `learning: { email: false }` and `achievements: { email: false }`. `medium` and `low` priority cannot bypass preferences (`apps/web/lib/notifications/constants.ts`). Cross-referencing the connectors and crons, these are **all silently dropped**:

| Template | Category / priority | Reaches the user? |
|---|---|---|
| `learning.daily_reminder` | learning / medium | ❌ dropped |
| `learning.weekly_recap` | learning / medium | ❌ dropped |
| `learning.module_complete` | learning / medium | ❌ dropped |
| `achievement.badge_earned` | achievements / medium | ❌ dropped |
| `achievement.level_up` | achievements / medium | ❌ dropped |

Only auth, certificate, portfolio-published and manual admin broadcasts survive. The defaults file's own header comment says module completion *is* enabled by default — the code disagrees with its documentation.

The queue, dual providers, governance, retries, idempotency, the admin communications console, and the GitHub Actions scheduler — an enormous investment — currently deliver **nothing** to a learner's inbox in the normal case.

### (c) Even once (a) and (b) are fixed, the audience is inverted

`apps/web/app/api/cron/daily-reminder/route.ts:73`:

```ts
.gt('current_streak', 0).limit(100)
```

It emails **only people who are already engaged**, and goes silent the moment someone's streak breaks — precisely the users who churned. `limit(100)` also means 296 of 396 users are unreachable regardless. `dueCount: 5` is hardcoded into the email body.

There is **no lifecycle sequence at all** for:

- signed up, never opened a lesson (**the 320-user segment**)
- started lesson 1, never finished
- was active, then went quiet

Meanwhile `weekly-recap` targets *all* users, so a fixed version would send inactive learners a cheerful "0 lessons, 0 XP, 0-day streak" summary — a demotivation email.

**A user who signs up and stalls receives exactly two emails, ever: verify and welcome. Then nothing, forever.** That is the whole explanation for "stayed 2–3 days."

---

## 6. Root cause 5 — The learning loop never closes, and the reward comes after the work

- **Flashcards and Reflection are locked until the lesson is already complete** (`isFlashcardsUnlocked = progress.status === 'completed'`). Retrieval practice — the thing that actually makes learning stick — is placed *after* the user has been told they are done, where nobody goes.
- **The "Lesson Completed!" screen only renders if the user submits the optional reflection.** `completedThisSession` is set solely by `handleReflectionComplete`. Finish the quiz and skip reflection — the single highest-intent moment in the product — and the user is left sitting on the quiz tab.
- **The post-quiz CTA is "Continue to Flashcards →"**, not "Next lesson." The momentum handoff points sideways.
- **Completion is score-independent.** `recordQuizAttemptAction` calls `completeLesson()` regardless of score — 0/15 completes the lesson and unlocks the next one. The sequential lock therefore enforces *order*, not *mastery*. **It buys nothing pedagogically and costs everything in autonomy.** This is the core contradiction in the product.
- **The payoff is unreachable.** Capstones need 8 of 10 module lessons (~5 hours of dense reading), then **manual admin review**. The differentiated, shareable, motivating artifact is behind a wall essentially no one has reached.
- Flashcard unlock rules are inconsistent: the review hub unlocks cards for `in_progress` lessons, the lesson tab requires `completed`.

---

## 7. What is being overlooked

1. **The funnel is invisible.** `apps/web/lib/analytics.ts` has `trackLessonStarted`, `trackQuizCompleted`, `trackHeroCTAClick` — and **nothing** for signup started/completed, email verified, onboarding step viewed, onboarding completed, or tour skipped. The 396→76 gap spans the one stretch with zero telemetry. Every prioritisation decision below is a hypothesis until this is instrumented.
2. **All 90 lessons are already public.** `generateStaticParams` in `apps/web/app/(marketing)/lessons/[slug]/page.tsx` statically generates the entire curriculum at `/lessons/lesson-XXX` (noindex except 3 samples). **Anonymous visitors have freer access to the content than logged-in users do.** The wrong people are being gated. This is also a large, unused try-before-you-sign-up asset — linked from exactly one place, a small "lesson-001" link in the marketing curriculum section.
3. **Navigation is duplicated and oversized.** 8 top-level items + 6 Progress children = 14 destinations, with `/badges` vs `/progress/badges` and `/capstones` vs `/progress/capstones` as genuine duplicate routes — for a product whose job is "open the next lesson."
4. **The feedback widget asks the wrong question.** It measures *clarity* (1–5 stars + tags like "Too Technical", "Pacing Too Fast"). There is no tag for *too long*, the single most likely complaint about a 7,000-word lesson, and no churn/exit survey anywhere. There is no mechanism to discover the problem this audit describes.
5. **Marketing sells "interactive, gamified."** The delivered experience is a long-form essay followed by multiple choice. Every user's first session tests that promise against reality.

---

## 8. Assumptions worth challenging

| Assumption | Assessment |
|---|---|
| *Sequential completion protects learning integrity* | It cannot — completion ignores the score. It is sequence theater with real autonomy costs. |
| *The 90-lesson curriculum is the product* | The corpus is the **moat**. The product is the shortest path to something a PM can *do*. Right now the corpus **is** the path, and it is 80 hours long. |
| *More depth = more value* | Depth is the quality bar and should stay — but as an **optional layer**, not as the mandatory unit of work. |
| *Gamification drives retention* | XP/badges/levels/leaderboard with no delivery channel (RC4) and no sub-5-minute daily action are inert. The scoreboard was built; the game was not. |
| *Free lowers expectations* | Free means **zero switching cost**. The bar for the first 10 minutes is higher, not lower. |
| *Onboarding data personalizes the experience* | Today it feeds admin broadcast filters and two strings of UI copy. |
| *The retention problem is motivational* | It is mechanical. Fix the wire before touching motivation design. |

---

## 9. What the ideal Prodily looks like — using what already exists

Ordered by leverage per unit of effort. **No new features.**

### A. Fix the wire — days, not weeks (P0)

- Load the stored preference row in `enqueueNotificationItem` instead of `createDefaultNotificationPreferences`.
- Flip `learning` and `achievements` email defaults to `true` for milestone + reminder templates (the docs already say they should be).
- **Invert the daily-reminder audience:** target `last_activity_date < today`, not `current_streak > 0`. Remove `limit(100)`; paginate.
- Suppress the weekly recap when the week had zero activity — or swap it for a restart nudge.
- Build three lifecycle sequences from templates and broadcast machinery already owned: **D+1 signed-up-never-started**, **D+3 started-never-finished**, **streak-broken comeback**.

This alone plausibly moves both numbers more than anything else on this list.

### B. Re-cut the unit of work without rewriting a word (P1)

The blocks are already typed and separable. Split every lesson in `getBlocksForTab`:

- **Core (~7 min):** `learningObjectives` → `theory` → `mentalModel` → `keyTakeaways` → 5 questions
- **Deep dive (optional):** `caseStudy`, `companyExample`, `realWorldPerspective`, `interviewPerspective`, `framework`, `cheatSheet`, `resources`, `connections`

**Completion = Core.** Same markdown, same compiler, same content, different grouping. This turns a 40-minute obligation into a 7-minute one, makes the streak physically achievable, and makes the depth a reward for engaged users instead of a tax on new ones. Highest-impact change available; touches almost no content.

### C. Land the loop (P1)

- Render "Lesson Completed" on **quiz** completion, not reflection.
- Post-quiz primary CTA = **"Next lesson: {title}"** with module progress; flashcards and reflection secondary.
- Move flashcards to **after theory, before quiz** — retrieval practice where it belongs.
- Surface the theory engagement failure instead of swallowing it.

### D. Make personalization real (P2)

- Persist `recommendedModuleSlug` at onboarding.
- Route **"Start Learning"** to the first lesson of the recommended module — not to a collapsed `/academy`.
- Replace global sequential locking with **"any module's entry lesson is open; sequence within a module."** Search stops being a trap, and the practicing-PM persona becomes real for the first time.

### E. Collapse the entrance (P2)

- Wizard → **one screen**: goal + experience. Defer username/avatar/bio/socials to the moment the portfolio first matters (first capstone).
- Delete the 8-step tour, or fire it **after** lesson 1 when the features mean something.
- Add Google OAuth. If verification must stay, let unverified users complete lesson 1 and gate at lesson 2 — verify the email *after* they have felt value.

### F. Instrument (P0, alongside A)

`signup_started`, `signup_completed`, `email_verified`, `onboarding_step_viewed`, `onboarding_completed`, `tour_skipped`, `first_lesson_opened`, `theory_scroll_depth`, `first_quiz_submitted`, `day_2_return`. Surface as one funnel view in the existing admin console.

### G. Clean the IA (P3)

Collapse `/badges` + `/progress/badges` and `/capstones` + `/progress/capstones`. Add lock affordances to the academy lesson list. Add a "too long" tag and a one-question exit survey to the feedback widget.

---

## 10. What to measure afterwards

| Metric | Today (est.) | Target |
|---|---|---|
| Signup → first lesson completed | **19%** | 45%+ |
| Median time to first completion | ~40 min | **<10 min** |
| D7 return | unknown (uninstrumented) | 25%+ |
| Learners receiving ≥1 lifecycle email | **~0%** | 100% |
| Learners reaching capstone 1 | ~0 | 10% of activated |

---

## 11. The one thing not to do

**Do not add features.** There is more product surface than 396 users can consume. Every root cause above is something already built that is disconnected, mis-sequenced, or mis-targeted by a few lines.

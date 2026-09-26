# Prodily — Product Improvement Blueprint

**Date:** 2026-09-24
**Companion to:** [`PRODUCT_AUDIT_2026-09-24.md`](PRODUCT_AUDIT_2026-09-24.md)
**Scope:** How to improve Prodily using what already exists. No new features. No code changes made.
**Baseline:** 396 registered · 76 first-lesson completions (19%) · some engaged users stayed 2–3 days.

---

## 0. How to read this

Every claim carries an evidence grade:

| Grade | Meaning |
|---|---|
| **[FACT]** | Confirmed by reading the repository; file/line cited. Not a judgement. |
| **[INFERENCE]** | Follows from facts plus standard product reasoning, but not directly observed. |
| **[HYPOTHESIS]** | Plausible, unverified, and the blueprint says how to test it. |

**Nothing in this blueprint is a new feature.** Every item fixes, simplifies, repositions, connects, or removes something that already ships.

**Effort:** S = hours · M = days · L = a week or more.

---

## 1. Corrections to my own audit

The audit was written from a first read. Re-verifying it produced three material corrections and one sharpening. These change recommendations, so they come first.

### Correction 1 — I overstated the corpus by ~10%

Measured directly from `content/lessons/*.md` rather than from compiled JSON (my earlier count included JSON keys):

| | Audit said | Actual **[FACT]** |
|---|---|---|
| Total words | ~600,000 | **548,536** |
| Avg per lesson | ~6,700 | **6,095** |
| Largest lesson | ~11,000 | **7,798** |
| Pure reading @200wpm | 51 h | **45.7 h** |

Smallest lesson is 5,231 words — **every** lesson is long; there is no short one to start with. The conclusion stands, the magnitude was inflated. Corrected numbers are used throughout below.

### Correction 2 — "There is no short daily action" was **wrong**, and this is good news

I claimed no sub-5-minute action exists. It does, and it already works:

- `lib/srs.ts:137` — a card with no SRS record is **due immediately** **[FACT]**
- `lib/flashcards-service.ts:65` — cards unlock for lessons with status `completed` **or `in_progress` or `started`** **[FACT]**
- `lesson-content.tsx` calls `markInProgress()` on first open **[FACT]**
- `lib/flashcards-service.ts:279` → `updateUserStreak()` — a flashcard review **maintains the streak** **[FACT]**

**So the moment a user merely opens lesson 1, ~7 flashcards become due in `/review`, and reviewing them — a ~3-minute action — keeps their streak alive.** The short habit loop is built, working, and free.

Its actual problems are narrower and cheaper than I said:

1. It is invisible — nothing routes a new user there **[FACT: no CTA to `/review` outside the sidebar and one dashboard card]**
2. It is empty for anyone who never opened a lesson — i.e. the ~320-user segment **[FACT]**
3. It is positioned as *revision after learning*, not as *the daily thing you do* **[INFERENCE]**

This materially changes Phase 2: **reposition an existing loop rather than build a short path.**

### Correction 3 — "No email reaches users" needs precision

In-app notifications **do** fire: `learning.inApp = true` in the defaults, and `connectors.ts:43` calls `createInAppNotification` **[FACT]**. The bell works.

The accurate claim: **the inbox channel is dead, the in-app channel is alive.** But in-app only reaches someone who already came back — so it contributes nothing to retention while remaining an unhelpful place to invest. The diagnosis holds; the wording was sloppy.

### Sharpening — signing up *reduces* content access

Stronger than the audit stated, and fully confirmed:

- `/lessons/*` is absent from `isAppPage` in `proxy.ts` → **fully public, no auth** **[FACT]**
- `generateStaticParams` statically generates **all 90 lessons** at `/lessons/lesson-XXX` **[FACT]**
- `proxy.ts:185` redirects **authenticated** users from `/lessons/<slug>` to `/academy/<module>/<id>` — where the sequential lock applies **[FACT]**

**A logged-out stranger can read all 90 lessons. A registered user can read one.** Creating an account strictly removes access. This is the single strongest argument for changing the unlock model, and it costs nothing to notice.

### What survived re-verification unchanged

- `queue/processor.ts:104` constructs `createDefaultNotificationPreferences(userId)` and **never reads `user_notification_preferences`**, though that table exists and is written by `/api/settings/notifications` and the unsubscribe route **[FACT]**
- `learning` and `achievements` default to `email: false`; `medium`/`low` priority cannot bypass preferences **[FACT]** → daily reminder, weekly recap, module complete, badge earned, level up are all dropped **[FACT]**
- Admin automation toggles default to **enabled**, so the preference gate — not the admin toggle — is the blocker **[FACT]**
- `daily-reminder/route.ts:73` filters `.gt('current_streak', 0).limit(100)` **[FACT]**
- `completeLesson()` is called regardless of quiz score — 0/15 completes a lesson **[FACT]**
- The "Lesson Completed" screen renders only from `handleReflectionComplete` (line 468) **[FACT]**
- Flashcards + reflection tabs require `status === 'completed'` **[FACT]**
- Onboarding's recommended module is never persisted; `path-resolver.ts` declares it never reorders **[FACT]**

---

## 2. The root problem, stated once

Walk the journey and the same shape appears at every stage:

| Stage | Cost paid first | Value delivered |
|---|---|---|
| Signup | Identity, CAPTCHA, email round-trip, 4-step profile, 8-step tour | none |
| First value | ~30 min reading + 15 questions | first XP |
| Learning | Read 6,095 words | retrieval practice unlocks **after** being told you're done |
| Application | ~5 h of a module | capstone, then manual review with no SLA |
| Return | — | inbox silent; reminders target only the already-engaged |
| Progress | 45.7 h fixed sequence | one path for everyone |

> **Prodily places value downstream of a large commitment at every single stage, and nothing calls the user back when they stop.**

Four structural root problems, ranked by *evidence strength × reach × cheapness to fix*:

| # | Root problem | Grade | Reach | Cost to fix |
|---|---|---|---|---|
| **R1** | The inbox channel is disconnected at three independent points | **[FACT]** | All 396, incl. everyone already churned | **S** |
| **R2** | The activation task is ~40 min; the working 3-min loop is hidden behind it | **[FACT]** | All new users | **M** |
| **R3** | Completion ignores mastery, yet gating is absolute — so locking costs autonomy and buys nothing | **[FACT]** | All users, and both PRD personas | **M–L** |
| **R4** | The signup→first-lesson funnel has zero instrumentation | **[FACT]** | Every decision below | **S** |

R1 is the only fix that can reach people who **already left**. R4 is the only one that makes the rest measurable. They go first.

---

## 3. Sequencing logic

1. **Prove before building.** Phase 0 is queries, not code. Several claims here can be confirmed or killed in an afternoon from data you already store.
2. **Reach the lapsed before optimising the new.** 320 users never activated and 396 exist today. R1 addresses the existing base; everything else only helps future signups.
3. **Instrument before the big swing.** Phase 3 (re-cutting the lesson) is the highest-impact and highest-uncertainty change. Shipping it blind wastes the evidence.
4. **Behavioural change last.** Phase 5 alters the product's core promise (sequence). It should follow data, not precede it.
5. **Prioritised by impact and evidence, not convenience** — which is why Phase 3 sits ahead of the much easier Phase 4.

---

## Phase 0 — Prove it *(no product change)*

Effort **S**. Every claim below is answerable from tables you already populate.

| # | Question | How | Confirms / kills |
|---|---|---|---|
| 0.1 | Are retention emails really being dropped? | `select skipped_reason, count(*) from notification_events where skipped_reason like 'user_preference_disabled%' group by 1` — `recordSkippedEvent` writes this row on every block **[FACT]** | **R1.** A large `user_preference_disabled:learning` count confirms it outright |
| 0.2 | Has any learning email ever sent? | `email_queue` where `template_key` in the learning/achievement set and `status='sent'` | Near-zero confirms R1 independently |
| 0.3 | Split the 320 non-activators | `user_lesson_progress`: users with **no row** vs. `in_progress` on lesson 1 | "Never opened" = entrance problem (Phase 4). "Opened, bounced" = lesson-length problem (Phase 3). **This single split decides whether Phase 3 or Phase 4 is more urgent.** |
| 0.4 | How many stall at the engagement gate? | rows with `theory_read_at IS NULL` and `quiz_attempts = 0` but status `in_progress` | Sizes the silent-failure bug (2.5) |
| 0.5 | Where in the lesson do people stop? | GA4 `lesson_started` vs `theory_read` vs `quiz_completed` per lesson | Tests the "too long" hypothesis before rewriting anything |
| 0.6 | Is anyone using `/review`? | `xp_events` where `source_type='flashcard'`, distinct users | Tests Correction 2: is the short loop unused because it's hidden, or because it's unwanted? |
| 0.7 | Time from signup to first completion | `users.created_at` → earliest `completed_at` | Baseline for the headline metric |

**Deliverable:** a one-page funnel truth. If 0.3 shows most of the 320 never created a progress row at all, **Phase 4 swaps ahead of Phase 3.**

---

## Phase 1 — Reconnect the return path

**Why first:** [FACT]-grade, **S** effort, and the only phase that can reach users who already churned. Highest leverage-per-hour in the repository.

### 1.1 Read stored preferences in the queue processor
- **Why:** `processor.ts:104` builds defaults instead of loading `user_notification_preferences` **[FACT]**, so every toggle in `/settings` is inert for email.
- **Improves:** the existing settings page, unsubscribe route, and preferences table — all already built, all currently decorative.
- **Outcome:** user choices take effect; the preference system becomes real.
- **Depends on:** nothing.
- **Measure:** a preference change in `/settings` provably alters the next send.

### 1.2 Enable email by default for `learning` + `achievements` milestones
- **Why:** those categories default to `email: false`, and `medium` priority can't bypass **[FACT]** — dropping module-complete, badge-earned, level-up, daily reminder and weekly recap. The defaults file's own header says module completion *should* be enabled; the code contradicts its documentation **[FACT]**.
- **Improves:** 5 finished email templates, the connectors, the queue, dual providers, retries, governance — a large existing investment currently delivering nothing.
- **Outcome:** achievements leave the app and reach the inbox, where they can pull someone back.
- **Depends on:** 1.1 (otherwise the new defaults still can't be overridden by users).
- **Measure:** sent-vs-skipped ratio per template; open rate; click-through to `/academy`.
- **Risk:** this turns email on for people who've had near-silence. **Ship to a 50-user cohort first**, watch unsubscribe and complaint rate for 72 h before widening. The unsubscribe route already exists **[FACT]**.

### 1.3 Invert the daily-reminder audience
- **Why:** `.gt('current_streak', 0)` emails only the already-engaged and goes silent exactly when a streak breaks **[FACT]**. `.limit(100)` makes 296 of 396 users unreachable **[FACT]**. `dueCount: 5` is hardcoded into the body **[FACT]**.
- **Improves:** an existing cron, an existing template, an existing GitHub Actions schedule.
- **Outcome:** the reminder reaches lapsed users — the population that needs it.
- **Depends on:** 1.1, 1.2.
- **Measure:** reminder → session rate for lapsed users; **D7 reactivation of users idle 3–14 days.**
- **Also fix:** pass the real due count from `getReviewQueueData` instead of `5`.

### 1.4 Suppress the zero-activity weekly recap
- **Why:** weekly-recap targets all users **[FACT]**, so a fixed 1.2 would mail inactive learners "0 lessons, 0 XP, 0-day streak." **[INFERENCE]** that's a demotivation email.
- **Improves:** an existing template and cron.
- **Outcome:** the recap celebrates rather than accuses.
- **Depends on:** 1.2.
- **Measure:** unsubscribe rate on recap sends, split by activity level.

### 1.5 Three lifecycle sequences from existing broadcast machinery
- **What:** D+1 signed-up-never-started · D+3 started-never-finished · streak-broken comeback. Built from the admin broadcast system and templates that already exist **[FACT: `user-filter-query.ts` already supports inactivity filters]**.
- **Why:** there is **no** automated sequence for any of these states **[FACT]**. A stalled user receives verify + welcome and then nothing, forever.
- **Improves:** the admin communications console and audience-filter engine, currently manual-only.
- **Outcome:** the 320-user segment gets a second and third chance.
- **Depends on:** 1.1–1.3.
- **Measure:** **[HYPOTHESIS]** — hold out 30% of each segment for two weeks. Success = ≥5pp lift in lesson-1 completion for the treated group. If the lift is under 2pp, the problem is the product, not the silence, and Phase 3 becomes the priority.

---

## Phase 2 — Make the existing short loop the front door

**Why second:** Correction 2 means the daily habit mechanism is already built and working. This phase repositions it. Effort **S–M**, no new mechanics.

### 2.1 Promote `/review` as the daily action
- **Why:** unreviewed cards are due immediately and reviews maintain the streak **[FACT]** — a complete ~3-minute loop that is currently buried in the sidebar.
- **Improves:** `/review`, the SM-2 engine, `FlashcardReviewPromptCard`, the streak system — all built, all under-used.
- **Outcome:** a daily commitment a person can actually keep on a busy day, so streaks survive.
- **Depends on:** Phase 0.6 (confirm it's hidden, not unwanted).
- **Measure:** % of active users with ≥1 review/week; streak survival past day 3.

### 2.2 Route post-signup to lesson 1, not to `/academy`
- **Why:** both onboarding CTAs land on `/academy` (nine collapsed accordions, 0% pie) or `/dashboard` (empty cards) **[FACT]**. The user must *hunt* for the first lesson.
- **Improves:** the onboarding wizard's existing completion handler — a one-line destination change.
- **Outcome:** removes a navigation step at the highest-intent moment in the funnel.
- **Depends on:** nothing.
- **Measure:** onboarding-complete → lesson-1-open rate (needs Phase 6 instrumentation).

### 2.3 Land the completion loop
- **Why:** the "Lesson Completed" screen renders **only** from `handleReflectionComplete` **[FACT]**. Finish the quiz, skip the optional reflection, and you sit on the quiz tab. The post-quiz CTA is "Continue to Flashcards →", not "Next lesson" **[FACT]**.
- **Improves:** a celebration screen that is already designed and written, and currently almost never shown.
- **Outcome:** **[INFERENCE]** the single biggest lever on lesson-2 start rate — the moment of maximum momentum currently dead-ends.
- **Depends on:** nothing.
- **Measure:** lesson-1-complete → lesson-2-open rate, before/after.

### 2.4 Move flashcards before the quiz
- **Why:** flashcards and reflection require `status === 'completed'` **[FACT]** — retrieval practice is placed *after* the learner is told they're done.
- **Improves:** the flashcard deck block, already authored for all 90 lessons (~6.6 cards each).
- **Outcome:** better retention of the material, and first contact with the review loop inside the lesson, feeding 2.1.
- **Depends on:** 2.1 (consistent positioning).
- **Measure:** quiz score distribution before/after; `/review` adoption.
- **Note:** also resolves an existing inconsistency — the review hub unlocks `in_progress` cards while the lesson tab demands `completed` **[FACT]**.

### 2.5 Surface the theory-gate failure
- **Why:** `verifyTheoryReadEngagement` requires ≥45 s active **and** ≥80 % scroll `[xp.ts:258]`; the client catches the 400 and advances anyway **[FACT]**, so the user is never told it didn't count.
- **Improves:** an existing anti-gaming mechanism that currently produces silent, invisible failure.
- **Outcome:** no silent dead-ends; fewer users who think they progressed and didn't.
- **Depends on:** Phase 0.4 to size it.
- **Measure:** the 0.4 cohort should shrink toward zero.

---

## Phase 3 — Re-cut the unit of work

**Biggest expected impact. Highest uncertainty. Therefore: an experiment, not a rollout.**

### 3.1 Core / Deep-dive split via `getBlocksForTab`
- **What:** every lesson already compiles to 21 typed blocks **[FACT]**. Regroup them — no content rewritten, no compiler change:
  - **Core (~7 min):** `learningObjectives` → `theory` → `mentalModel` → `keyTakeaways` → 5 questions
  - **Deep dive (optional):** `caseStudy`, `companyExample`, `realWorldPerspective`, `interviewPerspective`, `framework`, `cheatSheet`, `resources`, `connections`
- **Why:** avg lesson is 6,095 words / 34 min estimated, then 15 questions **[FACT]** ≈ 40 min to first value. **[INFERENCE]** a 40-minute minimum session cannot sustain a daily habit.
- **Improves:** the block renderer, the tab shell, and the entire content library — reframed, not rewritten. **The depth becomes a reward for engaged learners instead of a tax on new ones.**
- **Outcome:** time-to-first-completion drops from ~40 min toward <10 min.
- **Depends on:** Phase 0.3 and 0.5; Phase 6 instrumentation.
- **Measure — run as an A/B on new signups, 50/50, 3 weeks:**
  - Primary: signup → first completion rate
  - Secondary: D7 return, lessons completed in week 1
  - **Guardrail:** quiz accuracy and Deep-dive open rate. If accuracy falls materially, Core is too thin.
- **[HYPOTHESIS]** Kill criterion: if activation doesn't improve by ≥10pp, the barrier is the entrance (Phase 4), not the lesson.

### 3.2 Completion = Core; sample 5 of the existing 15 questions
- **Why:** 15 questions per lesson, no variance **[FACT]** — 1,350 total. The remaining 10 are not wasted; they become retry variety and review material.
- **Improves:** the existing question bank and the already-present quiz shuffle logic.
- **Outcome:** shorter assessment, less fatigue, reusable bank.
- **Depends on:** 3.1.
- **Measure:** quiz abandonment rate mid-quiz.

### 3.3 Reconcile the time estimates
- **Why:** onboarding says "~18–24 Hours"; `/academy` says "~45 Hours"; the true reading-only figure is **45.7 h** **[FACT]**, before 1,350 questions, ~590 cards, 90 reflections and 9 capstones.
- **Improves:** existing copy on two surfaces.
- **Outcome:** expectation set once, honestly — **[INFERENCE]** a violated expectation in week one is itself a churn driver.
- **Depends on:** 3.1 (which changes the real number).
- **Measure:** qualitative, via 7.4's exit survey.

---

## Phase 4 — Collapse the entrance

**May move ahead of Phase 3** if Phase 0.3 shows most non-activators never created a progress row.

### 4.1 One-screen onboarding
- **Why:** a mandatory 4-step wizard collects username, name, avatar, bio, and four social URLs **[FACT]** — a *public portfolio identity* demanded from someone who has learned nothing.
- **Improves:** the existing wizard; keep goal + experience (which Phase 5 finally makes useful), defer the rest.
- **Outcome:** minutes and a unique-username collision removed from the critical path.
- **Depends on:** Phase 6 instrumentation to see per-step drop-off first.
- **Measure:** onboarding start → complete rate.

### 4.2 Remove or defer the 8-step tour
- **Why:** it auto-fires on the first app page **[FACT]**, selling leaderboards, badges, capstones and portfolio to someone with zero investment **[INFERENCE]**.
- **Improves:** `QuickStartContext` — keep it, fire it after lesson 1, or delete it.
- **Outcome:** 8 screens removed from pre-value.
- **Depends on:** 2.2.
- **Measure:** **[HYPOTHESIS]** A/B: tour-now vs tour-after-lesson-1 vs no tour. Tour-skip rate is already tracked via `trackQuickStartSkipped` **[FACT]** — read it before deciding.

### 4.3 Defer portfolio identity to first capstone
- **Why:** username/avatar/bio/socials only matter when `/p/[username]` has something on it **[FACT]** — which requires a capstone, which almost nobody reaches.
- **Improves:** the existing profile settings tab, which can already collect all of this.
- **Outcome:** the ask arrives when it's motivating rather than bureaucratic.
- **Depends on:** 4.1.
- **Measure:** profile-completion rate at capstone submission.

### 4.4 Authentication friction — **with a caveat against my own audit**
- The audit recommended Google OAuth and letting unverified users complete lesson 1. **I'm partially retracting the second half.** `docs/INDEX.md` references **two 2026-09 signup-abuse incident investigations** and "signup-reopening criteria" **[FACT]**. Turnstile and mandatory verification are very likely deliberate countermeasures, not oversights.
- **Revised recommendation:** add **Google OAuth** — it *strengthens* identity assurance while removing the email round-trip, so it cuts friction and abuse risk together. **Do not relax email verification** without reading those incident reports first.
- **Depends on:** a read of the incident docs; this is a security decision, not a UX one.
- **Measure:** signup start → verified rate, by method.

---

## Phase 5 — Make the path real

The largest behavioural change. Sequenced late deliberately.

### 5.1 Persist the recommendation
- **Why:** `computeRecommendation()` renders a "Recommended Match" badge that is **never saved and never routes anywhere** **[FACT]**. `path-resolver.ts` declares it never reorders **[FACT]**. Personalization output today = one badge + one sentence.
- **Improves:** an onboarding step, a resolver, and a dashboard banner that are all already built and all currently cosmetic.
- **Outcome:** the promise made on onboarding step 4 becomes true.
- **Depends on:** 5.2 to be meaningful.
- **Measure:** completion rate of recommended-module lessons vs others.

### 5.2 Change the unlock model: module entry lessons open
- **Why:** three facts compound — lesson *N* requires all of 1…*N−1*; completion ignores quiz score entirely; so **the lock enforces order, not mastery** **[FACT]**. For a new user, 89 of 90 lesson links lead to a lock wall, and the academy list renders no lock affordance **[FACT]**. Search routes into the same wall `[SearchOverlay.tsx:232]` **[FACT]**. PRD persona 2 ("Practicing PMs refresh frameworks via search") is architecturally impossible **[FACT]**.
- **And:** a logged-out visitor can read all 90 lessons while a registered user can read one **[FACT]** — the gate protects nothing that isn't already public.
- **Proposal:** each module's **entry lesson** opens freely; sequence is preserved *within* a module. Rigour where it teaches something, autonomy where it doesn't.
- **Improves:** `curriculum-access.ts`, the academy page, search, and the second PRD persona — all existing.
- **Outcome:** search becomes usable; practising PMs become servable; the lock screen stops being the most-seen page for new users.
- **Depends on:** Phase 3 data (does shorter content already fix drop-off without this?).
- **Measure:** **[HYPOTHESIS]** — cohort test. Primary: D30 lessons completed per user. **Guardrail: does average lesson-1 completion fall?** If unlocking causes scattering and *lower* total completion, revert. This is a genuine risk, not a formality.

### 5.3 Add lock affordances regardless of 5.2
- Cheap, independent, ships immediately: show the lock state in the academy list and in search results so users stop clicking into dead ends. **S**.

---

## Phase 6 — Measurement spine *(begin alongside Phase 1)*

**Why it isn't Phase 0:** the queries in Phase 0 answer today's questions from stored data. This builds the ongoing view.

`lib/analytics.ts` has `trackLessonStarted`, `trackQuizCompleted`, `trackHeroCTAClick` — and **nothing** for signup, verification, onboarding steps, or the tour **[FACT]**. The 396→76 gap spans precisely the uninstrumented stretch.

| Event | Where it goes |
|---|---|
| `signup_started`, `signup_completed` | `/signup` |
| `email_verified` | verified callback |
| `onboarding_step_viewed`, `onboarding_completed` | wizard (per-step — this is where 4.1 gets its evidence) |
| `quick_start_skipped` | already exists **[FACT]** — just read it |
| `first_lesson_opened`, `theory_scroll_depth`, `first_quiz_submitted` | lesson shell |
| `day_2_return`, `day_7_return` | session start |

Surface as one funnel view in the **existing** admin console. **Do not build a new analytics product.**

### The six numbers that matter

| Metric | Today | Target | Source |
|---|---|---|---|
| Signup → first lesson completed | **19%** | 45% | known |
| Median time to first completion | ~40 min **[INFERENCE]** | **<10 min** | Phase 0.7 |
| D7 return | unknown | 25% | Phase 6 |
| Learners receiving ≥1 lifecycle email | **~0%** **[FACT]** | 100% | Phase 0.1 |
| Active users with ≥1 review/week | unknown | 40% | Phase 0.6 |
| Activated users reaching capstone 1 | ~0 **[INFERENCE]** | 10% | `capstone_submissions` |

---

## Phase 7 — Application, outcomes, and removal

### 7.1 Surface the capstone from lesson 1
- **Why:** capstones are the only real differentiator against free PM content, and they need 8 of 10 module lessons ≈ **5 h** of reading **[FACT]**. Essentially nobody has seen one.
- **Improves:** `config/capstones.ts` — nine fully-specified deliverables with scenarios, requirements and starter templates, currently invisible.
- **Outcome:** the reward becomes a visible destination from hour one instead of an unreachable rumour.
- **Depends on:** Phase 3 (which shortens the distance to it).
- **Measure:** capstone page views from non-eligible users; capstone-1 submission rate.

### 7.2 Reconsider the 8-of-10 threshold
- **[HYPOTHESIS]** the strongest activation event in the product may be *producing a PM artifact*, not *finishing lessons*. Test a lower threshold (e.g. 4 lessons) for one module with a cohort. If capstone-starters retain better than lesson-completers, the product's centre of gravity should shift toward application.

### 7.3 Set a capstone review SLA — or say there isn't one
- Review is manual admin work with no stated turnaround **[FACT]**. A submitted capstone that is never reviewed converts your best moment into your worst. Either commit to a window and show it, or set the expectation honestly in the UI.

### 7.4 Remove these
| Remove | Reason |
|---|---|
| `/badges` vs `/progress/badges`; `/capstones` vs `/progress/capstones` | genuine duplicate routes **[FACT]**; 14 destinations for a product whose job is "open the next lesson" |
| The 8-step tour (or defer it) | Phase 4.2 |
| `dueCount: 5` hardcoded in the reminder | **[FACT]** — it makes the email lie |
| "Explore Prodily" → `/dashboard` | lands new users on three empty cards **[FACT]** |
| Clarity-only feedback tags | measures *clarity*, has no "too long" tag and no exit survey **[FACT]** — so it cannot detect the problem this blueprint describes. Add a length tag and one churn question. |

---

## 8. What would change my mind

Falsifiers, stated up front:

| Root problem | Would be falsified if… |
|---|---|
| **R1** (dead inbox) | Phase 0.1 shows few `user_preference_disabled` rows, or 0.2 shows learning emails have been sending. |
| **R2** (40-min task) | Phase 0.5 shows users abandoning in the *first 20%* of the theory block — that's a relevance or quality problem, not a length problem, and Phase 3 would be the wrong fix. |
| **R3** (gating) | Phase 0.3 shows nearly all non-activators never opened a lesson — then locking never bound them, and Phase 5 is wasted effort. |
| **Phase 2 thesis** | Phase 0.6 shows `/review` traffic exists and those users churn anyway — then the short loop isn't the retention mechanism I think it is. |

---

## 9. Risk register

| Risk | Mitigation |
|---|---|
| Turning email on (1.2) triggers unsubscribes or spam complaints from a base that's had near-silence | 50-user cohort, 72 h watch on complaint rate, existing unsubscribe route, then widen |
| Unlocking (5.2) scatters learners and *lowers* completion | Explicit guardrail metric; revert criterion defined before launch |
| Core/Deep-dive (3.1) reads as "content was removed" | Deep dive visible and labelled, never hidden; count it in progress; measure open rate |
| Relaxing auth friction (4.4) reopens a known abuse vector | Read the 2026-09 incident reports first; ship OAuth only; leave verification alone pending that review |
| Doing all of this at once makes attribution impossible | Phases 1, 3 and 5 each carry their own holdout or A/B |

---

## 10. The sequence, in one table

| Order | Phase | Effort | Evidence | Reaches existing users? | Gate to proceed |
|---|---|---|---|---|---|
| 1 | **0 — Prove it** | S | — | — | one-page funnel truth |
| 2 | **1 — Reconnect the inbox** | S | **[FACT]** | ✅ all 396 | 0.1 / 0.2 confirm |
| 3 | **6 — Instrumentation** *(parallel)* | S | **[FACT]** | — | funnel view live |
| 4 | **2 — Promote the short loop** | S–M | **[FACT]** | ✅ | 0.6 |
| 5 | **3 — Re-cut the lesson** | M | **[HYPOTHESIS]** | partly | A/B, ≥10pp or kill |
| 6 | **4 — Collapse the entrance** | M | **[FACT]** + **[HYPOTHESIS]** | ❌ new only | 0.3; 4.4 needs security review |
| 7 | **5 — Make the path real** | M–L | **[FACT]** | ✅ | Phase 3 result; guardrail defined |
| 8 | **7 — Application & removal** | M | mixed | ✅ | Phase 3 shipped |

**If Phase 0.3 shows most non-activators never opened a lesson, swap 5 and 6.**

---

## 11. The through-line

Prodily does not need more product. It has a 548,000-word library of genuinely excellent writing, a working spaced-repetition engine, nine real capstone deliverables, a portfolio, certificates, streaks with freezes, and an industrial-grade notification platform.

**Almost none of it is connected to a user who just signed up.** The blueprint above connects what exists, in the order that the evidence supports — and says plainly which steps are still guesses.

---

## 12. Technical remediation status (added 2026-09-26)

The recommendations above stand. This section marks only the items whose **engineering
substrate** genuinely changed on the `tech-fixes` technical-remediation track (T1–T5) and
the final review. Product decisions and unbuilt sequences are unchanged and still open.

| Blueprint item | Status after T1–T5 | Note |
|---|---|---|
| **1.1 Read stored preferences in the queue processor** | **Done in code (T2.1)** | `processor.ts` now resolves `user_notification_preferences` (batched); `/settings` toggles are live for email. Measure remains as written. |
| **1.2 Enable email by default for learning + achievements** | Open (product) | Defaults/policy unchanged by the technical track. |
| **1.3 Invert the daily-reminder audience** | Open (product) | Pagination now covers the full audience (T3.1) and delivery is timezone-aware (T5.4), but the daily reminder is still streak-gated; inverting the audience is unbuilt. |
| **1.4 Suppress the zero-activity weekly recap** | Open (product) | Recap now scales + is timezone-aware, but the zero-activity suppression rule is not implemented. |
| **1.5 Three lifecycle sequences** | Open (product) | Not built. |
| **2.3 Land the completion loop** | Partially done (T4) | The flashcard-deck→reflection advance callback is now wired; the completion-screen/next-lesson redesign is still product work. |
| **2.5 Surface the theory-gate failure** | **Done in code (T4)** | "Mark Theory as Read" now renders an accessible inline error instead of silently swallowing the rejection. |

**Foundational hardening delivered alongside (not in the blueprint, but enabling it):**
security/data-integrity (T1), atomic lesson completion + ledger-authoritative XP + badge-
reset correctness (T2), audit/SRS query scalability (T3), settings dirty-state + toast
feedback + lesson-tab URL sync (T4), and the full operational layer — bounce/complaint
webhooks, `/api/health`, provider failover, alerts, timezone-aware crons, unified retry
(T5). The final review additionally fixed a queue dead-letter mis-classification and a
scheduler bug that would have suppressed nearly all reminders/recaps.

**Still required before any of this reaches users:** production migration application, env
configuration, Vercel deploy, provider webhook registration, and post-deploy verification —
none performed. See Implementation Plan §9.

# Prodily — Product Improvement Audit

**Date:** 2026-10-17 · **Commit:** `d43e3f2` (origin/main) · **Auditor topic:** product (features, journey, activation, retention, learning and career outcomes, growth loops, measurement)

All paths are relative to `web/apps/web/` unless they start with `web/` (repo root) or `content/` (`web/content/`).

---

## Scope & method

- **Read:** the learner journey end to end in code (marketing → signup → onboarding → lesson → review → capstone → certificate → portfolio → Fellow → referral), the XP/streak/badge/certificate/capstone/notification logic in `lib/`, the cron jobs, email templates, and the docs listed in the brief (`web/docs/PRD.md`, `PHASE_8_PROPOSAL.md`, `PHASE_HISTORY.md`, `PORTFOLIO.md`, `LEADERBOARD.md`, `NOTIFICATIONS.md`, `USER_SYSTEM.md`, `ISSUES_KNOWN.md`, `DEPLOYMENT.md`) and `PRODILY_GROWTH_IMPLEMENTATION_PLAN.md`.
- **Content:**
  - Structure, coverage and quiz checks across all 90 lessons, by grep and counting.
  - Full or near-full reads of lessons 1, 12, 25 and 58.
  - Structure, case study, framework and every quiz stem for lessons 34, 38, 45, 47, 66, 75, 79, 84, 85 and 88, which covers all 9 modules.
  - Compiled metadata in `content/dist/curriculum.json`.
- **Measurement:** a full inventory of client and server instrumentation, spot-checked by hand.
- **Live site:** `prodily.app` did not resolve on 2026-10-17. The live site is `https://prodily.adityagangwani.me`, where the homepage and `/curriculum` were checked read-only. All other behaviour claims come from code at `d43e3f2`.
- **Numbers:** the only usage numbers used are the ones recorded in the repo: 396 registered users, of whom 76 (19%) had completed a first lesson, on 2026-09-24 (`web/docs/PHASE_HISTORY.md:39`), and 490 `public.users` rows on 2026-10-17 (`web/docs/ISSUES_KNOWN.md:29`). Everything else marked **Assumption** is an estimate for prioritisation, not data.
- **Production flag state:** `web/docs/DEPLOYMENT.md:139-148` recommends every experiment flag unset or false, and `PHASE_HISTORY.md` says no experiment has run. This audit assumes production runs the **control** experience: full-length lessons, 15-question quizzes, strict sequential lock, capstone at 8 of 10 lessons.

### Status of the existing growth plan

`PRODILY_GROWTH_IMPLEMENTATION_PLAN.md` is essentially shipped, so this audit builds past it rather than repeating it:

| Plan item | State in code |
|---|---|
| R1 portfolio nav, LinkedIn/X share, proof card, leaderboard widget, Quick Start after lesson 1 | Done (commits `347bc23`, `056187e`, `a6defac`, `a4d3854`, `e79ba95`) |
| R2 single certificate issuance at lesson 90, `fellow.granted`, `capstone.reviewed` deep links | Done (`eb106cd`, `d359e99`, `1137a06`; issuance at `lib/academy/lessons-db.ts:462`) |
| R3 celebration modal with LinkedIn, share and invite CTAs | Done (`4376717`, `be8f951`, `7aacc34`, `8f64b2f`) |
| Deferred items: weekly recap proof step, lifecycle proof step, capstone share pages, proof nudges with holdouts | Also done (`7c1bd2e`, `2bdb940`, `fd125e8`, `2799b4f`) |

The discovery and sharing layer is now in good shape. The next constraint is the **learning loop and the credibility of what gets shared**, which is where this audit focuses.

---

## Scorecard

| Dimension | Score | One-line reason |
|---|---|---|
| Value prop clarity | **7/10** | The hero is clear: "Learn product management. Leave with proof." plus "90 lessons and 9 capstones build a public portfolio… Free, permanently." Onboarding then promises things the product does not do (quiz calibration, recruiters). |
| Activation | **4/10** | One-screen onboarding is good, but in production the first unit of work is a 25–60 minute lesson with a 15-question quiz. The shorter-lesson fix is built and switched off. The baseline was 19% first-lesson completion. |
| Habit / retention | **5/10** | Streaks with freezes, SM-2 review, local-time reminders and lifecycle emails with holdouts are well built. But the streak-broken email cannot fire, reminder copy shows stale streaks, there is no weekly goal, and lapsed learners get no backoff. |
| Learning outcomes | **4/10** | The content is deep and quizzes explain answers. But any quiz score completes a lesson, quizzes are mostly recall, and capstone review is a binary approve or reject with no written feedback and no resubmission. |
| Career outcomes | **4/10** | Excellent plumbing: portfolio, capstone pages, OG cards, verify page, LinkedIn add. Weak signal: the certificate attests attendance, "Verified" means a complete profile, "PM Fellow" means one capstone plus a profile, and there is no interview practice or recruiter-facing surface. |
| Social / growth loops | **5/10** | Share and invite prompts appear at every milestone. But the referral reward is one-sided XP, cohorts are two static seeds, friends is a silent one-way follow, and share or verify activity is barely measured. |
| Measurement | **4/10** | A server-side activation funnel, experiment readouts and nudge holdouts exist. But GA4 is consent-gated and anonymous, there is no event table, no retention cohorts and no north star, and the experiment readouts compare two control arms. |
| **Overall** | **4.7/10** | The infrastructure is unusually complete for a free product. The core promise ("become hireable, leave with proof") is not yet backed by feedback, mastery, or credible credentials. |

---

## Executive summary

1. **The "prove and share" layer is built; the "learn and get better" layer is thin.** Portfolio, capstone share pages, OG cards, verified certificates, celebrations, proof nudges and the referral modal all work. But nothing tells a learner whether their work is good. A capstone is approved or rejected with no comment (`app/api/admin/capstones/[id]/review/route.ts:30-35`), a rejection cannot be revised (`lib/capstones.ts:170-176`), and a 0% quiz still completes a lesson (`web/supabase/migrations/20260925000002_phase_t2_backend_reliability.sql:233-256`).
2. **The biggest activation fixes are built and dark.** Phases 4, 6 and 7 (7-minute Core lessons with a 5-question quiz, entering any module, capstone after 4 lessons) all ship flag-off (`.env.example:93-129`, `web/docs/DEPLOYMENT.md:139-140`). At about 120 signups a month (**Assumption**, derived from 396 → 490 users in 23 days), an A/B test needs about 740 learners per arm to detect 19% → 25% first-lesson completion. That is over a year of traffic. **Turn them on by decision, with guardrails and a pre/post cohort read.**
3. **Three retention mechanisms are silently broken:**
   - The streak-broken comeback email requires `current_streak === 0` (`lib/notifications/lifecycle/segments.ts:102`), but nothing ever resets the stored streak (`lib/streaks/streaks-db.ts:72-80`). The email can essentially never fire.
   - The daily reminder tells lapsed learners to "keep your N-day streak alive" using that stale number (`app/api/cron/daily-reminder/route.ts:181`, `emails/templates/learning/DailyReminder.tsx:23`), and repeats daily with no cap.
   - Badge auto-award has no caller (`app/api/badges/route.ts:30` is the only caller; ISSUE-23).
4. **Credentials overclaim relative to what they measure:**
   - The certificate requires only 90 lesson completions (`lib/certificates/presentation.ts:20-25`).
   - The "Verified" portfolio check means avatar, bio and two links (`lib/portfolio-readiness.ts:191-197`).
   - PM Fellow means a complete profile, one capstone and manual approval (`lib/fellow.ts:33`).
   - The OG card labels MCQ-derived radar data "Evaluated PM Competencies".

   Fix the wording now. Then make credentials earn their words by tying them to rubric-scored capstones and quiz mastery.
5. **The highest-leverage new feature is rubric-scored capstone feedback with revise-and-resubmit.** The rubric already exists as each capstone's `requirements` list (`config/capstones.ts:55-58`, `107-110`…). An AI first-pass grader would cost roughly $0.003 (Haiku 5.5) to $0.06 (Sonnet 5.5) per review. That conflicts with the PRD invariant "No AI Mentor Feature" (`web/docs/PRD.md:30`) only if it is framed as chat. It needs an explicit owner decision.
6. **Content is deep but 2026-thin, and its scaffolding has drifted:**
   - LLM work appears in one lesson. Evals appear in three. SQL-as-querying appears in none.
   - No lesson mentions India or an Indian company, although the operator is India-based (footer address in Jaipur; IST defaults).
   - All 90 case studies are fictional scenarios.
   - About 70 of the 90 "mental models" are house coinages that the quizzes then test.
   - The public `/curriculum` page shows the wrong title over four modules. Verified live: lessons 41–50 (metrics) appear under "Design, UX & Prototyping".
   - Several capstones require skills no lesson teaches, for example WCAG, Kano, REST/GraphQL.
7. **Measurement cannot yet answer "are learners coming back and getting better?"** There is no D30 or weekly retention cohort, no product event table, and no north star.

   Proposed north star: **Weekly Mastering Learners**, meaning learners who in a week complete at least one lesson at ≥70% or submit or revise a capstone. It comes with five input metrics, set out below.

---

## Learner journey map (as built today)

Time estimates use `estimatedCompletionTime` from `content/dist/curriculum.json`. The full curriculum totals **73.3 hours**, with 30–90 minutes per lesson.

| # | Stage | What is built (evidence) | Friction / drop-off risk | Risk |
|---|---|---|---|---|
| 0 | **Stranger** | Homepage leads with proof (`app/(marketing)/page.tsx:52-66`; live H1 "Learn product management. Leave with proof.", CTA "Start Learning Free") and links to a sample lesson. All 90 lessons have a public preview of their first 8 theory blocks (`app/(marketing)/lessons/[slug]/page.tsx:41-46, 123-125`). | The live homepage shows no testimonials. The section only renders with at least 3 approved rows, so there are presumably fewer than 3. It also shows no learner counts and no outcome evidence.<br><br>The `/curriculum` page puts the wrong module titles over lessons (`app/(marketing)/curriculum/page.tsx:39-52, 87-90` vs `config/content.ts:21-103`). It also understates module time: 4–8 hours shown vs 6.3–9.8 hours compiled.<br><br>The preview CTA links to a bare `/signup` (`lessons/[slug]/page.tsx:206`), and signup only reads `?ref` (`signup/page.tsx:55`). So a searcher who lands on lesson 34 is sent to Lesson 1, with lesson 34 locked. | High |
| 1 | **Signup** | Name, email, password, terms and age checkboxes, Turnstile (`signup/page.tsx:286-413`). The referrer is shown via `ReferralBadge`. Email verification is currently **off** in production (`web/docs/ISSUES_KNOWN.md:29`). No OAuth (Phase 9 gated). | Five inputs plus CAPTCHA is acceptable. Turning verification off helps activation but reopens the abuse vector from the 1,233-account incident (security auditor's topic). | Low |
| 2 | **Onboarding** | One screen, two required choices: goal and experience (`app/onboarding/OnboardingWizard.tsx:96-105`). Frames the portfolio up front (`:246-248`). Identity fields are deferred. | Copy says experience "Helps us calibrate examples and quiz difficulty" (`:316`), but `career_role` only picks a recommended module (`lib/personalization/path-resolver.ts:79-85`). Under the production lock, "Start Learning" falls back to Lesson 1 for everyone (`path-resolver.ts:282-288`), so a "Grow in my PM career" learner is shown "Recommended: Strategy" and lands on "What is Product Management?". | Medium |
| 3 | **First lesson (aha candidate)** | Lesson 1: 25 min reading plus 10 min quiz (`content/lessons/lesson-001.md:20`; at 52 KB it is the largest lesson file). Control renders the whole lesson (`lesson-content.tsx:100-112`). The theory gate needs 80% scroll and about 20% of the estimated reading time (`lib/xp/xp.ts:305-331`), then 15 MCQs. On completion: celebration with portfolio framing, invite, and the Quick Start tour. | **Time-to-value is 35+ minutes** before any reward, in a single sitting. The real aha ("I made something I can show") sits behind 8 lessons, about 4–7 hours (`lib/capstones.ts:125`). | High |
| 4 | **Habit** | Streak with auto-applied freezes: earn 1 per 7 days, max 2, covers one missed day (`lib/streaks/streaks.ts:1-5, 137-153`). A single flashcard review counts for the day (`lib/flashcards-service.ts:288`). SM-2 review hub. Daily reminder at local hour, only when cards are due (`daily-reminder/route.ts:147-170`). Weekly recap with zero-activity suppression (`weekly-recap/route.ts:183-188`). D+1, D+3 and streak-broken lifecycle emails with a 30% holdout. Consistency-first weekly leaderboard. | Unit of work is 35–90 min with no session-size choice. No weekly goal. Reminders are about flashcards, not progress. The streak-broken sequence never fires. Lapsed learners get a daily email indefinitely. "Resume learning" is deferred (`lib/notifications/automations/service.ts:50`). | High |
| 5 | **Capstone** | Unlocks at 8 of 10 module lessons. Scenario, instructions, template, 250–500 words (`config/capstones.ts`). Validation is word count plus "any keyword from each requirement label appears" (`lib/capstones.ts:77-97`). Publishes to the portfolio immediately if the portfolio is public, with honest "best-effort review" copy (`lib/capstones.ts:20-34`). | No rubric, no written feedback, no score. Reject equals `status:'reviewed'` and `is_public:false` (`lib/admin/moderation-service.ts:475-476`), and the learner "Cannot resubmit an already reviewed capstone" (`lib/capstones.ts:174`). The dashboard prompt only appears at 10 of 10 lessons (`app/(app)/dashboard/page.tsx:183`), although eligibility starts at 8. Capstone module numbers and titles do not match the curriculum (PROD-11). | High |
| 6 | **Certificate** | Full-curriculum certificate auto-issued at lesson 90 with a single, idempotent flow (`lib/academy/lessons-db.ts:462`). Public verify page, LinkedIn Add-to-Profile, QR. | Only one credential, after about 73 hours. Module certificates exist in the data layer (`lib/certificates-db.ts:248-265`) but no UI ever issues them (no client call to `/api/certificates`). After graduation the dashboard offers only "Explore Curriculum" (`components/dashboard/ContinueLearningCard.tsx:26-52`). | High |
| 7 | **Portfolio** | `/p/[username]`, public by default (`web/supabase/migrations/20260805000003_add_portfolio_columns.sql:14`). Featured capstone, per-capstone share pages, OG card, nav link, proof card, lifetime view counter in Settings (`components/settings/PortfolioSettingsForm.tsx:525-535`). | It does not exist until the learner sets a username in Settings (not collected at signup). Views are a lifetime number buried in Settings, not used in any email. No recruiter-side surface exists, despite the onboarding claim. | Medium |
| 8 | **Share / refer** | LinkedIn, X and WhatsApp share. Invite prompts in the first-lesson, module, certificate and Fellow celebrations. Referral earns +50 XP when the invitee completes lesson 1 (`lib/referral/reward.ts`). | One-sided reward in a currency with no outside value. The invitee gets nothing. Certificate shares and verify-page views are not tracked anywhere. | Medium |
| 9 | **PM Fellow** | Learner request once readiness reaches 100%: profile fields plus at least one published capstone (`lib/fellow.ts:33`), then manual admin approval. Fellow-eligible nudge with a holdout. | The bar measures profile completeness, not demonstrated skill. The leaderboard's cosmetic "Fellow" tier collides with the title (`web/docs/LEADERBOARD.md` §2). | Medium |

**The aha moment today** is meant to be the first-lesson celebration ("+XP, your portfolio starts here"). The aha that matches the value proposition is **"I produced a PM artifact and got credible feedback on it."** Today that sits about 4–7 hours in, and the feedback half does not exist. Most of the roadmap below moves that moment earlier and makes it real.

---

## Findings & opportunities

Each finding gives the problem with evidence, the proposal, the metric it moves, and effort: **S** is under a week, **M** 1–3 weeks, **L** more than 3 weeks for one full-stack engineer, plus content time where noted.

### PROD-01 — Ship the dark activation fixes by decision, not by A/B
- **Problem.** Three fixes for the root causes the team itself identified are built, tested and switched off:
  - Recut: Core about 7 min plus a 5-of-15 quiz (`lib/academy/experiment.ts:34`).
  - Module-entry unlock (`lib/academy/module-entry-unlock.ts:40`).
  - Capstone at 4 of 10 lessons (`lib/capstone-threshold-experiment.ts:48-56`).

  Root causes RC2 "40-minute unit of work" and RC3 "personalization theatre" (`PHASE_HISTORY.md` table) therefore remain live in production. The admin experiment readout forces `enabled: true` when bucketing (`lib/admin/recut-experiment.ts:101`), so it currently compares two control groups. The Deep-dive guardrail is structurally 0% because Deep-dive only renders under treatment (`lesson-content.tsx:961-967`).
- **Why not A/B.** At about 120 signups a month (**Assumption**), detecting 19% → 25% first-lesson completion at 80% power and α = 0.05 needs about 740 learners per arm. That is more than a year.
- **Proposal.**
  - Enable recut and module-entry unlock at 100% for accounts created after a set date. Use the existing `*_COHORT_START` so existing learners keep their experience.
  - Read pre/post cohorts with explicit guardrails: lesson-1 quiz score distribution (`web/docs/BASELINE_QUERIES.md`) and Module 1 completion.
  - Decide on the capstone threshold together with PROD-03. A lower bar only helps once submissions get feedback.
  - Hide or relabel the experiment readout while flags are off.
- **Metric.** Activation (first lesson within 72 h), time to first completion, W1 active days.
- **Effort.** S (configuration, a cohort-start date, a short decision memo).

### PROD-02 — Make "completed" mean "learned"
- **Problem.**
  - Any score completes a lesson. The RPC upserts `status = 'completed'` unconditionally (`web/supabase/migrations/20260925000002_phase_t2_backend_reliability.sql:233-256`). The service path does the same (`lib/academy/lessons-db.ts:317-323`).
  - Quizzes are 15 MCQs per lesson, 1,350 in total, mostly recall:
    - 32% of stems anchor to "this lesson".
    - 12% ask about the lesson's own fictional case study.
    - Example: "What are the two dimensions of the Moat Durability Matrix?" (`content/lessons/lesson-075.md:322`).
  - Wrong answers get easier to eliminate as difficulty rises. Options with giveaway absolutes ("always", "never", "no further attention") go from 3.7% in Module 1 to 17.7% in Module 9 (e.g. `lesson-088.md:438-468`).
  - The inline "concept check" asks no question. It is a "Mark Understood" toggle held in temporary screen state and never saved (`blocks/section/InlineConceptCheck.tsx:15, 44`).
  - The skill radar and the certificate both build on completion.
  - The correct answers are shipped to the client (`blocks/quiz/QuizBlock.tsx:14, 71`). That matters little today because there is no pass bar (cross-topic: engineering/security).
- **Proposal.**
  - Add a **"mastered" state** at ≥70% best score. Keep "completed" for navigation so activation is not punished.
  - Feed every wrong answer's concept into the learner's SRS queue. The review hub becomes "fix what you got wrong", not only "re-read cards".
  - Rewrite 3 of the 15 questions per lesson as scenario or judgement items, and remove absolute-word distractors. Start with Modules 6–9, where distractors are weakest.
  - Turn `InlineConceptCheck` into one graded question per framework section.
  - Base the radar and any "Practitioner" credential (PROD-08) on mastery.
- **Metric.** Mastery rate (share of lessons first passed at ≥70%), quiz retry rate, W4 retention (guardrail: activation must not drop).
- **Effort.** M for engineering, plus ongoing content rewrite.

### PROD-03 — Close the capstone feedback loop (rubric, written feedback, revise and resubmit)
- **Problem.** The capstone is the product's best moment and its loop is a single bit:
  - The admin route accepts only `approve` or `reject` (`app/api/admin/capstones/[id]/review/route.ts:30-35`).
  - `capstone_submissions` has no feedback or score columns (`types/database.ts:202-213`).
  - A rejection reads "the public listing is off for now" with no reason (`lib/notifications/in-app/service.ts:270-272`).
  - The learner cannot resubmit (`lib/capstones.ts:170-176`).
  - Submission validation is a keyword check: any word longer than 3 letters from each requirement label anywhere in the text (`lib/capstones.ts:86-96`). The starter templates already contain those headings, so an unedited template plus filler words passes.
- **Proposal.**
  - Turn each capstone's existing `requirements` into a 4-level rubric (`config/capstones.ts:55-58`, `107-110`, `167-170`…).
  - Add `rubric_scores jsonb`, `feedback text` and a `needs_revision` status, all additive and nullable.
  - Give the admin a scoring form instead of two buttons.
  - Let the learner revise and resubmit with version history.
  - Show the score breakdown privately and an "Approved" stamp publicly.
- **Metric.** Capstone submit rate among eligible learners, resubmission rate, approval-after-revision rate, review turnaround (`reviewed_at` exists), and return within 7 days of feedback.
- **Effort.** M.

### PROD-04 — AI first-pass capstone feedback (a grader, not a mentor)
- **Problem.** Manual review has no SLA (`lib/capstones.ts:20-34`), and volume rises if PROD-01 lowers the threshold. Learners need feedback in minutes to iterate, not "best-effort".
- **Proposal.**
  - A structured, one-shot grader scores the submission against the PROD-03 rubric.
  - It quotes the learner's own text as evidence and returns 2–3 specific revision suggestions.
  - It is clearly labelled "automated first read".
  - A human still approves anything that becomes public or counts toward Fellow or certificate tiers.
  - No chat interface.
- **Policy.** `web/docs/PRD.md:30` forbids "LLM chat interface or AI mentor features". A rubric grader is neither, but the owner should make this call explicitly and record it in an ADR.
- **Cost estimate** (Anthropic list prices as of 2026-10; verify before budgeting). Assumes about 8k input tokens (rubric, brief, submission) and about 4k output tokens including reasoning:

  | Model | Per review | 200 reviews/month | With Batch API (−50%) |
  |---|---|---|---|
  | Claude Haiku 5.5 ($0.10 / $0.50 per MTok) | about $0.003 | about $0.60 | about $0.30 |
  | Claude Sonnet 5.5 ($2 / $10 per MTok) | about $0.06 | about $12 | about $6 |
  | Claude Opus 5.5 ($4 / $20 per MTok) | about $0.11 | about $22 | about $11 |

  Feedback within an hour can use the Batch API. Even the top tier is affordable at this scale; cap it at 3 graded attempts per capstone. Before choosing a tier, run a 30-submission eval comparing grader scores with a human reviewer.
- **Metric.** Time to first feedback, resubmission rate, approval rate after revision, human–AI score agreement.
- **Effort.** M, after PROD-03.

### PROD-05 — Fix the silent retention bugs
- **Problem.**
  1. **The streak-broken email cannot fire.**
     - `qualifiesStreakBroken` requires `currentStreak === 0` (`lib/notifications/lifecycle/segments.ts:102`), and the lifecycle job reads raw `users.current_streak` (`lib/growth/lifecycle-run.ts:266`).
     - The stored streak is only written on activity (`lib/streaks/streaks-db.ts:72-80`). The only path that zeroes it is the learner's own reset (`lib/settings/settings-service.ts:265`).
     - So a lapsed learner keeps their old non-zero streak forever.
  2. **Stale streak copy.** The daily reminder passes the same raw value (`app/api/cron/daily-reminder/route.ts:181`) into "Keep your {N}-day streak alive" (`emails/templates/learning/DailyReminder.tsx:23`). The weekly recap does the same (`app/api/cron/weekly-recap/route.ts:214`).
  3. **No backoff.** A lapsed learner with due cards gets the daily reminder every day indefinitely (`daily-reminder/route.ts:147-185`). There is no frequency cap anywhere in `lib/notifications`.
  4. **Badges are never persisted automatically.** `evaluateAndAwardBadges` is only called by `POST /api/badges` (`app/api/badges/route.ts:30`), which nothing calls. The UI derives "earned" on read (`lib/badges/badges.ts:86`), so `badge.earned` emails and celebrations never fire (ISSUE-23 is still open).
- **Proposal.**
  - Compute the effective streak with `getStreakStatusSummary` (`lib/streaks/streaks.ts:176`) everywhere a streak is read for messaging or segmentation.
  - Add a reminder backoff: days 1, 2, 4, 7, 14 and 30 after the last activity, then monthly only.
  - Call `evaluateAndAwardBadges` from the lesson, review and capstone completion hooks.
- **Metric.** Reactivation rate of lapsed learners (the holdout already exists), unsubscribe and complaint rate, badge-earned events.
- **Effort.** S.

### PROD-06 — Replace "streak plus flashcard nudge" with a learner-set weekly goal
- **Problem.**
  - There is no daily or weekly goal, no session-size choice and no study-plan concept (none in code).
  - The only reminder is "flashcards due".
  - Freezes cover one missed day only (`lib/streaks/streaks.ts:137`).
  - Daily streaks punish the realistic cadence for working adults switching careers, which is 3–4 days a week.
- **Proposal.**
  - In onboarding, ask "How much time per week?" (1, 2–3 or 4+ hours) and derive a weekly goal, for example 3 study days.
  - Show weekly-goal progress as the primary habit meter, with the streak secondary.
  - Send a "goal at risk" nudge on the learner's chosen day.
  - Rewrite the weekly recap around outcomes: "2 lessons to your Discovery capstone", "portfolio viewed N times this week", "3 concepts to fix".
  - All of this stays inside the "no purchasable streak" invariant (`web/docs/PRD.md:31`).
- **Metric.** Share of learners hitting the weekly goal, W4 retention, recap click-through.
- **Effort.** M.

### PROD-07 — Earlier credentials and a real graduation path
- **Problem.**
  - The only certificate needs all 90 lessons, about 73 hours.
  - Module certificates are implemented (`lib/certificates-db.ts:248-265`; copy at `lib/certificates/presentation.ts:108-110`) but no UI issues them.
  - Graduation dead-ends at "Explore Curriculum" (`components/dashboard/ContinueLearningCard.tsx:26-52`).
- **Proposal.**
  - Issue a **module credential** when a module's lessons are mastered and its capstone is approved, for example "Prodily Discovery — Practitioner".
  - Each module credential is a shareable and verifiable milestone roughly every 8 hours.
  - Replace the graduation card with next steps: certificate share, case drills (PROD-12), Fellow request, and "review 3 peers' capstones" (when PROD-14 lands).
- **Metric.** Module-2 continuation after Module 1, credentials shared per learner, share-to-signup.
- **Effort.** S–M.

### PROD-08 — Make credential language match what is measured
- **Problem.**
  - **"Verified" portfolio check:** auto-awarded for avatar, bio and two links (`lib/portfolio-readiness.ts:191-197`). Recruiters will read it as identity or skill verification.
  - **PM Fellow:** readiness at 100%, meaning profile fields plus one published capstone (`lib/fellow.ts:33`), then manual approval.
  - **OG card:** shows "Evaluated PM Competencies" built from MCQ completion (`web/docs/PORTFOLIO.md` §3; radar weights at `lib/skillRadar.ts:9-14`).
  - **Onboarding:** says the portfolio is one "recruiters can see" (`OnboardingWizard.tsx:247`).
  - **Certificate:** honestly states completion only (`lib/certificates/presentation.ts:20-25`), which is good, but it is the only tier.
- **Proposal.**
  - **Now (S):**
    - Rename "Verified" to "Complete profile", or remove the check.
    - Change the OG label to "Topics studied".
    - Change onboarding to "a public portfolio you can share with recruiters".
    - Rename the leaderboard "Fellow" tier.
  - **Next (M):**
    - Two certificate tiers: **Completion** (today's rule) and **Practitioner** (lessons mastered plus at least 5 approved capstones at rubric ≥ "meets").
    - Fellow requires Practitioner plus a reviewed end-to-end case study (Module 9 capstone).
- **Metric.** Certificate-to-LinkedIn rate, verify-page views per certificate (new event), recruiter-referral signups (UTM).
- **Effort.** S now, M next.

### PROD-09 — Preserve intent from public lessons through signup
- **Problem.**
  - All 90 public previews send traffic to a bare `/signup` (`app/(marketing)/lessons/[slug]/page.tsx:206`).
  - After onboarding the learner lands on the dashboard and Lesson 1. Their target lesson is locked by the sequential gate (control arm).
  - The same applies to "Read a sample lesson" from the hero, which goes to lesson 1 and is fine, and to any SEO landing on a deep lesson, which is not.
- **Proposal.**
  - Pass `?next=/academy/<module>/<lessonId>` through signup, verification and onboarding.
  - With PROD-01's module-entry unlock, land the learner on the module entry of the lesson they came for, with a one-line "you were reading lesson N; start its module here".
  - Track `signup_source = lesson_preview:<id>` server-side.
- **Metric.** Activation of lesson-preview signups vs other signups.
- **Effort.** S.

### PROD-10 — Make onboarding honest and use what it asks
- **Problem.**
  - "Helps us calibrate examples and quiz difficulty" (`OnboardingWizard.tsx:316`). Nothing uses `career_role` except module recommendation (`lib/personalization/path-resolver.ts:79-85`).
  - Under the production lock the recommendation is overridden (`path-resolver.ts:282-288`).
  - Practising PMs ("Grow in my PM career" maps to Strategy) must start with "What is Product Management?".
  - There is no placement check anywhere.
- **Proposal.**
  - **Now:** fix the copy, and with PROD-01 honour the recommendation.
  - **Later:** a 10-question placement check per module. Test-out grants "completed (tested out)" without mastery credit.
- **Metric.** Activation by experience segment, Module 1 skip rate.
- **Effort.** S now, M later.

### PROD-11 — Curriculum and capstone integrity (one module taxonomy)
- **Problem.** Modules were reordered, and four naming systems now disagree:
  - The compiled curriculum (`content/dist/curriculum.json`).
  - The public site (`config/content.ts:21-103`).
  - In-app metadata (`lib/admin/curriculum-meta.ts:26-99`, e.g. "Product Strategy", "Design Thinking & UX").
  - The capstone config (`config/capstones.ts`).

  Consequences:
  - **The public curriculum page is mislabeled (verified live).** It slices lessons by position under `config/content.ts` titles with its own slug map (`app/(marketing)/curriculum/page.tsx:39-52, 87-90`). Lessons 41–50 (metrics) sit under "Design, UX & Prototyping", 51–60 (leadership) under "Metrics, Growth & Experiments", 71–80 (B2B strategy) under "Stakeholders & Leadership", and 81–90 (regulated industries, AI) under "Capstone & Career Portfolio". Module hours are understated: 4–8 hours shown vs 6.3–9.8 compiled.
  - **Capstones don't match their modules.** The `strategy` capstone is a PRD labelled "Module 3, Defining Products & PRDs" (`config/capstones.ts:145-152`), but it is gated by Module 8 (B2B, moats, M&A). PRDs are taught in lesson 22, in Design.
  - **Capstone numbers are wrong too:** design is shown as 5 vs 3 in the curriculum, leadership 8 vs 6, metrics 6 vs 5. These are visible to learners (`NextCapstonePromptCard.tsx:64`, `capstones/[module]/page.tsx:201`).
  - **Capstones require untaught skills:**
    - Design asks for Nielsen heuristics and WCAG AA. WCAG appears in 0 lessons.
    - Execution asks for RICE/Kano. Kano appears in 0 lessons, RICE in 1.
    - Technical asks for REST/GraphQL, WebSockets and JSON schemas, all in 0 lessons.
  - **Content defects:**
    - Five lessons display "Spotify" as the heading over Shopify, Stripe, Amazon, Adobe or Alphabet examples. The compiler defaults the name (`web/scripts/compiler/compile.ts:299-306`).
    - Lesson 47's quiz names the wrong company (`lesson-047.md:447`).
    - Cross-references are stale, e.g. "Lesson 33 (Retention)" when 33 is Kanban (`lesson-001.md:25, 254, 697`).
    - OKRs are promised "in Module 5" and never taught (`lesson-002.md:67`).
  - **The dashboard prompts a capstone only at 10 of 10 lessons** (`app/(app)/dashboard/page.tsx:183`), while the gate is 8 of 10.
- **Proposal.**
  - Make `curriculum-registry` plus `curriculum.json` the single source for module number, title and hours. Derive the marketing, in-app and capstone labels from it.
  - Move the PRD capstone to Design. Write a Strategy capstone (positioning or moat memo, or B2B pricing and packaging).
  - Either teach what each capstone requires or remove the requirement.
  - Fix the compiler default and the cross-references with a link-check script in content CI.
  - Prompt the capstone at the real threshold.
- **Metric.** Curriculum-page → signup conversion, capstone start rate at eligibility, lesson "outdated/confusing" feedback tags.
- **Effort.** S engineering, M content.

### PROD-12 — Turn "Interview Perspective" into practice
- **Problem.**
  - Every lesson has an "Interview Perspective" section (`content/lessons/lesson-001.md:353`), and marketing deliberately avoids an "interview-ready" claim (`config/marketing.ts:43`).
  - But learners never practise answering a product-sense, metrics or execution question.
  - The FAQ says the course is "built first for career switchers" (`config/content.ts:216`), yet no lesson covers breaking into PM: product-sense frameworks, estimation, resume and APM paths all appear in 0 lessons. Lesson 56 covers IC vs. management ladders.
  - An `aiPrompt` block type (explain / quiz-me / socratic modes) is already defined in the content schema but unused (`web/scripts/compiler/schema/block-schema.ts:221-227`). Someone has already considered this direction.
- **Proposal.**
  - **Next, no AI:** one **case drill** per module.
    - A timed, open-ended prompt with a 300-word answer.
    - Then a model answer plus a self-assessment checklist.
    - The answer saves to the portfolio as an optional "worked case".
  - **Later, policy-gated:** AI-scored drills using the PROD-04 grader. Live mock interviews are a chat interface and need a PRD change.
    - Cost estimate: about 20 turns at about 10k cumulative input and about 1.5k output per turn.
    - Roughly $0.03 per session on Haiku 5.5 and $0.50–0.70 on Sonnet 5.5 (cache reads lower it).
    - Cap at 2 per learner per month.
- **Metric.** Drill completion, return within 7 days, self-reported interview outcomes (survey).
- **Effort.** M (mostly content).

### PROD-13 — A recruiter-facing surface, only after credentials mean something
- **Problem.**
  - There is no talent directory, no "open to PM roles" flag, and no recruiter page.
  - Portfolio views are an undated lifetime counter that counts bots, shown only in Settings (`PortfolioSettingsForm.tsx:525-535`; increment at `lib/portfolio-db.ts:335-393`).
- **Proposal.**
  - **Next (S):** store dated portfolio views (deduplicated) and put "your portfolio was viewed N times this week" in the weekly recap.
  - **Later (L):** an opt-in "Open to roles" flag and a public, filterable directory of Practitioner/Fellow learners and their approved capstones, plus a simple employer contact form. Only after PROD-08's Next tier, or it will amplify weak signals.
- **Metric.** Weekly portfolio views per public learner, recruiter contacts, self-reported interviews.
- **Effort.** S, then L.

### PROD-14 — Social loops that create accountability, not just rankings
- **Problem.**
  - Cohorts are two static seeded rows with no dates (`web/supabase/migrations/20260805000006_create_leaderboards_and_cohorts.sql:124-127`).
  - "Friends" is a silent one-way add with no notification (`web/docs/LEADERBOARD.md` §5; `lib/leaderboard-db.ts:508`).
  - The referral reward is +50 XP to the referrer only (`lib/referral/reward.ts`).
  - Peer review is promised in an unused marketing section (`components/marketing/sections/community.tsx:37`).
- **Proposal.**
  1. **Monthly start cohorts**, for example "November 2026 cohort". Auto-enrol new signups. Weekly cohort email with a progress strip. Cohort-scoped leaderboard as the default view.
  2. **Study pair invites:** "invite a friend to learn with you". Both see each other's weekly-goal progress, and the invitee joins the inviter's cohort. Reward both: a streak freeze and a "Study pair" badge. This is not purchasable, so the invariant holds.
  3. **Peer review of capstones** (after PROD-03): approved learners review 2 submissions against the rubric to unlock Fellow.
- **Metric.** Referred signups as a share of all signups, W4 retention of paired vs unpaired learners, peer reviews per week.
- **Effort.** M per item.

### PROD-15 — Measurement foundation
- **Problem.**
  - GA4 loads only after cookie consent and sends no user id (`lib/analytics.ts:179-185`; `components/legal/ConsentGatedAnalytics.tsx:22-29`).
  - There is no product event or session table. `xp_events` is the only activity log.
  - D1/D7 is one pooled floor (`lib/admin/baseline-aggregation.ts:376-429`). There is no D30 and no per-week cohort.
  - The north star is mentioned only as a funnel label (`components/admin/ActivationFunnelView.tsx:54`).
  - Certificate shares, LinkedIn adds, verify-page views and capstone page views are not tracked anywhere.
  - Admin bugs:
    - "Verified Users" equals total users (`lib/admin/analytics-service.ts:519`).
    - XP-by-source reads `event.source` instead of `source_type` (`lib/admin/analytics-aggregation.ts:166-177`), although ISSUE-20 is marked resolved.
    - The Overview funnel mixes range-scoped and all-time stages.
- **Proposal.**
  - Add a server-side `product_events (user_id, name, props jsonb, created_at)` table. Write it from the existing route handlers for about 15 named events (list below).
  - Add a weekly-signup cohort retention view (W1–W8) and a north-star tile to `/admin/analytics`.
  - Fix the three admin bugs.
  - No new vendor is needed.
- **Metric.** This is the enabler for every metric in this report.
- **Effort.** M.

### PROD-16 — Content: 2026 coverage, India relevance, canonical frameworks

See the Content section below. Summary of the proposal, in order:
1. **AI PM mini-track:** six lessons plus a capstone covering evals and LLM-as-judge, model and prompt selection, cost and latency arithmetic, RAG and agent UX, guardrails and prompt injection, and AI tools in the PM workflow.
2. **"Breaking into PM" module:** product sense, estimation, metrics cases, resume and portfolio, and the APM path. This feeds PROD-12.
3. **Experimentation lab:** worked sample-size and MDE calculation, confidence intervals, SRM, novelty effects.
4. **SQL and analytics lesson:** real queries on a sample dataset.
5. **India layer:** one real India case per module, for example UPI or ONDC platform dynamics, quick-commerce unit economics, Bharat-first and vernacular UX, B2B SaaS from India (Zoho, Freshworks). Replace some fictional case studies with real, sourced ones.
6. **Frameworks:** lead with canonical frameworks (RICE, Kano, HEART, OST, AARRR, JTBD, North Star) and label house models as "Prodily checklists". Stop quizzing on house framework names.

---

## Content

**Shape.**
- 9 modules of 10 lessons. Every lesson uses the identical 21-section template, from "Why This Lesson Matters" to "Connections" (e.g. `content/lessons/lesson-001.md`, `lesson-034.md`, `lesson-075.md`).
- About 544k words in total, around 6,000 per lesson.
- 50.6 hours of reading and 73.3 hours of completion time (`content/dist/curriculum.json`). Per module: 6.3 hours (Module 1) to 9.8 hours (Module 9).
- Each lesson has 15 MCQs with explanations and per-question feedback (`blocks/quiz/QuizBlock.tsx:352-372`), about 6.6 flashcards, a reflection prompt and a checklist or table (83 of 90 framework sections).
- **Interactivity is limited to MCQ and flashcards.**
  - The "concept check" is a cosmetic toggle (`blocks/section/InlineConceptCheck.tsx:15, 44`).
  - Reflections accept any text of 1 character or more, with no feedback (`app/api/reflections/route.ts:20`).
  - `timeline`, `video`, `aiPrompt`, `callout`, `tabs` and `accordion` block types are defined in the schema but unused (`web/scripts/compiler/schema/block-schema.ts:201-227, 295-311`).
  - No scenario, branching, ordering, free-text graded or calculator blocks exist.

**Strengths.**
- First-principles writing that is consistent across all 90 lessons.
- Honest sourcing: 51 lessons include a source line and 43 flag their assumptions.
- Every lesson ties back to interviews and to differences by company stage.
- Explanations are good, and answer keys are balanced across A–D (about 336 each).
- Breadth is good:
  - Module 7: platforms, APIs, marketplaces, recommender systems, data/ML.
  - Module 8: B2B fundamentals, buying committees, land-and-expand, enterprise pricing.
  - Module 9: regulated industries, privacy, AI-native companies, Responsible AI, international scaling, crisis management.
- The AI Feature Readiness Checklist in lesson 58 (`lesson-058.md:248-261`) is a strong practical artifact.

**Weaknesses.**
- **Depth shrinks as difficulty rises.** Mean Theory section length falls from about 1,000 words (Modules 1–2) to 588 (Module 9). Diagrams per lesson fall from 2.5–3.7 to 1.0–1.3.
- **All 90 "Detailed Case Study" sections are fictional scenarios.** 56 say so explicitly. Real companies appear only in a short "Real Company Example", almost all US big tech or SaaS.
- **About 70 of the 90 "Mental Model" names are house coinages,** for example "Coherence Span Model" and "Moat Durability Matrix", and quizzes test those names. Canonical frameworks are thin: Kano in 0 lessons, HEART 0, RICE 1, OST 5.

**Gaps and risks for 2026 PM roles** (number of lessons mentioning each, out of 90):

| Area | Coverage found | Gap |
|---|---|---|
| AI / LLM PM | "LLM" 1 (lesson 58), evals 3 (58, 84, 85), hallucination 2. Dedicated lessons: 58, 84, 85, 89, plus ML-adjacent 65–67. | No coverage of prompt design, RAG, agents, LLM-as-judge, model selection, token or cost arithmetic (lesson 84 has one paragraph and no numbers, `lesson-084.md:97-99`), prompt injection, the EU AI Act, or AI tools for PMs (ChatGPT, Claude, Cursor, v0: 0 mentions). These dominate 2026 AI PM loops. |
| Experimentation & statistics | A/B 22, significance 7, p-value 4, sample size 8. One dedicated lesson (45), which explains p-values and power correctly. | No worked sample-size or MDE calculation, no confidence intervals, nothing on SRM or variance reduction. |
| Data / SQL | SQL as a query language: **0** (the only hit is "sales-qualified lead"). Dashboards 27, cohorts 13. | No querying and no analytics tools (Amplitude 1, Mixpanel, Looker, Tableau 0). Analytics-heavy PM roles screen for this. |
| Technical PM | APIs 15, tech debt 17, platforms and DevEx covered conceptually. | System design 0. REST, GraphQL, JSON and WebSockets 0, although the technical capstone requires them. |
| B2B SaaS | B2B 38, enterprise 30, churn 29, pricing 25. Lessons 72–74 and 79 are dedicated. | ARR/MRR and NRR 0. CAC/LTV in 1 lesson. No B2B capstone. |
| Career / interviews | An "Interview Perspective" section in every lesson. | Product sense, CIRCLES, estimation, resume and the APM path: 0. No "breaking into PM" content, despite the FAQ's career-switcher positioning. |
| India market | **0** lessons mention India, UPI, Bharat, ₹ or any Indian company (Swiggy, Zomato, Flipkart, Razorpay, CRED, PhonePe, Meesho, Zepto, Zoho, Freshworks). | The operator is India-based. Indian learners interview at these companies and need their cases: UPI/ONDC platform dynamics, quick-commerce unit economics, vernacular onboarding, India SaaS go-to-market. |
| Freshness | The newest sources are a 2026 Forbes piece (`lesson-078.md:147`), Zoom's 2025 report and Intuit's 2024 Investor Day. Most examples are classics: Google's 41 shades (2009), Google Reader (2013), Duolingo Max (2023). | The core thinking ages well. But AI is treated as one topic among many, not woven into discovery, PRDs, prototyping and analytics, and modern PM tools are absent. |

**Quiz quality.**
- 1,350 questions: 534 Easy, 330 Medium, 191 Medium-Hard, 295 Hard.
- About 30% are tagged scenario or interview reasoning (typically Q9–15).
- Recall dominates: 32% of stems anchor to "this lesson", and 12% ask about details of the lesson's own fictional case.
- Answer-position and length cues were removed earlier (commits `fdc6e80`…`67fe3e7`), which is good.
- Distractors with giveaway absolute words rise from 3.7% (Module 1) to 17.7% (Module 9), so many advanced "Hard" items can be answered by elimination.
- Recommendation: rewrite about 20% of items as applied scenarios with plausible distractors, starting with Modules 6–9, and tie mastery (PROD-02) to the scenario items.

**Content defects to fix now** (see PROD-11):
- The compiler shows "Spotify" as the company heading on lessons 61, 62, 70, 80 and 90 (`web/scripts/compiler/compile.ts:299-306`).
- Lesson 47's quiz names Intuit, but the example is 37signals (`lesson-047.md:447`).
- Cross-references are stale (`lesson-001.md:25, 225, 254, 410-411, 697`; `lesson-002.md:23, 67`; `lesson-004.md:21`; `lesson-031.md:591`).
- Removing em dashes left run-on sentences (e.g. `lesson-001.md:5, 9`).
- Lesson 1 still contains "PM Academy" (`lesson-001.md:43`).
- `content/master_flashcards.json` (201 cards) is not referenced by any code.

---

## Metrics framework

### North-star metric: Weekly Mastering Learners (WML)

WML counts distinct learners who, in an ISO week, complete at least one lesson with a best quiz score of at least 70%, or submit or revise a capstone.

Why this metric:
- It combines habit (weekly), learning (mastery) and proof (capstones).
- XP or streak counts cannot be gamed into it.
- It is computable from existing tables once PROD-02 exists. Until then, use "≥1 lesson completed or capstone submitted" as a proxy.

### Input metrics

| # | Input metric | Definition | Current source | Target direction |
|---|---|---|---|---|
| 1 | **Activation** | Share of signups completing a first lesson within 72 hours | `users` + `user_lesson_progress` (funnel exists; add the 72-hour window). Baseline: 19% all-time first-lesson completion (2026-09-24) | ↑ (PROD-01, 09, 10) |
| 2 | **Early habit** | Share of new learners active on 3 or more distinct days in their first 14 days | `xp_events` dates | ↑ (PROD-05, 06) |
| 3 | **W4 retention** | Share of activated learners active in week 4, by signup-week cohort | Needs the cohort view (PROD-15) | ↑ |
| 4 | **Mastery rate** | Share of completed lessons first passed at 70% or more | `user_lesson_progress.quiz_score` | ↑ (PROD-02) |
| 5 | **Proof rate** | Share of capstone-eligible learners who submit within 14 days, plus approval-after-revision rate | `capstone_submissions` (+ PROD-03 columns) | ↑ (PROD-03, 04, 11) |
| 6 | **Share loop** | Share-intents per proof event, and referred signups as a share of all signups | `referrals` + new `product_events` | ↑ (PROD-07, 08, 14) |

**Guardrails:** email unsubscribe and complaint rate, lesson-1 quiz score distribution (`web/docs/BASELINE_QUERIES.md`), capstone review turnaround (`reviewed_at`), and abuse or junk signups.

**Minimum event list for `product_events` (PROD-15):**
- `signup_completed` (with `source`: lesson_preview, referral, direct)
- `onboarding_completed`
- `lesson_opened`
- `lesson_completed` (score)
- `lesson_mastered`
- `review_session_completed`
- `weekly_goal_met`
- `capstone_submitted`, `capstone_feedback_received`, `capstone_resubmitted`
- `credential_issued`
- `share_clicked` (context, platform)
- `certificate_verify_viewed`
- `portfolio_viewed` (dated, bot-filtered)
- `referral_link_copied`
- `reminder_email_clicked` (from existing `email_delivery_events`)

---

## Prioritized roadmap

**RICE** = Reach × Impact × Confidence ÷ Effort.
- **Reach:** learners affected per quarter.
- **Impact:** 3 massive, 2 high, 1 medium, 0.5 low, 0.25 minimal.
- **Confidence:** 80%, 50% or 30%.
- **Effort:** engineer-weeks.

**Assumptions:**
- About 120 signups a month, so about 360 a quarter (derived from 396 → 490 users in 23 days).
- About 150 existing learners active in a quarter, so about 500 learners reachable for features that touch everyone.
- About 40 capstone submitters a quarter.
- About 80 learners finishing a module a quarter.

None of these is measured; PROD-15 exists to replace them.

### Now (next 4–6 weeks)

| ID | Item | R | I | C | E | RICE | Note |
|---|---|---|---|---|---|---|---|
| PROD-08a | Credential wording: "Verified" → "Complete profile", OG "Topics studied", onboarding recruiter line, rename leaderboard "Fellow" tier | 500 | 0.5 | 80% | 0.5 | **400** | Protects credibility at near-zero cost |
| PROD-01 | Turn on recut + module-entry unlock for new cohorts; pre/post read; relabel A/A readout | 360 | 2 | 50% | 1 | **360** | Biggest activation lever already built |
| PROD-10a | Fix onboarding calibration copy; honour the recommendation | 360 | 0.5 | 80% | 0.5 | **288** | Ships with PROD-01 |
| PROD-05 | Effective-streak fix, reminder backoff and cap, badge award hook | 300 | 1 | 80% | 1 | **240** | Bugs in the return path |
| PROD-11 | One module taxonomy: fix the mislabeled public curriculum page and hours, capstone numbering, compiler "Spotify" default, stale cross-references, 8/10 dashboard prompt | 500 | 0.5 | 80% | 1 | **200** | Public page is wrong today. Capstone re-scoping goes in Next with PROD-16 |
| PROD-09 | `next=` intent through signup and onboarding; lesson-preview source | 100 | 1 | 50% | 0.5 | **100** | Reach unknown; measure first |
| PROD-03 | Rubric, written feedback, revise & resubmit | 40 | 3 | 80% | 3 | **32** | Low RICE because reach is small today, but it unlocks 04, 07 and 08b and is the core promise. **Do it now.** |
| PROD-15 | `product_events`, weekly cohort view, north-star tile, admin bug fixes | — | — | — | 2 | enabler | Needed to read every other item |

### Next (6–16 weeks)

| ID | Item | R | I | C | E | RICE |
|---|---|---|---|---|---|---|
| PROD-02 | Mastery state at ≥70%, wrong answers into SRS, graded concept checks, rewrite 20% of quiz items (Modules 6–9 first) | 400 | 2 | 50% | 2 | **200** |
| PROD-06 | Weekly goal, session size, goal-at-risk nudge, outcome-based weekly recap | 400 | 1 | 50% | 3 | **67** |
| PROD-07 | Module credentials (mastery + approved capstone); graduation next steps | 80 | 2 | 50% | 2 | **40** |
| PROD-12 | One case drill per module (no AI), saved to the portfolio | 300 | 1 | 50% | 4 | **38** |
| PROD-08b | Practitioner certificate tier; Fellow requires Practitioner + Module 9 case study | 50 | 2 | 50% | 1.5 | **33** |
| PROD-14a | Monthly start cohorts with a weekly cohort email | 360 | 1 | 30% | 3 | **36** |
| PROD-16 | AI PM mini-track, "Breaking into PM" module, experimentation lab, SQL lesson, one real India case per module; re-scope capstones to taught skills | 400 | 1 | 50% | 8 | **25** |
| PROD-13a | Dated, deduplicated portfolio views in the weekly recap | 200 | 0.5 | 50% | 1 | **50** |
| PROD-04 | AI first-pass capstone grader (after PROD-03 and an owner ADR on the PRD invariant) | 60 | 2 | 50% | 3 | **20** |

### Later (16+ weeks, or gated)

| ID | Item | R | I | C | E | RICE | Gate |
|---|---|---|---|---|---|---|---|
| PROD-14b | Study-pair invites with a two-sided reward; peer review of capstones | 360 | 1 | 30% | 4 | **27** | PROD-03 rubric live |
| — | Web push and WhatsApp reminders (opt-in) | 300 | 1 | 30% | 4 | **22** | Consent design; WhatsApp per-message cost |
| PROD-10b | Placement check / test-out per module | 100 | 1 | 50% | 3 | **17** | PROD-01 unlock live |
| PROD-12b | AI mock PM interviews (capped at 2 per month per learner) | 150 | 2 | 30% | 6 | **15** | PRD invariant change |
| PROD-13b | Opt-in "open to roles" and a public directory of Practitioners/Fellows | 100 | 1 | 30% | 4 | **8** | PROD-08b live |

---

## What to cut or simplify

1. **Six progress currencies → two primary ones.** XP, levels, tiers, badges, streak and skill radar all compete on the dashboard and portfolio. Make **weekly goal/streak** (habit) and **proof** (credentials and capstones) primary. Demote XP and level to secondary detail, and drop the cosmetic leaderboard tiers (`getLeaderboardTier`) whose "Fellow" name collides with PM Fellow.
2. **The 6-button SM-2 rating** (Blackout through Perfect, `components/review/QualitySelector.tsx:14-19`) → 4 buttons: Again, Hard, Good, Easy. Same algorithm, less decision fatigue.
3. **The "Verified" portfolio check:** rename it or remove it (PROD-08).
4. **Static cohorts** (`foundations-2026`, `career-switchers`): replace them with dated monthly cohorts or remove the UI. As built they are just leaderboard filters.
5. **Experiment readout and Deep-dive guardrail while flags are off:** hide or label them "no experiment running". Today they present A/A comparisons and a structural 0%.
6. **Unused promises and leftovers:** delete these so they cannot drift back into the live site:
   - `components/marketing/sections/community.tsx`: promises peer review, not rendered.
   - `components/marketing/sections/experience.tsx:378`: mocks a "Portfolio Rubric Checklist" that does not exist, not rendered.
   - The deferred `inactive.resume_learning` automation stub (`lib/notifications/automations/service.ts:50`), which PROD-05's backoff replaces.
   - The orphaned `content/master_flashcards.json`.
   - The six unused block types, unless PROD-02 or PROD-12 adopts them.
7. **Skill radar as a public "competency" claim:** keep it as a private study map until capstone rubric scores feed it.
8. **Global leaderboard as the default scope** for about 490 users: default to cohort scope once PROD-14a ships. Keep global as opt-in. This also resolves the open PRD question on global ranking (`web/docs/PRD.md:34`).

---

## What's already strong (keep and build on)

- **Activation programme discipline.** A root-cause audit led to phased fixes with ADRs, holdouts and readouts (`web/docs/PHASE_HISTORY.md`). The team instruments before it builds.
- **One-screen onboarding** with identity deferred until there is something to show (`app/onboarding/OnboardingWizard.tsx:96-105`).
- **Consistency-first leaderboard.** It ranks by days studied, then lessons, then XP (`web/docs/LEADERBOARD.md` §2). That rewards habit over grinding.
- **Humane streak design.** Timezone-aware, freezes auto-applied, any review counts as a day, local-hour delivery, zero-activity recaps suppressed, reminders suppressed with no due cards (`daily-reminder/route.ts:147-170`).
- **Lifecycle and nudge holdouts with lift readouts.** 30% deterministic holdouts and a "retire manual campaigns" gate at 200 treated users with positive lift. This is rare and valuable.
- **A single "next proof step"** shared by the dashboard, nudges, recap and lifecycle emails (`lib/growth/proof-state.ts`).
- **Honest copy choices.**
  - No invented review SLA (`lib/capstones.ts:20-34`).
  - The certificate states its actual requirement (`lib/certificates/presentation.ts:20-25`).
  - A fabricated review rating was dropped (`f10d676`).
  - "Interview-ready" was removed as an implied claim (`config/marketing.ts:43`).
- **Capstone design.** Each has a concrete scenario, instructions, template, time estimate and named requirements (`config/capstones.ts`), a solid base for the rubric.
- **Shareable proof surfaces.** Per-capstone public pages with OG cards, a verify page with JSON-LD, LinkedIn Add-to-Profile, and an idempotent certificate issuance flow at lesson 90.
- **Content depth, consistency and honest sourcing.** Every lesson connects theory to company stages, a case and interview framing. Quizzes explain every answer. 51 lessons cite sources and 43 flag their assumptions.
- **Server-enforced capstone eligibility and idempotent achievement events.** These are solid foundations for credentials that must be trusted.

---

*Cross-topic notes, one line each, for the other auditors:*
- Quiz correct answers ship to the client (`blocks/quiz/QuizBlock.tsx:14`): security/engineering.
- Email verification is off in production (`web/docs/ISSUES_KNOWN.md:29`): security.
- XP-by-source admin bug contradicts ISSUE-20 "resolved": code quality.
- The homepage hero and public lesson previews feed PROD-09: SEO/AEO.

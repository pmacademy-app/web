# PM Academy — Product Requirements Document (PRD)

**Status:** Living document — single source of truth for product decisions.
**Owner:** Solo founder (you).
**Platform:** Responsive web application (desktop + mobile responsive). Not a native mobile app.
**Companion docs:** `INDEX.md` (documentation entry point — read this first), `Architecture.md`, `Rules.md`, `Phases.md`, `Design.md`, `content-pipeline.md` and `rendering-pipeline.md` (the authoritative technical specs for how lesson content is compiled and rendered — see `Architecture.md` §4/§5 for how they relate). Read all before building or changing anything. (`archive/` contains superseded documents — historical/reference only, not authoritative; see each doc's changelog for what replaced it.)
**How to use this doc (for any future AI assistant or developer):** This PRD defines *what* to build and *why*. It does not define *how* the code is structured (see `Architecture.md`), *how* to work day-to-day (see `Rules.md`), *when* things ship (see `Phases.md`), or *what it looks like* (see `Design.md`). If a requirement here conflicts with something in another doc, this PRD wins for product behavior; `Architecture.md` wins for technical implementation details.
**Decision confidence — read this before changing anything:** every decision in this doc set is the **current best decision, not a permanent one**, unless §11's Open Decisions Log explicitly says otherwise. That cuts both ways. It means don't be afraid to revisit a specific value (a color, a spacing number, a copy line, even a feature's scope) once you have a real reason — user feedback, a launch-week metric, a build that turns out harder than expected. It also means don't re-litigate a settled decision on a hunch or a mood — "current unless justified" requires the *justified* part. If you're changing something, write one sentence on why in the relevant changelog; that's the whole bar, but clear that bar every time.

---

## 1. Product Vision & Positioning

**Vision statement:** PM Academy is the free, complete, rigorous alternative to a paid Product Management certificate — 90 lessons deep enough to sit next to a business-school elective, delivered with the habit-forming mechanics of a language-learning app.

**The gap being filled:** Someone learning PM for free today chooses between fragmented free content (blog posts, scattered videos, forum threads) with no structure or progress tracking, or a genuinely structured paid course costing $200–$2,000 (Reforge, Product School, CSPO certifications). A "Duolingo for PM" does not exist yet at real depth. The wedge is: **structured, deep, free, and habit-forming.**

**Positioning lines** (primary + backups, use consistently across marketing site, app copy, and social):
1. "The Duolingo of Product Management." *(primary)*
2. "A full PM certificate's worth of rigor. Zero cost."
3. "90 lessons. 9 modules. One skill: product judgment."

**Target users, in priority order — design every decision around #1:**

| Priority | Segment | Description | Why they matter most |
|---|---|---|---|
| Primary | Career switchers | Engineers, designers, consultants, analysts actively trying to break into PM roles within 6–12 months | Highest urgency (job-search deadline pressure), highest word-of-mouth potential if the product delivers real credibility |
| Secondary | Early-career PMs (0–2 yrs) | Got the title without the grounding; using PM Academy to fill gaps | Retention-driver segment, less urgency but longer LTV of engagement |
| Tertiary | Students / explorers | Considering PM as a possible path | Volume segment, lowest urgency, least design-priority |

**Product principles (non-negotiable, revisit before every feature decision):**

1. **Depth over gimmick.** Gamification serves retention of *real* learning — it never replaces it. No dopamine loop lets a user "complete" a lesson without engaging the Theory and Quiz sections.
2. **Free means free — no dark patterns.** No fake "free trial," no paywalling lesson 11 onward, ever. If monetization happens later (§10), it sits *on top of* a fully free core, never gates it. This is the single biggest differentiator vs. Reforge/Product School and the biggest word-of-mouth lever — do not compromise it for short-term revenue.
3. **Respect the learner's time.** Every lesson states an honest estimated time. The app must never feel like it's padding for engagement metrics (no artificial friction, no forced re-watches, no "wait 24 hours to unlock").
4. **Portfolio, not just certificate.** Module-level applied assignments must be exportable/shareable. A LinkedIn-postable PRD or case study is worth more to a learner than a badge.

Any new feature request — from you, from users, from an AI assistant continuing this build — must be checked against these four principles before being added to `Phases.md`.

---

## 2. Information Architecture

```
PM Academy
├── Home / Dashboard        (progress ring, streak, next lesson, recent XP, skill radar preview)
├── Curriculum
│   ├── Module 1–9 (locked/unlocked based on prerequisite graph)
│   │   └── Lesson 1–10 per module
│   │       ├── Theory reading view
│   │       ├── Interactive elements (mental model diagram, framework table)
│   │       ├── Quiz (15 Q, immediate feedback, learning-objective mapped)
│   │       ├── Flashcard review (spaced repetition, pulled into global deck)
│   │       └── Reflection Exercise (private journal, optional public/portfolio toggle)
│   └── Module Capstone / Applied Assignment (9 total, one per module)
├── Review Hub
│   ├── Spaced-repetition flashcard queue (global, cross-lesson, SM-2 algorithm)
│   ├── Missed-quiz-question re-test queue
│   └── Glossary search (cross-curriculum, deduped)
├── Progress
│   ├── Skill radar (lessons mapped to 7 competency clusters)
│   ├── Streak & XP history
│   └── Certificate / portfolio export
├── Leaderboard             (opt-in, friends/cohort only, weekly reset)
└── Profile & Settings
```

**Key IA decision:** Lessons are the atomic unit. Modules are the pacing unit. The **competency skill radar** — not module completion — is the most prominent thing on the dashboard, because "40% through Module 6" means less to a learner than "Discovery: Advanced, Strategy: Beginner." This reframes progress around *competence*, which is the actual product promise, not *completion*, which is a vanity metric.

---

## 3. Content Model

- 9 modules, 10 lessons each = **90 lessons total**. (Resolved per §11's Open Decisions Log — every other document already assumes this. If this ever changes, update this section and the content schema in `Architecture.md` §4 together in the same session — they must never drift out of sync.)
- **Markdown is the single source of truth.** Each lesson is authored as a Markdown file using the existing, already-consistent conventions (Learning Path table, Theory, Quiz, Flashcards, Glossary, Connections, etc.) — no fixed frontmatter or new authoring syntax required. At build time, a real Markdown-AST compiler parses, validates, and converts each lesson to a static, content-addressed block tree in JSON (see `content-pipeline.md` for the exact block taxonomy and pipeline stages). The browser consumes pre-generated JSON — there is no runtime markdown parsing. **Lesson content is never stored in the database** — the database stores only user state (see `Architecture.md` §2).
- Every lesson carries an **honest estimated time** shown before the learner starts it.
- Every lesson is tagged with 1–2 of 7 **competency clusters**: Discovery & Research, Strategy, Design & UX, Execution & Delivery, Metrics & Growth, Leadership & Communication, Platform/Technical/Specialized.
- Every lesson has: Theory (prose + mental model + case study + framework table), a 15-question Quiz, a Flashcard set, and a Reflection Exercise prompt.
- Every module ends in one **Capstone / Applied Assignment** — a larger, portfolio-worthy deliverable (e.g., write a PRD, run a mock case study), gradeable by self-review, peer-review, or (future, monetized) expert review.

---

## 4. Core Features & Functional Requirements

Each feature below states **what it must do**, **what "done" looks like**, and **explicit non-goals** to prevent scope creep by a future contributor.

### 4.1 Authentication & Onboarding
- **Requirement:** Email + Password and Google Login, via Supabase Auth.
- **Onboarding flow:** a single goal-setting question ("Why are you here?" — options: job search, filling gaps, exploring) that tailors notification cadence and dashboard copy. **MVP-trimmed:** the original design paired this with a scored placement quiz to pre-seed the skill radar — cut for v1 because the skill radar itself doesn't exist until Phase 2 (`Phases.md`), so building placement-quiz scoring logic in Phase 1 would be scoring a feature that doesn't yet consume its output. Add the placement quiz back in Phase 2, alongside the skill radar it's meant to seed, not before.
- **Done when:** a new user can sign up, answer the goal-setting question in under 30 seconds, and land on a dashboard with a "Start Lesson 1" CTA.
- **Non-goal at MVP:** additional social sign-up providers; multi-factor auth (rely on Supabase Auth defaults); scored placement quiz (Phase 2, see above).

### 4.2 Lesson Reading View
- **Requirement:** renders the lesson content from pre-generated static JSON (theory, mental model diagram, case study, framework table) with clean, distraction-free typography. No runtime markdown parsing — content is built from Markdown into JSON at deploy time (see `Architecture.md` §4). Tracks scroll-depth + active time-on-page (used for XP anti-gaming, §4.6).
- **Done when:** a learner can read a full lesson, see estimated time honored, and the "Continue to Quiz" CTA becomes available only after the dwell-time/scroll threshold is met.
- **Non-goal:** video content, audio narration (future consideration, not MVP).

### 4.3 Quiz Flow
- **Requirement:** 15 questions per lesson, one at a time, immediate feedback (correct/incorrect + explanation) before advancing, learning-objective mapped so wrong answers can route into the Review Hub's missed-question queue.
- **Done when:** a learner completes all 15 questions, sees a summary score, earns XP per §4.6, and — if 100% first-attempt — earns the mastery bonus.
- **Non-goal:** adaptive difficulty / branching quizzes at MVP.

### 4.4 Flashcard Review (Spaced Repetition)
- **Requirement:** every lesson contributes flashcards to a global, cross-lesson deck. Reviews are scheduled via the SM-2 algorithm (same core algorithm Anki uses). Review Hub surfaces due cards daily.
- **Done when:** a learner can run a review session, mark each card's recall difficulty, and see their next-due date update per SM-2.
- **Non-goal:** community-submitted flashcards, image/audio flashcards at MVP.

### 4.5 Reflection Exercise
- **Requirement:** a private journal-style prompt per lesson, with an explicit toggle to make it public/portfolio-visible.
- **Done when:** a learner can write, save, and later toggle visibility of a reflection; public reflections are viewable on the learner's portfolio export page (§4.10).
- **Non-goal:** comments/social interaction on reflections at MVP.

### 4.6 XP, Levels & Titles
- **XP model (exact values — do not change without updating this table and the corresponding logic together):**

| Action | XP | Rationale |
|---|---|---|
| Theory read (min. dwell time + scroll-through) | 10 | Rewards engagement, not skip-and-mark-done |
| Quiz — per correct answer | 5 | 15 × 5 = 75 XP ceiling per lesson |
| Quiz — first-attempt 100% bonus | +25 | Rewards genuine mastery over guess-and-retry |
| Flashcard review (per card, daily) | 2 | Keeps the retention loop alive between lessons |
| Reflection Exercise submitted | 15 | The only qualitative signal in the loop |
| Module Capstone submitted | 150 | Big, meaningful milestone |
| Daily streak maintained | 5/day, scaling, capped | Standard habit loop, capped to avoid burnout-driven grinding |

- **Anti-gaming rule (must be enforced in code, not just documented):** Theory XP only fires after a minimum active-time threshold *and* sufficient scroll depth — never on a naive "mark as read" checkbox. See `Architecture.md` §5 for the implementation approach.
- **Levels/titles** (cumulative XP thresholds tuned during beta, but the *sequence and dual meaning* are fixed):
  `Associate PM Trainee → Junior PM → PM → Senior PM → Group PM → VP Product → Chief Product Officer` (Level 9, unlocked on completing all 90 lessons + all 9 capstones).
- **Done when:** every XP-earning action updates `users.total_xp` atomically via an `xp_events` ledger (never a direct mutable counter — see `Architecture.md` §2), and the level/title updates and displays immediately with a "genuinely big milestone" animation (see `Design.md` §3 for which moments deserve motion).

### 4.7 Streaks
- **Requirement:** daily streak counter. One "streak freeze" is *earned* per week of consistent study — never purchasable. This is a deliberate anti-pattern stance: no "buy your streak back."
- **Weekly recap:** automated email/notification summarizing days studied, lessons completed, and skill-radar movement (e.g., "You studied 4/7 days, completed Lessons 23–25, your Discovery skill moved from Intermediate to Advanced").
- **Done when:** streak increments correctly across timezones (store in UTC, compute "day" boundary from the user's local timezone, captured at signup), freeze is auto-applied per the earn rule, and the recap email fires weekly via a scheduled job.
- **Non-goal:** streak-based monetization of any kind, ever (see §10 exclusions).

### 4.8 Skill Radar
- **Requirement:** every lesson tagged with 1–2 of the 7 competency clusters (§3). Dashboard renders a radar/spider chart aggregating lesson completion + quiz performance per cluster into a proficiency level (Beginner/Intermediate/Advanced per cluster, or a continuous 0–100 score — decide and lock in during Phase 1 design, document the final scoring formula here once chosen).
- **Done when:** the radar updates immediately after each lesson/quiz/capstone completion and is the single most prominent element on the dashboard (above streak, above XP).
- **This is the core differentiator** — do not deprioritize this feature relative to badges/leaderboard if timeline pressure forces cuts.

### 4.9 Badges
- **Requirement:** capped at ~20 meaningful badges tied to real learning events — avoid badge bloat. Confirmed badge list (extend only with genuine milestones, never filler):
  - First perfect quiz score
  - First capstone submitted
  - Each module completed (9 badges)
  - 30-day streak
  - "Comeback" — resumed studying after a 2-week+ gap (rewards return, not streak purity)
  - Full curriculum completion ("Chief Product Officer")
  - (Remaining slots reserved for beta-discovered meaningful moments — do not fill preemptively with generic badges.)
- **Non-goal:** cosmetic-only badges, purchasable badges.

### 4.10 Leaderboard
- **Requirement:** opt-in only, defaults to off. Friends/cohort scope only — no global leaderboard (demotivates the ~95% of users never near the top). Weekly reset. Ranked by **consistency (days studied this week)**, not raw XP, to avoid favoring people with more free time over people learning effectively.
- **Done when:** a user can opt in, add friends (via invite link or email), and see a weekly-resetting cohort ranking.

### 4.11 Progress & Portfolio Export
- **Requirement:** exportable/shareable certificate and portfolio page showing skill radar, completed capstones (with public reflections attached), and overall level/title. Shareable as a public profile URL and/or downloadable PDF.
- **Done when:** a learner can generate a public portfolio link suitable for pasting into a LinkedIn post or job application, and it renders cleanly without requiring the viewer to have an account.
- **Rationale:** per Product Principle #4, this is a retention *and* acquisition feature — treat it as core, not a nice-to-have.

### 4.12 Module/Curriculum Map
- **Requirement:** a visual "map" (not a bare list) of the 9 modules, using a game-world-map metaphor, showing lock/unlock state based on prerequisite completion.
- **Done when:** a learner can see all 9 modules, their lock state, and jump into any unlocked module's lesson list.

---

## 5. Non-Functional Requirements

| Category | Requirement |
|---|---|
| **Cost** | Low infrastructure cost at launch — every service used must have a genuinely free tier sufficient for launch-scale traffic (~5,000 users). See `Architecture.md` §1 for the locked-in free-tier stack and what triggers a paid upgrade decision. |
| **Architecture** | Static-first: lesson content served as pre-generated JSON via Vercel Edge Network CDN. Database used only for user state. No runtime markdown parsing. See `content-pipeline.md` for the full content pipeline and `Architecture.md` §4 for a summary. |
| **Performance** | Lesson pages must be server-rendered (SSR) for SEO and fast first paint. Target Lighthouse performance score ≥ 90 on lesson pages. Static JSON content delivery ensures consistently fast load times. |
| **SEO** | Public lesson preview pages must be indexable, with proper meta tags, structured data (Article/Course schema), and semantic HTML. This is a primary organic acquisition channel — treat SEO as a functional requirement, not an afterthought (see `Design.md` §6 for the marketing site + SEO strategy in full). |
| **Accessibility** | WCAG AA minimum: color contrast, keyboard navigation, screen-reader labels on all interactive elements. Build this in from day one — retrofitting is expensive (per original roadmap §5.3). |
| **i18n readiness** | Externalize all UI strings from day one (even if launching English-only) — a large share of the target audience is outside the US/India-and-APAC-heavy given the positioning. Do not hardcode strings inline in components. |
| **Data integrity** | Markdown files are the single source of truth for lesson content. Content is converted to static JSON at build time — never stored in the database. The database stores only user state (progress, reflections, XP events, bookmarks). Never hand-edit lesson content outside of Markdown source files. |
| **Analytics** | Google Analytics for page views, user flow, and conversion tracking. No server-side analytics infrastructure. |
| **Security** | Row-level security (RLS) enforced at the database layer for all user-owned data (progress, reflections, XP events) — do not rely solely on application-layer checks. |
| **Solo-founder maintainability** | Every architectural choice must optimize for one person (possibly aided by AI tools) being able to understand, extend, and debug the system without a team. Prefer boring, well-documented technology over novel or clever solutions. See `Rules.md` for the full simplicity-first engineering philosophy. |

---

## 6. Explicit Non-Goals (v1)

To prevent scope creep, the following are **not** in scope for the initial public launch, even though they may be discussed or requested:

- Native mobile apps — this is a responsive web application only. No Android app, no iOS app, no app store listings.
- Community/social features beyond the opt-in friends leaderboard (no forums, comments, DMs).
- AI-generated personalized lesson content (curriculum is fixed and human-authored).
- An "AI Mentor" chat feature (PRD reviews, quiz generation, interview practice) — resolved as cut from v1 per §11; do not reintroduce without first budgeting it as a real feature here, in `Architecture.md`, and in `Phases.md`.
- Multi-language content (i18n-*ready* infrastructure only, not translated content).
- Any paid tier or paywalled lesson content (see Product Principle #2 — this is permanent, not just a v1 scope cut).
- Cohort/instructor mode for institutions (this is a Section 10 monetization idea for *after* the free core is proven — do not build early).
- Server-side search (search is client-side via a build-time generated index — see `Architecture.md` §5).

---

## 7. Gamification System — Design Rationale Summary

(Full detail lives inline in §4.6–4.10 above; this section captures the *why* so a future contributor doesn't accidentally reintroduce a rejected pattern.)

- Gamification exists to reinforce genuine learning signals (scroll-depth-verified reads, quiz correctness, capstone submission), never to reward clicking without engagement.
- No purchasable mechanics of any kind (streak freezes, XP boosts, badge unlocks) — this is a permanent anti-pattern stance tied directly to the "no dark patterns" product principle.
- Global leaderboards are explicitly rejected as demotivating; cohort/friends-only, consistency-ranked, opt-in is the permanent model.
- The skill radar (not modules-completed) is the primary progress metaphor shown to users — this is the single most important gamification/IA decision in the entire product and should not be de-prioritized under timeline pressure.

---

## 8. Marketing Website — Product Requirements

The marketing pages are integrated into the main Next.js application as the `(marketing)` route group — one deploy, one domain, shared design system. Full content structure, page-by-page copy guidance, and SEO strategy live in `Design.md` §6. This section defines the *functional* requirements only:

- **Purpose:** official information page for PM Academy — explains the product, shows sample lesson content, and converts visitors into either (a) waitlist signups pre-launch or (b) app signups post-launch.
- **Waitlist form:** collects **name, email address, and current career position** — nothing else. Stored in a `waitlist` table in Supabase (see `Architecture.md` §2).
- **Must include:** a working waitlist form (pre-launch), 3–5 fully public sample lesson pages (SEO head start + credibility proof), a clear explanation of the free-forever model (reinforces Product Principle #2 to skeptical visitors), and a Product Hunt/launch-ready landing page for launch week.
- **Must be live independently of the authenticated app features** — the waitlist page can and should go live in Week 1, decoupled from all other engineering work.
- **Transactional email:** waitlist confirmation, email verification, password reset, and welcome emails sent via **Resend** connected to Supabase through SMTP (see `Architecture.md` §1).
- **Hosting:** Vercel, same deployment as the main application.

---

## 9. Success Metrics (first 6 months post-launch)

| Metric | Target (directional — recalibrate after closed beta) |
|---|---|
| Day-1 activation (completed Lesson 1) | > 60% of signups |
| Day-7 retention | > 30% |
| Module 1 completion rate | > 40% of activated users |
| Full curriculum (all 90 lessons) completion rate | 5–10% (realistic for free self-serve; comparable to Duolingo's own completion range) |
| Organic (non-paid) traffic share by month 6 | > 50%, driven by SEO + LinkedIn shares |
| NPS from completers | > 50 |

**Launch-week metrics to actually watch (do not over-index on raw signups):**
- Day-1 lesson completion rate (did they finish Lesson 1?)
- Day-7 retention (did they come back?)
- Quiz completion rate (are they engaging with assessment, not just skimming?)

These three predict long-term success far better than signup counts.

---

## 10. Monetization (deferred — only after the free core is proven)

The core 90 lessons stay free forever — this is the trust foundation and the core differentiator, not negotiable. If/when sustainability beyond founder funding is needed, in order of fit:

1. **Optional paid capstone review** — human or expert-reviewed-AI feedback on the 9 capstone submissions, for learners who want more than peer/self-review. Monetizes *depth*, not *access*.
2. **Job-search-adjacent premium** — resume/portfolio review, mock PM interview practice, curated job board. Sits *next to* the free curriculum, never gates it.
3. **B2B/cohort licensing** — bootcamps or university career centers license a "cohort mode" (instructor progress dashboards) built on top of the same free content.

**Permanently excluded, regardless of revenue pressure:**
- Ads (undermines the "b-school caliber" positioning).
- Gating any of the 90 lessons (breaks the core promise).
- Pay-to-skip-streak-freeze or any other gamification-monetization pattern (predatory, contradicts §4.7's anti-pattern stance).

---

## 11. Open Decisions Log

Track unresolved product decisions here so context is never lost between sessions. Update this table whenever a decision is made — move resolved items to a dated changelog at the bottom of this file rather than deleting them.

| Decision | Status | Notes |
|---|---|---|
| 9 vs. 10 modules | **Resolved: 9 modules.** | Locked in. Every downstream document (`Architecture.md` §2/§4, `Design.md`, `Phases.md`, and both marketing/content sprint docs) already builds on 9 modules × 10 lessons = 90 — this was de facto decided by implementation drift even while this table still said "Open." Formally closing it here so no future contributor reopens it. |
| **AI Mentor** | **Resolved: cut from v1 entirely.** | Was found unscoped in the (now-archived) marketing/content sprint docs — an entire homepage section, FAQ answer, footer link, and hero copy line built around a chat-based AI mentor that never existed in this PRD's feature list, `Architecture.md`'s stack, or `Phases.md`'s roadmap, and directly contradicted §6's non-goal against AI-generated content. It also breaks the $0-infra-cost principle (`Architecture.md` §1) — LLM API calls have no meaningful free tier at real usage volume, unlike the rest of this stack. Treated the same way §10 treats monetization: deferred to Phase 7+, to be built only once the free core is proven and only with a real cost model, never as launch-week marketing copy for a feature engineering hasn't built. All "AI Mentor"/"AI-assisted" copy has been stripped from launch-facing content; the archived docs still contain leftover references — do not resurrect them without re-adding this as a real, budgeted feature first.
| Skill radar scoring formula (discrete Beginner/Intermediate/Advanced vs. continuous 0–100) | Open | Lock in during Phase 1 design (see `Phases.md`), then document the final formula in this PRD §4.8. |
| Exact XP thresholds per level/title | Open | Tune during closed beta (Phase 4); §4.6 sequence is fixed, numeric thresholds are not. |
| Expert-reviewed-AI capstone feedback (§10.1) — build in-house or use an LLM API directly | Deferred | Not a v1 decision; revisit only once free core is proven per §10's ordering. Note: if AI Mentor (above) is greenlit, evaluate both together — they'd likely share the same LLM-API cost/vendor decision rather than being solved twice. |

---

## Changelog

- v2.3 — Added `content-pipeline.md` and `rendering-pipeline.md` as companion docs. Updated §3's content-model description: lessons are no longer described as having a "fixed section structure" parsed by a single schema — they use the existing, already-consistent authoring conventions (Learning Path table, Quiz, Flashcards, Glossary, Connections, etc.), compiled into a richer block tree by the new content pipeline; no product-level requirement changed, only the wording that referred to the now-superseded flat-schema description in `Architecture.md`. Updated §5's NFR table to point to `content-pipeline.md` as the authoritative pipeline reference.
- v2.2 — Lean-documentation pass: resolved AI Mentor as cut from v1 (was Open in v2.1). Added the "current decision unless justified" framing to this doc's intro. MVP-trimmed onboarding (§4.1) — removed the scored placement quiz from Phase 1 since it existed only to seed the skill radar, which doesn't exist until Phase 2; moved it there instead. Noted the archive of the original roadmap and three sprint docs (now `archive/`, superseded by the lean 5-doc set — see `Design.md`'s changelog for what was preserved from them).
- v2.1 — Documentation review pass: closed the 9-vs-10 modules decision (resolved: 9, per downstream doc consistency). Added critical Open Decision on the "AI Mentor" feature found unscoped in the marketing/content sprint docs — contradicts §6's non-goal and is absent from Architecture/Phases; flagged as launch-blocking until resolved.
- v2.0 — Updated for static-first architecture: responsive web app (not native), Markdown→JSON build pipeline, Supabase for user state only, Google Analytics (replaced PostHog), Email+Password and Google Login (removed LinkedIn OAuth), Resend SMTP, Vercel-only hosting (removed Cloudflare), client-side search, waitlist collects name/email/career position.
- v1.0 — Initial PRD authored from the "PM Academy — 0→1 Roadmap & Project Plan" source document. All decisions in that roadmap are considered ratified unless marked "Open" in §11.

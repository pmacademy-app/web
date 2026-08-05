# PM Academy — Phases (Roadmap & Milestones)

**Status:** Living document — single source of truth for sequencing and "what does done mean" at each stage.
**Companion docs:** `INDEX.md` (documentation entry point — read this first), `PRD.md` (what/why), `Architecture.md` (how, technically), `Rules.md` (how we work), `Design.md` (what it looks like), `content-pipeline.md` and `rendering-pipeline.md` (the exact compiler/renderer this roadmap's Phase 0/1/4 milestones build).
**Context:** Solo-founder execution, optionally aided by AI coding assistants. Timelines are directional (weeks from kickoff) and phases can overlap where explicitly noted — treat the *sequence and definition-of-done* as the fixed part, and the week numbers as recalibratable based on actual solo-founder bandwidth.

---

## How to Use This Document

Each phase lists: **Goal**, **Scope (what ships)**, **Explicit exclusions (what does NOT ship this phase)**, and **Definition of Done**. Before starting work in any phase, confirm the previous phase's Definition of Done is actually met — don't let scope bleed forward just because it's tempting to start gamification work while the core loop is still shaky.

---

## Phase 0 — Foundation (Weeks 1–3)

**Goal:** Resolve blocking content/design decisions, stand up the static-first content pipeline, and wire the deployment infrastructure, so Phase 1 engineering isn't blocked on anything.

**Scope:**
- Resolve the 9 vs. 10 modules decision (`PRD.md` §11) — this blocks the content schema in `Architecture.md` §4 and must be resolved first.
- Approve the content backlog/bug-fix list from the content audit; kick off any Module 9 expansion work in parallel with engineering (content work should never block engineering, and vice versa).
- Build the Figma design system: typography, color, component library (buttons, cards, progress rings, quiz UI, search input, auth forms, waitlist form) — see `Design.md` §1–§2 for the locked-in direction to execute against.
- Technical scaffolding: repo created per `Architecture.md` §3's folder structure, Next.js + Supabase set up, CI/CD on Vercel per `Rules.md` §3.5.
- **Content compiler** (`content-pipeline.md`, `Architecture.md` §4) — build this as the **first real engineering task**. Compile all source Markdown files (`content:compile`) into validated, content-addressed block-tree JSON, with per-lesson validation (`content:validate`) so a single bad lesson never blocks the others. No runtime markdown parsing — the browser consumes pre-generated JSON.
- **Authentication** — wire Supabase Auth with Email + Password and Google Login (`PRD.md` §4.1).
- **Waitlist page** — stand up the marketing-site waitlist landing page (see `Design.md` §6) collecting name, email, and current career position. This is independent of every other Phase 0 item and should go live as early in Week 1 as possible. Waitlist data stored in Supabase `waitlist` table (`Architecture.md` §2).
- **Google Analytics** — integrate for page views and basic user flow tracking.
- **Resend SMTP** — connect Resend to Supabase via SMTP for email verification, password reset, waitlist confirmation, and welcome emails.
- **Deployment pipeline** — set up GitHub Actions workflow: Markdown validation → JSON generation → Next.js build → Vercel deployment (`Architecture.md` §8).

**Explicit exclusions:** no gamification logic, no quiz UI polish, no dashboard — this phase is scaffolding, content pipeline, and deployment infrastructure only.

**Definition of Done:**
- Module/lesson count decision is finalized and reflected in `PRD.md` §3, `Architecture.md` §4.
- A developer (or AI assistant) can clone the repo, run the build, and see at least one real lesson rendered from the static JSON content pipeline.
- The deployment pipeline is fully automated: push to GitHub → GitHub Actions validates content and generates JSON → Vercel deploys.
- The waitlist landing page is live and capturing name, email, and career position.
- Google Analytics is tracking page views.
- Resend SMTP is sending transactional emails (verification, waitlist confirmation).
- Figma design system covers at minimum: typography scale, color tokens, button/card/progress-ring/search/auth/waitlist components (see `Design.md` §2 for the full first-screens list this system must support).

---

## Phase 1 — Core Learning Loop MVP (Weeks 4–8)

**Goal:** A real user can sign up, read Lesson 1, take its quiz, and see Lesson 2 unlock. This is the first genuinely testable version of the product.

**Scope:**
- Lesson reading view: renders pre-generated static JSON content for all fixed sections (`PRD.md` §4.2, `Architecture.md` §4), styled per `Design.md`.
- Quiz flow: 15 questions, immediate feedback, explanations (`PRD.md` §4.3). Quiz data loaded from static JSON.
- Basic progress tracking: lesson complete/incomplete, module unlock logic based on the prerequisite graph (`PRD.md` §2). Progress stored in Supabase.
- Auth + user accounts, onboarding flow (single goal-setting question only — `PRD.md` §4.1's MVP-trimmed scope, no scored placement quiz yet).

**Explicit exclusions:** no XP/levels, no streaks, no skill radar, no badges, no leaderboard, no flashcard SRS, no capstones, **no search** (moved to Phase 4 — see rationale there). Resist the temptation to add "just a little gamification" here — the point of this phase is to validate the *learning* loop in isolation.

**Definition of Done:**
- 10–20 real career-switcher users (recruited per `PRD.md`'s Primary segment) can complete the full loop: sign up → onboarding → Lesson 1 theory → Lesson 1 quiz → Lesson 2 unlocks.
- Get this cohort of real users testing before building anything further — their feedback should directly inform Phase 2 priorities.
- No P0/P1 bugs in the core reading → quiz → unlock loop.

---

## Phase 2 — Gamification Layer (Weeks 9–13)

**Goal:** Layer in the habit-forming mechanics that turn a course into a product people return to daily.

**Scope:**
- XP system + levels/titles (`PRD.md` §4.6) — implement the anti-gaming rule (`Rules.md` §5.2) from the start, not as a later patch.
- Streaks with the earned-freeze mechanic (`PRD.md` §4.7, `Rules.md` §5.3) — timezone-correct day-boundary logic per `Architecture.md` §6.
- Skill radar: competency tagging (already in the static JSON content) + visualization (`PRD.md` §4.8) — lock in the scoring formula (open decision, `PRD.md` §11) during this phase and document it back into `PRD.md` §4.8 once decided.
- Dashboard: progress ring + skill radar + "continue learning" CTA (`Design.md` §2, screen #3).
- Flashcard spaced-repetition review hub (`PRD.md` §4.4, SM-2 per `Architecture.md` §5).

**Explicit exclusions:** no capstones, no badges, no leaderboard yet — these depend on gamification fundamentals being solid first.

**Definition of Done:**
- A returning user sees accurate XP, level/title, streak, and a skill radar that updates immediately after each lesson/quiz.
- Flashcard review sessions correctly schedule next-review dates per SM-2.
- The Phase 1 test cohort (or an expanded version of it) reports the gamification layer as motivating, not gimmicky — check this explicitly against Product Principle #1 (`PRD.md` §1): does anyone report "completing" a lesson without engaging Theory/Quiz? If so, tighten the anti-gaming rule before moving to Phase 3.

---

## Phase 3 — Depth & Retention Features (Weeks 14–18)

**Goal:** Add the features that make the product's promise ("portfolio, not just certificate") real, and the mechanics that bring lapsed users back.

**Scope:**
- Module capstone/applied-assignment submission flow (`PRD.md` §4, capstone in the content model §3).
- Badges (`PRD.md` §4.9) — the capped ~20-badge list, tied to real milestones.
- Opt-in friends/cohort leaderboard (`PRD.md` §4.10).
- Email re-engagement: streak reminders, weekly recap (`PRD.md` §4.7) via Resend (`Architecture.md` §1).
- Portfolio/certificate export — shareable PDF or public profile page (`PRD.md` §4.11). Treat this as core, not a nice-to-have, per its stated role as both a retention *and* acquisition feature.

**Explicit exclusions:** no expert/paid capstone review (that's `PRD.md` §10 monetization, explicitly deferred until the free core is proven).

**Definition of Done:**
- A user can submit a capstone, have it appear (optionally publicly) on their portfolio export page, and that page renders cleanly for a logged-out viewer (e.g., a recruiter clicking a LinkedIn link).
- Weekly recap emails fire correctly and contain accurate skill-radar movement data.
- At least one badge-earning event has been verified end-to-end (e.g., first perfect quiz score triggers the badge immediately).

---

## Phase 4 — Polish, SEO, Beta Hardening (Weeks 19–22)

**Goal:** Get the product ready for real public traffic — technically, legally (accessibility), and from an acquisition standpoint.

**Scope:**
- Full content-audit fixes applied (ideally this ran in parallel since Week 1 — confirm completion here as a gate, don't start it now if it wasn't already in motion).
- **Search — UI enablement, moved here from Phase 1.** The content compiler emits the FlexSearch `search-index.json` (and `glossary-index.json`) as a pipeline stage on every compile regardless of phase (`content-pipeline.md` §8) — what actually moves to this phase is building and turning on the client-side `SearchOverlay` (`rendering-pipeline.md` §8, `Architecture.md` §5). Rationale for the move: search adds no value while only 1–2 lessons are unlocked for a 10–20-user test cohort (Phase 1's actual scope); it earns its place once most/all 90 lessons are live and there's real content to search, which naturally aligns with this phase's public-facing SEO push.
- SSR/SEO pass on lesson pages: public-facing lesson previews indexed by Google (`PRD.md` §5 non-functional requirement, `Design.md` §6 SEO strategy) — this is a major free acquisition channel for "what is product management"-style queries.
- Accessibility pass: run the full budget in `Design.md` §4 — automated scan plus at least one manual screen-reader pass.
- Closed beta with 100–200 real users, instrumented with Google Analytics. Fix drop-off points in the funnel — **onboarding → Lesson 1 completion is the single most important metric to fix here.**

**Explicit exclusions:** no new features beyond search (above) in this phase — this is a hardening and instrumentation phase. If a beta user requests a new feature, log it for a post-launch phase; don't let it slip into Phase 4 scope.

**Definition of Done:**
- Every item in `Design.md` §4's Performance Budget is met on lesson pages, verified with real Lighthouse runs, not estimated.
- WCAG AA basics verified per `Design.md` §4's checklist (automated + at least one manual pass with a screen reader).
- Client-side search returns relevant results across all live lessons in under 100ms perceived latency.
- Closed beta cohort's Day-1 activation and Day-7 retention numbers are known and any major funnel drop-off has been addressed (see `PRD.md` §9 for target ranges to compare against).
- Google Analytics is capturing the funnel end-to-end: signup → onboarding → Lesson 1 theory → quiz → dashboard return.

---

## Phase 5 — Public Launch (Week 23+)

**Goal:** Execute the launch plan and start compounding organic growth.

**Scope (see `PRD.md` §8 and `Design.md` §6 for full detail):**
- **Pre-launch groundwork** (should already be substantially done by this point, since the waitlist page went live in Week 1 and 3–5 public sample lessons were published ahead of full launch for SEO head start + credibility):
  - Recruit closed-beta advocates from career-switcher communities as first launch-week amplifiers.
- **Launch channels (all free, no paid-ad budget assumed):**
  1. Product Hunt launch.
  2. Reddit (r/ProductManagement, r/cscareerquestions) — feedback framing, never a hard sell.
  3. LinkedIn — founder-voice posts on the free-vs-paid gap, plus organic distribution once users start sharing their skill-radar/portfolio exports.
  4. SEO (slow-start, compounding) — public lesson pages targeting real search queries ("what is a PRD," "jobs to be done framework," etc.) become the largest channel by month 6–12 even at near-zero launch-week contribution.
  5. Partnerships — PM bootcamps/communities (Product School, Mind the Product, ADPList mentors) as a free-resource-to-recommend, not a competitor pitch.

**Definition of Done / what to watch launch week:** Don't over-index on raw signups. Watch, in this priority order:
1. Day-1 lesson completion rate (did they finish Lesson 1?)
2. Day-7 retention (did they come back?)
3. Quiz completion rate (are they engaging with assessment, not just skimming?)

These predict long-term success far better than signup counts (`PRD.md` §9).

**Launch Week Success Criteria (directional — the point is having a number to check against, not the specific number):**

| Signal | Target | If missed |
|---|---|---|
| Waitlist → signup conversion (first 7 days) | > 15% of waitlist | Not itself a crisis — check whether it's an activation-copy problem (weak "why sign up now" moment) before assuming the whole launch failed. |
| Day-1 lesson completion (launch cohort) | > 60% (matches the 6-month target in `PRD.md` §9 — launch week is the first real read on whether that target is realistic) | Treat as the #1 priority bug-hunt signal — a low number here almost always means friction in onboarding or Lesson 1 itself, not a demand problem. |
| Product Hunt launch day | Top 10 in Products of the Day | A miss here doesn't change the plan — SEO and LinkedIn are the compounding channels (`PRD.md` §8.2); Product Hunt is a single-day amplifier, not the growth engine. Don't over-invest founder time chasing PH ranking at the expense of watching Day-1/Day-7 numbers. |
| Zero P0 bugs in the core reading → quiz → unlock loop during launch week | 0 | This is a hard gate carried over from Phase 1's Definition of Done — if it regresses during launch week, fixing it outranks every growth activity that day. |

If Day-1 completion or Day-7 retention come in meaningfully below target, the right response is diagnosing and fixing the funnel (Phase 6), not pushing harder on acquisition — more signups into a leaky funnel just produces a worse-looking Day-7 number at larger scale.

**Total to public launch: ~5–6 months** for deliberate, non-rushed solo-founder execution — this is a realistic estimate for the scope described, not padded, and should be recalibrated honestly (not compressed under pressure) if Phase 1 or Phase 4 reveal the timeline needs adjustment.

---

## Post-Launch Phases (directional — flesh out once Phase 5 data exists)

- **Phase 6 — Retention iteration:** use closed-beta and launch-week Google Analytics data to fix the biggest funnel drop-off, iterate on gamification balance (XP thresholds, streak-freeze cadence) using real behavioral data rather than guesses.
- **Phase 7 — Monetization exploration (only once free-core success is proven per `PRD.md` §10):** optional paid capstone review, job-search-adjacent premium features, or B2B/cohort licensing — in that order of fit, never before the core metrics in `PRD.md` §9 show real traction.
- **Phase 8+ — Scale infrastructure decisions:** revisit `Architecture.md` §10's scaling path only when free-tier ceilings are actually approached — not preemptively.

---

## Immediate Next Steps (do these first, this week, regardless of which phase is "current")

1. Decide 9 vs. 10 modules (`PRD.md` §11) — blocks the content schema.
2. Approve the fixed-count content backlog and kick off metadata-bug fixes + any module expansion in parallel with Phase 0 engineering.
3. Commission or draft the Figma design system (`Design.md` §1–§2) so engineering isn't blocked waiting on visual direction.
4. Stand up the waitlist landing page (`PRD.md` §8, `Design.md` §6) collecting name, email, and career position — this can go live literally this week, independent of everything else, and starts compounding immediately.
5. Build the content compiler (`content-pipeline.md`, `Architecture.md` §4) as the first real engineering task — it de-risks the entire content pipeline before any UI is built.
6. Set up the deployment pipeline (`Architecture.md` §8): GitHub Actions → Markdown validation → JSON generation → Vercel deployment.

---

## Milestone Checklist (quick-reference, tick off as completed)

- [ ] Module/lesson count finalized
- [ ] Waitlist landing page live
- [ ] Figma design system v1 complete
- [ ] Repo scaffolded per `Architecture.md` §3
- [ ] Content compiler built and run against all available lessons
- [ ] Deployment pipeline automated (GitHub Actions → Vercel)
- [ ] Auth working (Email + Password, Google Login)
- [ ] Google Analytics tracking page views
- [ ] Resend SMTP sending transactional emails
- [ ] Lesson reading view + quiz flow functional (Phase 1 core loop)
- [ ] 10–20 real users complete the core loop
- [ ] XP, streaks, skill radar live (Phase 2)
- [ ] Placement quiz live, seeding skill radar (Phase 2)
- [x] Capstones, badges, leaderboard, portfolio export, certificates live (Phase 3 — Stabilization Sprint Complete)
- [ ] Search index generated and search UI live (Phase 4)
- [ ] Performance budget (`Design.md` §4.1) and accessibility budget (`Design.md` §4) verified, not estimated
- [ ] Closed beta run (Phase 4)
- [ ] Public launch executed across all channels (Phase 5)

---

## Changelog

- v2.2 — Added `content-pipeline.md`/`rendering-pipeline.md` as companion docs. Updated Phase 0's content-pipeline milestone and Phase 4's search milestone to describe the real block-tree compiler (`content:compile`/`content:validate`, per-lesson validation, FlexSearch indexing built into every compile) rather than a flat parse-content.ts/generate-search-index.ts script pair — no change to phase sequencing or scope, only to the implementation description so it doesn't contradict `content-pipeline.md`.
- v2.1 — MVP scope trim per documentation review: (1) moved client-side search (index generation + UI) from Phase 1 to Phase 4 — it added no value while only 1-2 lessons were unlocked for the small Phase 1 test cohort, and pairs naturally with Phase 4's SEO push once most lessons are live. (2) Fixed a sequencing bug: Phase 1's onboarding no longer includes a scored placement quiz, since it existed only to seed the skill radar, which doesn't exist until Phase 2 — building that scoring logic in Phase 1 was premature work with no consumer. The placement quiz moves to Phase 2 alongside the skill radar. (3) Added explicit numeric Launch Week Success Criteria to Phase 5, distinct from `PRD.md` §9's 6-month targets. (4) Resolved the AI Mentor open question (see `PRD.md` §11) as cut from v1 — no Phases.md changes were needed since it was never actually in any phase's scope, only in the now-archived marketing copy.
- v2.0 — Updated for static-first architecture: Phase 0 expanded to include content parser, JSON generator, search index, deployment pipeline (GitHub Actions), Google Analytics, Resend SMTP, waitlist (name/email/career position). Replaced PostHog with Google Analytics throughout. Removed LinkedIn OAuth. Updated content pipeline references from DB seeding to static JSON generation.
- v1.0 — Initial phased roadmap authored from the "PM Academy — 0→1 Roadmap & Project Plan" source document, with explicit scope/exclusion/definition-of-done added per phase for unambiguous execution.

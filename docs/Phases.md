# PM Academy — Phases (Roadmap & Milestones)

**Status:** Living document — single source of truth for sequencing and "what does done mean" at each stage.
**Companion docs:** `PRD.md` (what/why), `Architecture.md` (how, technically), `Rules.md` (how we work), `Design.md` (what it looks like).
**Context:** Solo-founder execution, optionally aided by AI coding assistants. Timelines are directional (weeks from kickoff) and phases can overlap where explicitly noted — treat the *sequence and definition-of-done* as the fixed part, and the week numbers as recalibratable based on actual solo-founder bandwidth.

---

## How to Use This Document

Each phase lists: **Goal**, **Scope (what ships)**, **Explicit exclusions (what does NOT ship this phase)**, and **Definition of Done**. Before starting work in any phase, confirm the previous phase's Definition of Done is actually met — don't let scope bleed forward just because it's tempting to start gamification work while the core loop is still shaky.

---

## Phase 0 — Foundation (Weeks 1–3)

**Goal:** Resolve blocking content/design decisions and stand up the technical skeleton, so Phase 1 engineering isn't blocked on anything.

**Scope:**
- Resolve the 9 vs. 10 modules decision (`PRD.md` §11) — this blocks the data model in `Architecture.md` §2 and must be resolved first.
- Approve the content backlog/bug-fix list from the content audit; kick off any Module 9 expansion work in parallel with engineering (content work should never block engineering, and vice versa).
- Build the Figma design system: typography, color, component library (buttons, cards, progress rings, quiz UI) — see `Design.md` §1–§2 for the locked-in direction to execute against.
- Technical scaffolding: repo created per `Architecture.md` §3's folder structure, Next.js + Supabase set up, auth wired (email + Google first, LinkedIn can follow), CI/CD on Vercel per `Rules.md` §3.5.
- Build the content parser (`Architecture.md` §4) and run it against all lessons currently ready → seed the dev database. **Do this as the first real engineering task** — it de-risks the entire content pipeline before any UI exists.
- Stand up the marketing-site waitlist landing page (see `Design.md` §6) — this is independent of every other Phase 0 item and should go live as early in Week 1 as possible.

**Explicit exclusions:** no gamification logic, no quiz UI polish, no dashboard — this phase is scaffolding and decisions only.

**Definition of Done:**
- Module/lesson count decision is finalized and reflected in `PRD.md` §3, `Architecture.md` §2/§4.
- A developer (or AI assistant) can clone the repo, run it locally, and see at least one real seeded lesson rendered from the content pipeline.
- The waitlist landing page is live and capturing emails.
- Figma design system covers at minimum: typography scale, color tokens, button/card/progress-ring components (see `Design.md` §2 for the full first-screens list this system must support).

---

## Phase 1 — Core Learning Loop MVP (Weeks 4–8)

**Goal:** A real user can sign up, read Lesson 1, take its quiz, and see Lesson 2 unlock. This is the first genuinely testable version of the product.

**Scope:**
- Lesson reading view: full MDX rendering of all fixed sections (`PRD.md` §4.2, `Architecture.md` §4), styled per `Design.md`.
- Quiz flow: 15 questions, immediate feedback, explanations (`PRD.md` §4.3).
- Basic progress tracking: lesson complete/incomplete, module unlock logic based on the prerequisite graph (`PRD.md` §2).
- Auth + user accounts, onboarding flow (placement quiz + goal-setting, `PRD.md` §4.1).

**Explicit exclusions:** no XP/levels, no streaks, no skill radar, no badges, no leaderboard, no flashcard SRS, no capstones. These are all Phase 2–3. Resist the temptation to add "just a little gamification" here — the point of this phase is to validate the *learning* loop in isolation.

**Definition of Done:**
- 10–20 real career-switcher users (recruited per `PRD.md`'s Primary segment) can complete the full loop: sign up → onboarding → Lesson 1 theory → Lesson 1 quiz → Lesson 2 unlocks.
- Get this cohort of real users testing before building anything further — their feedback should directly inform Phase 2 priorities.
- No P0/P1 bugs in the core reading → quiz → unlock loop.

---

## Phase 2 — Gamification Layer (Weeks 9–13)

**Goal:** Layer in the habit-forming mechanics that turn a course into a product people return to daily.

**Scope:**
- XP system + levels/titles (`PRD.md` §4.6) — implement the anti-gaming rule (`Rules.md` §5.2) from the start, not as a later patch.
- Streaks with the earned-freeze mechanic (`PRD.md` §4.7, `Rules.md` §5.3) — timezone-correct day-boundary logic per `Architecture.md` §5.
- Skill radar: competency tagging (already in the content pipeline) + visualization (`PRD.md` §4.8) — lock in the scoring formula (open decision, `PRD.md` §11) during this phase and document it back into `PRD.md` §4.8 once decided.
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
- SSR/SEO pass on lesson pages: public-facing lesson previews indexed by Google (`PRD.md` §5 non-functional requirement, `Design.md` §6 SEO strategy) — this is a major free acquisition channel for "what is product management"-style queries.
- Accessibility pass: WCAG AA (`PRD.md` §5) — contrast, keyboard nav, screen-reader labels.
- Closed beta with 100–200 real users, instrumented with PostHog (`Architecture.md` §1). Fix drop-off points in the funnel — **onboarding → Lesson 1 completion is the single most important metric to fix here.**

**Explicit exclusions:** no new features in this phase — this is a hardening and instrumentation phase only. If a beta user requests a new feature, log it for a post-launch phase; don't let it slip into Phase 4 scope.

**Definition of Done:**
- Lighthouse performance score ≥ 90 on lesson pages (`PRD.md` §5).
- WCAG AA basics verified (automated + at least one manual pass with a screen reader).
- Closed beta cohort's Day-1 activation and Day-7 retention numbers are known and any major funnel drop-off has been addressed (see `PRD.md` §9 for target ranges to compare against).
- PostHog is capturing the funnel end-to-end: signup → onboarding → Lesson 1 theory → quiz → dashboard return.

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

**Total to public launch: ~5–6 months** for deliberate, non-rushed solo-founder execution — this is a realistic estimate for the scope described, not padded, and should be recalibrated honestly (not compressed under pressure) if Phase 1 or Phase 4 reveal the timeline needs adjustment.

---

## Post-Launch Phases (directional — flesh out once Phase 5 data exists)

- **Phase 6 — Retention iteration:** use closed-beta and launch-week PostHog data to fix the biggest funnel drop-off, iterate on gamification balance (XP thresholds, streak-freeze cadence) using real behavioral data rather than guesses.
- **Phase 7 — Monetization exploration (only once free-core success is proven per `PRD.md` §10):** optional paid capstone review, job-search-adjacent premium features, or B2B/cohort licensing — in that order of fit, never before the core metrics in `PRD.md` §9 show real traction.
- **Phase 8+ — Scale infrastructure decisions:** revisit `Architecture.md` §8's scaling path only when free-tier ceilings are actually approached — not preemptively.

---

## Immediate Next Steps (do these first, this week, regardless of which phase is "current")

1. Decide 9 vs. 10 modules (`PRD.md` §11) — blocks the data model.
2. Approve the fixed-count content backlog and kick off metadata-bug fixes + any module expansion in parallel with Phase 0 engineering.
3. Commission or draft the Figma design system (`Design.md` §1–§2) so engineering isn't blocked waiting on visual direction.
4. Stand up the waitlist landing page (`PRD.md` §8, `Design.md` §6) — this can go live literally this week, independent of everything else, and starts compounding immediately.
5. Write the content parser (`Architecture.md` §4) as the first real engineering task — it de-risks the entire content pipeline before any UI is built.

---

## Milestone Checklist (quick-reference, tick off as completed)

- [ ] Module/lesson count finalized
- [ ] Waitlist landing page live
- [ ] Figma design system v1 complete
- [ ] Repo scaffolded per `Architecture.md` §3
- [ ] Content parser built and run against all available lessons
- [ ] Auth working (email + Google, LinkedIn optional at this stage)
- [ ] Lesson reading view + quiz flow functional (Phase 1 core loop)
- [ ] 10–20 real users complete the core loop
- [ ] XP, streaks, skill radar live (Phase 2)
- [ ] Capstones, badges, leaderboard, portfolio export live (Phase 3)
- [ ] SEO + accessibility pass complete, closed beta run (Phase 4)
- [ ] Public launch executed across all channels (Phase 5)

---

## Changelog

- v1.0 — Initial phased roadmap authored from the "PM Academy — 0→1 Roadmap & Project Plan" source document, with explicit scope/exclusion/definition-of-done added per phase for unambiguous execution.

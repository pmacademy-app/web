# PM Academy — 0→1 Roadmap & Project Plan

---

## 1. Product Vision & Positioning

**Vision statement:** *PM Academy is the free, complete, rigorous alternative to a paid Product Management certificate — 90 lessons deep enough to sit next to an IIM elective, delivered with the habit-forming mechanics of a language app.*

**The gap we're filling:** Today, someone learning PM for free chooses between two bad options — (a) fragmented free content (blog posts, random YouTube videos, Reddit threads) with no structure or progress tracking, or (b) a genuinely structured paid course ($200–$2,000: Reforge, Product School, CSPO certs). Duolingo-for-PM doesn't exist yet at real depth. That's the wedge: **structured, deep, free, and addictive.**

**Positioning line (pick one for marketing, keep the others as backups):**
- "The Duolingo of Product Management."
- "A full PM certificate's worth of rigor. Zero cost."
- "90 lessons. 9 modules. One skill: product judgment."

**Who it's for (be specific, not "anyone"):**
1. Primary: career switchers (engineers, designers, consultants, analysts) actively trying to break into PM roles within 6–12 months.
2. Secondary: early-career PMs (0–2 years) who got the title without the grounding, using it to fill gaps.
3. Tertiary: students/early professionals exploring PM as a possible path.

Design every UX and gamification decision around **Primary**, since they have the most urgency (job search deadline pressure) and will drive the most word-of-mouth if it works.

---

## 2. Core Product Principles (decide these once, refer back constantly)

1. **Depth over gimmick.** Gamification serves retention of *real* learning, never replaces it. No dopamine loop that lets someone "complete" a lesson without engaging the Theory or Quiz sections.
2. **Free means free — no dark patterns.** No fake "free trial," no paywalling lesson 11 onward. If you ever monetize (Section 9), it's on top of a fully free core, not a bait-and-switch. This is your single biggest differentiator vs. Reforge/Product School and your biggest word-of-mouth lever.
3. **Respect the learner's time.** Every lesson states an honest estimated time and the app should never feel like it's padding for engagement metrics.
4. **Portfolio, not just certificate.** The module-level applied assignments (see content doc, §4.3) should be exportable/shareable — a LinkedIn-postable PRD or case study is worth more to a learner than a badge.

---

## 3. Information Architecture

```
PM Academy
├── Home / Dashboard (progress ring, streak, next lesson, recent XP)
├── Curriculum
│   ├── Module 1–9 (locked/unlocked based on prerequisite graph)
│   │   └── Lesson 1–10 per module
│   │       ├── Theory reading view
│   │       ├── Interactive elements (mental model diagram, framework table)
│   │       ├── Quiz (15 Q, immediate feedback, LO-mapped)
│   │       ├── Flashcard review (spaced repetition, pulled into global deck)
│   │       └── Reflection Exercise (private journal, optional public/portfolio toggle)
│   └── Module Capstone / Applied Assignment (9 total)
├── Review Hub
│   ├── Spaced-repetition flashcard queue (global, cross-lesson, SM-2 algorithm)
│   ├── Missed-quiz-question re-test queue
│   └── Glossary search (cross-curriculum, deduped)
├── Progress
│   ├── Skill radar (map lessons → 6–8 competency clusters, e.g. "Discovery," "Strategy," "Execution," "Metrics," "Leadership," "Platform/Technical")
│   ├── Streak & XP history
│   └── Certificate / portfolio export
├── Leaderboard (opt-in, friends + global, weekly reset to avoid all-time-leader demotivation)
└── Profile & Settings
```

**Key IA decision:** lessons are the atomic unit, modules are the pacing unit, and a **competency skill radar** (not modules) is the thing shown most prominently on the dashboard — because "I'm 40% through Module 6" means less to a learner than "My Discovery skill is Advanced, my Strategy skill is Beginner." This reframes progress around competence, not completion, which is the actual promise of the product.

---

## 4. Gamification & Progress System (designed from scratch, not bolted on)

Gamification must map to genuine learning signals, not just clicks. Here's the full model:

### 4.1 XP model
| Action | XP | Rationale |
|---|---|---|
| Complete Theory read (min. dwell time + scroll-through, not just "mark done") | 10 | Rewards engagement, not skipping |
| Quiz — per correct answer | 5 | 15 Q × 5 = 75 XP ceiling per lesson |
| Quiz — first-attempt 100% bonus | +25 | Rewards genuine mastery, not guess-and-retry |
| Flashcard review session (spaced repetition, daily) | 2/card | Keeps retention loop alive between lessons |
| Reflection Exercise submitted | 15 | Only real qualitative signal in the loop |
| Module Capstone/Applied Assignment submitted | 150 | Big, meaningful milestone |
| Daily streak maintained | 5/day, scaling | Standard habit loop, capped to avoid burnout-driven grinding |

**Anti-gaming rule:** XP for Theory only counts with a minimum active-time threshold (prevents "mark as read and skip" abuse) — implement via scroll-depth + time-on-page heuristic, not a naive checkbox.

### 4.2 Levels & titles
Map cumulative XP to PM-flavored titles that also *mean something on a resume/LinkedIn*, not generic game levels:
`Associate PM Trainee → Junior PM → PM → Senior PM → Group PM → VP Product → Chief Product Officer (Level 9, on completing all 90 lessons + all 9 capstones)`
This dual-purpose naming (game level *and* career ladder) reinforces the product's core value prop every time a user levels up.

### 4.3 Streaks
- Daily streak counter, but with **1 "streak freeze" earned per week** of consistent study (not purchasable — this avoids the predatory "buy your streak back" pattern some apps use) — you're optimizing for genuine habit, not guilt-driven engagement.
- Weekly recap notification/email: "You studied 4/7 days, completed Lessons 23–25, your Discovery skill moved from Intermediate to Advanced."

### 4.4 Skill Radar (the real differentiator)
Tag every lesson with 1–2 of ~7 competency clusters (Discovery & Research, Strategy, Design & UX, Execution & Delivery, Metrics & Growth, Leadership & Communication, Platform/Technical/Specialized). Render as a radar/spider chart on the dashboard. This does two things competitors don't: (1) gives the learner language for their own gaps ("I need more Metrics practice") and (2) is genuinely shareable/impressive as a progress artifact for a job search — far more credible on LinkedIn than "Day 47 streak."

### 4.5 Badges — sparingly, tied to real milestones
Avoid badge bloat (a common gamification failure mode where 200 badges make each one worthless). Cap at ~20 meaningful badges tied to real learning events: first perfect quiz, first capstone submitted, module completed, 30-day streak, "Comeback" (resumed after a 2-week gap — rewards return, not just streak purity), full curriculum completion ("Chief Product Officer").

### 4.6 Leaderboard — opt-in and low-stakes
Global leaderboards demotivate 95% of users (they're never near the top). Default to a **friends/cohort leaderboard**, weekly-resetting, opt-in only, and frame it around consistency (days studied this week) rather than raw XP, which favors people with more free time over people learning effectively.

---

## 5. UX & Design System

### 5.1 Design direction
Given the positioning ("rigor of a b-school, habit of a game app"), the visual language should sit between **Duolingo's playfulness** and **Linear/Notion's seriousness** — not full cartoon-mascot territory (undermines the "IIM-caliber" credibility), not sterile-corporate either (kills the habit loop). Concretely:
- **Typography:** a serif or high-quality slab for lesson headings (signals "this is a real course," not a SaaS landing page), clean sans-serif for UI chrome and body text.
- **Color:** one confident primary brand color (avoid generic SaaS blue/purple gradient — pick something distinct, e.g., a deep amber/ochre or forest green that reads "academic" rather than "startup") + a full semantic system for correct/incorrect/streak/locked states.
- **Motion:** purposeful micro-interactions only (XP counter tick-up, streak flame pulse, skill radar animating on update) — no gratuitous confetti-everything; save celebration animations for genuinely big milestones (module complete, capstone submitted) so they retain meaning.
- **Iconography:** consistent line-icon set for the 7 skill clusters, reused everywhere (skill radar, lesson tags, filters) so users build pattern recognition fast.

### 5.2 Core screens to design first (in build order)
1. Lesson reading view (the single most-used screen — get this right before anything else)
2. Quiz flow (question → immediate feedback → explanation → next)
3. Dashboard (progress ring, skill radar, streak, "continue where you left off")
4. Module/curriculum map (visual, not just a list — a real "map" metaphor works well for 9 modules, like a game world map)
5. Flashcard review session
6. Onboarding (placement-style intro quiz to set an initial skill radar baseline + goal-setting: "why are you here" → tailors notification cadence)

### 5.3 Accessibility & i18n groundwork
Since this targets a broad, cost-sensitive, global audience (a big share of PM aspirants are outside the US, including likely a significant India/APAC audience given the IIM comparison) — build with i18n-ready string externalization from day one even if you launch English-only, and hit WCAG AA basics (contrast, keyboard nav, screen-reader labels) since retrofitting accessibility later is expensive.

---

## 6. Technical Architecture

### 6.1 Recommended stack
Optimized for: solo/small-team buildable, free-tier-friendly (this is a free product, keep infra cost near-zero at launch, targeting ~5,000 users), static-first architecture (Markdown as the source of truth, JSON generated at build time, no runtime markdown parsing).

| Layer | Choice | Why |
|---|---|---|
| Frontend | Next.js (App Router) + TypeScript | SSR for SEO on lesson pages (huge for organic discovery — "what is product management" should rank), huge ecosystem |
| Styling | Tailwind CSS + shadcn/ui | Fast, consistent design system, matches your existing design-system constraints |
| Content pipeline | Markdown → JSON at build time | Markdown files are the single source of truth. A build-time parser validates, converts to structured JSON, and generates a search index. The browser consumes pre-generated static JSON. No runtime markdown parsing. No content in the database |
| Backend/API | Next.js API routes (for user-state mutations only) | Keep it simple at 0→1; don't over-engineer microservices for a 90-lesson MVP. API routes handle progress updates, XP events, and other user-state writes only |
| Database | PostgreSQL via Supabase | Stores **user state only**: auth, profiles, progress, XP events, quiz attempts, bookmarks, streaks, reflections, SRS state. **Never stores lesson content.** Supabase bundles auth + row-level security |
| Auth | Supabase Auth | Email + Password and Google Login. Don't build auth yourself |
| Hosting | Vercel (frontend + API routes + static JSON) | Generous free tier, automatic scaling, zero DevOps overhead, native Next.js integration. Vercel Edge Network provides built-in CDN for static asset delivery |
| Search | Client-side via build-time `search-index.json` | No server-side search. Fast, free, zero operational cost |
| Spaced repetition | Implement SM-2 algorithm (open, well-documented, same core algorithm Anki uses) in-house | Keeps you independent, it's a genuinely simple algorithm (~100 lines) |
| Analytics | Google Analytics | Page views, user flow, conversion tracking — sufficient for MVP-scale product analytics |
| Email | Resend, connected to Supabase via SMTP | Email verification, password reset, welcome emails, waitlist confirmation, streak reminders, weekly recaps |
| CI/CD | GitHub + GitHub Actions → Vercel | Automated pipeline: Markdown validation → JSON generation → search index → Next.js build → Vercel deployment |

### 6.2 Data model (core tables, not exhaustive)
The database stores **user state only** — authentication, profiles, progress, and gamification. Lesson content, quiz questions, and flashcards are never stored in the database; they are served as pre-generated static JSON.

```
users(id, email, name, auth_provider, created_at, current_streak, longest_streak, total_xp, level)
user_lesson_progress(user_id, lesson_slug, status[not_started|in_progress|completed], theory_read_at, quiz_score, quiz_attempts, xp_earned, completed_at)
quiz_attempts(id, user_id, lesson_slug, question_id, selected_option, is_correct, attempted_at)
user_flashcard_srs(user_id, flashcard_id, ease_factor, interval_days, next_review_at, review_count)
xp_events(id, user_id, source_type, source_id, xp_amount, created_at)
reflections(id, user_id, lesson_slug, content, is_public, created_at)
bookmarks(id, user_id, lesson_slug, created_at)
capstone_submissions(id, user_id, module_slug, content, status, submitted_at)
badges(id, key, name, description, icon)
user_badges(user_id, badge_id, earned_at)
waitlist(id, name, email, career_position, created_at)
```

User-state tables reference content by **slug** (a stable string identifier from the static JSON), not by foreign-key UUID. This decouples user state from content.

### 6.3 Content pipeline (Markdown → static JSON — build-time only)

**Content flow:**
```
Markdown files (/content)
       ↓
  Parser (scripts/parse-content.ts)
       ↓
  Validation (scripts/validate-content.ts)
       ↓
  JSON Generation
       ↓
  Search Index Generation (search-index.json)
       ↓
  Static Assets (public/content/)
       ↓
  Vercel Deployment (served via CDN)
```

1. A parser script walks each Markdown lesson file, extracts the fixed sections via the header structure confirmed consistent in the content audit, and outputs structured JSON: `{ meta, theory, mistakes, mental_model, case_study, framework, interview_perspective, summary, key_takeaways, cheat_sheet, glossary[], resources[], flashcards[], reflection, quiz[], connections[] }`.
2. This JSON becomes static assets served to the browser — **not** seed data for database tables. The browser consumes pre-generated JSON directly. No runtime markdown parsing.
3. A search index generator produces `search-index.json` for client-side search. No server-side search infrastructure.
4. The pipeline is automated via GitHub Actions: push to GitHub → validate Markdown → generate JSON → generate search index → build Next.js → deploy to Vercel.
5. Build this pipeline as the **first real engineering task** — it de-risks the entire content pipeline before any UI is built.

### 6.4 Why not a no-code tool / off-the-shelf LMS
Considered and rejected: Kajabi/Teachable/Thinkific are built for *paid* cohort courses, not free gamified self-serve learning, and none give you real control over a custom XP/streak/skill-radar system, which is your core differentiator. An open-source LMS (Moodle) is the opposite problem — heavy, dated UX, wrong aesthetic entirely for a "Duolingo of PM" positioning. Custom-built on the stack above is the right call given the gamification mechanics *are* the product.

---

## 7. Build Roadmap (0→1, phased)

Assume a small team (1 PM/founder — you — + 1–2 engineers + 1 designer, or a scrappier solo-plus-AI-tools build). Timeline in **weeks from kickoff**, phases can overlap where noted.

### Phase 0 — Foundation (Weeks 1–3)
- Finalize content decisions from the audit doc (9 vs. 10 modules, bug fixes, Module 9 expansion kicked off in parallel).
- Design system in Figma: typography, color, component library (buttons, cards, progress rings, quiz UI, search input, auth forms, waitlist form).
- Technical scaffolding: repo, Next.js + Supabase setup, CI/CD on Vercel.
- **Content parser and JSON generator** built and run against all lessons → static JSON output.
- **Search index generation** (`search-index.json`) for client-side search.
- **Authentication**: Email + Password and Google Login via Supabase Auth.
- **Waitlist page** live, collecting name, email, and current career position.
- **Google Analytics** integrated for page views and user flow.
- **Resend SMTP** connected to Supabase for transactional emails.
- **Deployment pipeline**: GitHub Actions → Markdown validation → JSON generation → Next.js build → Vercel deployment.

### Phase 1 — Core Learning Loop MVP (Weeks 4–8)
- Lesson reading view (renders pre-generated static JSON content with all sections styled).
- Quiz flow with instant feedback + explanations (quiz data from static JSON).
- Basic progress tracking (lesson complete/incomplete, module unlock logic). Progress stored in Supabase.
- Auth + user accounts.
- Client-side search using the pre-built `search-index.json`.
- **Goal at end of Phase 1: a real user can sign up, read Lesson 1, take the quiz, and see Lesson 2 unlock.** This is your first genuinely testable version — get 10–20 real career-switcher users on it before building anything else.

### Phase 2 — Gamification Layer (Weeks 9–13)
- XP system + levels/titles.
- Streaks (with freeze mechanic).
- Skill radar (competency tagging + visualization).
- Dashboard with progress ring + "continue learning."
- Flashcard spaced-repetition review hub.

### Phase 3 — Depth & Retention Features (Weeks 14–18)
- Module capstone/applied assignment submission flow.
- Badges.
- Opt-in friends leaderboard.
- Email re-engagement (streak reminders, weekly recap).
- Portfolio/certificate export (shareable PDF or public profile page — huge for organic LinkedIn-driven growth).

### Phase 4 — Polish, SEO, Beta Hardening (Weeks 19–22)
- Full content audit fixes applied (see companion doc) — run this in parallel starting Week 1, target completion by here.
- SSR/SEO pass on lesson pages (public-facing lesson previews indexed by Google — huge free acquisition channel for a "what is product management" style query).
- Accessibility pass (WCAG AA).
- Closed beta with 100–200 real users, instrumented with Google Analytics, fix drop-off points in the funnel (onboarding → Lesson 1 completion is the metric that matters most).

### Phase 5 — Public Launch (Week 23+)
- See §8 below for launch strategy specifics.

**Total to public launch: ~5–6 months** for a small team building deliberately (not rushed) — this is realistic for the scope described, not padded.

---

## 8. Launch Strategy

### 8.1 Pre-launch (weeks before public launch)
- Build a waitlist landing page immediately (Week 1, independent of the build) — collects **name, email, and current career position** only. "90 lessons. Free forever. Get notified." Costs nothing, starts compounding immediately. Confirmation email via Resend SMTP.
- Publish 3–5 individual lessons as free public blog-style pages *before* full launch (SEO head start + credibility proof — "here's actual sample content" beats any landing page copy).
- Recruit the closed beta cohort (Phase 4) specifically from career-switcher communities (r/ProductManagement, Product School alumni Slack/Discord communities, PM-focused LinkedIn groups) — these are people who will give sharp, honest feedback and become your first advocates if the product delivers.

### 8.2 Launch channels (free-product-appropriate, no paid-ad budget assumed)
1. **Product Hunt launch** — free, PM-adjacent audience, well-suited to a genuinely free/complete product story.
2. **Reddit** (r/ProductManagement, r/cscareerquestions for career-switchers) — but only with a "we built something and want feedback" framing, not a hard sell; this community punishes obvious marketing.
3. **LinkedIn** — this audience lives here. Founder-voice posts about *why* you built it (the free-vs-paid gap), plus the shareable skill-radar/certificate export feature doing organic distribution once users start posting their own progress.
4. **SEO (compounding, slow-start channel)** — the 90 lesson topics map almost 1:1 to real search queries ("what is a PRD," "jobs to be done framework," "product-led growth explained"). Public lesson pages targeting these terms, done properly from Phase 4, will be your largest channel by month 6–12 even though it contributes near-zero at launch week.
5. **Partnerships** — reach out to PM bootcamps/communities (Product School, Mind the Product, ADPList mentors) not as competitors but as a free-resource-to-recommend; many PM community leaders actively want a good free option to point beginners to.

### 8.3 Launch-week metrics to actually watch
Don't over-index on signups. Watch: **Day-1 lesson completion rate** (did they finish Lesson 1?), **Day-7 retention** (did they come back?), and **quiz completion rate** (are they engaging with assessment, not just skimming). These predict long-term success far better than raw signups.

---

## 9. Monetization (optional, only after the free core is proven)

You said "free," so keep the core 90 lessons free forever — that's the trust foundation and the differentiator. If/when you want sustainability beyond your own funding, the non-compromising options, in order of fit:
1. **Optional paid capstone review** — human (or expert-reviewed AI) feedback on the 9 module capstone submissions, for people who want real feedback vs. peer/self-review. This monetizes depth, not access.
2. **Job-search-adjacent premium** — resume/portfolio review, mock PM interview practice, curated job board — sits *next to* the free curriculum rather than gating it.
3. **B2B/cohort licensing** — bootcamps or university career centers license a "cohort mode" (progress dashboards for instructors) built on top of the same free content.
Avoid: ads (undermines the "b-school caliber" positioning), gating any of the 90 lessons (breaks your core promise), pay-to-skip-streak-freeze or other gamification-monetization patterns (predatory, inconsistent with §4.3's anti-pattern stance).

---

## 10. Success Metrics (first 6 months post-launch)

| Metric | Target (directional, calibrate after beta) |
|---|---|
| Day-1 activation (complete Lesson 1) | >60% of signups |
| Day-7 retention | >30% |
| Module 1 completion rate | >40% of activated users |
| Full curriculum (all 90) completion rate | 5–10% (realistic for free self-serve — Duolingo's own completion rates are in this range) |
| Organic (non-paid) traffic share by month 6 | >50%, driven by SEO + LinkedIn shares |
| NPS from completers | >50 |

---

## 11. Immediate Next Steps (this week)

1. Decide 9 vs. 10 modules (audit doc §3.3) — blocks the content schema.
2. Approve the fixed-count content backlog (audit doc §6) and kick off the metadata-bug fixes + Module 9 expansion in parallel with build Phase 0.
3. Commission or draft the Figma design system (§5) so engineering isn't blocked waiting on visual direction.
4. Stand up the waitlist landing page (§8.1) collecting name, email, and career position — this can go live literally this week, independent of everything else, and starts compounding immediately.
5. Build the content parser and JSON generator (§6.3) as the first real engineering task — it de-risks the entire content pipeline before any UI is built.
6. Set up the deployment pipeline: GitHub Actions → Markdown validation → JSON generation → Vercel deployment.

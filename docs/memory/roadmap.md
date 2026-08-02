# PM Academy — Roadmap Memory

> **Purpose:** A living record of phase-by-phase implementation progress, the current state of each development phase, remaining work, and future direction.  
> **Part of:** the [`docs/memory/`](./) system. See [`docs/INDEX.md`](../INDEX.md) for the full documentation map.  
> **Authoritative source for phase definitions and DOD:** [`docs/Phases.md`](../Phases.md) — this file tracks *actual progress*; `Phases.md` defines *what done means*.

---

## Current Status (as of 2026-08-02)

```
Phase 0 — Foundation          ████████████████  Complete ✅
Phase 1.1–1.4 (v2 Migration)  ████████████████  Complete ✅
Phase 1.5 (Stabilization)     ████████████░░░░  In Progress — Sprint 2 Complete (Learning Flow)
Phase 2 — Gamification Layer  ████████░░░░░░░░  In Progress — dashboard and skill radar wired
Phase 3 — Depth & Retention   ░░░░░░░░░░░░░░░░  Scaffolded / Not Started
Phase 4 — Polish & SEO        ░░░░░░░░░░░░░░░░  Not Started
Phase 5 — Public Launch       ░░░░░░░░░░░░░░░░  Not Started
```

---

## Phase 0 — Foundation ✅

**Status:** Complete.

### Completed Items
- [x] 9 modules × 10 lessons = 90 lessons structure finalized
- [x] Waitlist landing page live and capturing signups (name, email, career position)
- [x] Supabase Auth: Email + Password and Google Login
- [x] Resend SMTP: transactional email (verification, password reset, waitlist confirmation)
- [x] GitHub Actions CI/CD pipeline: Markdown validation → JSON generation → Vercel deployment
- [x] Google Analytics: GA4 integrated for page views and funnel tracking
- [x] v1 content pipeline: `parse-content.ts`, `validate-content.ts`, `generate-search-index.ts`
- [x] 90 lessons validated, 1350 quiz questions, 770 search index items
- [x] v2 content pipeline compiler (remark/AST, stable `lessonId`, block tree, incremental builds) — compiled to `content/dist/`

---

## Phase 1 — Core Learning Loop MVP ✅

**Status:** Complete. The learning loop is fully migrated to the v2 architecture.

### Completed Items
- [x] Lesson reading view: renders static JSON content, `MarkdownRenderer` (v1) and `BlockTreeRenderer` (v2)
- [x] Quiz flow: 15-question interactive UI, keyboard navigation, immediate feedback, scoring
- [x] Progress tracking: `user_lesson_progress` table, sequential unlock via `lessons-completion-service.ts`
- [x] Auth + onboarding: goal-setting question, profile sync
- [x] Service layer isolation (Sprint 3): `xp-service.ts`, `lessons-completion-service.ts`, `flashcards-service.ts`
- [x] Performance optimizations (Sprint 3.5): async file reads, Supabase singleton, Mermaid strict mode fix
- [x] **Database migration:** Rename `lesson_slug` → `lesson_id` in all user-state tables. Alter `user_flashcard_srs` to add `lesson_id` to composite PK.
- [x] **v2 content pipeline:** remark/AST compiler per `content-pipeline.md` outputting to `content/dist/`.
- [x] **v2 routing:** Create `app/academy/layout.tsx` (curriculum shell) and `app/academy/l/[lessonId]/page.tsx` (stable ID-based lesson route).
- [x] **v2 renderer:** Implement `BlockTreeRenderer` + plugin component registry per `rendering-pipeline.md §3–§4`.
- [x] **Fix sidebar routing:** The "Curriculum" link in the authenticated sidebar resolves to `/academy` (M-009 fix).

---

## Phase 2 — Gamification Layer (In Progress ⚠️)

**Status:** Logic modules built and tested. Dashboard and UI integration pending.

### Completed Items
- [x] XP ledger schema: `xp_events` table, SQL triggers recompute `users.total_xp` and `users.level`
- [x] XP service: `lib/xp-service.ts` writes events correctly
- [x] XP constants & level titles: `lib/xp.ts`, `getLevelTitle()` consolidated
- [x] Streak calculation engine: `lib/streaks.ts` (pure, timezone-aware)
- [x] Streak DB operations: `lib/streaks-db.ts`
- [x] Skill radar formula: `lib/skillRadar.ts`, 7-cluster competency model defined
- [x] Flashcard SRS: `lib/srs.ts` (pure SM-2) + `lib/flashcards-service.ts` (DB orchestration)

### Remaining for Phase 2 Completion
- [ ] **Flashcard Review Hub:** Build the review queue screen at `/review`. Currently a stub. Tie it to `flashcards-service.ts` and the `user_flashcard_srs` table.
- [ ] **Placement quiz:** Add the onboarding assessment flow that seeds the skill radar. See `PRD.md §4.1` and `Phases.md Phase 2`.

### Completed Phase 2 Items (Integrated in Phase 1.5)
- [x] **Dashboard integration:** Wired `dashboard/page.tsx` to fetch real XP, level, streak, and completed lesson counts from Supabase.
- [x] **Skill radar UI:** Connected the radar chart component to `lib/skillRadar.ts` scores computed from real progress data using a robust module-to-competency mapping.

### Definition of Done (from `Phases.md`)
> A returning user sees accurate XP, level/title, streak, and a skill radar that updates immediately after each lesson/quiz. Flashcard review sessions correctly schedule next-review dates per SM-2.

---

## Phase 3 — Depth & Retention (Not Started / Scaffolded ❌)

**Status:** DB schema supports the features. UI pages are placeholder stubs.

### Scaffolded (DB ready, UI pending)
- Capstone submissions: `capstone_submissions` table in schema
- Reflections: `reflections` table with `is_public` flag for portfolio exposure
- Public portfolio page: `app/(portfolio)/p/[username]/page.tsx` exists as a stub

### Remaining Work
- [ ] Module capstone submission form and display
- [ ] Badge system: ~20 badges tied to real learning milestones
- [ ] Opt-in cohort leaderboard: weekly-reset, consistency-ranked
- [ ] Email re-engagement: streak reminder and weekly recap emails via Resend
- [ ] Portfolio/certificate export: shareable public profile page for recruiters

---

## Phase 4 — Polish, SEO, Beta Hardening (Not Started ❌)

### Planned Work
- [ ] Full content-audit fixes applied
- [ ] Client-side search UI: `SearchOverlay` with `Cmd/Ctrl+K` trigger using the pre-generated FlexSearch index
- [ ] SSR/SEO pass on lesson pages: public lesson previews, structured data, sitemap optimization
- [ ] Accessibility pass: WCAG AA automated scan + manual screen reader pass
- [ ] Performance budget verification: Lighthouse scores per `Design.md §4`
- [ ] Closed beta: 100–200 real users, funnel analytics, drop-off fixes

---

## Phase 5 — Public Launch (Not Started ❌)

### Planned Work
- [ ] Product Hunt launch preparation
- [ ] Reddit engagement (r/ProductManagement, r/cscareerquestions)
- [ ] LinkedIn founder-voice content
- [ ] Partnership outreach (PM bootcamps, ADPList mentors)
- [ ] Launch-week monitoring: Day-1 completion rate, Day-7 retention, quiz engagement

**Success Criteria (from `Phases.md`):**
- Waitlist → signup conversion: >15% in first 7 days
- Day-1 lesson completion: >60%
- Product Hunt: Top 10 Products of the Day
- Zero P0 bugs in core reading → quiz → unlock loop

---

## Recommended Execution Sequence (Pre-Phase 2 Migration)

Before implementing any Phase 2 gamification UI, the v2 architecture migration should be completed in this sequence to avoid compounding tech debt:

```
Step 1  →  Rebuild Content Pipeline v2
           content-pipeline.md spec → remark AST compiler → lessonId registry → content/dist/

Step 2  →  Database Schema Migration
           lesson_slug → lesson_id (roll-forward migration, no data loss)
           Add lesson_id to user_flashcard_srs composite PK

Step 3  →  Build /academy/** Route Structure
           app/academy/layout.tsx (curriculum shell with sidebar)
           app/academy/l/[lessonId]/page.tsx (stable ID-based lesson route)
           Fix sidebar "Curriculum" link to /academy

Step 4  →  Port Renderers to Block Component Registry
           BlockTreeRenderer + renderer/registry.ts
           Lazy-loaded block components (QuizBlock, FlashcardDeck, MermaidBlock, etc.)

Step 5  →  Reconnect Service Layer
           Update lessons-db.ts, streaks-db.ts, lessons-completion-service.ts
           to use lesson_id not lesson_slug
           Verify reading → quiz → unlock loop end-to-end

Step 6  →  Phase 2 Gamification UI Integration
           Wire dashboard, skill radar, SRS review hub to real data
```

---

## Post-Launch Phases (Directional)

- **Phase 6 — Retention iteration:** Fix funnel drop-offs using GA4 behavioral data. Tune XP thresholds and streak-freeze cadence with real usage data.
- **Phase 7 — Monetization exploration:** Only after free-core success metrics (`PRD.md §9`) are met. Options: paid capstone review, job-search premium features, B2B/cohort licensing — in that order.
- **Phase 8+ — Infrastructure scaling:** Revisit `Architecture.md §10` scaling path only when free-tier ceilings are actually approached. Not preemptively.

---

## Milestone Checklist

### Phase 0
- [x] Module/lesson count finalized (9 × 10 = 90)
- [x] Waitlist landing page live
- [x] Repo scaffolded per `Architecture.md §3`
- [x] v1 content pipeline built and run against all lessons
- [x] Deployment pipeline automated (GitHub Actions → Vercel)
- [x] Auth working (Email + Password, Google Login)
- [x] Google Analytics tracking page views
- [x] Resend SMTP sending transactional emails

### Phase 1
- [x] Lesson reading view + quiz flow functional
- [x] Service layer isolated (XP, completion, flashcard services)
- [ ] 10–20 real users complete the core loop (in progress)
- [ ] v2 content pipeline implemented
- [ ] `lesson_slug` → `lesson_id` migration applied
- [ ] `/academy/` routing structure built

### Phase 2
- [ ] Dashboard wired to real user data
- [ ] Skill radar scoring formula settled and documented
- [ ] Skill radar UI connected to real competency scores
- [ ] Flashcard Review Hub built and functional
- [ ] XP, streaks, skill radar verified with a real user cohort
- [ ] Placement quiz live, seeding skill radar

### Phase 3–5
- [ ] Capstones, badges, leaderboard, portfolio export live
- [ ] Search index UI live (`Cmd+K`)
- [ ] Performance budget verified (Lighthouse)
- [ ] Accessibility budget verified (WCAG AA)
- [ ] Closed beta run (100–200 users)
- [ ] Public launch executed

---

## Changelog

- v1.0 (2026-08-01) — Created from `Phases.md`, the project audit report, and `MEMORY.md`. Adds current phase progress tracking, known debt items, and the recommended v2 migration execution sequence.
- v1.5 (2026-08-02) — Phase 1.5 Sprint 1 Runtime & Navigation Stabilization complete. Fixed dashboard CTA navigation/completed count queries, resolved blocks typecast compiler issue, paused theory timer outside of the theory tab, and added auth redirects to marketing curriculum and public previews. All production builds compile cleanly.
- v1.6 (2026-08-02) — Phase 1.5 Sprint 2 Learning Flow Stabilization complete. Wired flashcard reviews to API, implemented Previous/Next navigation footer links, verified reflections load/save correctly, and integrated real competency skill radar scores on the dashboard.

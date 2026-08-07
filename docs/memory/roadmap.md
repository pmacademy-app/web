# PM Academy — Roadmap Memory

> **Purpose:** A living record of phase-by-phase implementation progress, the current state of each development phase, remaining work, and future direction.  
> **Part of:** the [`docs/memory/`](./) system. See [`docs/INDEX.md`](../INDEX.md) for the full documentation map.  
> **Authoritative source for phase definitions and DOD:** [`docs/Phases.md`](../product/Phases.md) — this file tracks *actual progress*; `Phases.md` defines *what done means*.

---

## Current Status (as of 2026-08-06)

```
Phase 0 — Foundation          ████████████████████████████████  Complete ✅
Phase 1 (Core MVP & v2)       ████████████████████████████████  Complete ✅ — v1.0.0-foundation Release
Phase 2 — Gamification Layer  ████████████████████████████████  Complete ✅ — v0.2.0-phase2-complete Release
Phase 3 — Depth & Retention   ████████████████████████████████  Complete ✅ — v1.0.0-rc1 Release Candidate
Phase 4 — Polish & SEO        ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  Not Started
Phase 5 — Public Launch       ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  Not Started
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
- [x] **v2 routing:** Create `app/academy/layout.tsx` (curriculum shell) and `app/academy/[moduleSlug]/[lessonId]/page.tsx` (dynamic canonical route) with `l/[lessonId]` redirect fallbacks.
- [x] **v2 renderer:** Implement `BlockTreeRenderer` + plugin component registry per `rendering-pipeline.md §3–§4`.
- [x] **Fix sidebar routing:** The "Curriculum" link in the authenticated sidebar resolves to `/academy` (M-009 fix).
- [x] **Phase 1.6 Production Polish:** Custom email templates, email verification success page, topbar breadcrumbs context overrides, CI workflow consolidation, and resolved Interview Perspective parser constraints.

---

## Phase 2 — Gamification Layer ✅

**Status:** Complete (`v0.2.0-phase2-complete`). All 5 Sprints fully built, tested, integrated, and verified.

### Completed Items
- [x] **Sprint 1 (XP & Level Engine):** `lib/xp.ts`, `lib/xp-service.ts`, append-only `xp_events`, anti-gaming read checks, 15/15 unit tests passing.
- [x] **Sprint 2 (Streak Engine):** `lib/streaks.ts`, `lib/streaks-db.ts`, timezone-aware calculation, earned freeze recovery, 16/16 unit tests passing.
- [x] **Sprint 3 (Skill Radar Engine):** `lib/skillRadar.ts`, continuous 0–100 competency scoring model, 7-cluster curriculum mapping, 11/11 unit tests passing.
- [x] **Sprint 4 (Dashboard 2.0):** `app/(app)/dashboard/page.tsx`, `components/dashboard/` suite (ContinueLearning, SkillRadar, ProgressRing, Level, Streak, RecentActivity), visual hero integration.
- [x] **Sprint 5 (Flashcard Review Hub):** `lib/srs.ts`, `lib/flashcards-service.ts`, `app/api/review/queue/route.ts`, `app/(app)/review/page.tsx`, `components/review/` suite (Flashcard 3D flip, QualitySelector 0–5, ReviewProgress, ReviewStats, EmptyState, ReviewComplete), 10/10 unit tests passing.

### Definition of Done (from `Phases.md`)
> A returning user sees accurate XP, level/title, streak, and a skill radar that updates immediately after each lesson/quiz. Flashcard review sessions correctly schedule next-review dates per SM-2. ✅ VERIFIED.

---

## Phase 3 — Depth & Retention ✅

**Status:** Complete (`v1.0.0-rc1` Release Candidate). All Phase 3 sprints shipped, tested, and verified.

### Completed Sprints
- [x] **Sprint 1 (Capstone Workspace):** `/capstones` workspace, per-module submission + draft APIs, admin oversight.
- [x] **Sprint 2 (Public Portfolio):** `/p/[username]` shareable page — public skill radar, reflections, capstones, achievement badges.
- [x] **Sprint 3 (Certificates & Verification):** `/verify/[certificateId]`, schema.org EducationalOccupationalCredential JSON-LD, QR verification, PDF export.
- [x] **Sprint 4 (Badge & Achievement System):** `/badges` gallery, badge rule evaluations tied to real learning milestones.
- [x] **Sprint 5 (Friends & Cohort Leaderboard):** `/leaderboard`, weekly-reset consistency ranking, friends/cohort APIs.
- [x] **Stabilization Sprint (Priority 1+2+3):** empty-section render guards, module-completion detection (global ordering), Continue Learning flow, portfolio settings 401, certificate discoverability, breadcrumb/metadata global ordering.
- [x] **Sprint 6.1–6.3 (Notification Platform):** typed event system, email engine + queue delivery, in-app notification center + preferences (`apps/web/lib/notifications/`, `apps/web/emails/`, `/api/cron/`).
- [x] **Sprint 6.4 (Admin Console & Dev Tools):** `/admin` RBAC (ADMIN_EMAILS + `users.is_admin`, proxy middleware guard), user ops, notification/email queue tooling, dev certificate tools.
- [x] **Sprint 6.5 (Release Candidate Audit):** `v1.0.0-rc1` production-readiness audit complete.
- [x] **Sprint 7.1 (Global Branding & Documentation):** `lib/brand.ts` + `BrandLogo` + static brand assets (`public/brand/`), full rebrand pass (layouts, metadata, emails, certificates, admin), doc-sync sweep. Build-time Mermaid→SVG stage deferred — see `KNOWN_ISSUES.md §2`.

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
- [x] 10–20 real users complete the core loop (beta testing)
- [x] v2 content pipeline implemented
- [x] `lesson_slug` -> `lesson_id` migration applied
- [x] `/academy/` routing structure built

### Phase 2
- [x] Dashboard wired to real user data
- [x] Skill radar scoring formula settled and documented
- [x] Skill radar UI connected to real competency scores
- [x] Flashcard Review Hub built and functional
- [x] XP, streaks, skill radar verified with 100% test suite pass rate

### Phase 3–5
- [ ] Capstones, badges, leaderboard, portfolio export live
- [ ] Search index UI live (`Cmd+K`)
- [ ] Performance budget verified (Lighthouse)
- [ ] Accessibility budget verified (WCAG AA)
- [ ] Closed beta run (100–200 users)
- [ ] Public launch executed

---

## Changelog

- v2.0 (2026-08-06) — Phase 3 marked **Complete** (`v1.0.0-rc1`), mirroring `CURRENT_STATUS.md`. Added Sprint 6.x + 7.1 completion entries and replaced the stale "scaffolded / not started" Phase 3 section with the shipped sprint list.
- v1.0 (2026-08-01) — Created from `Phases.md`, the project audit report, and `MEMORY.md`. Adds current phase progress tracking, known debt items, and the recommended v2 migration execution sequence.
- v1.5 (2026-08-02) — Phase 1.5 Sprint 1 Runtime & Navigation Stabilization complete. Fixed dashboard CTA navigation/completed count queries, resolved blocks typecast compiler issue, paused theory timer outside of the theory tab, and added auth redirects to marketing curriculum and public previews. All production builds compile cleanly.
- v1.6 (2026-08-02) — Phase 1.5 Sprint 2 Learning Flow Stabilization complete. Wired flashcard reviews to API, implemented Previous/Next navigation footer links, verified reflections load/save correctly, and integrated real competency skill radar scores on the dashboard.
- v1.7 (2026-08-02) — Phase 1.5 Sprint 3 Content Experience & Curriculum Rendering complete. Enhanced MarkdownRenderer styles using Tailwind prose and marked custom renderers, rewrote DefaultMarkdown to output native HTML tables and lists, built customized visual designs for all SectionBlock types (mistakes, objectives, cheat sheets, resources, real-world, interview, case study, framework, mental model, company example), and rebuilt the `/academy` curriculum landing page to display expandable module-grouped lesson lists. All typescript validation checks and compiler tests passed.
- v1.8 (2026-08-02) — Phase 1.5 Curriculum Integrity & Content Consistency Audit complete. Resolved module-splitting bugs (17 modules down to exactly 9 modules, 10 lessons each) by mapping to canonical slugs via module number parsing; fixed regex matching bugs in `extractors.ts` to fully parse/render Interview and Real World Perspectives; and added a second referential validation pass in `compile.ts` to identify and resolve all glossary consistency warnings across 12 source files, achieving 0 compiler warnings. All production builds, type checks, and tests pass.
- v1.0.0-foundation (2026-08-02) — Phase 1 Foundation Complete. Resolved all critical Edge middleware route guarding bugs, moved quiz correctness checking and XP ledger calculations entirely to the server, audited XP ledger to prevent duplicate quiz/read/reflection XP, implemented daily flashcard review XP deduplication in user timezone, and disabled the Google OAuth placeholder button with a "Coming Soon" badge. The codebase is clean, builds successfully, and is ready for Phase 2.
- v1.0.1-foundation-polish (2026-08-03) — Authentication flow callback unified. All templates synchronized to avoid route group references, README.md rewritten to serve as developer handbook, and index docs updated. Codebase verified build-clean and lint-clean. Ready for Phase 2.

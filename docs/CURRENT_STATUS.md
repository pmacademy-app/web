# PM Academy — Current Status

> **Live Status & Active Focus.** This document represents the current, real-time status of the repository. It is updated at the end of every implementation session to serve as the source of truth for current focus, active bugs, and immediate tasks.
> **Documentation entry point:** See [`docs/INDEX.md`](./INDEX.md) for the full doc map.

---

## 1. Repository Metadata

- **Current Branch:** `main`
- **Current Version:** `0.1.0` (defined in [`apps/web/package.json`](../apps/web/package.json))
- **Last Successful Build:** 2026-08-02 (Next.js 16.2.12 Turbopack production build — clean, 0 errors, 23 routes, 90 lessons compiled)
- **Current Implementation Phase:** Phase 1 (1.1-1.4) ✅ Complete & Signed Off

---

## 2. Project Stage & Milestones

For phase definitions, see [`docs/Phases.md`](./Phases.md) and [`docs/memory/roadmap.md`](./memory/roadmap.md).

- **Phase 1.1 Content Pipeline Foundation:** ✅ Complete
- **Phase 1.2 Renderer Foundation:** ✅ Complete
- **Phase 1.3 Migration & Integration Foundation:** ✅ Complete
- **Phase 1.4 Legacy Cleanup & Finalization:** ✅ Complete
- **Current Focus:** Phase 2 Gamification UI wiring (dashboard, skill radar, SRS review hub).

---

## 3. What's Next: Next Planned Tasks

Following the recommended sequence in [`docs/memory/roadmap.md`](./memory/roadmap.md#L133-L161):

1. **[Phase 2] Skill Radar:** Wire `lib/skillRadar.ts` to real `user_lesson_progress` data. Resolve D-009 scoring formula decision. Replace dashboard `0%` placeholders.
2. **[Phase 2] XP & Level UI:** Wire `lib/xp-service.ts` to dashboard stats display. Show real total_xp, level, and recent XP events.
3. **[Phase 2] Streak Tracker UI:** Wire `lib/streaks.ts` to dashboard streak indicator. Current streak, longest streak, freeze count.
4. **[Phase 2] SRS Review Hub:** Build the spaced repetition review queue UI at `/review`. Uses `lib/flashcards-service.ts` + `user_flashcard_srs` table.

---

## 4. Active Issues, Blockers & Bugs

### Known Blockers
- **Radar Chart Scoring Formula (D-009):** The skill radar scoring formula is unresolved in [`docs/memory/decisions.md`](./memory/decisions.md#L182-L195). We must lock this formula (continuous `0-100` vs. discrete bands) before connecting real data to the dashboard.

### Known Bugs & Debt (Post Phase 1.4)
- **2 ESLint Warnings (non-blocking):** `_prevLessonId` unused in `lesson-content.tsx` and `_rating` unused in `FlashcardDeckBlock.tsx`. These are correct underscore-prefixed suppressions and do not block the build.
- **Sidebar `isActive` Detection:** The `/academy` isActive check uses `pathname.startsWith('/academy')` — this will correctly highlight Curriculum for both `/academy` and `/academy/l/*`.

### Resolved This Session (Phase 1.4)
- ✅ **M-009 Sidebar Breakage:** Fixed — sidebar "Curriculum" link now points to `/academy`.
- ✅ **M-001 DB Column Name:** Fixed — DB migration `20260802000001_lesson_id_migration.sql` renames `lesson_slug` → `lesson_id`.
- ✅ **M-001 SRS PK Gap:** Fixed — `user_flashcard_srs` composite PK now includes `lesson_id`.
- ✅ **Legacy Code Cleanup:** Removed all v1 routes (`/curriculum/[moduleSlug]/[lessonSlug]`), API endpoints under `/api/lessons`, legacy hooks/components, and legacy JSON content files.
- ✅ **Sitemap & Previews:** Refactored `sitemap.ts` and dynamic public previews `/lessons/[slug]` to read from the v2 compiled content directories.

---

## 5. Definition of Done for Phase 1.4 (All Complete ✅)

- [x] Obsolete legacy v1 components, routes, APIs, hooks, and content parsers safely deleted.
- [x] Duplicate/redundant code eliminated and single authoritative v2 pipeline path verified.
- [x] Dynamic sitemap `/sitemap.xml` refactored to read from v2 curriculum JSON.
- [x] Public SEO lesson previews (`/lessons/[slug]`) refactored to resolve stable IDs and render blocks using `BlockTreeRenderer`.
- [x] Production build passes cleanly: 0 TypeScript errors, 0 ESLint errors, 23 routes compiled.
- [x] All compiler unit tests (`test:compiler`) and validation flows pass.

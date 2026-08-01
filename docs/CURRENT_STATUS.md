# PM Academy — Current Status

> **Live Status & Active Focus.** This document represents the current, real-time status of the repository. It is updated at the end of every implementation session to serve as the source of truth for current focus, active bugs, and immediate tasks.
> **Documentation entry point:** See [`docs/INDEX.md`](./INDEX.md) for the full doc map.

---

## 1. Repository Metadata

- **Current Branch:** `main`
- **Current Version:** `0.1.0` (defined in [`apps/web/package.json`](../apps/web/package.json))
- **Last Successful Build:** 2026-08-02 (Next.js 16.2.12 Turbopack production build — clean, 0 errors, 29 routes, 90 lessons compiled)
- **Current Implementation Phase:** Phase 1.3 ✅ Complete

---

## 2. Project Stage & Milestones

For phase definitions, see [`docs/Phases.md`](./Phases.md) and [`docs/memory/roadmap.md`](./memory/roadmap.md).

- **Phase 1.1 Content Pipeline Foundation:** ✅ Complete
- **Phase 1.2 Renderer Foundation:** ✅ Complete
- **Phase 1.3 Migration & Integration Foundation:** ✅ Complete
- **Current Focus:** Phase 2 Gamification UI wiring (dashboard, skill radar, SRS review hub).

---

## 3. What's Next: Next Planned Tasks

Following the recommended sequence in [`docs/memory/roadmap.md`](./memory/roadmap.md#L159-L161):

1. **[Phase 2] Skill Radar:** Wire `lib/skillRadar.ts` to real `user_lesson_progress` data. Resolve D-009 scoring formula decision. Replace dashboard `0%` placeholders.
2. **[Phase 2] XP & Level UI:** Wire `lib/xp-service.ts` to dashboard stats display. Show real total_xp, level, and recent XP events.
3. **[Phase 2] Streak Tracker UI:** Wire `lib/streaks.ts` to dashboard streak indicator. Current streak, longest streak, freeze count.
4. **[Phase 2] SRS Review Hub:** Build the spaced repetition review queue UI at `/review`. Uses `lib/flashcards-service.ts` + `user_flashcard_srs` table.
5. **[Phase 1.4 Cleanup - Optional]:** Remove legacy v1 routes (`/curriculum/[moduleSlug]/[lessonSlug]`), clean up `public/content/` legacy JSON, remove deprecated `useLessonProgress` hook.

---

## 4. Active Issues, Blockers & Bugs

### Known Blockers
- **Radar Chart Scoring Formula (D-009):** The skill radar scoring formula is unresolved in [`docs/memory/decisions.md`](./memory/decisions.md#L182-L195). We must lock this formula (continuous `0-100` vs. discrete bands) before connecting real data to the dashboard.

### Known Bugs & Debt (Post Phase 1.3)
- **2 ESLint Warnings (non-blocking):** `_prevLessonId` unused in `lesson-content.tsx` and `_rating` unused in `FlashcardDeckBlock.tsx`. These are correct underscore-prefixed suppressions and do not block the build.
- **Legacy `/curriculum` Route Still Active:** The old `/curriculum/[moduleSlug]/[lessonSlug]` route still renders via `LessonViewShell` (v1). It is being kept alive until Phase 1.4 cleanup confirms `/academy/l/[lessonId]` parity.
- **Sidebar `isActive` Detection:** The `/academy` isActive check uses `pathname.startsWith('/academy')` — this will correctly highlight Curriculum for both `/academy` and `/academy/l/*`.

### Resolved This Session (Phase 1.3)
- ✅ **M-009 Sidebar Breakage:** Fixed — sidebar "Curriculum" link now points to `/academy`.
- ✅ **M-001 DB Column Name:** Fixed — DB migration `20260802000001_lesson_id_migration.sql` renames `lesson_slug` → `lesson_id`.
- ✅ **M-001 SRS PK Gap:** Fixed — `user_flashcard_srs` composite PK now includes `lesson_id`.

---

## 5. Definition of Done for Phase 1.3 (All Complete ✅)

- [x] The v2 compiler compiles all 90 lessons into Zod-validated Block JSON inside `content/dist/`.
- [x] DB migration renames `lesson_slug` → `lesson_id` across all user-state tables.
- [x] Authenticated curriculum shell at `/academy` houses module cards + full lesson list.
- [x] Stable-ID lesson page `/academy/l/[lessonId]` renders via `BlockTreeRenderer`.
- [x] Sidebar link correctly maps to `/academy` and keeps the user within the authenticated AppShell.
- [x] `v2` API routes exist: `/api/v2/lessons/[lessonId]/progress`, `/theory-read`, `/quiz`.
- [x] `useLessonProgressV2` hook drives the v2 lesson shell.
- [x] `LessonContextProvider` passes quiz submission callback to `QuizBlock` through context.
- [x] Production build passes: 0 TypeScript errors, 0 ESLint errors, 29 routes compiled.

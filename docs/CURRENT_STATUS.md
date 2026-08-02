# PM Academy — Current Status

> **Live Status & Active Focus.** This document represents the current, real-time status of the repository. It is updated at the end of every implementation session to serve as the source of truth for current focus, active bugs, and immediate tasks.
> **Documentation entry point:** See [`docs/INDEX.md`](./INDEX.md) for the full doc map.

---

## 1. Repository Metadata

- **Current Branch:** `main`
- **Current Version:** `0.1.0` (defined in [`apps/web/package.json`](../apps/web/package.json))
- **Last Successful Build:** 2026-08-02 (Next.js 16.2.12 Turbopack production build — clean, 0 errors, 23 routes, 90 lessons compiled)
- **Current Implementation Phase:** Phase 1.5 — Sprint 1 Complete (Runtime & Navigation Stabilization) ✅

---

## 2. Project Stage & Milestones

For phase definitions, see [`docs/Phases.md`](./Phases.md) and [`docs/memory/roadmap.md`](./memory/roadmap.md).

- **Phase 1.1 Content Pipeline Foundation:** ✅ Complete
- **Phase 1.2 Renderer Foundation:** ✅ Complete
- **Phase 1.3 Migration & Integration Foundation:** ✅ Complete
- **Phase 1.4 Legacy Cleanup & Finalization:** ✅ Complete
- **Phase 1.5 Sprint 1 Runtime & Navigation:** ✅ Complete
- **Current Focus:** Phase 1.5 — Sprint 2: Learning Flow Stabilization.

---

## 3. What's Next: Next Planned Tasks

1. **[Phase 1.5 - Sprint 2] Flashcard SRS API Integration (FUNC-003):** Wire the rating buttons in `FlashcardDeckBlock.tsx` to hit the SM-2 review endpoint `/api/flashcards/[id]/review` to persist spaced repetition states in Supabase.
2. **[Phase 1.5 - Sprint 2] Lesson Back-Navigation (FUNC-005):** Render the "Previous Lesson" button using `prevLessonId` inside the v2 lesson shell layout.
3. **[Phase 1.5 - Sprint 2] Marketing Sync (UI-001):** Refactor the public `/curriculum` marketing page to consume `content/dist/curriculum.json` instead of a static hardcoded configuration.

---

## 4. Active Issues, Blockers & Bugs

### Remaining Sprint 2 Stabilization Items
- **FUNC-003 Flashcard SRS state is not persisted:** Card reviews do not trigger the API calls to save SM-2 intervals.
- **FUNC-005 `prevLessonId` is unused:** Users cannot navigate backward inside a lesson.
- **UI-001 Curriculum marketing mismatches:** Marketing list is disconnected from compiler output.

### Resolved This Session (Sprint 1)
- ✅ **FUNC-001 Dashboard CTA Broken Route:** Fixed — Dashboard start/continue learning buttons now resolve to correct first incomplete dynamic lesson IDs and completed lessons counts are real-time.
- ✅ **FUNC-002 blocks/index Compilation Error:** Fixed — added missing `React` import.
- ✅ **FUNC-004 Theory Engagement Tab Leak:** Fixed — timed seconds and scroll listeners now pause unless the `'theory'` tab is active.
- ✅ **SEC-001 Auth cookie extraction cleanup:** Fixed — consolidated session cookie retrieval and client factory logic in a single server-side `getServerUser()` helper.
- ✅ **Marketing App Redirects:** Fixed — authenticated users landing on marketing `/curriculum` or `/lessons/[slug]` are redirected to `/academy` and `/academy/l/[lessonId]`.

---

## 5. Definition of Done for Phase 1.4 (All Complete ✅)

- [x] Obsolete legacy v1 components, routes, APIs, hooks, and content parsers safely deleted.
- [x] Duplicate/redundant code eliminated and single authoritative v2 pipeline path verified.
- [x] Dynamic sitemap `/sitemap.xml` refactored to read from v2 curriculum JSON.
- [x] Public SEO lesson previews (`/lessons/[slug]`) refactored to resolve stable IDs and render blocks using `BlockTreeRenderer`.
- [x] Production build passes cleanly: 0 TypeScript errors, 0 ESLint errors, 23 routes compiled.
- [x] All compiler unit tests (`test:compiler`) and validation flows pass.

# PM Academy — Current Status

> **Live Status & Active Focus.** This document represents the current, real-time status of the repository. It is updated at the end of every implementation session to serve as the source of truth for current focus, active bugs, and immediate tasks.
> **Documentation entry point:** See [`docs/INDEX.md`](./INDEX.md) for the full doc map.

---

## 1. Repository Metadata

- **Current Branch:** `main`
- **Current Version:** `0.1.0` (defined in [`apps/web/package.json`](../apps/web/package.json))
- **Last Successful Build:** 2026-08-02 (Next.js 16.2.12 Turbopack production build — clean, 0 errors, 23 routes, 90 lessons compiled)
- **Current Implementation Phase:** Phase 1.5 — Curriculum Integrity & Content Pass Complete ✅

---

## 2. Project Stage & Milestones

For phase definitions, see [`docs/Phases.md`](./Phases.md) and [`docs/memory/roadmap.md`](./memory/roadmap.md).

- **Phase 1.1 Content Pipeline Foundation:** ✅ Complete
- **Phase 1.2 Renderer Foundation:** ✅ Complete
- **Phase 1.3 Migration & Integration Foundation:** ✅ Complete
- **Phase 1.4 Legacy Cleanup & Finalization:** ✅ Complete
- **Phase 1.5 Sprint 1 Runtime & Navigation:** ✅ Complete
- **Phase 1.5 Sprint 2 Learning Flow:** ✅ Complete
- **Phase 1.5 Sprint 3 Content & Curriculum:** ✅ Complete
- **Phase 1.5 Curriculum & Content Integrity Pass:** ✅ Complete
- **Current Focus:** Phase 1.5 — Sprint 4: Performance & Infrastructure Optimization.

---

## 3. What's Next: Next Planned Tasks

1. **[Phase 1.5 - Sprint 4] Dynamic Import Optimizations (PERF-001):** Lazy-load block components via `dynamic()` inside `apps/web/blocks/index.ts` to reduce initial bundle size and optimize hydration.
2. **[Phase 1.5 - Sprint 4] Image AVIF/WebP and Layout Shifts (PERF-002):** Optimize local image delivery and configure layout dimensions to achieve 95+ Lighthouse Performance scores.
3. **[Phase 1.5 - Sprint 4] Search flexsearch index caching (PERF-003):** Implement client-side localStorage/sessionStorage caching for the generated search index.

---

## 4. Active Issues, Blockers & Bugs

### Remaining Sprint 4 Stabilization Items
- **PERF-001 / PERF-002 / PERF-003:** Performance optimizations for initial load speeds, bundles, and search indexes.

### Resolved This Session (Phase 1.5 – Sprint 5: Curriculum Integrity & Production Readiness)
- ✅ **Lesson ID Registry Pollution Fixed (🔴 P0):** Cleaned up duplicate `apps/web/...` entry in the stable registry file, and upgraded `compiler.test.ts` to resolve absolute test paths relative to the workspace root, eliminating pollution.
- ✅ **Normalized Lesson Local ordering (🔴 P0):** Configured the compiler to calculate relative order within its module (`((globalOrder - 1) % 10) + 1`), matching the 1-to-10 model expected by the validator and UI.
- ✅ **Flashcards Restored for Lessons 61-90 (🔴 P0):** Enhanced `extractFlashcardBlock` to split on `Front:` and `Card` block boundaries, stripping bold markdown markup formatting to cleanly compile flashcards for lessons 61-90.
- ✅ **9-Module Curriculum Structure Restored:** Resolved the module splitting issue (17 modules down to exactly 9 modules, 10 lessons each, 90 lessons total) by parsing the module number from the metadata table and mapping it to the 9 canonical slugs.
- ✅ **Interview Perspective Extraction Fixed:** Fixed lazy regex parsing bugs that matched empty strings and cleared question text details, restoring all interview questions.
- ✅ **Real World Perspective Formatting Restructured:** Re-engineered the compiler parser to split paragraphs between bold headers and body content, resolving malformed output formatting.
- ✅ **Skipped Cross-Lesson Validations Resolved:** Programmed a second validation pass in `compile.ts` to run cross-lesson validation rules (such as `glossary-consistency`), and resolved exactly 12 term conflicts ("Happy Path", "Fidelity Ladder", "Technical Debt Quadrant", "Metric Definition Drift", "Vanity Metric", "Smile Curve") across 12 source files, achieving 0 compiler warnings.

---

## 5. Definition of Done for Phase 1.4 (All Complete ✅)

- [x] Obsolete legacy v1 components, routes, APIs, hooks, and content parsers safely deleted.
- [x] Duplicate/redundant code eliminated and single authoritative v2 pipeline path verified.
- [x] Dynamic sitemap `/sitemap.xml` refactored to read from v2 curriculum JSON.
- [x] Public SEO lesson previews (`/lessons/[slug]`) refactored to resolve stable IDs and render blocks using `BlockTreeRenderer`.
- [x] Production build passes cleanly: 0 TypeScript errors, 0 ESLint errors, 23 routes compiled.
- [x] All compiler unit tests (`test:compiler`) and validation flows pass.

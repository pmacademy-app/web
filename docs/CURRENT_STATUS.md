# PM Academy — Current Status

> **Live Status & Active Focus.** This document represents the current, real-time status of the repository. It is updated at the end of every implementation session to serve as the source of truth for current focus, active bugs, and immediate tasks.
> **Documentation entry point:** See [`docs/INDEX.md`](./INDEX.md) for the full doc map.

---

## 1. Repository Metadata

- **Current Branch:** `main`
- **Current Version:** `0.1.0` (defined in [`apps/web/package.json`](../apps/web/package.json))
- **Last Successful Build:** 2026-08-02 (Next.js 16.2.12 Turbopack production build — clean, 0 errors, 23 routes, 90 lessons compiled)
- **Current Implementation Phase:** Phase 1.5 — Sprint 3 Complete (Content Experience & Curriculum Rendering) ✅

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

### Resolved This Session (Sprint 3)
- ✅ **Lesson Rendering Parity:** Refactored SectionBlock helper cards for each metadata type (learning objectives, common mistakes, key takeaways, cheat sheet, resources, real-world perspective, interview perspective, framework, mental model, case study, company example, summary) with clean borders, icons, background color coding, and layouts.
- ✅ **DefaultMarkdown Enhancements:** Programmed tables to render as native HTML elements (`<table>`) and lists to render as native lists (`<ul>`/`<ol>`) with prose typography, blockquotes support, and correct headings margins.
- ✅ **MarkdownRenderer Type Safety:** Configured MarkdownRenderer with custom code formatting while removing custom blockquote/table renderers, utilizing standard marked compilation alongside Tailwind prose styles to solve typescript signature errors.
- ✅ **Curriculum Structure Parity:** Re-designed the `/academy` curriculum landing page using collapsible module details, a group-by-module layout list showing all 10 lessons per module, canonical descriptions, and color indicators.

---

## 5. Definition of Done for Phase 1.4 (All Complete ✅)

- [x] Obsolete legacy v1 components, routes, APIs, hooks, and content parsers safely deleted.
- [x] Duplicate/redundant code eliminated and single authoritative v2 pipeline path verified.
- [x] Dynamic sitemap `/sitemap.xml` refactored to read from v2 curriculum JSON.
- [x] Public SEO lesson previews (`/lessons/[slug]`) refactored to resolve stable IDs and render blocks using `BlockTreeRenderer`.
- [x] Production build passes cleanly: 0 TypeScript errors, 0 ESLint errors, 23 routes compiled.
- [x] All compiler unit tests (`test:compiler`) and validation flows pass.

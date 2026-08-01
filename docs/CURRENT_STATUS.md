# PM Academy — Current Status

> **Live Status & Active Focus.** This document represents the current, real-time status of the repository. It is updated at the end of every implementation session to serve as the source of truth for current focus, active bugs, and immediate tasks.
> **Documentation entry point:** See [`docs/INDEX.md`](./INDEX.md) for the full doc map.

---

## 1. Repository Metadata

- **Current Branch:** `main`
- **Current Version:** `0.1.0` (defined in [`apps/web/package.json`](../apps/web/package.json))
- **Last Successful Build:** 2026-08-01 (Next.js 16.2.12 Turbopack production compilation clean, zero warnings, 90 lessons / 1350 quiz questions validated)
- **Current Implementation Phase:** Transitioning from Phase 1 (Core Learning Loop MVP Complete) to Phase 2 (Gamification Layer)

---

## 2. Project Stage & Milestones

For phase definitions, see [`docs/Phases.md`](./Phases.md) and [`docs/memory/roadmap.md`](./memory/roadmap.md).

- **Current Phase:** Phase 1 (Core Learning Loop MVP) is functionally complete. However, we are executing a pre-Phase 2 **v2 Architecture Alignment Pass** before wiring the UI.
- **Last Completed Milestone:** Sprint 3.5 (MarkdownRenderer component with `marked` + `mermaid` support, strict mode double-rendering resolved, async filesystem read caches for dynamic routes, and Supabase client browser singletons).
- **Current Focus:** Reconciling the codebase with the v2 pipeline specifications ([`content-pipeline.md`](./content-pipeline.md) and [`rendering-pipeline.md`](./rendering-pipeline.md)).

---

## 3. What's Next: Next Planned Tasks

Following the recommended sequence in [`docs/memory/roadmap.md`](./memory/roadmap.md#L133-L161):

1.  **[Step 1] Build Content Pipeline v2:** Implement `remark` AST-based compilation, Zod validation schemas, stable compiler-assigned base36 `lessonId` mapping, and output block trees to `content/dist/`.
2.  **[Step 2] Database Schema Migration:** Write a roll-forward SQL migration to rename all `lesson_slug` columns to `lesson_id` across user-state tables, and include `lesson_id` in the `user_flashcard_srs` composite primary key.
3.  **[Step 3] Dynamic `/academy/**` Routes:** Create the unified persistent layout `app/academy/layout.tsx` (curriculum navigation sidebar) and the lesson route `app/academy/l/[lessonId]/page.tsx` (stable ID-based dynamic route). Fix the sidebar link to `/academy`.
4.  **[Step 4] Component Registry & Renderers:** Port existing renderers to `BlockTreeRenderer` recursive renderer and `renderer/registry.ts`.
5.  **[Step 5] Service Layer Alignment:** Update business logic services in `apps/web/lib/` to query on `lesson_id` instead of `lesson_slug`.
6.  **[Step 6] Phase 2 Gamification UI:** Wire up dashboard indicators, skill radar radar chart, and Spaced Repetition Review Hub queue.

---

## 4. Active Issues, Blockers & Bugs

### Known Blockers
-   **Radar Chart Scoring Formula (D-009):** The skill radar scoring formula is unresolved in [`docs/memory/decisions.md`](./memory/decisions.md#L182-L195). We must lock this formula (continuous `0-100` vs. discrete bands) before connecting real data to the dashboard.

### Known Bugs & Debt
-   **Sidebar App Shell Breakage (M-009):** The curriculum sidebar links to `/curriculum`, which routes to `app/(marketing)/curriculum/page.tsx`. This pulls authenticated users out of the AppShell layout (removing sidebar and topbar). Fixed in Step 3 by routing to `/academy`.
-   **Database Column Name Inconsistency (M-001):** The database columns reference `lesson_slug` instead of compiler-assigned stable `lesson_id`. This is a database integrity debt that blocks renaming lesson Markdown files. Fixed in Step 2.
-   **Flashcard SRS Table Primary Key Gap (M-001):** The database table `user_flashcard_srs` is missing the `lesson_id` column, violating the composite PK `(user_id, lesson_id, flashcard_id)` constraint. Fixed in Step 2.

---

## 5. Definition of Done for Current Stage

Before marking Phase 1 / Reconcile phase as complete and moving to Phase 2 UI wiring, we must verify:
- [ ] The v2 compiler compiles all 90 lessons into Zod-validated Block JSON inside `content/dist/`.
- [ ] No data loss occurs during the `lesson_slug` → `lesson_id` database migration.
- [ ] The authenticated curriculum shell (`app/academy/layout.tsx`) houses navigation, search, and progress.
- [ ] The sidebar link correctly maps to `/academy` and keeps the user within the authenticated `AppShell`.
- [ ] The core reading → quiz → unlock sequence compiles and runs cleanly with no TypeScript warnings or ESLint errors.

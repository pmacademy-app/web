# PM Academy — Implementation Rules

> **Developer & Agent Guidelines.** This document defines the engineering, documentation, and quality guidelines that every contributor (human developer or AI agent) must follow when implementing changes in this repository.
> **Documentation entry point:** See [`docs/INDEX.md`](../INDEX.md) for the full doc map.

---

## 1. Documentation & Onboarding Rules

### 1.1 Read Order
Before writing a single line of code or proposing any design change, you must:
1.  Read [`docs/INDEX.md`](../INDEX.md) first to understand the doc map, reading order, and authority hierarchy.
2.  Read [`docs/CURRENT_STATUS.md`](../CURRENT_STATUS.md) to align on the live branch, version, focus, and active bugs.
3.  Read the relevant core documents as determined by the `INDEX.md` map.

### 1.2 Pipeline Authority
-   [`docs/content-pipeline.md`](../architecture/content-pipeline.md) is the absolute technical source of truth for the compiler, parsing scripts, schema validation, and indexers.
-   [`docs/rendering-pipeline.md`](../architecture/rendering-pipeline.md) is the absolute technical source of truth for the curriculum shell, routing hierarchy, block component registry, and interactive lesson renderers.
-   If `Architecture.md` conflicts with either pipeline spec on compiler or renderer topics, **the pipeline specifications win**.

---

## 2. Coding & Architectural Rules

### 2.1 Focus on Phase Scope
-   Implement only the features scoped for the current phase (as defined in [`docs/Phases.md`](../product/Phases.md) and [`docs/CURRENT_STATUS.md`](../CURRENT_STATUS.md)).
-   Do **not** implement future phase features early (e.g., adding cohort leaderboards or gamification assets during Phase 1) unless explicitly instructed by the user. Keep focus narrow.

### 2.2 Maintain Parity & Core Logic
-   During refactors or migrations (e.g., porting v1 structures to v2 blocks), you must maintain strict feature parity.
-   Do **not** discard interactive state handlers, analytics tracking (such as GA4 scroll depth and time signal hooks), or accessibility properties (keyboard shortcuts, tab indexes).

### 2.3 Avoid Duplication & Inline Logic
-   Consolidate all business logic, formulas, calculations, and constants inside the isolated modules in [`apps/web/lib/`](../../apps/web/lib/) (e.g., `srs.ts`, `streaks.ts`, `skillRadar.ts`, `xp-service.ts`).
-   Never write custom calculations or duplicate helper functions inline inside React components. Components should act as pure consumers of the service layer.

### 2.4 No Placeholder Implementations
-   Do **not** check in placeholder code, stub components, or fake mock endpoints for completed features.
-   If scaffolding a feature that is deferred, explicitly wrap it in a placeholder boundary (like the current stub pages) and label it clearly. Once implementing, write full production-ready code.

---

## 3. Documentation Sync Rules

### 3.1 Update After Every Session
At the end of every implementation session, you must:
1.  Update the project memory system in [`docs/memory/`](../memory/) (specifically `implementation.md`, `decisions.md`, `mistakes.md`, or `roadmap.md` based on what changed).
2.  Update [`docs/CURRENT_STATUS.md`](../CURRENT_STATUS.md) to reflect the current state (latest completed milestone, new focus, active blockers, or newly discovered bugs).
3.  Update the lightweight root [`MEMORY.md`](../../MEMORY.md) index if the metadata has changed.

### 3.2 Prevent Contradictions
-   Never let two documentation files contradict each other. If an implementation details changes, scan the core documentation directory and update any stale references in the same session. Follow the conflict resolution hierarchy in `docs/INDEX.md` to resolve conflicts.

---

## 4. Quality Gates & Verification Rules

### 4.1 Local Verification
Before declaring any task complete, you must verify the code quality:
1.  Run the validation and content compiling commands (e.g., `npm run content:build` inside `apps/web/`).
2.  Run the Next.js production build (`npm run build` inside `apps/web/`) to verify compilation.
3.  Verify that the workspace is **TypeScript clean** (zero errors) and **ESLint clean** (zero warnings).

### 4.2 Database Safety
-   Never execute DDL scripts manually in the Supabase production SQL console. All schema changes must go through the version-controlled Supabase CLI migration workflow defined in [`docs/Supabase-Migration-Guide.md`](../architecture/Supabase-Migration-Guide.md).
-   Row Level Security (RLS) policies must be written and enabled inside the **same** migration script that creates or alters the target database table.

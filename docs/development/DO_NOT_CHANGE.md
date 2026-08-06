# PM Academy — Do Not Change (Architectural Invariants)

> **Core System Invariants.** This document outlines the fundamental architectural design decisions of the PM Academy codebase. These decisions are locked to preserve the project's ₹0-infrastructure constraint, performance budget, and data integrity. Do **not** modify, bypass, or refactor these paradigms without deliberate architectural discussion.
> **Documentation entry point:** See [`docs/INDEX.md`](../INDEX.md) for the full doc map.

---

## 1. Static-First Content Delivery

### 1.1 Invariant: Lesson content is never stored in Supabase
-   **What it is:** All lesson prose, quiz questions, and flashcard content are authored in Markdown and compiled to static JSON files served via the CDN.
-   **Why it exists:** Keeps database size well within Supabase's 500MB free-tier ceiling. Serving static JSON from Vercel Edge Network is faster and has zero operational query cost, preventing scale-up bottlenecks.
-   **Alternative to avoid:** Do not create a Supabase table for lesson content or query a DB for lesson text on page loads.

### 1.2 Invariant: Markdown → AST → Block JSON pipeline
-   **What it is:** The compiler must parse lesson Markdown files into a Zod-validated nested Block JSON tree using `remark` AST, rather than using string-slicing regexes.
-   **Why it exists:** Regex heuristics fail on complex content layouts (such as code blocks containing heading characters or tables inside quizzes). AST node manipulation is mathematically stable and guarantees build-time schema consistency.
-   **Alternative to avoid:** Do not add inline text-splitting or custom parsing regexes into components to read Markdown files at runtime.

---

## 2. Rendering & Routing Paradigms

### 2.1 Invariant: Recursive component renderer (`BlockTreeRenderer`)
-   **What it is:** Lesson views render by traversing the compiled JSON Block tree recursively using the central `BlockTreeRenderer` component.
-   **Why it exists:** Direct structural representation of the nested data schema. It allows nesting blocks arbitrarily (such as putting a quiz inside an accordion tab) without having to write layout-specific component wrappers.
-   **Alternative to avoid:** Do not write monolithic components that assume a flat, linear section layout.

### 2.2 Invariant: Plugin-based registry (`renderer/registry.ts`)
-   **What it is:** Block types must be mapped to their React components via a central registry utilizing dynamic `import()` boundaries.
-   **Why it exists:** Keeps the core renderer code clean and decoupled. Granular code-splitting ensures that heavy interactive JavaScript (e.g., Mermaid diagrams, interactive quizzes) is only sent to the user's browser if the lesson actually contains those blocks.
-   **Alternative to avoid:** Do not import and register new block components directly inside the main lesson shell files.

### 2.3 Invariant: Unified App Routing under `/academy/**`
-   **What it is:** The authenticated learning experience lives under a persistent curriculum layout shell at `app/academy/layout.tsx` and dynamically routes lesson segments as `app/academy/l/[lessonId]/page.tsx`.
-   **Why it exists:** Isolates authenticated learning states, navigation sidebars, search overlays, and progress sync providers from the marketing group (`app/(marketing)/`).
-   **Alternative to avoid:** Do not route authenticated student lessons to public marketing segments (like `curriculum/[moduleSlug]/[lessonSlug]`).

---

## 3. Data Integrity & State Management

### 3.1 Invariant: Stable Base36 `lessonId` Registry
-   **What it is:** All database tables referencing lesson progress, attempts, reflections, or bookmarks must reference the stable base36 compiler-assigned `lessonId` (e.g., `les_001a2b` stored in `.ids/lesson-id-registry.json`), **never** the human-facing URL slug or order position.
-   **Why it exists:** Renaming a lesson title changes its URL slug. Using stable IDs ensures that renaming or reordering lessons in Git does not break existing database associations or corrupt user progress.
-   **Alternative to avoid:** Do not write schema fields referencing `lesson_slug` or positional numbers.

### 3.2 Invariant: Append-Only XP Ledger (`xp_events`)
-   **What it is:** XP is never incremented directly in the `users` table via application code. Every XP gain is logged as an insert to `xp_events`, and a PostgreSQL trigger recomputes the cached `total_xp` and `level` on the user row.
-   **Why it exists:** Provides an auditable ledger for anti-gaming validation, supports event replayability, and guarantees transaction concurrency safety at the database level.
-   **Alternative to avoid:** Do not execute `UPDATE users SET total_xp = total_xp + N` inside Next.js API routes or server actions.

### 3.3 Invariant: Timezone-Aware Streak Engine
-   **What it is:** Study streaks are calculated relative to the student's local timezone (stored as `users.timezone` in Supabase) rather than UTC server boundaries.
-   **Why it exists:** A student studying at 10 PM in San Francisco must not lose their streak because the database server evaluates on UTC midnight. Streaks must honor local user timezone boundaries.
-   **Alternative to avoid:** Do not use plain database timestamps without timezone offsets or compute streaks using server-side UTC boundaries.

---

## 4. Operational Invariants

### 4.1 Invariant: Git as the Content Source of Truth
-   - **What it is:** Modifying course lessons must be done by editing the Markdown files in the `content/` folder, which triggers the automated GitHub build pipeline.
-   - **Why it exists:** Keeps the entire 90-lesson curriculum under Git version control (track changes, pull requests, revert edits).
-   - **Alternative to avoid:** Do not manually edit the compiled JSON files under `public/content` or attempt to load content text from Supabase.

### 4.2 Invariant: No AI Mentor Feature
-   **What it is:** No LLM-powered feedback features are allowed in the core product.
-   **Why it exists:** LLM token calls at scale violate the ₹0 infrastructure cost principle. The curriculum relies on high-quality human-authored contents.
-   **Alternative to avoid:** Do not add code references or integration endpoints for AI text evaluation.

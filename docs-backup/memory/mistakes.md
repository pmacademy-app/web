# PM Academy — Mistakes & Pitfalls Memory

> **Purpose:** A record of mistakes made during implementation, known pitfalls in the codebase, and things that future contributors (human or AI) must avoid repeating. This is the project's institutional memory for what goes wrong.  
> **Part of:** the [`docs/memory/`](./) system. See [`docs/INDEX.md`](../INDEX.md) for the full documentation map.

---

## How to Use This File

When you encounter a bug, an architectural misstep, or a "don't do it that way" lesson — add it here. Each entry should be concrete and actionable: not "be careful with async" but "using `fs.readFileSync` inside a Next.js Server Component blocks the Node.js event loop — use `fs.promises.readFile` with React `cache` instead."

---

## M-001: Using `lesson_slug` as a Foreign Key in User-State Tables

**Category:** Schema / Data integrity  
**Severity:** High — causes silent data corruption

**What went wrong:** The initial database migrations defined `user_lesson_progress`, `quiz_attempts`, and related tables using `lesson_slug` as the lesson reference column. Slugs are human-facing URL segments derived from lesson titles (e.g., `introduction-to-product-thinking`).

**Why this is a problem:** If a lesson's title (and therefore slug) changes, every user progress record referencing the old slug becomes an orphan — the application can no longer connect that progress record to the lesson. This is a silent data loss event that's extremely hard to diagnose in production.

**Correct approach:** Use the compiler-assigned stable `lessonId` (e.g., `les_001a2b` from `content-pipeline.md §5`). The ID is assigned once at compile time and stored in `.ids/lesson-id-registry.json`. It never changes even if the lesson title or slug changes.

**Current state (2026-08-01):** The existing migrations use `lesson_slug`. A roll-forward migration to rename these columns to `lesson_id` is required before v2 content pipeline deployment. Until then, **do not rename any lesson titles** or the slugs will break progress tracking.

---

## M-002: Duplicate Supabase Client Instantiation in the Browser

**Category:** Performance / Client-side  
**Severity:** Medium — causes unnecessary re-subscriptions and auth state inconsistencies

**What went wrong:** Multiple components each called `createBrowserSupabaseClient()` independently, creating a separate Supabase client instance per component. Each instance maintains its own realtime subscription connections and auth listener.

**Symptoms:** Subtle auth state flicker on route transitions; duplicate API calls observed in the Network tab; memory overhead from multiple WebSocket connections.

**Correct approach:** Singleton factory pattern — check if a client instance already exists before creating a new one. This is implemented in `apps/web/lib/supabase.ts` as of Sprint 3.5 (2026-08-01). Always import the client from `lib/supabase.ts`; never instantiate `createBrowserClient()` directly in a component.

---

## M-003: Mermaid Diagrams Rendering Twice in React 18 Strict Mode

**Category:** Rendering / React lifecycle  
**Severity:** Medium — visual bug in development and production

**What went wrong:** Mermaid's `mermaid.render()` call mutates the DOM directly. In React 18 strict mode, effects run twice (mount → unmount → mount) to surface bugs. The second Mermaid render attempt found a node already processed and threw an error, resulting in either a blank diagram or a duplicate.

**Correct approach:** Mark diagram nodes as processed synchronously after the first render using a flag on the element (e.g., `dataset.mermaidProcessed = 'true'`). Skip any node that already has this flag. This is implemented in `components/ui/MarkdownRenderer.tsx` as of Sprint 3.5.

**Key lesson:** Any library that directly mutates the DOM (Mermaid, Prism, certain charting libraries) needs a processed-flag guard to survive React 18 strict mode double-invocation.

---

## M-004: Blocking the Node.js Event Loop with `fs.readFileSync` in Server Components

**Category:** Performance / Server-side  
**Severity:** Medium — degrades concurrent request handling

**What went wrong:** Dynamic route server components (`[lessonSlug]/page.tsx` and `lessons/[slug]/page.tsx`) used synchronous `fs.readFileSync` to read lesson JSON files. Node.js is single-threaded; synchronous file reads block the entire event loop, preventing concurrent requests from being processed while the read is in progress.

**Correct approach:** Use `fs.promises.readFile` wrapped in React's `cache()` function. The async read is non-blocking; React's `cache` deduplicates identical reads within a single render pass.

```typescript
import { cache } from 'react'
import { readFile } from 'fs/promises'

const getLessonData = cache(async (slug: string) => {
  const file = await readFile(`public/content/lessons/${slug}.json`, 'utf-8')
  return JSON.parse(file)
})
```

This pattern is implemented as of Sprint 3.5. Apply it to any server component that reads from the filesystem.

---

## M-005: `getLevelTitle()` Duplicated Across Files

**Category:** Code duplication / Maintainability  
**Severity:** Low — but caused calculation drift

**What went wrong:** `getLevelTitle()` was defined independently in `lib/xp.ts`, `app/(app)/dashboard/page.tsx`, and `components/layout/Topbar.tsx`. When the level threshold values were updated in one location, the other two retained old values, silently displaying incorrect level titles.

**Correct approach:** Single canonical definition in `lib/xp.ts`. All consumers import from there. **Never define business logic constants or functions inline inside components.** This was fixed in Sprint 2 (2026-07-28).

**Key lesson:** If a value appears in more than one file, it needs a single source of truth. For PM Academy, all business logic constants live in `lib/`. Components are pure consumers.

---

## M-006: `shadcn` CLI Included as a Runtime Dependency

**Category:** Dependencies / Bundle size  
**Severity:** Low

**What went wrong:** The `shadcn` CLI package was listed in `dependencies` (runtime), not `devDependencies`. This caused it to be included in the production bundle, adding unnecessary size.

**Correct approach:** CLI tools used only at development time (codegen, scaffolding, etc.) belong in `devDependencies`. The fix was applied in Sprint 2 (2026-07-28).

**Key lesson:** Run `npm install --save-dev <package>` for any tool that's only needed during development. Audit `dependencies` vs `devDependencies` during each major sprint.

---

## M-007: Dashboard CTA Routing to Marketing Route Instead of App Route

**Category:** Routing / UX  
**Severity:** Medium — breaks the authenticated user's navigation context

**What went wrong:** The "Continue Learning" CTA button on the dashboard was linking to `/lessons/{slug}` (a marketing/public route rendered in the marketing layout) instead of `/curriculum` (the authenticated app route rendered in the app shell with sidebar and topbar).

**Symptoms:** Clicking "Continue Learning" dropped authenticated users out of the app shell (no sidebar, no topbar) and into the marketing layout. Users had to navigate back manually.

**Correct approach:** Authenticated app CTAs must always link to routes within the `(app)` route group. Public/SEO pages (`/lessons/[slug]`) are for unauthenticated visitors only. Fixed in Sprint 2 (2026-07-28).

**Key lesson:** Before adding any internal link in the authenticated app, confirm the target route is in `app/(app)/` — not in `app/(marketing)/`.

---

## M-008: v1 Content Pipeline Treating Markdown as a String to Slice

**Category:** Architecture / Content pipeline  
**Severity:** High — the root cause of the entire v1-to-v2 rebuild

**What went wrong:** The v1 parser (`scripts/parse-content.ts`) treats Markdown as a text string, splitting on `\n\n`, checking `line.startsWith('## ')`, and using regex to extract content types. This works for simple, well-formatted lessons but fails for:
- Nested content (a list inside a callout box)
- Code fences that contain `##` characters
- Tables inside quiz explanations
- Any new block type that doesn't have a heading to detect

**Correct approach:** Use a real Markdown AST parser (`remark`/`mdast`). Operate on a typed syntax tree, not raw strings. Each downstream step (block extraction, validation, search indexing) operates on nodes in the tree, not regex on text. See `content-pipeline.md §1–§2`.

**Current state:** The v2 pipeline is defined in `content-pipeline.md` but not yet implemented. Until it is, the v1 parser is in use and must not be extended with more regex heuristics — add new block types to the v2 spec and implement them there.

---

## M-009: Authenticated Curriculum Route Uses Marketing Layout

**Category:** Routing / UX  
**Severity:** Medium — known architectural mismatch

**What went wrong:** The sidebar navigation links to `/curriculum`, which resolves to `app/(marketing)/curriculum/page.tsx` — a page rendered in the marketing layout (no sidebar, no topbar, no auth context). Authenticated users who click "Curriculum" in the sidebar are stripped of the app shell.

**Current state (2026-08-01):** This is a known open issue. It will be resolved when the v2 `/academy/` route structure is implemented, which adds a proper `app/academy/layout.tsx` curriculum shell for authenticated users.

**Do not work around this by moving the marketing curriculum page** — it exists at `/curriculum` for SEO purposes (unauthenticated previews). The fix is to add the authenticated curriculum experience under `/academy/`.

---

## M-010: `SKILL_CLUSTERS` Defined in Two Places with Different Shapes

**Category:** Code duplication / Type safety  
**Severity:** Low — caused type mismatch errors in the skill radar component

**What went wrong:** A plain string array `SKILL_CLUSTERS: string[]` existed in `lib/design/tokens.ts` while a richer enriched object array `SKILL_CLUSTERS: SkillCluster[]` existed in `lib/skillRadar.ts`. Components importing from `tokens.ts` received strings, not the objects they expected for rendering icons and labels.

**Correct approach:** One source of truth. `lib/skillRadar.ts` is the canonical source of cluster definitions (it has the full type with icons and labels). `tokens.ts` exports only design-level tokens (colors, durations) — not business logic like cluster definitions. Fixed in Sprint 2 (2026-07-28).

---

## Changelog

- v1.0 (2026-08-01) — Created from the project audit report, MEMORY.md, and sprint notes. Synthesizes 10 concrete mistakes with actionable prevention guidance.

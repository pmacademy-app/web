# PM Academy Rendering Pipeline — Technical Specification v2
### Block JSON → Component Registry → Interactive UI

> **Status**: Implementation-ready blueprint for a standalone rebuild.
> **Supersedes**: `lesson-rendering-pipeline-audit.md` (v1).
> **Documentation entry point**: See `INDEX.md` for the full doc map and source-of-truth rules.
> **Depends on**: `content-pipeline.md` (produces the Block JSON this spec consumes).
> **Grounded in**: `lesson-001.md`, via the content pipeline's real block taxonomy (§3 there) — the specialized renderer list in §4 below has been corrected to match the block types real lessons actually produce (learning objectives, theory, common mistakes, mental models, company examples, case studies, frameworks, interview perspective, summary, key takeaways, cheat sheet, glossary, resources, connections, flashcards, quiz), not the smaller five-type set assumed by an earlier draft.

---

## 0. Why v1's Renderer Needs to Be Replaced, Not Patched

| # | Limitation in v1 | Why it matters | Root cause |
|---|---|---|---|
| 1 | `components: Record<string, ComponentType>` map hard-coded inline inside `lesson-renderer.tsx` (lines 441-629) | Every new block type requires editing the core renderer file directly — no plugin boundary, high merge-conflict surface as the team grows. | Registry is a literal object, not a registration API |
| 2 | Flat `lesson.sections.map(...)` — no recursion | Can't render "a quiz inside a tab inside an accordion" (the new content pipeline explicitly supports nested block trees — the renderer must too). | Renderer assumes a flat list because v1's data model was flat |
| 3 | All specialized renderers are bundled together; "lazy loading" in v1 is really just "doesn't mount if absent from JSON" — the code is still in the same bundle | Quiz/flashcard/mermaid JS ships to users reading text-only lessons. No real code-splitting per block type. | No dynamic `import()` per component, only conditional mounting |
| 4 | No progress tracking, no resume-where-you-left-off, no completion state | Core LMS feature is entirely missing from the rendering layer. | Out of scope in v1 by omission |
| 5 | No client-side navigation model beyond "one lesson per page load" — no prev/next, no sidebar tree, no breadcrumbs | Docs-platform table-stakes UX (GitBook/Mintlify sidebar + breadcrumb + prev/next) doesn't exist. | Renderer only knows about a single lesson, not the curriculum graph |
| 6 | No offline/streaming rendering strategy — full lesson JSON fetched before anything paints | Slow perceived load on long lessons; no progressive reveal. | Server component fetches everything, then renders synchronously |
| 7 | Accessibility handled ad hoc per component (if at all) — no systematic keyboard nav, focus management, or ARIA contract across block types | Inconsistent a11y quality; some interactive blocks (quiz) have partial keyboard support, others (flashcard flip) rely on mouse/click semantics primarily. | No shared interaction contract for interactive blocks |
| 8 | Error boundaries wrap components generically; no per-block-type recovery or telemetry | A failing Mermaid render and a failing quiz render look identical to the user and to observability tooling. | Single generic `<ErrorFallback>` with no block-type context |
| 9 | No AI-powered rendering surface (explain-this, quiz-me, adaptive difficulty) | Content pipeline v2 introduces `aiPrompt` blocks; v1 renderer has no concept of a block that calls a model at render/interaction time. | Not designed for it |
| 10 | Theming is scattered: Tailwind classes per component + Mermaid init config edited separately | No single design-token source; dark/light consistency depends on every component author remembering to wire `resolvedTheme` correctly. | No central theme contract |

**Design consequence:** v2 renderer is a **recursive, plugin-registered, code-split block renderer** sitting on top of a **curriculum-aware navigation shell**, with progress tracking, accessibility, and AI-interaction as first-class concerns rather than afterthoughts.

---

## 1. High-Level Architecture

```mermaid
flowchart LR
    A[Curriculum Shell\napp/academy/layout.tsx] --> B[Navigation Provider\nsidebar, breadcrumbs, prev/next]
    B --> C[Lesson Route\napp/academy/l/[lessonId]/page.tsx]
    C --> D[Lesson Data Loader\nfetch content/dist/lessons/id.json]
    D --> E[Progress Provider\nresume state, completion]
    E --> F[BlockTreeRenderer\nrecursive]
    F --> G[Block Component Registry\nplugin-based, lazy-loaded]
    G --> H[Leaf Block Components\nQuiz, Flashcards, Mermaid, Tabs, Video, AIPrompt...]
    F --> I[Search Overlay\nFlexSearch client index]
    E --> J[Progress Sync\nlocal-first + server sync]
```

---

## 2. Entry Points (Next.js App Router)

### 2.1 `app/academy/layout.tsx` — Curriculum Shell (new)
Replaces v1's bare dashboard wrapper. Responsibilities:
- Loads `curriculum.json` + `module-graph.json` once (cached, revalidated on content deploy) to render the persistent **sidebar navigation** (module → lesson tree, matching GitBook/Mintlify's docs-shell pattern).
- Hosts the **Progress Provider** (§7) and **Search Overlay** (§8) at the shell level so they're available on every route without re-fetching.
- Renders breadcrumbs derived from the module graph, not hard-coded.

### 2.2 `app/academy/l/[lessonId]/page.tsx` — Lesson Route
- Reads `lessonId` from the dynamic segment (note: **stable ID**, not a positional number — see content spec §5).
- Server Component: fetches `content/dist/lessons/${lessonId}.json` and streams it to the client via React Server Components — critically, **above-the-fold blocks render first**, later blocks stream in, rather than v1's "wait for entire JSON, then render everything synchronously."
- Computes prev/next lesson links directly from each lesson's `connections` block (content spec §3/§4), which already carries `previous`/`next`/`unlocks` — no separate lookup needed. Not present at all in v1.
- Handles not-found via Next.js `notFound()`, same as v1. **(aligned to lesson-001.md)** Draft/review-state gating is out of scope until the content pipeline actually has a `status` field to key off of (see content spec §4's note on workflow metadata) — today, everything under `content/dist/` is publishable by construction.

### 2.3 `app/academy/l/[lessonId]/lesson-content.tsx`
- `fetchLessonData(lessonId)`: reads compiled JSON (file system in dev, CDN/edge cache in production — content is static, immutable, content-hashed, so it's a perfect CDN caching candidate, unlike v1 which never specified a caching story).
- Delegates to `<BlockTreeRenderer blocks={lesson.blocks} lessonId={lesson.id} />`.

---

## 3. Core Rendering Component: `BlockTreeRenderer`

The single biggest structural change from v1. Recursive by design:

```tsx
function BlockTreeRenderer({ blocks, lessonId }: { blocks: Block[]; lessonId: string }) {
  return (
    <>
      {blocks.map((block) => (
        <BlockErrorBoundary key={block.blockId} block={block} lessonId={lessonId}>
          <BlockRenderer block={block} lessonId={lessonId} />
        </BlockErrorBoundary>
      ))}
    </>
  );
}

function BlockRenderer({ block, lessonId }: { block: Block; lessonId: string }) {
  const Component = useBlockComponent(block.type); // registry lookup, see §6
  // Blocks that contain children (tabs, accordion, callout) recurse:
  if ('children' in block && Array.isArray(block.children)) {
    return (
      <Component block={block} lessonId={lessonId}>
        <BlockTreeRenderer blocks={block.children} lessonId={lessonId} />
      </Component>
    );
  }
  return <Component block={block} lessonId={lessonId} />;
}
```

This directly fixes limitation #2 (no nesting) — a `tabs` block's renderer receives its children as a fully-rendered `<BlockTreeRenderer>` subtree, so a quiz inside a tab inside an accordion "just works" with zero special-casing.

### 3.1 Error Boundaries — Per-Block, Not Generic (fixes limitation #8)

```tsx
<BlockErrorBoundary block={block} lessonId={lessonId}>
```
- Catches errors **per block**, so one broken Mermaid diagram doesn't take down the rest of the lesson (same resilience goal as v1, but now also:)
- Emits a structured telemetry event `{ lessonId, blockId, blockType, errorMessage }` — v1's generic fallback had no block-type-aware observability.
- Fallback UI is block-type-aware: a failed quiz shows "This question couldn't load — skip to the next one," a failed diagram shows the raw Mermaid source in a `<pre>` (preserving v1's good instinct here), rather than one generic message for everything.

---

## 4. Specialized Block Renderers

**(aligned to lesson-001.md)** Real lessons are built from a specific, richer set of section types (see content spec §3) than the five generic ones assumed by an earlier draft — but most of them are **not** independently interactive; they're styled prose sections that mainly need a consistent wrapper (anchor ID for deep-linking, a TOC/reading-progress entry, consistent spacing) rather than bespoke widget logic. Splitting by that distinction avoids over-building components for content that's fundamentally still "read this text":

**Genuinely interactive — bespoke components:**

| Renderer | Handles | Notes vs. v1 |
|---|---|---|
| `QuizBlock` | MCQ, scoring | Now emits progress events per question (§7), supports full keyboard operation (arrow keys + Enter, matching v1) plus screen-reader-announced score results via `aria-live`. Props match the real authored shape: `options: string[]`, `correctAnswer: number`, `objectivesTested: number[]` (an array, since real questions often test more than one objective), `difficulty: 'easy'\|'medium'\|'medium-hard'\|'hard'` (a string label, not v1's implicit assumption of a numeric scale). |
| `FlashcardDeckBlock` | Flip cards | Flip state toggleable via keyboard focus + Enter/Space (v1 mentions Space; adds explicit focus ring + `aria-pressed`). Renders the deck exactly as authored — each card's `front`/`back`/`difficulty`/`tags`, sourced from the `**Card N**` blocks the compiler already extracts (content spec §3, Stage 1). |
| `MermaidBlock` | Diagrams | Same normalize → theme → two-pass SVG fix pipeline as v1 (that part of v1 was solid — preserved, see §4.1). |
| `GlossaryBlock` (new) | Term/definition tables | Renders the lesson's own authored glossary table (unchanged from today), **and** makes every term hoverable/tappable elsewhere in the same lesson body — the renderer cross-references `[[term]]`-shaped text against this lesson's own glossary entries plus the aggregated `glossary-index.json` (content spec §8) for terms defined in *other* lessons, showing a tooltip with a "defined in Lesson N" link when the term isn't local. |
| `ConnectionsBlock` (new) | Previous/Current/Next/Unlocks navigation | Renders the `## Connections` table as a set of resolvable lesson cards (title + link), using the `lessonId`s the compiler resolved at build time (content spec §5) rather than the raw title text authors wrote. This is also where the lesson route's prev/next footer nav is sourced from (§2.2). |
| `CalloutBlock` | Info/warning/tip/danger | Available for lessons that opt into it going forward. Icon **and** text label always present (accessibility rule from content spec §9 — no color-only signaling). Not used by any current lesson; not required. |

**Prose sections — one shared wrapper, no bespoke logic:**

| Block type (from content spec §3) | Wrapper behavior |
|---|---|
| `learningObjectives`, `theory`, `commonMistakes`, `mentalModel`, `companyExample`, `realWorldPerspective`, `caseStudy`, `framework`, `interviewPerspective`, `summary`, `keyTakeaways`, `cheatSheet`, `resources`, `reflection` | All render via a single `SectionBlock` wrapper: heading + slugged anchor (for search deep-links and a generated in-page TOC), consistent spacing/typography from the design tokens (§6), and a reading-time contribution counted toward the lesson's total. `mentalModel` and `framework` additionally embed a nested `MermaidBlock` for their diagram child — the wrapper doesn't special-case this, the diagram is just another block in its `children` array (§3 recursion). |
| `paragraph` / `heading` / `list` / `table` / `code` (generic prose) | `DefaultMarkdown` — same safety-net role as v1's fallback, now driven by the registry's default entry rather than a special-cased `??` check. |

**Not yet used by any lesson — available via the plugin system for future content (content spec §3):**

| Renderer | Handles | Notes |
|---|---|---|
| `TabsBlock` | Tabbed content | Full `role="tablist"` / `role="tab"` / `role="tabpanel"` ARIA pattern with arrow-key navigation, per WAI-ARIA Authoring Practices. |
| `AccordionBlock` | Collapsible sections | `aria-expanded`, keyboard toggle, matches native `<details>` semantics where possible for progressive enhancement. |
| `TimelineBlock` | Sequenced events | Semantic `<ol>` under the hood for screen readers, visually rendered as a timeline. |
| `VideoBlock` | Video embeds | Requires a caption track asset (enforced at compile time); lazy-loads the video player chunk only when scrolled into view. |
| `AIPromptBlock` | "Explain this," "Quiz me," Socratic follow-ups | Streams a model response client-side; see §9. |

### 4.1 MermaidBlock — Preserved From v1 (it was good), Theme Handling Corrected

- Dynamic `import('mermaid')` on first use — same bundle-size discipline as v1.
- Post-render pipeline unchanged in spirit: strip clip-paths, expand `foreignObject`, `fixNodeShapes`, recompute `viewBox` with padding.
- Two-pass layout fix (immediate + ~150ms follow-up for late font loads) — kept as-is; it's a pragmatic, working solution to a real browser quirk.
- **Theme handling — (aligned to lesson-001.md):** real diagrams are authored with a hand-picked `%%{init}%%` palette (a purple/dark accent scheme) baked into the source. The compiler splits this into `normalized` (the diagram body only) and `authorTheme` (the extracted `themeVariables`) — see content spec §3, Stage 2. `MermaidBlock` renders using `authorTheme` as the base palette and only swaps the small set of *structural* dark/light tokens (background, text, border contrast) via `resolvedTheme`, preserving the author's deliberate accent color rather than overriding it with a generic site-wide Mermaid theme. This is a correction from an earlier draft of this spec, which assumed diagrams had no author-authored theme config at all.
- **New**: build-time static SVG (from content pipeline §7) used as the SSR/first-paint placeholder, swapped for the live-themed version on hydration — removes the "diagram pops in" flash v1 has.

---

## 5. Component Registry (Plugin-Based — fixes limitation #1)

```ts
// registry.ts
type BlockComponent = React.LazyExoticComponent<React.ComponentType<BlockProps>>;

const registry = new Map<string, BlockComponent>();

export function registerBlock(type: string, loader: () => Promise<{ default: React.ComponentType<BlockProps> }>) {
  registry.set(type, React.lazy(loader));
}

export function useBlockComponent(type: string): BlockComponent {
  return registry.get(type) ?? registry.get('__default__')!;
}
```

```ts
// blocks/index.ts — the ONLY file touched to add a new block type
registerBlock('quiz', () => import('./quiz/QuizBlock'));
registerBlock('flashcardDeck', () => import('./flashcards/FlashcardDeckBlock'));
registerBlock('mermaid', () => import('./mermaid/MermaidBlock'));
registerBlock('glossary', () => import('./glossary/GlossaryBlock'));
registerBlock('connections', () => import('./connections/ConnectionsBlock'));
registerBlock('callout', () => import('./callout/CalloutBlock'));

// Prose section types all share one wrapper — registered once, reused across
// learningObjectives, theory, commonMistakes, mentalModel, companyExample,
// realWorldPerspective, caseStudy, framework, interviewPerspective, summary,
// keyTakeaways, cheatSheet, resources, reflection (content spec §3):
for (const type of PROSE_SECTION_TYPES) {
  registerBlock(type, () => import('./section/SectionBlock'));
}

// Future block types — not used by any lesson yet, available via the plugin system:
registerBlock('tabs', () => import('./tabs/TabsBlock'));
registerBlock('accordion', () => import('./accordion/AccordionBlock'));
registerBlock('timeline', () => import('./timeline/TimelineBlock'));
registerBlock('video', () => import('./video/VideoBlock'));
registerBlock('aiPrompt', () => import('./ai/AIPromptBlock'));

registerBlock('__default__', () => import('./default/DefaultMarkdown'));
```

Every entry is a **real `React.lazy` dynamic import** — fixing limitation #3: a text-only lesson never loads the quiz, flashcard, or video JS at all, because the registry never calls their loaders.

This registry is populated by the plugin system defined in the content pipeline spec (§6 there): a new content plugin ships its own block schema (compiler side) *and* its own registry entry (renderer side) — the two halves of one plugin, but each independently owned and testable.

---

## 6. Styling & Theming

- **Design tokens, not scattered Tailwind strings.** A single `theme/tokens.ts` defines color, spacing, radius, and shadow tokens consumed by every block component — Mermaid's theme config (dark/light variable injection) and Tailwind's `className`s both read from the *same* token source, closing the gap where v1 had Mermaid theming edited independently of the rest of the CSS.
- `next-themes` still drives dark/light mode switching (kept from v1 — it worked).
- Responsive layout utilities (`w-full`, `overflow-x-auto`, `max-w-3xl`) preserved from v1 where they were already sound.

---

## 7. Progress Tracking (New)

v1 has no concept of this at all; it's a core LMS requirement for a standalone product.

```ts
interface ProgressEvent {
  lessonId: string;
  blockId?: string;         // specific quiz/flashcard interaction, if applicable
  eventType: 'lesson_started' | 'lesson_completed' | 'quiz_answered' | 'flashcard_reviewed';
  payload?: Record<string, unknown>;
  timestamp: string;
}
```

- **Local-first**: progress events write immediately to `IndexedDB`/local storage via a `ProgressProvider` context, so the UI updates instantly and works offline.
- **Server sync**: a background sync (debounced) pushes events to a `/api/progress` endpoint; conflict resolution is last-write-wins per `(userId, lessonId, blockId)` tuple, acceptable for a linear-progress use case.
- **Resume-where-you-left-off**: the lesson route reads the last-viewed block position (via `IntersectionObserver`-tracked scroll position, throttled) and offers a "Resume" jump link.
- **Curriculum-level rollup**: the sidebar (§2.1) shows per-module completion percentage, computed client-side from the progress store against `module-graph.json`.

---

## 8. Search (New — consumes the index from content pipeline §8)

- `SearchOverlay` (triggered by `Cmd/Ctrl+K`, matching the GitBook/Docusaurus/Mintlify convention users already expect) loads the FlexSearch static index lazily on first open, not on initial page load.
- Results are block-aware: selecting a result deep-links to `(lessonId, blockId)` and the lesson route scrolls to and highlights that specific block on load.

---

## 9. AI-Powered Rendering Surface (New)

Supports the `aiPrompt` block type introduced in the content pipeline:

- `AIPromptBlock` renders a contextual action (e.g., "Explain this differently," "Quiz me on this section," "Give me a real-world example") tied to the surrounding lesson content.
- On interaction, streams a model response into the block via server-sent events / streaming fetch — rendered progressively, not as a blocking spinner-then-dump.
- **Reproducibility**: the block's `promptTemplate` (from the compiled JSON) is combined with live lesson context at request time; the *template* is versioned and content-hashed same as any other block, so "what prompt produced this" is always traceable even though the *response* is dynamic.
- **Guardrails**: prompt templates are author-defined at content-compile time, not user-freeform — keeps the surface scoped (explain/quiz-me/socratic-followup) rather than an open chat box, matching an LMS context rather than a general assistant.

---

## 10. Performance Optimizations

| Technique | Where | Why (vs. v1) |
|---|---|---|
| Dynamic `import()` per block type via registry | §5 | v1 only avoided *mounting* unused components; v2 avoids *shipping* their JS at all |
| RSC streaming of block tree | Lesson route | v1 waited for the full JSON before rendering anything; v2 paints above-the-fold blocks immediately |
| Build-time static SVG for Mermaid, hydrated client-side | MermaidBlock | Removes layout shift / pop-in that v1 has |
| Content-hashed, immutable CDN caching of `content/dist/**` | Data loading | v1 never specified a caching strategy; static+hashed JSON is trivially cacheable |
| `IntersectionObserver`-gated lazy mount for Video/heavy blocks | VideoBlock, TimelineBlock | Avoids loading video player chunks for blocks not yet scrolled to |
| FlexSearch index loaded on first search-open, not page load | SearchOverlay | Keeps initial bundle lean |
| Two-pass Mermaid SVG fix with `requestAnimationFrame` | MermaidBlock | Preserved from v1 — already correct |

---

## 11. Accessibility (Systematic, Not Ad Hoc — fixes limitation #7)

- Every interactive block type has a **documented ARIA contract** (in its own component's doc comment) reviewed against WAI-ARIA Authoring Practices: Tabs, Accordion, and Quiz all follow the standard interaction patterns (arrow-key navigation within tab lists, `aria-expanded` on accordion triggers, `aria-live="polite"` for quiz score announcements).
- Focus management: opening the Search overlay traps focus; closing it returns focus to the trigger element (a common miss in ad hoc implementations).
- Heading hierarchy is validated at compile time (content spec §9) so the renderer can trust it — no runtime hierarchy repair needed.
- Reduced-motion: flashcard flip and Mermaid pop-in animations respect `prefers-reduced-motion`.

---

## 12. Error Handling & Fallback UI Summary

1. **Block-level errors** — caught by `BlockErrorBoundary` per block (§3.1), block-type-aware fallback, structured telemetry.
2. **Mermaid rendering errors** — red-border box with raw chart source (preserved from v1, it's a good pattern).
3. **JSON validation** — enforced upstream at compile time (content spec §4), so the renderer can largely *trust* the shape of what it receives; a defensive `zod`-schema `.safeParse()` at load time catches any drift and routes to a lesson-level fallback rather than a hard crash.
4. **Network/file errors** — `fetchLessonData` 404s surfaced via Next.js `notFound()`, same as v1.
5. **AI block failures** — streaming failure shows a retry affordance inline rather than blocking the rest of the lesson.

---

## 13. Extending the Pipeline

Adding a new block type end-to-end now touches exactly **two new files** (down from three-plus scattered edits in v1):

1. **Content side**: `plugins/<type>/schema.ts` + `plugins/<type>/directive.ts` (content pipeline spec §6).
2. **Render side**: `blocks/<type>/<Type>Block.tsx` + one line in `blocks/index.ts` registering it.

No edits to `BlockTreeRenderer`, the navigation shell, progress tracking, or search — all of those are type-agnostic by construction.

---

## 14. Migration Notes (v1 → v2)

1. **Parallel route period**: stand up `app/academy/**` (v2) alongside the existing `app/pmacademy/**` (v1) routes; point v2 at content compiled by the v2 compiler (which is migrating the same source markdown — see content spec §12), so both can be QA'd side by side before cutover.
2. **Component-by-component port**: `MermaidRenderer` and `QuizRenderer` from v1 are largely reusable — port their internal logic into the new registry-based components (`MermaidBlock`, `QuizBlock`) rather than rewriting from scratch; the *wrapping* architecture changes, the *internals* mostly don't. `FlashcardRenderer` ports to `FlashcardDeckBlock` with the same internal flip logic. `GlossaryBlock` and `ConnectionsBlock` are genuinely new (v1 rendered glossary/connections tables as plain Markdown via `DefaultMarkdown`, with no cross-lesson linking or resolved navigation) — these need to be built, not ported. `CalloutBlock` also ports cleanly but isn't wired into any current lesson's data, so it has no migration urgency.
3. **Progress backfill**: since v1 tracked no progress data, there's no historical state to migrate — v2 progress tracking starts clean at cutover; communicate this to users if relevant (e.g., "your completed lessons will need to be re-marked").
4. **Redirects**: use the `legacy-id-map.json` produced in the content migration (content spec §12) to 301-redirect old `/lesson/[numeric-id]` URLs to new `/academy/l/[lessonId]` URLs.
5. **Cutover gate**: don't decommission v1 routes until the v2 sidebar navigation, search, and progress tracking have been validated against the full migrated content set — these are new surfaces with no v1 equivalent to diff against, so they need their own QA pass rather than a parity check.

---

## 15. References (New File Paths)

- **Curriculum Shell**: `app/academy/layout.tsx`
- **Lesson Route**: `app/academy/l/[lessonId]/page.tsx`
- **Lesson Data Loader**: `app/academy/l/[lessonId]/lesson-content.tsx`
- **Core Renderer**: `renderer/block-tree-renderer.tsx`
- **Component Registry**: `renderer/registry.ts`, block registrations in `blocks/index.ts`
- **Block Components**: `blocks/<type>/<Type>Block.tsx` (one folder per type)
- **Progress**: `providers/progress-provider.tsx`, `lib/progress/sync.ts`
- **Search**: `components/search-overlay.tsx`, index consumed from `content/dist/search-index.json`
- **Theme Tokens**: `theme/tokens.ts`

---
*End of specification.*

# PM Academy — Decisions Memory

> **Purpose:** A record of major technical and product decisions — what was decided, why, what alternatives were considered, and what the trade-offs were. This prevents relitigating settled decisions and explains the "why" behind the code.  
> **Part of:** the [`docs/memory/`](./) system. See [`docs/INDEX.md`](../INDEX.md) for the full documentation map.

---

## Decision Log Format

Each entry follows this structure:
- **Decision:** What was decided.
- **Status:** `Settled` | `Open` | `Deferred` | `Overturned`.
- **Rationale:** Why this choice was made.
- **Alternatives considered:** What was explicitly rejected and why.
- **Consequences:** What this decision locks in or rules out.

---

## D-001: Static-First Content Architecture

**Status:** Settled ✅

**Decision:** Lesson content (text, quiz questions, flashcards) is authored as Markdown files, compiled to static JSON at build time, and served via CDN. Content is never stored in or fetched from Supabase at runtime.

**Rationale:**
- Eliminates runtime database queries for content — fastest possible lesson load time.
- CDN-served static JSON scales to any traffic level without a DB upgrade.
- Markdown files live in Git — full version control, diff review, no CMS vendor lock-in.
- Separates content concerns (markdown + scripts) from user-state concerns (database).

**Alternatives considered:**
- **Supabase for content:** Rejected. Would require DB queries for every lesson load, create coupling between content edits and DB migrations, and add unnecessary infrastructure cost and complexity.
- **MDX with runtime parsing:** Rejected. Adds bundle weight, runtime parsing overhead, and a complex AST execution model. Static JSON is simpler and faster.
- **Headless CMS (Contentful, Sanity):** Rejected. Adds a paid dependency, vendor lock-in, and a separate authoring UI that doesn't serve a solo founder writing in a code editor.

**Consequences:**
- Content changes require a redeploy (acceptable — automated via GitHub Actions).
- Browser receives JSON; no Markdown escapes to the frontend.
- All content IDs must be stable across deploys (see D-006 for `lessonId` decision).

---

## D-002: Supabase as the Single Backend

**Status:** Settled ✅

**Decision:** Use Supabase (PostgreSQL + Auth + RLS) as the sole backend for all user-state storage, authentication, and API operations.

**Rationale:**
- Free tier covers ~5,000 MAU comfortably without upgrade.
- Built-in Auth with Email + Password and OAuth providers (Google) — no custom auth code.
- Row Level Security at the database layer means less security logic in application code.
- One deployable unit (Next.js API routes) talks to one backend — minimal operational overhead.

**Alternatives considered:**
- **PlanetScale / Neon:** Rejected. No integrated auth, adds more moving parts.
- **Firebase:** Rejected. NoSQL doesn't fit the relational nature of progress tracking; vendor lock-in; Google Analytics already covers analytics needs.
- **Custom PostgreSQL:** Rejected. Infrastructure cost and operational burden not justified for a solo founder.

**Consequences:**
- All user-state queries must go through Supabase client.
- RLS must be enabled on every user-owned table — this is a hard rule, not optional.
- `SUPABASE_SERVICE_ROLE_KEY` must never reach the browser.

---

## D-003: Next.js 16 App Router (not Pages Router)

**Status:** Settled ✅

**Decision:** Use Next.js 16 with the App Router. Server Components are the default; `"use client"` is used only where interactivity genuinely requires it.

**Rationale:**
- Server Components allow fetching data at render time on the server without shipping that fetch code to the browser — better for lesson pages that need SEO and fast initial paint.
- App Router enables collocated layouts, loading states, and error boundaries per route segment.
- Streaming via React Server Components allows above-the-fold content to render before the full lesson JSON loads.

**Alternatives considered:**
- **Pages Router:** Rejected. Lacks collocated layouts, requires `getServerSideProps` boilerplate, and doesn't support React Server Components — a significant DX regression for a new project.
- **Remix:** Rejected. Not as mature in the Next.js/Vercel hosting ecosystem; smaller library ecosystem for the chosen UI libraries.

**Consequences:**
- Components must default to Server Components — adding `"use client"` anywhere is a deliberate choice requiring justification.
- Framer Motion requires `"use client"` (it's a client animation library) — wrap it in a client boundary.
- The `useRouter`, `useState`, `useEffect` hooks are only available in client components.

---

## D-004: Append-Only XP Ledger

**Status:** Settled ✅

**Decision:** XP is never incremented directly in `users.total_xp`. Every XP-earning event writes a row to `xp_events`. A PostgreSQL trigger recomputes and updates `users.total_xp` and `users.level` from the ledger.

**Rationale:**
- Full audit trail of every XP transaction — essential for anti-gaming enforcement.
- Idempotency: re-running a trigger always produces the correct total.
- Anti-gaming: duplicate-event detection can query the ledger directly.
- Safe concurrency: `xp_events` insert is atomic; the trigger update is serialized by the DB.

**Alternatives considered:**
- **Direct increment (`UPDATE users SET total_xp = total_xp + N`):** Rejected. No audit trail, no replay capability, susceptible to race conditions under concurrent requests, and no mechanism to detect or reverse fraudulent XP.
- **Client-side XP state + periodic sync:** Rejected. Client-reported state is never trusted for anything that affects gamification integrity.

**Consequences:**
- Every feature that awards XP must call `xp-service.ts`, not write SQL directly.
- XP queries that need the "current" total read from `users.total_xp` (the cache). Queries that need to audit or verify read from `xp_events`.

---

## D-005: In-House SM-2 Implementation

**Status:** Settled ✅

**Decision:** The SM-2 spaced repetition algorithm is implemented in-house (~100 lines in `lib/srs.ts`) rather than taken as an npm dependency.

**Rationale:**
- SM-2 is a well-documented, mathematically simple algorithm — not complex enough to justify a dependency.
- In-house ownership makes it trivial to add custom XP-event logging hooks.
- Eliminates a dependency for something core to the gamification loop — removing or upgrading the algorithm later doesn't require a package migration.
- The `open-spaced-repetition/sm-2-ts` package (referenced in `GitHub-Repos-and-Starter-Kits.md`) was studied as a reference implementation and test-case source.

**Alternatives considered:**
- **`@open-spaced-repetition/sm-2` npm package:** Considered seriously. Rejected because the algorithm is simple enough that owning it directly is cleaner (no upgrade path needed, no API surface to learn, full control for instrumentation).
- **FSRS algorithm (more advanced than SM-2):** Deferred. Could upgrade in a future phase if SM-2 proves insufficient. The `open-spaced-repetition` org maintains `ts-fsrs` for this.

**Consequences:**
- `lib/srs.ts` contains pure math — no database calls, no side effects. Tests should verify the algorithm correctness directly.
- If the algorithm needs to change, it's a single well-tested file to update.

---

## D-006: Stable Compiler-Assigned `lessonId` (not slug-based references)

**Status:** Settled in spec, migration pending ⚠️

**Decision:** All user-state database columns that reference a lesson use a compiler-assigned stable base36 `lessonId` (e.g., `les_001a2b`) stored in `.ids/lesson-id-registry.json`, not the human-facing URL slug. Slugs can change when a title is edited; `lessonId` never changes once assigned.

**Rationale:**
- If `lesson_slug` is the DB key and a lesson is renamed, all user progress records for that lesson become orphaned (the slug no longer resolves to the correct lesson).
- Stable IDs allow safe lesson renames, restructuring, and reordering without a data migration.
- The content pipeline spec (`content-pipeline.md §5`) defines this as a core requirement.

**Alternatives considered:**
- **Slug-based references:** Was the v1 implementation (current codebase as of 2026-08-01). Rejected for production because it makes lesson renames a data-migration event.
- **Database-assigned UUIDs:** Rejected because the compiler needs to produce consistent IDs at build time without a DB round-trip. Build-time ID assignment via a registry file is simpler and works fully offline.

**Current state (known migration debt):** The existing Supabase migrations use `lesson_slug` columns, not `lesson_id`. This must be resolved with a roll-forward migration before any lessons are renamed or before the v2 content pipeline is deployed. See [`roadmap.md`](./roadmap.md) for the planned sequence.

**Consequences:**
- The content compiler must be the canonical source of `lessonId` values.
- The registry file (`.ids/lesson-id-registry.json`) must be committed to Git.
- A migration from `lesson_slug` → `lesson_id` is required before the v2 pipeline goes live.

---

## D-007: Cohort-Only, Opt-In, Weekly-Reset Leaderboard

**Status:** Settled ✅

**Decision:** The leaderboard is opt-in, friends/cohort-scoped (never global), and resets weekly. It ranks by consistency (days active), not raw XP.

**Rationale:**
- A global XP leaderboard is demotivating for 95% of users who will never reach the top — it works against the retention goal.
- Ranking by consistency (days active) rather than raw XP aligns the incentive with the actual product goal (daily learning habit) rather than grinding sessions.
- Opt-in prevents social pressure from making users feel surveilled.

**Alternatives considered:**
- **Global XP leaderboard:** Explicitly rejected in `PRD.md §4.10`. This decision is documented there with the demotivation rationale.

**Consequences:**
- No global leaderboard, ever, without a `PRD.md` amendment.
- The cohort/friends feature is a Phase 3 item.

---

## D-008: No AI Mentor Feature

**Status:** Settled — Cut from v1 ✅

**Decision:** The AI Mentor feature (AI-assisted feedback on reflections, adaptive quiz difficulty, explain-this functionality) is explicitly cut from v1 and will not be built until the core product proves traction.

**Rationale:**
- LLM API costs at scale (even with 5,000 users) are incompatible with the ₹0 infrastructure constraint.
- The core differentiator is structured human-authored content + gamification, not AI augmentation — shipping the AI feature before proving the core loop would be premature and expensive.
- The `PRD.md §11` Open Decisions Log records this as a resolved decision.

**Alternatives considered:**
- **Groq / low-cost LLM providers:** Considered. Still not free at non-trivial scale. Deferred to post-launch monetization phase if user data shows demand.

**Consequences:**
- No `aiPrompt` block renderers in v1 even though the content pipeline spec mentions them.
- Marketing copy must refer to "structured human-authored content," never "AI-assisted feedback."
- Any agent or contributor that proposes building this should be redirected to `PRD.md §11`.

---

## D-009: Skill Radar Scoring Formula

**Status:** Open ⚠️ — Must be resolved before Phase 2 ships

**Decision:** Not yet finalized. The 7-cluster structure and cluster labels are settled (in `lib/skillRadar.ts`). The scoring formula (how quiz scores + lesson completions translate to a `0–100` radar axis value) is unresolved.

**Options under consideration:**
- **Continuous `0–100`** per cluster, weighted by lesson completion rate and quiz score.
- **Discrete bands** (`Beginner` / `Intermediate` / `Advanced`) computed from the continuous score — cleaner UI, but loses precision for gamification.

**Required action:** Lock the formula during Phase 2 implementation. Document the decision here and in `PRD.md §4.8` and `Architecture.md §6` in the same session.

---

## D-010: v1 Content Pipeline — Use vs. Replace

**Status:** Settled — Replace with v2 ✅

**Decision:** The existing v1 content pipeline (`scripts/parse-content.ts` using string-splitting and regex) will be replaced by the v2 remark/AST-based pipeline defined in `content-pipeline.md`. The v1 pipeline is not patched — it is replaced in full.

**Rationale:**
- v1 is a string-slicer, not an AST parser. It cannot support nested blocks, stable IDs, incremental builds, per-lesson error isolation, or the plugin architecture required for future block types.
- `content-pipeline.md §0` documents all 12 specific limitations that make patching unviable.
- The v2 spec is fully implementation-ready — it was designed specifically for this codebase and content.

**Consequences:**
- All v1 script files (`scripts/parse-content.ts`, `scripts/validate-content.ts`, `scripts/generate-search-index.ts`) will be replaced.
- The output directory changes from `apps/web/public/content/` to `content/dist/`.
- The v2 build command is `content:compile` (not `content:parse`) — all CI and package.json scripts will need updating.

---

## D-011: Build-Time Static SVG Mermaid Compilation via JSDOM Layout Engine

**Status:** Settled ✅ (Sprint 7.1)

**Decision:** Render all Mermaid diagrams (code fences, `mentalModel`, and `framework` blocks) to static SVGs at `content:compile` time via `scripts/compiler/mermaid-svg.ts` using the official `mermaid` v11 engine executing inside Node.js via JSDOM.

**Rationale:**
- **Zero Runtime Overhead:** Completely eliminates the client-side Mermaid JS runtime bundle from lesson pages, reducing client bundle size and preventing hydration pop-in flashes.
- **Layout Fidelity:** Using the real `mermaid` layout engine in JSDOM preserves full 2D Dagre layout capabilities, decision diamonds, horizontal branching, curved/orthogonal arrows, sequence diagrams, and subgraphs without relying on inaccurate custom string parsers.
- **Brand Alignment:** SVGs are styled at build time using PM Academy green/white design tokens (`theme/tokens.ts`: `#FFFFFF` fills, `#166534` green borders/edges, `#1B2A21` text, `#EFF6F2` accent fills). Dark mode theme toggling is handled CSS-only via embedded `.dark` rules inside the SVG `<style>` tag.
- **Fluid Sizing:** Post-processed SVGs use fluid `viewBox` attributes and `max-width` styling inside responsive flex containers (`MermaidBlock.tsx`), scaling cleanly at 100% normal browser zoom without forced 33% zoom out or horizontal overflow.

**Alternatives Considered:**
- **Custom string-based layout algorithm:** Rejected. Lacks proper 2D Dagre layout routing, causing horizontal decision branches to stack vertically and curved arrows to break.
- **Client-side runtime rendering (`mermaid.js` in browser):** Rejected. Adds heavy JS bundle overhead, hydration delay, and theme flickering.

**Consequences:**
- Zero client-side Mermaid JS runtime shipped to the browser.
- All 90 lessons and 203 Mermaid blocks pre-rendered to SVG at build time (`content:compile`).

---

## Changelog

- v1.1 (2026-08-08) — Added D-011 (Build-Time Static SVG Mermaid Compilation via JSDOM Layout Engine).
- v1.0 (2026-08-01) — Created from information distributed across `MEMORY.md`, the project audit report, and the architecture docs. Synthesizes 10 major decisions with full rationale.

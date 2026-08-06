# PM Academy — Documentation Index

> **Start here.** This is the first document any developer, contributor, or AI agent should read. It maps the entire documentation system, explains what each document owns, defines the reading order, and resolves precedence when documents conflict.

---

## Project Overview

PM Academy is a free, structured, habit-forming curriculum for learning Product Management — 90 lessons across 9 modules, built with the gamification mechanics of Duolingo and the rigor of a business-school elective. The product is a Next.js web application running on a ₹0-at-launch infrastructure stack (Vercel + Supabase free tiers).

**Core constraint:** Solo-founder buildable, static-first architecture, targeting ~5,000 users without a paid infrastructure upgrade.

**Tech stack (locked):** Next.js 16 App Router · TypeScript 5 (strict) · Tailwind CSS v4 · shadcn/ui · Framer Motion · Supabase (PostgreSQL + Auth) · Vercel · Resend SMTP · Google Analytics.

---

## Recommended Reading Order

Read in this order before writing any code or making any product decision. Do not skip steps.

| Step | Document | Why first? |
|------|----------|------------|
| 1 | **This document** (`INDEX.md`) | Maps the system; tells you where to look for anything |
| 2 | [`CURRENT_STATUS.md`](./CURRENT_STATUS.md) | **Live Repository State:** Current branch, version, focus, active blockers, and bugs |
| 3 | [`PRD.md`](./product/PRD.md) | Defines *what* to build and *why* — the product vision, principles, and requirements |
| 4 | [`Architecture.md`](./architecture/Architecture.md) | Defines *how* the code is structured — the locked tech stack, data model, and folder layout |
| 5 | [`IMPLEMENTATION_RULES.md`](./development/IMPLEMENTATION_RULES.md) | **Developer Rules:** Pre-flight checklists, coding rules, documentation sync, and quality gates |
| 6 | [`KNOWN_ISSUES.md`](./development/KNOWN_ISSUES.md) | **Deferred Backlog & Tech Debt:** Intentionally deferred Phase 1 items and planned technical enhancements |
| 7 | [`DO_NOT_CHANGE.md`](./development/DO_NOT_CHANGE.md) | **Architectural Invariants:** Locked system paradigms (static-first, stable IDs, ledger, etc.) and rationale |
| 8 | [`Rules.md`](./development/Rules.md) | Defines *how we work* — engineering standards, coding conventions, change management |
| 9 | [`Phases.md`](./product/Phases.md) | Defines *when* things ship — the phase-by-phase sequencing and definition of done (Phases 0–3) |
| 10 | [`Roadmap.md`](./product/Roadmap.md) | **Sequencing (post-Phase-3):** launch planning and sprint scope; supersedes `Phases.md` for everything after Phase 3 |
| 11 | [`Brand-Architecture.md`](./product/Brand-Architecture.md) | **Naming & brand:** what the product is called (`Prodigy` / `PM Academy` / `Prodigy PM Academy`) and how the brand is used |
| 12 | [`Design.md`](./design/Design.md) | Defines *what it looks like* — visual language, UX patterns, screen designs |
| 13 | [`content-pipeline.md`](./architecture/content-pipeline.md) | **Deep-dive:** the authoritative compiler specification (read before any content pipeline work) |
| 14 | [`rendering-pipeline.md`](./architecture/rendering-pipeline.md) | **Deep-dive:** the authoritative renderer specification (read before any lesson UI work) |
| 15 | [`AUTH_FLOW.md`](./architecture/AUTH_FLOW.md) | **Deep-dive:** routing, redirects, callbacks, email templates, and session creation across all auth flows |
| 16 | [`Notification-Architecture.md`](./architecture/Notification-Architecture.md) | **Deep-dive:** the authoritative notification and email architecture — event system, queue, scheduler, templates, Admin Notification Center |
| 17 | [`docs/memory/`](./memory/) | **Project memory:** implementation status, decisions, pitfalls, and roadmap progress |
| 18 | [`docs/roadmap/`](./roadmap/) | **Sprint roadmap:** per-sprint scope and definition-of-done for Sprints 7.x–8.x (7.1 is the current sprint) |
| 19 | [`docs/reports/`](./reports/) | **Review reports:** architecture / product / integrity audit findings and the documentation-sync source of truth |

**For a quick orientation only** (not a substitute for full reading): read `CURRENT_STATUS.md`, `PRD.md §1`, `Architecture.md §1`, and this document's Source of Truth section below.

---

## Document Map

### Live Status & Implementation Rules

These files manage active repository metadata and enforce pre-flight standards during coding.

#### [`CURRENT_STATUS.md`](./CURRENT_STATUS.md) — Live Status & Focus
**Owns:** live branch, version, focus, active blockers, active bugs, and next planned tasks.  
**Use it:** to verify what is currently being worked on and the current build/compilation metadata. Updated after every session.

#### [`IMPLEMENTATION_RULES.md`](./development/IMPLEMENTATION_RULES.md) — Implementation Guidelines
**Owns:** coding standard directives, parity requirements, validation checklists, and documentation sync requirements.  
**Use it:** before making any changes to ensure compliance with the repository rules and build validations.

#### [`KNOWN_ISSUES.md`](./development/KNOWN_ISSUES.md) — Deferred Backlog & Tech Debt
**Owns:** list of intentionally deferred product features, planned enhancements, and non-critical technical debt.  
**Use it:** to track backlog items and plan technical debt resolutions in future sprints.

#### [`DO_NOT_CHANGE.md`](./development/DO_NOT_CHANGE.md) — Architectural Invariants
**Owns:** locked structural and database paradigms (static-first JSON, remark AST, recursive renderer, singleton clients, stable Base36 IDs, append-only XP trigger) and their underlying rationales.  
**Use it:** to verify if a refactoring pattern or library change violates the core system safety boundaries.

---

### Core Specification Documents

These seven documents are the living, authoritative source for all product and technical decisions. They cross-reference each other and must never contradict each other — if you find a conflict, resolve it immediately by updating the stale document.

#### [`PRD.md`](./product/PRD.md) — Product Requirements
**Owns:** what to build and why. Vision, positioning, user segments, product principles, feature requirements (§4), information architecture, non-functional requirements, success metrics, open decisions log.  
**Wins over:** all other documents for *product behavior* questions (what a feature should do from a user perspective).  
**Does not own:** how the code is structured, when features ship, or what it looks like.

#### [`Architecture.md`](./architecture/Architecture.md) — Technical Architecture
**Owns:** the locked tech stack (§1), data model / DB schema (§2), folder structure (§3), content system summary (§4), business logic modules (§6), deployment pipeline (§8), security / RLS (§9).  
**Wins over:** all other documents for *technical implementation* questions.  
**Important:** §4 and §5 of Architecture.md summarize the content and rendering systems but explicitly defer to `content-pipeline.md` and `rendering-pipeline.md` for authoritative detail — if those two conflict with Architecture.md, **the pipeline specs win**.

#### [`Rules.md`](./development/Rules.md) — Engineering & Process Rules
**Owns:** coding standards (§3), content authoring rules (§4), gamification implementation constraints (§5), decision-making rules (§6), change management process (§7), AI-assisted development norms (§8).  
**Use it:** as the operating manual for *how* to work on this codebase, regardless of what you're building.

#### [`Phases.md`](./product/Phases.md) — Phased Roadmap
**Owns:** phase definitions, scope, explicit exclusions, and definition-of-done for each development phase (Phases 0–5+ and post-launch).  
**Use it:** to determine what the project is currently working on and what "done" means for this phase before starting any work.

#### [`Roadmap.md`](./product/Roadmap.md) — Launch & Sprint Roadmap
**Owns:** post-Phase-3 sequencing, launch planning, and sprint scope (Sprints 7.x–8.x). States that it supersedes `Phases.md` for everything after Phase 3.  
**Use it:** to determine the current sprint, the sprint backlog, and what comes next after Phase 3 work completes.

#### [`Brand-Architecture.md`](./product/Brand-Architecture.md) — Brand & Naming
**Owns:** the brand architecture (`Prodigy` parent brand, `PM Academy` product, `Prodigy PM Academy` formal name), product naming rules, logo usage, and social handle/brand-consistency rules (Sprint 7.1 deliverable).  
**Wins over:** all other documents for naming and brand-consistency questions.

#### [`Design.md`](./design/Design.md) — Visual Design & UX
**Owns:** design direction and positioning (§1), core screen build order (§2), gamification UI spec (§3), performance and accessibility budgets (§4), marketing site content and SEO strategy (§6).  
**Wins over:** all other documents for visual/UX decisions.  
**Note:** The `archive/` folder contains three older Sprint design docs (Design-System-Sprint-1, Marketing-Website-Sprint-2, Content-Communication-System-Sprint-3). These are **not authoritative** — `Design.md` is the single authoritative design doc. The archived files are reference-only and may be stale.

---

### Authoritative Architecture Specs (Pipeline Documents)

These two documents are the definitive implementation blueprints for the content compiler and lesson renderer. They supersede any conflicting description in Architecture.md, PRD.md, or Rules.md on their specific topics.

#### [`content-pipeline.md`](./architecture/content-pipeline.md) — Content Compiler Specification v2
**Status:** Implementation-ready blueprint.  
**Owns:** the complete Markdown → AST → Block JSON → Search Index pipeline architecture. This includes: why v1 is being replaced (§0), the remark-based AST parser (§1–§2), the complete block taxonomy (§3), the Zod validation schema (§4), the stable `lessonId` registry system (§5), the plugin API for new block types (§6), the asset pipeline (§7), the FlexSearch search indexer (§8), the incremental build cache strategy (§9), and the CI/CD integration (§11).  
**Wins over:** Architecture.md §4 on any content pipeline implementation detail.  
**Read this before:** writing any content pipeline code, adding a new block type, changing the lesson schema, or modifying any file in `scripts/`.

#### [`rendering-pipeline.md`](./architecture/rendering-pipeline.md) — Rendering Pipeline Specification v2
**Status:** Implementation-ready blueprint.  
**Owns:** the Block JSON → React Component → Interactive UI rendering architecture. This includes: why v1 is being replaced (§0), the curriculum shell layout (`app/academy/layout.tsx`) and lesson route (`app/academy/l/[lessonId]/page.tsx`) (§2), the `BlockTreeRenderer` recursive component (§3), the plugin-based component registry (§4), the specialized block components (§5), theming contract (§6), progress tracking (§7), the search overlay (§8), accessibility (§9), and error boundaries (§10).  
**Wins over:** Architecture.md §5 on any renderer implementation detail.  
**Depends on:** `content-pipeline.md` (produces the Block JSON this spec consumes).  
**Read this before:** building any lesson UI, adding block-type renderers, or working in `app/academy/`.

---

### Operational Guides

#### [`AUTH_FLOW.md`](./architecture/AUTH_FLOW.md) — Authentication Flow Specification
**Owns:** routing, redirects, callbacks, email templates, and session creation across all auth flows.  
**Use it:** to verify callback parameters and redirect destinations for OAuth, password resets, signup, and login flows.

#### [`Notification-Architecture.md`](./architecture/Notification-Architecture.md) — Notification & Communication Architecture
**Owns:** the complete notification system design — 30+ typed learning events, 25+ email templates across 6 categories, PostgreSQL-backed queue with priority levels and dead-letter handling, Vercel cron scheduler with timezone-aware delivery, exponential backoff retry strategy, per-user rate limiting, full user notification preference model, React Email template system, Admin Notification Center specification (6 views), database schema, and Sprint 6 implementation roadmap.  
**Use it:** before writing any email, notification, or communication code. This is the single source of truth for all PM Academy communications.

#### [`Supabase-Migration-Guide.md`](./architecture/Supabase-Migration-Guide.md) — Database Migration Runbook
**Owns:** the safe workflow for making database schema changes via Supabase CLI. This is a *how-to* document, not a *what* document — the schema itself is defined in `Architecture.md §2`.  
**Critical rule it enforces:** Never run manual DDL in the Supabase Dashboard SQL Editor. All changes via migration files. RLS must ship in the same migration as the table it protects.

#### [`GitHub-Repos-and-Starter-Kits.md`](./development/GitHub-Repos-and-Starter-Kits.md) — Reference Implementations
**Owns:** curated list of open-source starter kits and reference implementations for the exact tech stack (Next.js + Supabase + shadcn/ui). Useful for cherry-picking patterns; not for wholesale adoption.  
**Status:** Treat as a reference list, not an authoritative architectural source. Re-verify repo freshness before using any reference.

---

### Roadmap & Reports

#### [`docs/roadmap/`](./roadmap/) — Sprint Roadmap
**Owns:** per-sprint scope, deliverables, definition-of-done, and out-of-scope notes for Sprints 7.x–8.x. `Sprint-7.1-Global-Branding-Documentation.md` is the current sprint; `Sprint-7.2` through `Sprint-8.6` are the queued backlog.  
**Use it:** to determine the active sprint and its acceptance criteria before starting sprint work.

#### [`Architecture-Review-Report.md`](./reports/Architecture-Review-Report.md) — Architecture Audit
**Owns:** architecture audit findings and recommendations, including the build-time Mermaid→SVG rendering recommendation (§6) that Sprint 7.1 deliverable 5 tracks.  
**Use it:** as the audit source for architecture-level recommendations and their sprint assignments.

#### [`Product-Review-Report.md`](./reports/Product-Review-Report.md) — Product Audit
**Owns:** product-level review findings and recommendations.  
**Use it:** as the audit source for product decisions and their sprint assignments.

#### [`Documentation-Synchronization-Report.md`](./reports/Documentation-Synchronization-Report.md) — Doc-Sync Source of Truth
**Owns:** the documentation-consistency work items (§1 Critical) that Sprint 7.1 implements.  
**Use it:** to verify the documentation-synchronization backlog before making doc changes.

#### [`Documentation-Integrity-Report.md`](./reports/Documentation-Integrity-Report.md) — Documentation Integrity Audit
**Owns:** documentation integrity audit findings (link rot, stale cross-references).  
**Use it:** for doc-quality issues during any documentation pass.

### Project Memory System

The memory system lives under [`docs/memory/`](./memory/) and is the project's long-term knowledge base. It is split by concern to keep each file focused and easy to scan.

| File | Contains |
|------|---------|
| [`memory/architecture.md`](./memory/architecture.md) | Core architectural invariants, system design decisions, technology choices and their rationale |
| [`memory/implementation.md`](./memory/implementation.md) | Current implementation status, completed sprints, important implementation details, directory layout |
| [`memory/decisions.md`](./memory/decisions.md) | Major technical and product decisions, trade-offs considered, accepted vs. rejected approaches |
| [`memory/mistakes.md`](./memory/mistakes.md) | Known pitfalls, previous implementation mistakes, things to avoid repeating |
| [`memory/roadmap.md`](./memory/roadmap.md) | High-level phase progress, remaining work, future direction |

The root [`MEMORY.md`](../MEMORY.md) is a lightweight index into this system — read it for a quick orientation, then follow its links to the detailed files.

---

### Archived Documents

The [`archive/`](./archive/) folder contains superseded documents kept for historical reference only:

| File | Superseded By |
|------|--------------|
| `archive/02-PM-Academy-0-to-1-Roadmap.md` | `Phases.md` |
| `archive/Design-System-Sprint-1.md` | `Design.md` |
| `archive/Marketing-Website-Sprint-2.md` | `Design.md` |
| `archive/Content-Communication-System-Sprint-3.md` | `Design.md` |

**Never update the archive files.** If you find useful granular detail there (pixel values, specific copy lines), mine it for the live doc. The archive files may be stale and should not be treated as authoritative.

---

## Source of Truth — Conflict Resolution

When two documents appear to say different things, apply these rules in order:

1. **Product behavior** (what a feature does for users) → `PRD.md` wins.
2. **Content pipeline implementation** (parser, block schema, validation, IDs, search indexer) → `content-pipeline.md` wins, even over `Architecture.md §4`.
3. **Rendering implementation** (route structure, component registry, block renderers, curriculum shell) → `rendering-pipeline.md` wins, even over `Architecture.md §5`.
4. **Technical implementation** (everything else — data model, API design, folder structure, stack choices) → `Architecture.md` wins.
5. **Visual/UX decisions** → `Design.md` wins.
6. **Process and standards** → `Rules.md` wins.
7. **Sequencing and definition of done** → `Phases.md` wins.

> [!IMPORTANT]
> **If you find a genuine conflict between documents**, do not silently pick one interpretation and proceed. Update the stale document to match the correct one, then make your code change. Per `Rules.md §7.5`: never let two documents contradict each other.

---

## Key Non-Negotiables (Quick Reference)

For a full list, see `Rules.md` and `Architecture.md`. The most critical invariants that every contributor must internalize:

1. **Markdown is the single source of truth for lesson content.** Never store lesson text, quiz questions, or flashcard data in Supabase. Content lives in `content/` as `.md` files, compiled to static JSON at build time.
2. **Supabase stores user state only.** Auth, profiles, progress, XP events, quiz attempts, flashcard SRS state, streaks, reflections, bookmarks.
3. **XP is append-only.** Write to `xp_events` first; a trigger recomputes the cached `total_xp`. Never increment `users.total_xp` directly.
4. **RLS on every user-owned table.** Policy: `user_id = auth.uid()`. Ships in the same migration file as the table.
5. **No AI Mentor feature.** Cut from v1 — see `PRD.md §11`. Do not build it.
6. **No dark patterns.** No purchasable streaks, no paywalled lessons, no artificial urgency.
7. **Deploy through the pipeline.** GitHub → GitHub Actions → Vercel. No manual deployments.
8. **`SUPABASE_SERVICE_ROLE_KEY` is server-only.** Never expose to the browser.

---

## Changelog

- v1.3 (2026-08-06) — Sprint 7.1 doc-sync pass: added `docs/roadmap/` (step 18) and `docs/reports/` (step 19) to the reading order and a new "Roadmap & Reports" section to the Document Map.
- v1.2 (2026-08-06) — Documentation structure pass: rewrote all links to match the new subfolder layout (`product/`, `architecture/`, `development/`, `design/`, `roadmap/`, `reports/`). Added `Roadmap.md` (reading order step 10) and `Brand-Architecture.md` (step 11) to the reading order and Document Map (Core Specification Documents).
- v1.1 (2026-08-05) — Added `Notification-Architecture.md` to reading order (step 14), document map (Operational Guides), and shifted memory system to step 15. Registered notification architecture as the authoritative source for all communication system work.
- v1.0 (2026-08-01) — Initial creation. Establishes the documentation entry point, reading order, document map, source-of-truth conflict resolution rules, and links to the new memory system under `docs/memory/`.

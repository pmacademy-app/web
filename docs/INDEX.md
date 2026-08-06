# Prodigy PM Academy — Documentation Index

> **Start here.** This is the first document any developer, contributor, or AI agent should read. It maps the entire documentation system, explains what each document owns, defines the reading order, and resolves precedence when documents conflict.

---

## Project Overview

Prodigy PM Academy is a free, structured, habit-forming curriculum for learning Product Management — 90 lessons across 9 modules, built with the gamification mechanics of Duolingo and the rigor of a business-school elective. The product is a Next.js web application running on a ₹0-at-launch infrastructure stack (Vercel + Supabase free tiers). See `Brand-Architecture.md` for the full naming system (`Prodigy` / `PM Academy` / `Prodigy PM Academy`).

**Core constraint:** Solo-founder buildable, static-first architecture, targeting ~5,000 users without a paid infrastructure upgrade.

**Tech stack (locked):** Next.js 16 App Router · TypeScript 5 (strict) · Tailwind CSS v4 · shadcn/ui · Framer Motion · Supabase (PostgreSQL + Auth) · Vercel · Resend SMTP · Google Analytics.

**Where the project is right now:** `v1.0.0-rc1`. Phases 0–3 (Foundation through Depth & Retention) are complete. Active work is Phase 3.7 (Product Completion, Sprints 7.1–7.6) leading into Phase 4 (Public Launch Preparation, Sprints 8.1–8.6). See `Roadmap.md`.

---

## Recommended Reading Order

Read in this order before writing any code or making any product decision. Do not skip steps.

| Step | Document | Why first? |
|------|----------|------------|
| 1 | **This document** (`INDEX.md`) | Maps the system; tells you where to look for anything |
| 2 | [`CURRENT_STATUS.md`](./CURRENT_STATUS.md) | **Live Repository State:** current branch, version, focus, active blockers, and bugs |
| 3 | [`PRD.md`](./PRD.md) | Defines *what* to build and *why* — product vision, principles, requirements |
| 4 | [`Architecture.md`](./Architecture.md) | Defines *how* the code is structured — locked tech stack, data model, folder layout, and **§0: the precise scope of what's frozen vs. open for redesign** |
| 5 | [`Brand-Architecture.md`](./Brand-Architecture.md) | Defines the brand system — `Prodigy` / `PM Academy` naming, centralized config, logo strategy |
| 6 | [`Roadmap.md`](./Roadmap.md) | Defines *when* things ship from Phase 3.7 onward — sprint sequencing, goals, DoD (supersedes `Phases.md` for this range) |
| 7 | [`IMPLEMENTATION_RULES.md`](./IMPLEMENTATION_RULES.md) | **Developer Rules:** pre-flight checklists, coding rules, documentation sync, quality gates |
| 8 | [`KNOWN_ISSUES.md`](./KNOWN_ISSUES.md) | **Deferred Backlog & Tech Debt:** open items only — resolved items moved to §1 as of the Sprint 7.1 sweep |
| 9 | [`DO_NOT_CHANGE.md`](./DO_NOT_CHANGE.md) | **Architectural Invariants:** locked system paradigms (static-first, stable IDs, ledger, RLS, etc.) — read alongside `Architecture.md §0` for the current, precise scope |
| 10 | [`Rules.md`](./Rules.md) | Defines *how we work* — engineering standards, coding conventions, change management |
| 11 | [`Design.md`](./Design.md) | Defines *what it looks like* — unified visual language across Learner/Admin/Marketing/Certificates/Emails/Notification Panel/Settings |
| 12 | [`content-pipeline.md`](./content-pipeline.md) | **Deep-dive:** the authoritative compiler specification (frozen scope — read before any content pipeline work) |
| 13 | [`rendering-pipeline.md`](./rendering-pipeline.md) | **Deep-dive:** the authoritative renderer specification (frozen scope — read before any lesson UI work) |
| 14 | [`AUTH_FLOW.md`](./AUTH_FLOW.md) | **Deep-dive:** routing, redirects, callbacks, email templates, session creation across all auth flows |
| 15 | [`Notification-Architecture.md`](./Notification-Architecture.md) + [`Notification-Architecture-Addendum.md`](./Notification-Architecture-Addendum.md) | **Deep-dive:** the authoritative notification/email architecture, plus this phase's additive changes (new events, Admin Communications merge, Notification Panel UX) |
| 16 | [`Security-Threat-Model.md`](./Security-Threat-Model.md) | **New this phase:** explicit threats and mitigations across auth, RBAC, RLS, API validation, secrets, rate limiting, headers, audit logging |
| 17 | [`Performance-Budget-Checklist.md`](./Performance-Budget-Checklist.md) | **New this phase:** per-page-type, dated, pass/fail performance and accessibility verification |
| 18 | [`docs/sprints/`](./sprints/) | Full per-sprint specs (Sprint 7.1–7.6, 8.1–8.6) — goal, deliverables, UI/backend/DB/API impact, testing checklist, DoD, out of scope, risks, future extensions |
| 19 | [`docs/memory/`](./memory/) | **Project memory:** implementation status, decisions, pitfalls, roadmap progress |

**For a quick orientation only** (not a substitute for full reading): read `CURRENT_STATUS.md`, `PRD.md §1`, `Architecture.md §0`–`§1`, and this document's Source of Truth section below.

**For understanding the reasoning behind this phase's changes specifically**, read `Documentation-Synchronization-Report.md`, `Architecture-Review-Report.md`, and `Product-Review-Report.md` — these three documents record what was found stale/contradictory, what was redesigned and why, and what was simplified or deliberately not built.

---

## Document Map

### Live Status & Implementation Rules

#### [`CURRENT_STATUS.md`](./CURRENT_STATUS.md) — Live Status & Focus
**Owns:** live branch, version, focus, active blockers, active bugs, next planned tasks. Updated after every session.

#### [`IMPLEMENTATION_RULES.md`](./IMPLEMENTATION_RULES.md) — Implementation Guidelines
**Owns:** coding standard directives, parity requirements, validation checklists, documentation sync requirements.

#### [`KNOWN_ISSUES.md`](./KNOWN_ISSUES.md) — Deferred Backlog & Tech Debt
**Owns:** open technical debt only (resolved items archived within the file itself, §1, as of the Sprint 7.1 sweep).

#### [`DO_NOT_CHANGE.md`](./DO_NOT_CHANGE.md) — Architectural Invariants
**Owns:** locked structural and database paradigms and their rationale. **Read alongside `Architecture.md §0`**, which is now the precise, current statement of what's frozen vs. explicitly open for this phase's redesign work.

---

### Core Specification Documents

These documents are the living, authoritative source for product and technical decisions. They cross-reference each other and must never contradict each other — if you find a conflict, resolve it immediately by updating the stale document (`Rules.md §7.5`).

#### [`PRD.md`](./PRD.md) — Product Requirements
**Owns:** what to build and why — vision, positioning, feature requirements (§4, including this phase's Certificates 2.0/Settings 2.0/Feedback System/Admin reorganization), non-functional requirements, explicitly cut features (§11).
**Wins over:** all other documents for *product behavior* questions.

#### [`Architecture.md`](./Architecture.md) — Technical Architecture
**Owns:** **§0 — the precise, narrowed scope of the freeze** (read this first); the locked tech stack (§1), data model (§2, including `testimonials` and `certificates.template_version` added this phase), folder structure (§3), content system summary (§4), business logic modules (§6), deployment pipeline (§8), security summary (§9 — detailed in `Security-Threat-Model.md`).
**Wins over:** all other documents for *technical implementation* questions, except where §4/§5 explicitly defer to the pipeline specs.

#### [`Brand-Architecture.md`](./Brand-Architecture.md) — Brand System
**Owns:** the `Prodigy` / `PM Academy` brand structure, naming conventions per context, the centralized `lib/brand.ts` config contract, and the two-variant logo strategy (static asset vs. `BrandLogo` React component).
**Wins over:** all other documents for brand-naming and logo-usage questions.

#### [`Roadmap.md`](./Roadmap.md) — Phased Roadmap (Phase 3.7 → Launch)
**Owns:** sprint sequencing, goals, and DoD for Phase 3.7 onward. **Supersedes `Phases.md`** for this range — `Phases.md` (archived) remains authoritative for Phases 0–3 history and for the unchanged Phase 5 launch-week plan it originally defined.

#### [`Rules.md`](./Rules.md) — Engineering & Process Rules
**Owns:** coding standards, content authoring rules, gamification implementation constraints, decision-making rules, change management, AI-assisted development norms.

#### [`Design.md`](./Design.md) — Visual Design & UX
**Owns:** the unified design-token system (§1) and its application across every surface — Learner, Admin, Marketing, Certificates, Emails, Notification Panel, Settings (§5–§10) — plus the performance/accessibility budget (§4, enforced via `Performance-Budget-Checklist.md`).
**Wins over:** all other documents for visual/UX decisions.

---

### This Phase's Review Documents

Read these to understand *why* the current documentation looks the way it does, not just *what* it says.

#### [`Documentation-Synchronization-Report.md`](./Documentation-Synchronization-Report.md)
What was found stale or contradictory across the doc set before this rewrite, and how each was resolved.

#### [`Architecture-Review-Report.md`](./Architecture-Review-Report.md)
The architectural reasoning behind every redesign decision this phase — the narrowed freeze, Admin IA, Notification/Settings/Certificate decisions, and the Mermaid build-time move.

#### [`Product-Review-Report.md`](./Product-Review-Report.md)
Simplifications adopted, features kept as-is, new features assessed against a "should we build this" test, and what was explicitly rejected or deferred.

---

### Authoritative Architecture Specs (Pipeline Documents)

Unchanged this phase — frozen per `Architecture.md §0`.

#### [`content-pipeline.md`](./content-pipeline.md) — Content Compiler Specification v2
**Owns:** the Markdown → AST → Block JSON → Search Index pipeline, plus the additive Mermaid-to-static-SVG compiler stage added in Sprint 7.1. **Wins over** `Architecture.md §4`.

#### [`rendering-pipeline.md`](./rendering-pipeline.md) — Rendering Pipeline Specification v2
**Owns:** the Block JSON → React Component → Interactive UI rendering architecture, including the `SearchOverlay` enabled in Sprint 8.2. **Wins over** `Architecture.md §5`.

---

### Operational Guides

#### [`AUTH_FLOW.md`](./AUTH_FLOW.md) — Authentication Flow Specification
Unchanged this phase — genuinely current as of its last update.

#### [`Notification-Architecture.md`](./Notification-Architecture.md) — Notification & Communication Architecture (base spec)
**Owns:** the complete notification system — event registry, queue, scheduler, retry, preferences, templates, Admin Notification Center. **Read alongside** [`Notification-Architecture-Addendum.md`](./Notification-Architecture-Addendum.md), which documents this phase's additive changes (new event types, the Admin "Communications" merge, and the Notification Panel UX change) without altering the base architecture.

#### [`Security-Threat-Model.md`](./Security-Threat-Model.md) — Security Threat Model *(new)*
**Owns:** explicit threats and mitigations across authentication, authorization/RBAC, RLS, API validation, secrets, rate limiting, headers, and audit logging, each with a verification status.

#### [`Performance-Budget-Checklist.md`](./Performance-Budget-Checklist.md) — Performance & Accessibility Budget *(new)*
**Owns:** the per-page-type, dated, pass/fail record against the Lighthouse ≥ 90 / WCAG AA targets defined in `Design.md §4`. Updated in place through Sprints 7.5, 8.5, and 8.6.

#### [`Supabase-Migration-Guide.md`](./Supabase-Migration-Guide.md) — Database Migration Runbook
Unchanged — the safe workflow for schema changes. Never run manual DDL in the Supabase Dashboard.

#### [`GitHub-Repos-and-Starter-Kits.md`](./GitHub-Repos-and-Starter-Kits.md) — Reference Implementations
Unchanged — reference-only, not authoritative.

---

### Sprint Specifications

[`docs/sprints/`](./sprints/) holds the full spec for every sprint in `Roadmap.md`: goal, deliverables, UI/backend/database/API impact, testing checklist, definition of done, out of scope, risks, and future extensions.

| Sprint | File |
|---|---|
| 7.1 — Global Branding & Documentation | `sprints/Sprint-7.1-Global-Branding-Documentation.md` |
| 7.2 — Settings 2.0 | `sprints/Sprint-7.2-Settings-2.0.md` |
| 7.3 — Certificate System 2.0 | `sprints/Sprint-7.3-Certificate-System-2.0.md` |
| 7.4 — Admin Console Polish | `sprints/Sprint-7.4-Admin-Console-Polish.md` |
| 7.5 — Security & Performance | `sprints/Sprint-7.5-Security-Performance.md` |
| 7.6 — Dashboard & Learning Experience | `sprints/Sprint-7.6-Dashboard-Learning-Experience.md` |
| 8.1 — Marketing Website v2 | `sprints/Sprint-8.1-Marketing-Website-v2.md` |
| 8.2 — Marketing Content & SEO | `sprints/Sprint-8.2-Marketing-Content-SEO.md` |
| 8.3 — Legal & Support | `sprints/Sprint-8.3-Legal-Support.md` |
| 8.4 — Notification UX | `sprints/Sprint-8.4-Notification-UX.md` |
| 8.5 — Mobile Experience | `sprints/Sprint-8.5-Mobile-Experience.md` |
| 8.6 — Public Launch QA | `sprints/Sprint-8.6-Public-Launch-QA.md` |

---

### Project Memory System

| File | Contains |
|------|---------|
| [`memory/architecture.md`](./memory/architecture.md) | Core architectural invariants, system design decisions, technology choices and rationale |
| [`memory/implementation.md`](./memory/implementation.md) | Implementation status, completed sprints, directory layout |
| [`memory/decisions.md`](./memory/decisions.md) | Major technical/product decisions, trade-offs, accepted vs. rejected approaches |
| [`memory/mistakes.md`](./memory/mistakes.md) | Known pitfalls, previous implementation mistakes |
| [`memory/roadmap.md`](./memory/roadmap.md) | High-level phase progress — **corrected this phase** to match `CURRENT_STATUS.md`'s RC1 reality; see its own changelog |

The root `MEMORY.md` is a lightweight index into this system.

---

### Archived Documents

The [`archive/`](./archive/) folder contains superseded documents kept for historical reference only:

| File | Superseded By |
|------|--------------|
| `archive/Phases.md` | `Roadmap.md`, for Phase 3.7 onward (Phases 0–3 history and the Phase 5 launch plan remain accurate as archived) |
| `archive/02-PM-Academy-0-to-1-Roadmap.md` | `Phases.md` (which is now itself archived, see above) |
| `archive/Design-System-Sprint-1.md` | `Design.md` |
| `archive/Marketing-Website-Sprint-2.md` | `Design.md` |
| `archive/Content-Communication-System-Sprint-3.md` | `Design.md` |

**Never update the archive files.** If useful granular detail lives there, mine it for the live doc.

---

## Source of Truth — Conflict Resolution

When two documents appear to say different things, apply these rules in order:

1. **Product behavior** → `PRD.md` wins.
2. **What's frozen vs. open for redesign** → `Architecture.md §0` wins.
3. **Content pipeline implementation** → `content-pipeline.md` wins, even over `Architecture.md §4`.
4. **Rendering implementation** → `rendering-pipeline.md` wins, even over `Architecture.md §5`.
5. **Notification/communication implementation** → `Notification-Architecture.md` + `Notification-Architecture-Addendum.md` win, even over `Architecture.md`.
6. **Technical implementation** (everything else) → `Architecture.md` wins.
7. **Visual/UX decisions** → `Design.md` wins.
8. **Brand naming/logo usage** → `Brand-Architecture.md` wins.
9. **Process and standards** → `Rules.md` wins.
10. **Sequencing and definition of done** → `Roadmap.md` wins for Phase 3.7 onward; archived `Phases.md` remains the historical record for Phases 0–3.

> [!IMPORTANT]
> **If you find a genuine conflict between documents**, do not silently pick one interpretation and proceed. Update the stale document to match the correct one, then make your code change. Per `Rules.md §7.5`: never let two documents contradict each other.

---

## Key Non-Negotiables (Quick Reference)

For the full list, see `Rules.md`, `Architecture.md §0`, and `DO_NOT_CHANGE.md`. The most critical invariants every contributor must internalize:

1. **Markdown is the single source of truth for lesson content.** Never store lesson text, quiz questions, or flashcard data in Supabase.
2. **Supabase stores user state only.**
3. **XP is append-only.** Write to `xp_events` first; never increment `users.total_xp` directly — this now also governs Settings 2.0's reset actions (§4 of `Architecture-Review-Report.md`), which must write ledger records, not raw deletes.
4. **RLS on every user-owned table**, including `testimonials` (added Sprint 7.4). Policy: `user_id = auth.uid()`. Ships in the same migration file as the table.
5. **No AI Mentor feature.** Cut from v1, reaffirmed this phase (`PRD.md §11`, `Product-Review-Report.md §4`). Do not build it.
6. **No dark patterns.** No purchasable streaks, no paywalled lessons, no artificial urgency, no global leaderboard.
7. **Deploy through the pipeline.** GitHub → GitHub Actions → Vercel. No manual deployments.
8. **`SUPABASE_SERVICE_ROLE_KEY` is server-only.** Never expose to the browser — verified explicitly in `Security-Threat-Model.md §3`.
9. **Content compiler, renderer, `lessonId`/`blockId` addressing, and the XP ledger are frozen** (`Architecture.md §0`) — everything else (Admin, Notifications UX, Settings, Certificates, Marketing, Design System) is open for this phase's redesign work.

---

## Changelog

- v2.0 (2026-08-06, Sprint 7.1) — Full rebrand and reading-order update for Phase 3.7. Added `Brand-Architecture.md`, `Roadmap.md`, `Documentation-Synchronization-Report.md`, `Architecture-Review-Report.md`, `Product-Review-Report.md`, `Security-Threat-Model.md`, `Performance-Budget-Checklist.md`, `Notification-Architecture-Addendum.md`, and `docs/sprints/` to the reading order and document map. Archived `Phases.md`; repointed all references accordingly. Added conflict-resolution rules for the frozen-scope (§0) and brand/notification-addendum precedence.
- v1.1 (2026-08-05) — Added `Notification-Architecture.md` to reading order.
- v1.0 (2026-08-01) — Initial creation.

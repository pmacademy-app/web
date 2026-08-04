# PM Academy — Project Memory Index

**Last Updated:** 2026-08-05  
**Project Stage:** Phase 2 Complete (v0.2.0-phase2-complete)

This file is a **lightweight index** into the full memory system under `docs/memory/`. Read this first for a quick orientation, then follow the links for detailed context.

---

## Quick Orientation

PM Academy is a free, structured, gamified Product Management curriculum — 90 lessons across 9 modules, built as a Next.js 16 App Router application on a ₹0-at-launch infrastructure stack.

**Current state:** Phase 2 (Gamification & Retention Engines) is fully completed, integrated, tested, and verified (`v0.2.0-phase2-complete`). Sprints 1 through 5 (XP Engine, Timezone-Aware Streak Engine, Continuous 0–100 Skill Radar Engine, Dashboard 2.0, and SM-2 Flashcard Review Hub) are operational with 100% test pass rates and clean Next.js production builds. The repository is ready to begin Phase 3 (Social & Portfolio Infrastructure).

---

## Memory System

The project memory is split into focused files to prevent any single file from becoming unwieldy:

| File | What it contains |
|------|----------------|
| [`docs/memory/architecture.md`](docs/memory/architecture.md) | Core architectural invariants, locked tech stack, data model contracts, security rules, business logic module map, deployment architecture |
| [`docs/memory/implementation.md`](docs/memory/implementation.md) | Current implementation status by feature, completed sprint work, directory layout, current routing structure, build verification status |
| [`docs/memory/decisions.md`](docs/memory/decisions.md) | Major technical and product decisions with rationale, alternatives considered, and consequences |
| [`docs/memory/mistakes.md`](docs/memory/mistakes.md) | Known pitfalls, previous implementation mistakes, concrete "do not repeat" guidance |
| [`docs/memory/roadmap.md`](docs/memory/roadmap.md) | Phase-by-phase progress tracking, remaining work, milestone checklist, recommended execution sequence |

---

## Documentation Entry Point

For the full documentation map (reading order, document authority hierarchy, source-of-truth rules), see:

**→ [`docs/INDEX.md`](docs/INDEX.md)**

This is the first document any developer or AI agent should read before starting work.

---

## Non-Negotiables (5-Second Reference)

1. Lesson content → Markdown files in `content/`, compiled to static JSON. Never in Supabase.
2. Supabase → user state only (auth, profiles, progress, XP, streaks, reflections).
3. XP is append-only → write `xp_events`, never increment `users.total_xp` directly.
4. RLS on every user-owned table → same migration file as the table.
5. No AI Mentor feature — cut from v1, see `docs/PRD.md §11`.
6. No dark patterns — no purchasable streaks, no paywalled lessons.
7. Deploy through the pipeline → GitHub → Actions → Vercel only.
8. `SUPABASE_SERVICE_ROLE_KEY` is server-only — never in the browser.

Full rules: [`docs/Rules.md`](docs/Rules.md) | Full architecture: [`docs/Architecture.md`](docs/Architecture.md)

---

## Tech Stack (Locked)

Next.js 16 (App Router) · TypeScript 5 (strict) · Tailwind CSS v4 · shadcn/ui · Framer Motion  
Supabase (PostgreSQL + Auth) · Vercel · Resend SMTP · Google Analytics

Full stack table with free-tier ceilings: [`docs/Architecture.md §1`](docs/Architecture.md)

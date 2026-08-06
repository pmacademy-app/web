# PM Academy — Architectural Memory

> **Purpose:** The settled, invariant core of the system — decisions made deliberately for a solo-founder, ₹0-infra context that must not be changed without an explicit, documented reason.  
> **Part of:** the [`docs/memory/`](./) system. See [`docs/INDEX.md`](../INDEX.md) for the full documentation map.

---

## 1. System Design Principles

These are the load-bearing design principles every architectural choice in this codebase was optimized around:

| Principle | Statement | Consequence |
|-----------|-----------|-------------|
| **Static-first** | Lesson content is pre-generated JSON served via CDN; zero runtime Markdown parsing | Fast, cheap, and scalable without a server upgrade |
| **Supabase = user state only** | PostgreSQL via Supabase never stores lesson content, quiz questions, or flashcard data | Content can change without touching the DB; schema stays simple |
| **₹0 at launch** | Every infrastructure choice must have a free tier sufficient for ~5,000 users | Forces architectural discipline; removes the "throw hardware at it" escape hatch |
| **Solo-founder maintainable** | Any engineer (or AI assistant with no prior context) must be able to understand a module in 5 minutes | Favors boring technology, explicit contracts, small focused files |
| **Append-only XP ledger** | `xp_events` is the source of truth; `users.total_xp` is a recomputed cache | Audit trail, anti-gaming, and safe concurrency by construction |

---

## 2. Locked Tech Stack

The stack below is **locked**. Do not swap components without updating `Architecture.md §1` and adding a documented rationale.

| Layer | Choice | Free-tier ceiling |
|-------|--------|------------------|
| Frontend framework | Next.js 16 (App Router) + TypeScript 5 (strict) | N/A — framework is free |
| Styling | Tailwind CSS v4 + shadcn/ui | N/A — open source |
| Animations | Framer Motion | N/A — open source |
| Content authoring | Markdown (90 source files in `content/`) | N/A — files in repo |
| Content delivery | Pre-generated JSON → Vercel Edge CDN | N/A — static files |
| Backend / API | Next.js API routes | N/A — same host as frontend |
| Database | PostgreSQL via Supabase | 500MB DB, 50k MAU auth |
| Auth | Supabase Auth (Email + Password + Google) | Same as DB above |
| Hosting | Vercel (Hobby plan) | 100GB bandwidth/month |
| Client-side search | FlexSearch via build-time `search-index.json` | N/A — static file |
| Spaced repetition | In-house SM-2 (~100 lines in `lib/srs.ts`) | N/A — no dependency |
| Analytics | Google Analytics (GA4) | Free for standard usage |
| Transactional email | Resend via Supabase SMTP | 3,000 emails/month, 100/day |
| CI/CD | GitHub Actions → Vercel native Git integration | Generous free tier |

---

## 3. Data Model Invariants

Defined fully in `Architecture.md §2`. Key invariants that must never be violated:

### 3.1 Core Table Contracts

```
users            → id (uuid PK), email, name, auth_provider, timezone, goal,
                   current_streak, longest_streak, streak_freezes_available,
                   total_xp (cache — source of truth is xp_events), level, created_at

user_lesson_progress → (user_id, lesson_id) composite PK
                       lesson_id = compiler-assigned stable base36 ID (e.g. "les_001a2b")
                       NOT the human-facing slug — slugs may change, lesson IDs never do

quiz_attempts    → references lesson_id + question_id (stable content IDs)

user_flashcard_srs → (user_id, lesson_id, flashcard_id) composite PK
                     lesson_id is required — flashcard IDs are only unique within a lesson

xp_events        → append-only ledger; trigger recomputes users.total_xp and users.level

reflections      → is_public boolean enables portfolio-page exposure without auth
```

### 3.2 Critical Schema Rule: `lesson_id` not `lesson_slug`

**Current codebase discrepancy (2026-08-01):** The existing migrations use `lesson_slug` rather than the spec's `lesson_id`. This is a known migration debt — see [`decisions.md`](./decisions.md) for the resolution plan.

The correct column name per `Architecture.md §2` is `lesson_id`, containing the compiler-assigned stable base36 identifier (e.g., `les_001a2b` from the content pipeline's `lesson-id-registry.json`). This ID never changes even if the lesson title or slug changes.

### 3.3 RLS Policy Invariant

Every user-owned table **must** have RLS enabled and a policy of `user_id = auth.uid()` shipping in the **same** migration file. A table without RLS shipped is a security hole, not a "do later" item.

---

## 4. Content System Architecture

See `content-pipeline.md` for the full authoritative spec. Key invariants:

- **Content compiler:** Markdown → `remark` AST → typed Block JSON → `content/dist/`.
- **Block tree (not flat sections):** Content is a recursive tree of typed blocks. Any block can contain child blocks. This is what allows quizzes inside accordions inside tabs.
- **Stable IDs:** The compiler maintains `.ids/lesson-id-registry.json`, mapping source filenames to stable base36 `lessonId` values. These IDs must never change once assigned — all user progress links to them.
- **Per-lesson failure isolation:** A validation error in one lesson excludes only that lesson from the build; the other 89 lessons still deploy.
- **No runtime parsing:** The browser consumes pre-generated JSON. No Markdown or MDX parsing at request time.

---

## 5. Rendering Architecture

See `rendering-pipeline.md` for the full authoritative spec. Key invariants:

- **Route:** Authenticated lessons live under `app/academy/l/[lessonId]/page.tsx` (ID-based, not slug-based).
- **Curriculum shell:** `app/academy/layout.tsx` hosts the persistent sidebar, navigation provider, progress provider, and search overlay. All lesson routes inherit from it.
- **BlockTreeRenderer:** A recursive server component that maps block types to lazily-loaded registered components. No monolithic lesson renderer.
- **Plugin registry:** New block types are registered via `renderer/registry.ts` — they never require modifying the core renderer file.
- **Code splitting:** Each block component loads via dynamic `import()` — quiz/flashcard/mermaid JS only ships to pages that actually contain those blocks.

---

## 6. Business Logic Module Map

All business logic lives in `apps/web/lib/`. Components and API routes must call into these modules — they must not contain raw business logic themselves.

| Module | Responsibility |
|--------|---------------|
| `xp.ts` | XP constants, level thresholds, `getLevelTitle()` |
| `xp-service.ts` | Canonical service for writing to `xp_events` ledger |
| `srs.ts` | Pure SM-2 spaced repetition math (no DB calls) |
| `streaks.ts` | Pure timezone-aware streak calculation engine (no DB calls) |
| `streaks-db.ts` | Timezone-aware streak DB updates and daily XP awards |
| `skillRadar.ts` | Skill radar competency formula and the 7-cluster definitions |
| `lessons-db.ts` | Lesson DB operations: theory reads, quiz grading, reflections |
| `lessons-completion-service.ts` | Lesson unlock chain, completion state, sequential prerequisite checks |
| `flashcards-service.ts` | SM-2 orchestration, due-card querying, review log persistence |
| `supabase.ts` | Server/Browser Supabase client factories (singleton pattern for browser) |
| `analytics.ts` | Type-safe GA4 event wrappers |
| `animation.ts` | Centralised Framer Motion timings and transition variants |
| `auth.ts` | Profile synchronization and session helpers |
| `email.ts` | Resend transaction templates and sending functions |
| `design/tokens.ts` | Design token constants (colors, labels, durations) |

---

## 7. Deployment & CI Architecture

All deployments go through: `GitHub → GitHub Actions → Vercel`. Never deploy manually.

The CI pipeline runs in this order on every push:
1. `npm run content:parse` — Markdown → JSON
2. `npm run content:validate` — schema + quiz validation
3. `npm run content:search` — FlexSearch index generation
4. `next build` — TypeScript check + production bundle
5. Vercel deploys on success

**Secrets management:** All API keys in `.env.local` (never committed). `SUPABASE_SERVICE_ROLE_KEY` is server-only — it must never be passed to the browser or client components.

---

## 8. Security Invariants

1. Every API route verifies identity via `supabase.auth.getUser()` — never trust a client-reported `user_id` in the request body.
2. RLS on every user-owned table — `user_id = auth.uid()`.
3. `SUPABASE_SERVICE_ROLE_KEY` is server-only — never expose to the browser.
4. Theory-read XP requires server-verified engagement (scroll depth + active time signals) — not a single trusted client timestamp.

---

## 9. Gamification Architecture Rules

1. XP is append-only: write `xp_events` row → trigger recomputes `users.total_xp` and `users.level`. Never increment directly.
2. Streak freezes are earned, never purchased. No monetization path for streaks.
3. No global leaderboard — cohort/friends-only, opt-in, weekly-reset, ranked by consistency not raw XP.
4. Badges are capped at ~20, each mapped to a real learning milestone.
5. The skill radar uses a 7-cluster competency model (defined in `lib/skillRadar.ts`). Scoring formula is an open decision — see `decisions.md`.

---

## Changelog

- v1.0 (2026-08-01) — Extracted and restructured from the monolithic `MEMORY.md` into the `docs/memory/` system.

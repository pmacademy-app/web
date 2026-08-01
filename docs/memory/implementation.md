# PM Academy — Implementation Memory

> **Purpose:** A living record of what has actually been built, the current state of each system, important implementation details, and the directory layout of the codebase.  
> **Part of:** the [`docs/memory/`](./) system. See [`docs/INDEX.md`](../INDEX.md) for the full documentation map.

---

## 1. Current Project Stage

**As of 2026-08-01:**

- **Phase 0 (Foundation):** Complete ✅
- **Phase 1 (Core Learning Loop MVP):** Complete ✅ — functional reading → quiz → unlock loop, but using v1 content pipeline and slug-based routing (v2 migration pending)
- **Phase 2 (Gamification Layer):** Logic modules built, UI integration pending ⚠️
- **Phase 3–5:** Scaffolded or not started ❌

The codebase is transitioning from Phase 1 completion toward Phase 2. A significant architecture alignment task is in progress: migrating the v1 flat-section content pipeline and slug-based routing to the v2 block-tree architecture described in `content-pipeline.md` and `rendering-pipeline.md`.

---

## 2. Completed Work by Phase

### Phase 0 — Foundation (Complete ✅)

- **Module structure:** 9 modules × 10 lessons = 90 lessons finalized.
- **Content pipeline (v1):** `scripts/parse-content.ts` parses raw Markdown into structured JSON at `apps/web/public/content/lessons/`. The validator checks quiz schemas (15 questions per lesson), flashcard presence, and generates deterministic IDs.
- **Search index:** `scripts/generate-search-index.ts` outputs `search-index.json` with 770 pre-compiled items.
- **Authentication:** Supabase Auth with Email + Password and Google Login, server-side verification callback at `/api/auth/callback`.
- **Waitlist system:** Desktop-primary, mobile-responsive landing page. Captures `name`, `email`, `career_position`. UTM + referrer attribution parsed. Stored in Supabase `waitlist` table with insert-only RLS.
- **Transactional email:** Resend SMTP integration via Supabase for verification, password resets, and waitlist confirmation.
- **Deployment pipeline:** GitHub Actions → Markdown validation → JSON generation → Vercel deployment. Automated.
- **Google Analytics:** GA4 integrated for page views and basic user flow tracking.

### Phase 1 — Core Learning Loop MVP (Complete ✅)

- **Lesson reading view:** Renders pre-generated static JSON content across all section types. Client-side `MarkdownRenderer` component (using `marked` parser) handles rich text and Mermaid diagrams. Integrated into `TheorySection`, `ReflectionForm`, and the public lesson page.
- **Quiz flow:** 15-question interactive UI with keyboard navigation, immediate feedback, scoring logic. 1350 quiz questions validated across 90 lessons.
- **Progress tracking:** `user_lesson_progress` table tracks status, quiz score, and XP per lesson. Sequential unlock logic implemented via `lessons-completion-service.ts`.
- **Auth + onboarding:** Goal-setting onboarding question ("Why are you here?") captures `goal` field and tailors UX. MVP scope: no scored placement quiz.
- **Sprint 2 Foundation Cleanup (2026-07-28):** Audit scored 88/100 with 7 issues. All high and medium issues fixed:
  - Consolidated `getLevelTitle()` into `lib/xp.ts`, removed duplicates.
  - Fixed dashboard CTA route: `/lessons/{slug}` → `/curriculum`.
  - Consolidated `SKILL_CLUSTERS` — removed plain string array from `tokens.ts`.
  - Fixed `SKILL_LABELS.technical` inconsistency.
  - Moved `shadcn` CLI from runtime to `devDependencies`.
  - Verified build: lint-clean, TypeScript-clean, 90 lessons, 1350 quiz questions, 21 routes.

### Sprint 3 — Service Layer Isolation (Complete ✅, 2026-07-28)

- **Canonical XP Service** (`lib/xp-service.ts`): Consolidated all XP awards to write `xp_events` first, then recompute cache.
- **Lesson Completion Service** (`lib/lessons-completion-service.ts`): Consolidated lesson completion state, score caching, and sequential unlock checks. Progress PATCH API restricted to `'in_progress'` updates only.
- **Flashcard SRS Service** (`lib/flashcards-service.ts`): Extracted SM-2 orchestration, due-card querying, and review log persistence. Pure SM-2 math stays in `lib/srs.ts`.
- **Quality gates:** All production builds compile cleanly. ESLint and TypeScript pass with zero warnings or errors.

### Sprint 3.5 — Rendering & Performance Optimizations (Complete ✅, 2026-08-01)

- **MarkdownRenderer component** (`components/ui/MarkdownRenderer.tsx`): Client-side `marked` parser with `mermaid` diagram support. Integrated into `TheorySection`, `ReflectionForm`, and the public lesson page.
- **Mermaid strict mode fix:** Resolved React 18 strict mode double-render bug by marking diagram nodes as processed synchronously.
- **Dynamic route optimization:** Refactored synchronous `fs.readFileSync` calls to `fs.promises.readFile` with React `cache` in server components (`[lessonSlug]/page.tsx` and `lessons/[slug]/page.tsx`).
- **Supabase client optimization:** Singleton factory pattern for `createBrowserSupabaseClient` in `lib/supabase.ts` — prevents duplicate client instantiations.

---

## 3. Current Implementation Status by Feature Area

| Feature Area | Status | Notes |
|-------------|--------|-------|
| Waitlist System | ✅ Complete | Live and capturing signups |
| Auth & Onboarding | ✅ Complete | Email + Google, goal question |
| Lesson Reading View | ⚠️ Partial | Functional but uses v1 flat-section parsing + client-side `marked`. v2 block-tree pending. |
| Quiz Flow | ⚠️ Partial | Functional. Uses v1 schema (`correctOptionIndex`). v2 field is `correctAnswer`. |
| Flashcard SRS Engine | ⚠️ Partial | Service layer built. Review Hub screen is a stub. |
| XP & Level System | ⚠️ Partial | DB ledger + triggers correct. Frontend dashboard shows mocked `0` values. |
| Streak Tracker | ⚠️ Partial | Calculation engine built (`lib/streaks.ts`). Not wired into dashboard UI. |
| Skill Radar | ⚠️ Partial | Formula in `lib/skillRadar.ts`. Dashboard hardcodes `0%` for all clusters. |
| Leaderboard / Cohorts | ❌ Scaffolded | DB tables exist. Page is placeholder text. |
| Progress & Portfolio Export | ❌ Scaffolded | SQL schema supports it. Pages are placeholder text. |
| Account Settings | ❌ Scaffolded | UI shell exists. Form updates not written. |
| Client-Side Search | ❌ Not started | Search index generated. UI (`SearchOverlay`) not built. |
| v2 Content Pipeline | ❌ Not started | Spec in `content-pipeline.md`. Current pipeline is v1. |
| v2 Renderer / `/academy/` Routes | ❌ Not started | Spec in `rendering-pipeline.md`. Current routes are `/curriculum/[moduleSlug]/[lessonSlug]`. |

---

## 4. Directory Layout

```
pm-academy/
├── apps/web/                   # Next.js 16 App Router application
│   ├── app/
│   │   ├── (marketing)/        # SSR public pages (Home, Curriculum, /lessons/[slug], Waitlist, About)
│   │   ├── (auth)/             # Auth routes (Login, Signup, Reset Password)
│   │   ├── (portfolio)/        # Public portfolio: /p/[username] (no auth wall)
│   │   ├── (app)/              # Authenticated app: /dashboard, /curriculum, /review, /progress
│   │   ├── api/                # API endpoints (waitlist, progress heartbeats, auth, quiz, flashcards)
│   │   ├── globals.css         # Tailwind CSS v4 styling & theme configuration
│   │   └── layout.tsx          # Root layout, font variables, GA4 scripts
│   ├── components/
│   │   ├── ui/                 # shadcn/ui primitives + MarkdownRenderer
│   │   ├── feedback/           # ErrorState and SuccessState
│   │   ├── forms/              # WaitlistForm and input wrappers
│   │   ├── layout/             # Navigation and Footer
│   │   ├── lesson/             # TheorySection, QuizContainer, FlashcardDeck, ReflectionForm
│   │   └── marketing/          # Homepage sections (Hero, Why, Journey, Curriculum, Experience, etc.)
│   ├── hooks/                  # useAnalytics, useReducedMotion, useScrolled, useScrollDepth
│   ├── lib/
│   │   ├── analytics.ts        # Type-safe GA4 event wrappers
│   │   ├── animation.ts        # Framer Motion timings and transition variants
│   │   ├── auth.ts             # Profile synchronization and session helpers
│   │   ├── email.ts            # Resend transaction templates
│   │   ├── flashcards-service.ts   # SM-2 orchestration + review log persistence
│   │   ├── lessons-completion-service.ts  # Lesson unlock and completion verification
│   │   ├── lessons-db.ts       # Lesson DB operations
│   │   ├── skillRadar.ts       # Skill radar scoring + 7-cluster definitions
│   │   ├── srs.ts              # Pure SM-2 algorithm math
│   │   ├── streaks-db.ts       # Timezone-aware streak DB updates
│   │   ├── streaks.ts          # Pure timezone-aware streak calculator
│   │   ├── supabase.ts         # Server/Browser client factories (singleton for browser)
│   │   ├── xp-service.ts       # Canonical XP events ledger writer
│   │   ├── xp.ts               # XP constants, level titles, getLevelTitle()
│   │   ├── utils.ts            # Tailwind cn() class merging helper
│   │   └── design/
│   │       └── tokens.ts       # Design token constants
│   └── public/content/         # Build output: parsed static JSON (git-ignored)
├── content/
│   ├── lessons/                # 90 human-authored Markdown lesson source files
│   └── master_flashcards.json  # Pre-compiled flashcard collection
├── supabase/
│   ├── config.toml             # Local Supabase engine config
│   └── migrations/             # Timestamped SQL migration files
├── scripts/                    # Build-time TypeScript: parse-content, validate-content, generate-search-index
├── docs/                       # All project documentation (INDEX.md is the entry point)
│   └── memory/                 # Split memory system (this directory)
└── .agents/                    # Antigravity AI skills and AGENTS.md
```

---

## 5. Current Routing Structure

| Route | Type | Notes |
|-------|------|-------|
| `/` | Static | Marketing landing page |
| `/about` | Static | About page |
| `/waitlist` | Static | Pre-launch waitlist capture |
| `/login`, `/signup`, `/reset-password` | Static | Auth flows |
| `/onboarding` | Dynamic (ƒ) | Goal-setting onboarding |
| `/curriculum` | Static | Curriculum map (marketing layout — known issue, see `mistakes.md`) |
| `/curriculum/[moduleSlug]/[lessonSlug]` | Dynamic (ƒ) | Authenticated lesson view (v1 slug-based) |
| `/lessons/[slug]` | Dynamic (ƒ) | Public lesson preview (marketing SEO) |
| `/dashboard` | Dynamic (ƒ) | Authenticated user dashboard |
| `/review` | Dynamic (ƒ) | Flashcard review hub (stub) |
| `/progress` | Dynamic (ƒ) | Progress page (stub) |
| `/leaderboard` | Dynamic (ƒ) | Leaderboard (stub) |
| `/settings` | Dynamic (ƒ) | Account settings (stub) |
| `/p/[username]` | Dynamic (ƒ) | Public portfolio (stub) |
| `/api/*` | Dynamic (ƒ) | API routes (waitlist, auth, progress, quiz, flashcards, reflections) |
| `/sitemap.xml`, `/robots.txt` | Static | SEO assets |

**Planned v2 routes** (not yet built): `/academy/` (curriculum shell layout) and `/academy/l/[lessonId]/` (stable ID-based lesson route).

---

## 6. Build Verification (as of 2026-08-01)

Last successful production build:
- ✅ 90 lessons parsed
- ✅ 1350 quiz questions validated
- ✅ 770 search index items generated
- ✅ TypeScript: zero errors
- ✅ ESLint: zero warnings
- ✅ Next.js 16.2.12 with Turbopack: compiled in 2.1 min
- ✅ 22 routes generated (20 static + dynamic + middleware)
- ✅ Next.js GA: zero `export const runtime` issues

---

## 7. AI Agent Skill System Reference

Specialized Antigravity AI skills for this project are in `.agents/skills/`. Load the appropriate skill before starting work in each area:

| Skill | When to load |
|-------|-------------|
| `00-pm-academy-core` | **ALWAYS — every session** |
| `01-frontend-engineer` | Building UI components, pages, layouts, animations |
| `02-backend-engineer` | Supabase queries, RLS policies, API routes, migrations |
| `03-content-pipeline` | Content pipeline work, lesson files, scripts/, schema |
| `04-design-system` | Tailwind tokens, CVA, typography, component design |
| `05-seo-performance` | SEO, Lighthouse, structured data, meta tags |
| `06-testing-qa` | Writing tests, QA passes, verifying business logic |
| `07-git-deployment` | Git workflow, CI, Vercel, releases |
| `08-sprint-planning` | Feature scoping, phase planning, product decisions |
| `09-security` | RLS, auth, secrets, privacy |
| `10-feature-workflow` | End-to-end feature implementation |
| `11-bug-fixing` | Debugging, investigation, hotfixes |
| `12-refactoring-code-review` | Code review, refactoring, quality |

---

## Changelog

- v1.0 (2026-08-01) — Extracted and restructured from the monolithic `MEMORY.md` into the `docs/memory/` system. Added full feature status table and current routing table.

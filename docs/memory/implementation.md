# PM Academy — Implementation Memory

> **Purpose:** A living record of what has actually been built, the current state of each system, important implementation details, and the directory layout of the codebase.  
> **Part of:** the [`docs/memory/`](./) system. See [`docs/INDEX.md`](../INDEX.md) for the full documentation map.

---

## 1. Current Project Stage

**As of 2026-08-02:**

- **Phase 0 (Foundation):** Complete ✅
- **Phase 1.1 (Content Pipeline Foundation):** Complete ✅ — v2 remark AST compiler + Zod schema, 90 lessons compiled to `content/dist/`
- **Phase 1.2 (Renderer Foundation):** Complete ✅ — `BlockTreeRenderer`, `registry.ts`, all block components (Quiz, Flashcard, Mermaid, Connections, Glossary, Default)
- **Phase 1.3 (Migration & Integration Foundation):** Complete ✅ — DB schema migrated, v2 API routes, `/academy/**` routing, v2 lesson shell
- **Phase 2 (Gamification Layer):** Logic modules built, UI integration pending ⚠️
- **Phase 3–5:** Scaffolded or not started ❌

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
| Lesson Reading View | ✅ Complete | v2 `/academy/l/[lessonId]` renders via `BlockTreeRenderer` with compiled Block JSON |
| Quiz Flow | ✅ Complete | v2 `QuizBlock` + `LessonContextProvider` submits to `/api/v2/lessons/[lessonId]/quiz` |
| Flashcard SRS Engine | ⚠️ Partial | `FlashcardDeckBlock` renders review UI. SRS recording not yet wired. Review Hub screen is a stub. |
| XP & Level System | ⚠️ Partial | DB ledger + triggers correct. Frontend dashboard shows mocked `0` values. |
| Streak Tracker | ⚠️ Partial | Calculation engine built (`lib/streaks.ts`). Not wired into dashboard UI. |
| Skill Radar | ⚠️ Partial | Formula in `lib/skillRadar.ts`. Dashboard hardcodes `0%` for all clusters. |
| Leaderboard / Cohorts | ❌ Scaffolded | DB tables exist. Page is placeholder text. |
| Progress & Portfolio Export | ❌ Scaffolded | SQL schema supports it. Pages are placeholder text. |
| Account Settings | ❌ Scaffolded | UI shell exists. Form updates not written. |
| Client-Side Search | ❌ Not started | Search index generated. UI (`SearchOverlay`) not built. |
| v2 Content Pipeline | ✅ Complete | 90 lessons compiled to `content/dist/` via remark AST compiler (Phase 1.1) |
| v2 Renderer / `/academy/` Routes | ✅ Complete | `BlockTreeRenderer` + `registry.ts` + `/academy` index + `/academy/l/[lessonId]` (Phase 1.2+1.3) |

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
| `/curriculum` | Static | Marketing curriculum overview (legacy — not in authenticated AppShell) |
| `/curriculum/[moduleSlug]/[lessonSlug]` | Dynamic (ƒ) | Legacy v1 lesson route (still active for backward compat, to be removed in Phase 1.4) |
| `/academy` | Dynamic (ƒ) | **v2** Authenticated curriculum index — module cards + full lesson list |
| `/academy/l/[lessonId]` | Dynamic (ƒ) | **v2** Stable-ID lesson page — reads compiled Block JSON via `BlockTreeRenderer` |
| `/lessons/[slug]` | Dynamic (ƒ) | Public lesson preview (marketing SEO) |
| `/dashboard` | Dynamic (ƒ) | Authenticated user dashboard |
| `/review` | Dynamic (ƒ) | Flashcard review hub (stub) |
| `/progress` | Dynamic (ƒ) | Progress page (stub) |
| `/leaderboard` | Dynamic (ƒ) | Leaderboard (stub) |
| `/settings` | Dynamic (ƒ) | Account settings (stub) |
| `/p/[username]` | Dynamic (ƒ) | Public portfolio (stub) |
| `/api/lessons/[slug]/*` | Dynamic (ƒ) | Legacy v1 API routes (progress, quiz, theory-read) — still active |
| `/api/v2/lessons/[lessonId]/*` | Dynamic (ƒ) | **v2** Stable-ID API routes (progress, quiz, theory-read) |
| `/api/reflections` | Dynamic (ƒ) | Reflections API — supports both `lesson_id` and legacy `lesson_slug` |
| `/api/*` | Dynamic (ƒ) | Other API routes (waitlist, auth, flashcard review) |
| `/sitemap.xml`, `/robots.txt` | Static | SEO assets |

---

## 6. Build Verification (as of 2026-08-02)

Last successful production build:
- ✅ 90 lessons parsed (v1 legacy pipeline)
- ✅ 90 lessons compiled to Block JSON (v2 AST pipeline, `content/dist/`)
- ✅ 1350 quiz questions validated
- ✅ 770 search index items generated
- ✅ TypeScript: zero errors
- ✅ ESLint: 0 errors, 2 non-blocking warnings (correctly underscore-prefixed)
- ✅ Next.js 16.2.12 with Turbopack: compiled in ~70s
- ✅ 29 routes generated
- ✅ Production build worker: clean exit

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
- v1.3 (2026-08-02) — Phase 1.3 Migration & Integration Foundation complete. Updated feature status table, routing table (added /academy routes), and build verification.

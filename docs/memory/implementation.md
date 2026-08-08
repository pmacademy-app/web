# PM Academy — Implementation Memory

> **Purpose:** A living record of what has actually been built, the current state of each system, important implementation details, and the directory layout of the codebase.  
> **Part of:** the [`docs/memory/`](./) system. See [`docs/INDEX.md`](../INDEX.md) for the full documentation map.

---

## 1. Current Project Stage

**As of 2026-08-05:**

- **Phase 0 (Foundation):** Complete ✅
- **Phase 1.1 (Content Pipeline Foundation):** Complete ✅ — v2 remark AST compiler + Zod schema, 90 lessons compiled to `content/dist/`
- **Phase 1.2 (Renderer Foundation):** Complete ✅ — `BlockTreeRenderer`, `registry.ts`, all block components (Quiz, Flashcard, Mermaid, Connections, Glossary, Default)
- **Phase 1.3 (Migration & Integration Foundation):** Complete ✅ — DB schema migrated, v2 API routes, `/academy/**` routing, v2 lesson shell
- **Phase 1.4 (Legacy Cleanup & Finalization):** Complete ✅ — Removed all v1 routes, APIs, hooks, components, and public content JSONs. Codebase runs entirely on a single v2 implementation path.
- **Phase 1.5 Sprint 1 (Runtime & Navigation Stabilization):** Complete ✅ — Fixed dashboard CTA, blocks compilation, tab engagement timer, and auth helper. Added marketing routing redirects.
- **Phase 1.5 Sprint 2 (Learning Flow Stabilization):** Complete ✅ — Wired flashcard reviews to API, added Previous/Next lesson navigation, verified reflections, and connected skill radar metrics.
- **Phase 1.5 Sprint 3 (Content Experience & Curriculum Rendering):** Complete ✅ — Enhanced markdown rendering, native lists and tables HTML structures, customized SectionBlock cards, and collapsible dynamic modules list on `/academy`.
- **Phase 1.5 Curriculum & Content Integrity Pass:** Complete ✅ — Normalized curriculum grouping into exactly 9 modules (10 lessons each), fixed regex extraction for perspectives blocks, resolved all cross-lesson glossary warnings.
- **Phase 1.5 Sprint 7 (Release Candidate Blockers):** Complete ✅ — Resolved all critical auth middleware bugs, server-side correctness checks, XP ledger security checks, and Google OAuth UI placeholders.
- **Phase 1.6 (Foundation Finalization & Production Polish):** Complete ✅ — Custom email templates, email verification success page, dynamic canonical routing, topbar breadcrumbs context, consolidated CI pipeline, unified auth callback route `/api/auth/callback` supporting OTP token_hash verification, and resolved Interview Perspective parsing.
- **Phase 2 (Gamification Layer):** Complete ✅ (`v0.2.0-phase2-complete`) — XP Engine, Streak Engine, Skill Radar, Dashboard 2.0, and SM-2 Flashcard Review Hub fully integrated and verified with 100% test pass rate.
- **Phase 3–5:** Scaffolded or active focus 🎯

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

- **Lesson reading view:** Renders pre-generated static JSON content across all section types. Build-time compiler (`scripts/compiler/mermaid-svg.ts`) uses the real `mermaid` v11 engine inside Node.js via JSDOM to compile all code fence and top-level (`mentalModel`, `framework`) Mermaid blocks to static SVGs with green/white design system tokens (`theme/tokens.ts`) and fluid responsive `viewBox` coordinates (`width: 100%; max-width: ${naturalWidth}px; height: auto`). `MermaidBlock.tsx` renders static SVGs directly inside responsive flex containers (`w-full max-w-full flex justify-center`). Zero client-side Mermaid JS runtime is shipped to the browser.
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

### Sprint 4 — Phase 1.4 Legacy Cleanup & Finalization (Complete ✅, 2026-08-02)

- **Legacy Deletions:** Obsolete routes (`app/(app)/curriculum`), legacy API handlers (`api/lessons/[slug]`), legacy hooks (`use-lesson-progress.ts`), legacy components (`LessonViewShell`, `TheorySection`, `QuizContainer`, `FlashcardDeck`), legacy scripts (`parse-content`, `validate-content`, `generate-search-index`), and legacy JSON files under `public/content/` successfully removed.
- **Dynamic Sitemap:** Refactored `sitemap.ts` to read from the v2 `content/dist/curriculum.json` manifest dynamically.
- **Public Previews:** Refactored `app/(marketing)/lessons/[slug]/page.tsx` to resolve stable IDs and render blocks using `BlockTreeRenderer`.
- **Engagement Loader:** Simplified `recordTheoryReadAction` in `lessons-db.ts` to query exclusively via the stable `lessonId` v2 path.
- **Single Path Verification:** Confirmed full learning loop builds cleanly via Turbopack Next.js 16 with 0 TypeScript/ESLint errors and 23 final compiled routes.

---

## 3. Current Implementation Status by Feature Area

| Feature Area | Status | Notes |
|-------------|--------|-------|
| Waitlist System | ✅ Complete | Live and capturing signups |
| Auth & Onboarding | ✅ Complete | Email + Google, custom templates, verified page |
| Lesson Reading View | ✅ Complete | Dynamic `/academy/[moduleSlug]/[lessonId]` canonical routing, legacy redirect fallback |
| Quiz Flow | ✅ Complete | v2 `QuizBlock` + `LessonContextProvider` submits to `/api/v2/lessons/[lessonId]/quiz` |
| Flashcard SRS Engine | ✅ Complete | SM-2 scheduling, `/api/review/queue`, full 3D flip Review Hub UI (`/review`) |
| XP & Level System | ✅ Complete | Append-only DB ledger, server verification, Level & Title calculator (`lib/xp.ts`) |
| Streak Tracker | ✅ Complete | Timezone-aware streak engine (`lib/streaks.ts`), earned freeze mechanics |
| Skill Radar | ✅ Complete | Continuous 0–100 weighted formula (`lib/skillRadar.ts`), 7 competency clusters |
| Dashboard 2.0 | ✅ Complete | Reconstructed layout with Continue Learning hero, Skill Radar hero, 3-column metric cards |
| Leaderboard / Cohorts | ❌ Scaffolded | DB tables exist. Page is placeholder text. |
| Progress & Portfolio Export | ❌ Scaffolded | SQL schema supports it. Pages are placeholder text. |
| Account Settings | ❌ Scaffolded | UI shell exists. Form updates not written. |
| Client-Side Search | ❌ Not started | Search index generated. UI (`SearchOverlay`) not built. |
| v2 Content Pipeline | ✅ Complete | 90 lessons compiled to `content/dist/` via remark AST compiler (Phase 1.1) |
| v2 Renderer / `/academy/` Routes | ✅ Complete | `BlockTreeRenderer` + `registry.ts` + `/academy` dynamic routes (Phase 1.2+1.3+1.6) |

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
| `/auth/verified` | Static | Email verification success landing page |
| `/onboarding` | Dynamic (ƒ) | Goal-setting onboarding |
| `/curriculum` | Static | Marketing curriculum overview (legacy — not in authenticated AppShell) |
| `/academy` | Dynamic (ƒ) | **v2** Authenticated curriculum index — module cards + full lesson list |
| `/academy/[moduleSlug]/[lessonId]` | Dynamic (ƒ) | **v2** Dynamic canonical lesson page — reads compiled Block JSON via `BlockTreeRenderer` |
| `/academy/l/[lessonId]` | Dynamic (ƒ) | **v2** Legacy bookmark fallback — redirects 301 to the canonical dynamic path |
| `/lessons/[slug]` | Dynamic (ƒ) | Public lesson preview (marketing SEO) |
| `/dashboard` | Dynamic (ƒ) | Authenticated user dashboard |
| `/review` | Dynamic (ƒ) | Flashcard review hub (stub) |
| `/progress` | Dynamic (ƒ) | Progress page (stub) |
| `/leaderboard` | Dynamic (ƒ) | Leaderboard (stub) |
| `/settings` | Dynamic (ƒ) | Account settings (stub) |
| `/p/[username]` | Dynamic (ƒ) | Public portfolio (stub) |
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
- v1.5 (2026-08-02) — Phase 1.5 Sprint 1 Runtime & Navigation Stabilization complete. Fixed dashboard CTA, blocks compilation, active tab engagement timer, and auth helper. Added marketing redirects. All builds and verification checks clean.
- v1.6 (2026-08-02) — Phase 1.6 Foundation Finalization & Production Polish complete. Implemented dynamic routing, email templates, success verification page, Topbar breadcrumb overrides, CI consolidation, and solved Interview Perspective parser constraints. Next.js production build verified clean.
- v1.7 (2026-08-03) — Authentication callback integration & documentation cleanup. Unified token_hash and PKCE flows inside a central callback, added AUTH_FLOW.md guide, updated INDEX.md and README.md with script references. Built cleanly.
- v1.8 (2026-08-08) — Sprint 7.1 wrap-up hotfixes. Lesson theory tab renders authored `connections`/`unlocks` content and shows the true course position (`globalOrder`). Mermaid static-SVG engine hardened (consistent 14px font, content-sized boxes, char-level wrapping, proportional responsive scaling — no horizontal scroll); compiler `CACHE_VERSION` bumped to 4 and 4 rendering-quality tests added. `notification-scheduler.yml` hardened (`APP_URL`/`CRON_SECRET` GitHub secrets documented in Notification-Architecture.md §17, `curl --fail-with-body`). Brand-hardening check restored to `ci.yml`. Verification: `test:compiler` green, `yaml-lint` green for both workflows.

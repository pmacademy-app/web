# Architecture Specification — Prodily PM Academy

**Repository:** `prodily-monorepo` (app code at `apps/web/`)
**Framework:** Next.js 16.2.12 App Router (Turbopack) / React 19.2.4 / PostgreSQL (Supabase)
**Last Updated:** September 6, 2026

---

## 1. Executive Summary & Tech Stack

**Prodily PM Academy** is a structured, gamified Product Management learning application designed for high performance, zero runtime latency, and ₹0-at-launch serverless execution.

| Tech Stack Layer | Technology | Purpose / Notes |
|---|---|---|
| **Framework** | Next.js 16.2.12 App Router (Turbopack) | Server Components, Route Handlers, `proxy.ts` request interceptor |
| **Frontend UI** | React 19.2.4, Tailwind CSS v4 + CSS design tokens | Responsive layout, light/dark theming, glassmorphic admin theme |
| **Admin Charts** | Recharts 3.x (MIT, free) | Admin Panel dashboard time-series & funnel visualizations (client-side) |
| **Content Pipeline** | Build-time Markdown Compiler (`scripts/compiler/compile.ts`) | Markdown → static JSON in `content/dist/` |
| **Diagram Engine** | Build-time Mermaid v11 SVG Renderer | Node.js + JSDOM SVG compilation (0 client JS) |
| **Search Engine** | FlexSearch Index Compiler | Pre-indexed search in `content/dist/search-index.json` |
| **Database** | Supabase PostgreSQL (41 migration files) | User state, XP, streaks, leaderboard, notifications, broadcasts, referrals — see [`DATABASE.md`](DATABASE.md) |
| **Authentication** | Supabase Auth + custom cookie session bridge | Email/password + PKCE, Send Email Hook, platform settings controls — see [`AUTHENTICATION.md`](AUTHENTICATION.md) |
| **Email Delivery** | Dual-provider: Brevo (primary, configurable) + Resend, both via raw `fetch` (no SDK) | Transactional emails, broadcast engine, automatic Brevo→Resend fallback — see [`INTEGRATIONS.md`](INTEGRATIONS.md) |
| **Background Cron** | GitHub Actions (`notification-scheduler.yml`) | Queue processing (5 min), retry (hourly), daily reminder, weekly recap, cleanup |
| **Unit/Integration Tests** | Vitest | 100 test files in `lib/__tests__/`, 1029 tests passing |
| **E2E Tests** | Playwright | 3 auth-lifecycle specs in `e2e/auth/` |

---

## 2. Directory Layout & Architecture Boundaries

```
apps/web/
├── app/                         # Next.js App Router
│   ├── (app)/                   # Authenticated learner surface
│   │   ├── academy/             # Curriculum browser & lesson viewer
│   │   ├── badges/              # Learner badge showcase
│   │   ├── capstones/           # Capstone submission workflow
│   │   ├── dashboard/           # "What do I do next" home (action-oriented)
│   │   ├── leaderboard/         # Global / Cohort / Friends leaderboard
│   │   ├── notifications/       # Redirect stub → /dashboard (no standalone page;
│   │   │                        #   the real notification UI is the header bell/drawer)
│   │   ├── progress/            # "How am I doing" summary (skill radar, badges,
│   │   │                        #   capstones, certificates)
│   │   ├── review/               # SM-2 flashcard review queue
│   │   └── settings/            # Profile, portfolio, security, notification prefs
│   ├── (auth)/                  # Unauthenticated login, signup, reset-password,
│   │                            #   verified, email-verified
│   ├── (marketing)/             # Public landing page and marketing sections
│   ├── (portfolio)/
│   │   └── p/[username]/        # Public learner portfolio page
│   ├── admin/(console)/         # Admin Console — 19 workspace route folders
│   ├── api/                     # Route Handlers (auth, cron, admin, settings, webhooks)
│   ├── maintenance/             # Maintenance-mode holding page
│   ├── onboarding/              # Post-signup onboarding flow
│   └── verify/[certificateId]/  # Public certificate verification page
├── components/                  # React components (Admin, UI, Marketing, Email, Modals)
├── e2e/                         # Playwright E2E test specs (auth/ only)
├── emails/                      # React Email templates & rendering engine
├── lib/                         # Core backend services, DB clients, rate limiters
│   └── __tests__/               # Vitest unit/integration suites (100 files, 1029 tests)
├── theme/                       # Design tokens (`theme/tokens.ts`) — see DESIGN_SYSTEM.md
├── types/
│   └── database.ts              # Auto-generated Supabase TypeScript schema
├── proxy.ts                     # Next.js request interceptor (auth & platform controls)
├── vitest.config.mts            # Vitest test runner configuration
└── playwright.config.ts         # Playwright E2E configuration

content/
├── lessons/                     # 90 flat Markdown lessons: lesson-001.md … lesson-090.md
│                                #   (no module subfolders, no YAML frontmatter — see
│                                #   CONTENT_SYSTEM.md for how metadata is derived)
├── 04-Master-Glossary.md
└── dist/                        # Compiled output: curriculum.json, search-index.json,
                                  #   glossary-index.json, module-graph.json, lessons/

supabase/migrations/              # 41 versioned PostgreSQL DDL migrations
scripts/compiler/                 # Build-time content compiler (compile.ts, mermaid-svg.ts)
```

Notable naming/structure notes:
- There is **no** top-level `app/profile/` directory — profile/account management lives under `(app)/settings/`.
- The Admin Console has **19** workspace folders under `app/admin/(console)/`: `achievements, analytics, announcements, certificates, communications, content, curriculum, dashboard, emails, feature-flags, feedback, leaderboard, moderation, notifications, portfolios, settings, system, templates, users`. Several of these (`announcements`, `emails`, `notifications`, `templates`, `portfolios`, `certificates`) are thin redirects into the unified Communications hub or Moderation workspace rather than independent UIs — see [`ADMIN_PANEL.md`](ADMIN_PANEL.md).

---

## 3. Client vs. Server Execution Boundaries

1. **Server Components (`app/`):** Default for page rendering. Data fetching occurs directly on the server via Supabase clients, preventing API token leaks to the browser.
2. **Client Components (`'use client'`):** Form state, micro-animations, the notification bell/drawer, search UI, flashcards, interactive quizzes, and Admin drawer interfaces.
3. **Compiler Scripts (`scripts/compiler/`):** Executed strictly at build time (`npm run build` or `npm run content:compile`). NEVER loaded at runtime or exposed to the client.
4. **Service-Role Client (`SUPABASE_SERVICE_ROLE_KEY`):** Strictly server-side inside Route Handlers (`app/api/admin/`, `app/api/cron/`, `/api/auth/send-email-hook`). NEVER imported into client components.

---

## 4. Key Architectural Invariants

- **Content Isolation:** Markdown in `content/lessons/` is the single source of truth for lesson text. Lesson content is compiled into static JSON files and NEVER stored in PostgreSQL.
- **Append-Only XP Ledger:** XP is written as immutable rows to `xp_events`. `users.total_xp` is updated exclusively via PostgreSQL trigger (`update_user_xp_and_level()`).
- **Stable ID Addressing:** User-state rows reference lessons by stable `lessonId`, never by volatile URL slugs.
- **Authorization Verification:** Every mutation route re-derives authorization from the authenticated session; request body `user_id` parameters are never trusted.
- **Type Safety:** Database schema is fully typed via `types/database.ts`; `lib/supabase.ts` re-exports these types for all table access.
- **Public Portfolio Eligibility:** PM Fellow designation can only be granted to a public portfolio (private portfolios are rejected server-side). Automatic Portfolio Verification is a separate, unrelated mechanism — see [`docs/admin/portfolio-verification.md`](admin/portfolio-verification.md) and [`docs/admin/fellow-designation.md`](admin/fellow-designation.md).

---

## 5. Known Architectural Debt

- **Custom session bridge vs. `@supabase/ssr`:** Auth session sync uses custom `sb-access-token`/`sb-refresh-token` cookies via `proxy.ts` and `AuthStateListener.tsx`, rather than the official `@supabase/ssr` package (not a dependency). Server components cannot auto-refresh expired tokens; see [`docs/ISSUES_KNOWN.md`](ISSUES_KNOWN.md).
- **Email send limits:** only the daily quota is enforced, as a pre-dispatch gate in `processEmailQueue()`. There is no hourly limit and no global max-retry setting; retry attempts are per-priority from `PRIORITY_MATRIX`. The corresponding admin controls were removed in September 2026 rather than left implying enforcement. See [`docs/EMAIL_SYSTEM.md`](EMAIL_SYSTEM.md).
- **`/api/cron/cleanup` is a placeholder:** it always returns `{ cleanedRows: 0 }` and performs no actual cleanup today, despite being scheduled. See [`docs/CRON_AND_SCHEDULING.md`](CRON_AND_SCHEDULING.md).

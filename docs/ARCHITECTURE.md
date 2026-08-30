# Architecture Specification — Prodily PM Academy

**Repository:** `pmacademy-app/web`  
**Framework:** Next.js 16.2.12 App Router (Turbopack) / React 19 / PostgreSQL (Supabase)  
**Last Updated:** August 30, 2026  

---

## 1. Executive Summary & Tech Stack

**Prodily PM Academy** is a structured, gamified Product Management learning application designed for high performance, zero runtime latency, and ₹0-at-launch serverless execution.

| Tech Stack Layer | Technology | Purpose / Notes | Status |
|---|---|---|---|
| **Framework** | Next.js 16.2.12 App Router (Turbopack) | Server Components, Route Handlers, Proxy Middleware | 🟢 Verified in Production |
| **Frontend UI** | React 19, Vanilla CSS Design System | Responsive layout, dark mode, glassmorphic themes | 🟢 Verified in Production |
| **Admin Charts** | Recharts 3.x (MIT, free) | Admin Panel dashboard time-series & funnel visualizations (client-side) | 🟢 Verified in Production |
| **State & Cache** | Server Component Data Fetching + Client State | SWR / React State for local component state | 🟢 Verified in Production |
| **Content Pipeline** | Build-time Markdown Compiler (Compiler v2) | Markdown → Static JSON in `content/dist/lessons` | 🟢 Verified in Production |
| **Diagram Engine** | Build-time Mermaid v11 SVG Renderer | Node.js + JSDOM SVG compilation (0 client JS) | 🟢 Verified in Production |
| **Search Engine** | FlexSearch Index Compiler | Pre-indexed search in `content/dist/search-index.json` | 🟢 Verified in Production |
| **Database** | Supabase PostgreSQL (39 Migration Files) | User state, XP, streaks, notifications, broadcasts, referrals | 🟢 Verified in Production |
| **Authentication** | Supabase Auth + Custom Proxy | PKCE email auth, Send Email Hook, platform settings controls | 🟢 Verified in Production |
| **Email Delivery** | Resend API + Supabase Auth Hook | Transactional emails, broadcast engine, Brevo fallback | 🟢 Verified in Production |
| **Background Cron** | GitHub Actions Workflows | Queue processing, broadcast execution, daily/weekly tasks | 🟢 Verified in Production |
| **Unit Tests** | Vitest | 84 test files across `lib/__tests__/` (887 tests, 100% passing) | 🟢 In Place |
| **E2E Tests** | Playwright | Auth lifecycle specs in `e2e/auth/` | 🟡 Specs exist |

---

## 2. Directory Layout & Architecture Boundaries

```
apps/web/
├── app/                        # Next.js 16 App Router Pages & API Routes
│   ├── (auth)/                 # Unauthenticated login, signup, reset-password, verified
│   ├── (marketing)/            # Public landing page and marketing sections
│   ├── academy/                # Core curriculum browser & lesson viewer
│   ├── admin/                  # Admin Console (9 consolidated workspaces)
│   ├── api/                    # Serverless API routes (cron, admin, auth, settings, referrals)
│   ├── badges/                 # Learner badge showcase
│   ├── capstones/              # Capstone submission workflow
│   ├── dashboard/              # Learner home dashboard & streak overview
│   ├── leaderboard/            # Cohort/Friend leaderboard rankings
│   ├── notifications/          # Learner notification center
│   ├── p/[username]/           # Public learner portfolio page
│   ├── profile/                # User settings & security management
│   └── verify/[certificateId]/ # Public certificate verification page
├── components/                 # React components (Admin, UI, Marketing, Email, Modals)
├── e2e/                        # Playwright E2E test specs
├── emails/                     # React Email templates & rendering engine
├── lib/                        # Core backend services, DB clients, rate limiters
│   └── __tests__/              # Vitest unit and integration test files (84 files, 887 tests)
├── types/
│   └── database.ts             # Auto-generated Supabase TypeScript schema
├── proxy.ts                    # Next.js 16 request interceptor (auth & platform controls)
├── vitest.config.mts           # Vitest test runner configuration
├── playwright.config.ts        # Playwright E2E configuration
└── supabase/migrations/        # Versioned PostgreSQL DDL migrations (39 files)
```

---

## 3. Client vs. Server Execution Boundaries

1. **Server Components (`app/`):** Default for page rendering. Data fetching occurs directly on the server via Supabase Server Client (`createServerSupabaseClient()`), preventing API token leaks to the browser.
2. **Client Components (`'use client'`):** Form state, micro-animations, Notification Center popover, search UI, flashcards, interactive quizzes, and Admin Drawer interfaces.
3. **Compiler Scripts (`scripts/compiler/`):** Executed strictly at build time (`npm run build` or `npm run content:compile`). NEVER loaded at runtime or exposed to the client.
4. **Service-Role Client (`SUPABASE_SERVICE_ROLE_KEY`):** Strictly server-side inside Route Handlers (`app/api/admin/`, `app/api/cron/`, `/api/auth/send-email-hook`). NEVER imported into client components.

---

## 4. Key Architectural Invariants

- **Content Isolation:** Markdown in `content/` is the single source of truth for lesson text. Lesson content is compiled into static JSON files and NEVER stored in PostgreSQL.
- **Append-Only XP Ledger:** XP is written as immutable rows to `xp_events`. `users.total_xp` is updated exclusively via PostgreSQL trigger (`update_user_xp_and_level()`).
- **Stable ID Addressing:** User-state rows reference lessons by stable `lessonId` (e.g. `pm-101`), never by volatile URL slugs.
- **Authorization Verification:** Every mutation route re-derives authorization from the authenticated session; request body `user_id` parameters are never trusted.
- **Type Safety:** Database schema is fully typed via `types/database.ts`; `lib/supabase.ts` re-exports these types for all table access.
- **Public Portfolio Eligibility:** Only public portfolios can be verified by admins.

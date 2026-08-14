# Architecture Specification — Prodily PM Academy

**Repository:** `pmacademy-app/web`  
**Current Baseline HEAD:** `490fea37ea08813aa582fc5ebbc3896ee4eb070c`  
**Last Updated:** August 10, 2026  

---

## 1. Executive Summary & Tech Stack

**Prodily PM Academy** is a structured, gamified Product Management learning application designed for high performance, zero runtime latency, and ₹0-at-launch serverless execution.

| Tech Stack Layer | Technology | Purpose / Notes | Status |
|---|---|---|---|
| **Framework** | Next.js 16.2.12 App Router (Turbopack) | Server Components, Route Handlers, Proxy Middleware | 🟢 Verified in Production |
| **Frontend UI** | React 19, Vanilla CSS Design System | Responsive layout, dark mode, glassmorphic themes | 🟢 Verified in Production |
| **Admin Charts** | Recharts 3.x (MIT, free) | Admin Panel dashboard time-series & funnel visualizations (client-side) | ✅ Done (Phase 2) |
| **State & Cache** | Server Component Data Fetching + Client State | SWR / React State for local component state | 🟢 Verified in Production |
| **Content Pipeline** | Build-time Markdown Compiler (Compiler v2) | Markdown → Static JSON in `content/dist/lessons` | 🟢 Verified in Production |
| **Diagram Engine** | Build-time Mermaid v11 SVG Renderer | Node.js + JSDOM SVG compilation (0 client JS) | 🟢 Verified in Production |
| **Search Engine** | FlexSearch Index Compiler | Pre-indexed search in `content/dist/search-index.json` | 🟢 Verified in Production |
| **Database** | Supabase PostgreSQL (24 Migration Files) | User state, XP, streaks, notifications, queue | 🟢 Verified in Production |
| **Authentication** | Supabase Auth + Service Role Client | PKCE email auth, Send Email Hook, rate limits | 🟢 Verified in Production |
| **Email Delivery** | Resend API + Supabase Auth Hook | Transactional emails, queue processor | 🟡 Implemented — Verification Required |
| **Background Cron** | GitHub Actions Workflows | 5-minute queue processing, daily/weekly tasks | 🟡 Implemented — Verification Required |

---

## 2. Directory Layout & Architecture Boundaries

```
apps/web/
├── app/                        # Next.js 16 App Router Pages & API Routes
│   ├── (auth)/                 # Unauthenticated login, signup, reset-password
│   ├── academy/                # Core curriculum browser & lesson viewer
│   ├── admin/                  # Admin Console (12 tab management interface)
│   ├── api/                    # Serverless API routes (cron, admin, auth, settings)
│   ├── badges/                 # Learner badge showcase
│   ├── capstones/              # Capstone submission workflow
│   ├── dashboard/              # Learner home dashboard & streak overview
│   ├── leaderboard/            # Cohort/Friend leaderboard rankings
│   ├── notifications/          # Learner notification center
│   ├── p/[username]/           # Public learner portfolio page
│   ├── profile/                # User settings & security management
│   ├── verify/[certificateId]/ # Public certificate verification page
│   └── layout.tsx              # Root layout with BrandLogo & NotificationBell
├── components/                 # React components (Admin, UI, Email, Modals)
├── content/                    # Authoring single source of truth (90 lessons)
│   ├── dist/                   # Build-time emitted JSON & search index
│   └── modules/                # Markdown source files by module
├── emails/                     # React Email templates & rendering engine
├── lib/                        # Core backend services, DB clients, rate limiters
├── proxy.ts                    # Next.js Middleware (RBAC & auth protection)
├── scripts/                    # Compiler, asset generator, bootstrap scripts
└── supabase/migrations/        # Versioned PostgreSQL DDL migrations (24 files)
```

---

## 3. Client vs. Server Execution Boundaries

1. **Server Components (`app/`)**: Default for page rendering. Data fetching occurs directly on the server via Supabase Server Client (`createServerSupabaseClient()`), preventing API token leaks to the browser.
2. **Client Components (`'use client'`)**: Form state, micro-animations, Notification Center popover, search UI, flashcards, interactive quizzes, and Admin Drawer interfaces.
3. **Compiler Scripts (`scripts/compiler/`)**: Executed strictly at build time (`npm run build` or `npm run content:compile`). NEVER loaded at runtime or exposed to the client.
4. **Service-Role Client (`SUPABASE_SERVICE_ROLE_KEY`)**: Strictly server-side inside Route Handlers (`app/api/admin/`, `app/api/cron/`, `/api/auth/send-email-hook`). NEVER imported into client components.

---

## 4. Key Architectural Invariants

- **Content Isolation**: Markdown in `content/` is the single source of truth for lesson text. Lesson content is compiled into static JSON files and NEVER stored in PostgreSQL.
- **Append-Only XP Ledger**: XP is written as immutable rows to `xp_events`. `users.total_xp` is updated exclusively via PostgreSQL trigger (`update_user_xp_and_level()`).
- **Stable ID Addressing**: User-state rows reference lessons by stable `lessonId` (e.g. `pm-101`), never by volatile URL slugs.
- **Authorization Verification**: Every mutation route re-derives authorization from the authenticated session; request body `user_id` parameters are never trusted.
- **Zero Paid Dependencies**: Architecture uses free tiers for Supabase, Resend, Vercel, and GitHub Actions.

---

## 5. System Status Summary

- **🟢 Verified in Production**: App Router layout, compile-time content pipeline, static Mermaid SVGs, user state tables, RLS security policies.
- **🟡 Implemented — Production Verification Required**: Resend transactional delivery, Supabase Auth Hook webhooks, GitHub Actions cron schedules.

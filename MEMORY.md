# PM Academy — Project Memory (MEMORY.md)

**Last Updated:** 2026-07-28  
**Project Stage:** Phase 0 Complete / Entering Phase 1  
**OS Version:** Windows  
**Framework:** Next.js 16 (App Router) + TypeScript 5 (Strict) + Tailwind CSS v4 + Supabase

---

## 1. Project Overview & Context

PM Academy is a structured, free, and habit-forming curriculum designed to teach Product Management (90 lessons across 9 modules) using the gamification principles of Duolingo but with the rigor of a business school elective. 

This repository operates under a strict **₹0-infrastructure-cost discipline** at launch-scale (~5,000 users), leveraging the free tiers of Vercel (hosting), Supabase (database, auth, storage), Resend (SMTP transactional email), and Google Analytics.

---

## 2. Completed Phase 0 Work (Foundation)

Phase 0 is fully complete and functional:
- **Decision Resolution:** 9 modules × 10 lessons structure (90 lessons total) finalized and documented.
- **Waitlist System:** A desktop-primary, mobile-responsive landing page capturing `name`, `email`, and `career_position` is live. Attributions (`utm_*` fields and HTTP referrers) are parsed. Records are stored in the Supabase `waitlist` table, protected by insert-only Row Level Security (RLS) policies.
- **Static Content Pipeline:**
  - `scripts/parse-content.ts` parses raw markdown lessons in `/content/lessons/` into structured JSON files at `apps/web/public/content/lessons/`.
  - `scripts/validate-content.ts` verifies lesson formatting, quiz schemas (15 questions per lesson), and generates deterministic, stable IDs for quizzes and flashcards.
  - `scripts/generate-search-index.ts` outputs a `search-index.json` containing 770 pre-compiled items for client-side search.
- **Authentication:** Supabase Auth is integrated with support for Email + Password, Google Login, and server-side verification callback logic (`/api/auth/callback`).
- **Transactional Mail:** SMTP integration wired via Resend API for verification, password resets, and waitlist signups.
- **Deployment Pipeline:** Automated GitHub Actions workflow checks linting, validates content, generates JSON/indexes, and deploys the production bundle to Vercel.

---

## 3. Directory Layout

The workspace is organized as follows:
```
pm-academy/
├── apps/web/                   # Next.js 16 App Router application
│   ├── app/
│   │   ├── (marketing)/        # SSR public pages for SEO (Home, Curriculum, /lessons/[slug], Waitlist, About)
│   │   ├── (auth)/             # Authentication routes (Login, Signup, Reset Password)
│   │   ├── (portfolio)/        # Public showcase: /p/[username] (no auth wall)
│   │   ├── (app)/              # Authenticated product: /dashboard (Curriculum, review, progress)
│   │   ├── api/                # API endpoints (waitlist requests, progress heartbeats, auth)
│   │   ├── globals.css         # Tailwind CSS v4 styling & theme configuration
│   │   └── layout.tsx          # Root Layout, font variables, GA4 scripts
│   ├── components/
│   │   ├── ui/                 # shadcn/ui primitives styled via Tailwind v4 & @base-ui/react
│   │   ├── feedback/           # ErrorState and SuccessState components
│   │   ├── forms/              # WaitlistForm and input wrappers
│   │   ├── layout/             # Navigation and Footer
│   │   └── marketing/          # Homepage sections and product mockups
│   ├── hooks/                  # Custom React hooks (useAnalytics, useReducedMotion, useScrolled)
│   ├── lib/
│   │   ├── analytics.ts        # Type-safe Google Analytics 4 event wrappers
│   │   ├── animation.ts        # Centralised Framer Motion timings and transition variants
│   │   ├── auth.ts             # Profile synchronization and session helpers
│   │   ├── email.ts            # Resend transaction templates and sending functions
│   │   ├── supabase.ts         # Server/Browser Supabase client factories
│   │   └── utils.ts            # Tailwind CSS class merging helper (cn)
│   └── public/content/         # Target output folder for parsed static content (git-ignored)
├── content/
│   ├── lessons/                # 90 human-authored Markdown lesson source files
│   └── master_flashcards.json  # Pre-compiled flashcard collection
├── supabase/                   # Supabase database config & migrations (CLI version-controlled)
│   ├── config.toml             # Local Supabase engine configurations
│   └── migrations/             # Timestamped SQL database migration files (1-indexed base migrations)
├── scripts/                    # Build-time TypeScript content parsing and validation scripts
├── docs/                       # Project specifications & manuals (PRD, Architecture, Rules, Guides)
└── .agents/                    # Antigravity AI Customizations (AGENTS.md, skill guides)
```

---

## 4. Technical Invariants & Rules

Every developer (or AI agent) working on this repository must adhere to the following laws:

1. **Static-First Lesson Content:** Lesson text is never stored in Supabase. Raw Markdown is the single source of truth, parsed into static JSON at build time. The client fetches static JSON files from the public folder.
2. **Supabase for User State Only:** Tables inside Supabase (e.g., `users`, `user_lesson_progress`, `reflections`, `waitlist`) store user-centric interactive states only.
3. **Strict RLS Enforcement:** Every user-owned table has database-level Row Level Security enabled. The RLS policy is `user_id = auth.uid()`, except for fields explicitly flagged public (e.g., reflections or submissions with `is_public = true`).
4. **Append-Only XP Ledger:** XP is never incremented directly in the database. Every XP-earning event must write an entry to `xp_events` first. A trigger/function then recomputes and caches the user's `total_xp` and `level` from the ledger.
5. **No Client-Reported User IDs:** API routes and server actions must verify credentials server-side using `supabase.auth.getUser()`. Never trust a client-reported `user_id` inside the request body.
6. **No AI Mentor feature:** This feature is explicitly marked as an unresolved open decision in `PRD.md §11` due to API volume cost constraints. Marketing copy must refer to structured human-authored content, not "AI-assisted feedback".
7. **Timezone-Correct Streaks:** Users' study streaks are calculated relative to their local timezone (stored in `users.timezone`), not server UTC boundaries.
8. **No Dark Patterns:** Streaks can never be bought back. No urgency tactics or artificial progression blockages.
9. **Strict TypeScript & Linting:** The compiler operates under `"strict": true`. Eslint blocks builds on warnings or errors. No arbitrary type casting (e.g., `as any`) unless absolutely unavoidable and documented.

---

## 5. DB Schema & User State Quick Reference

- **`users`:** Core account, streak tracking, cached `total_xp`, and `level`.
- **`user_lesson_progress`:** Tracks lesson completion status, quiz score, attempts, and XP earned per lesson slug.
- **`quiz_attempts`:** Logs each question selection for post-lesson metrics and the Review Hub.
- **`user_flashcard_srs`:** Schedules flashcard cards based on the SM-2 spaced repetition algorithm.
- **`xp_events`:** Append-only ledger auditing all XP transactions (theory reads, quiz answers, daily streaks).
- **`reflections` / `bookmarks` / `capstone_submissions`:** User-generated journals, saved items, and module projects.
- **`waitlist`:** Pre-launch marketing registration list.

---

## 6. Antigravity AI Skill System

Workspace rules and specialized assistant guides are housed in `.agents/`. Under normal workflow, the appropriate skills should be consulted:
- `00-pm-academy-core` — Loads full architecture, stack rules, and invariants. **Load in every session.**
- `01-frontend-engineer` — Next.js 16 components, App Router layout, Tailwind CSS v4 styling.
- `02-backend-engineer` — Supabase authentication, SQL schema, migrations, RLS, and APIs.
- `03-content-pipeline` — Markdown structure, scripts, schema, index generation.
- `04-design-system` — Tailwind styling tokens, CVA, typography, animations.
- `09-security` — Security audits, secrets, database policies, API access.

---

## 7. Next.js 16 Warnings

The project runs on Next.js 16 (currently `16.2.12`) and React 19.
- App Router layout configurations use standard patterns but double-check API signatures against `node_modules/next/dist/docs/` when working on route optimization or runtime rendering context.
- Keep components Server Components by default. Use `"use client"` only for client-side state, events, or Framer Motion interactions.

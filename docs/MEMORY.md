# Project Memory & Immutable Decisions — Prodily PM Academy

**Repository:** `pmacademy-app/web`  
**Current Baseline HEAD:** `490fea37ea08813aa582fc5ebbc3896ee4eb070c`  
**Last Updated:** August 10, 2026  

---

## 1. Core Architectural Decisions

1. **Next.js 16 App Router Stack**: Built on Next.js 16.2.12 Turbopack with Server Components for zero-bundle-size data fetching and Route Handlers for API endpoints.
2. **PostgreSQL as Persistent Backend**: All user state, progress, streaks, badges, reflections, notification queues, system errors, and rate limits reside in Supabase PostgreSQL (24 versioned migration files in `supabase/migrations/`).
3. **Compile-Time Static Markdown & Mermaid SVG**: Content compiler v2 parses 90 Markdown lessons, compiles embedded Mermaid diagrams to static SVGs via Node.js + JSDOM, and emits static JSON to `content/dist/lessons/`.
4. **Resend as Transactional Email Provider**: All transactional emails use Resend API via `sendEmail()` (`lib/email.ts`) and Supabase Auth Send Email Hook (`/api/auth/send-email-hook`).
5. **GitHub Actions for Cron Scheduling**: Background queue processing, daily reminders, weekly recaps, and log cleanups are scheduled via GitHub Actions workflows (`.github/workflows/email-cron.yml` and `notification-scheduler.yml`).

---

## 2. Immutable Business Logic Contracts

- **XP Ledger**: XP is append-only. Services insert rows into `public.xp_events`. `users.total_xp` is updated exclusively via PostgreSQL trigger (`update_user_xp_and_level()`).
- **Stable ID Addressing**: User state tracks progress by stable `lessonId` (e.g. `pm-101`), never by volatile URL slugs.
- **Branding Standard**: Primary brand colors are Prodily Green (`#019E75`) and Dark Navy (`#011229`), configured in `lib/brand.ts` and `theme/tokens.ts`.
- **Secret Protection**: `SUPABASE_SERVICE_ROLE_KEY`, `SEND_EMAIL_HOOK_SECRET`, `CRON_SECRET`, and `RESEND_API_KEY` are server-only and must never be exposed to the client.
- **Critical Auth Email Priority**: Authentication emails (`auth.verify_email`, `auth.password_reset`) are critical and bypass optional automation pauses and daily email quota limits.

# Project Memory & Immutable Decisions — Prodily PM Academy

**Repository:** `prodily-monorepo` (app code at `apps/web/`)
**Last Updated:** September 6, 2026

---

## 1. Core Architectural Decisions

1. **Next.js 16 App Router Stack**: Built on Next.js 16.2.12 Turbopack with Server Components for zero-bundle-size data fetching and Route Handlers for API endpoints.
2. **PostgreSQL as Persistent Backend**: All user state, progress, streaks, badges, reflections, notification queues, system errors, and rate limits reside in Supabase PostgreSQL (41 versioned migration files in `supabase/migrations/`).
3. **Compile-Time Static Markdown & Mermaid SVG**: The content compiler (`scripts/compiler/compile.ts`) parses 90 flat Markdown lessons (`content/lessons/lesson-001.md` … `lesson-090.md`, no frontmatter — metadata comes from an in-body `## Learning Path` table plus a hardcoded lesson-number→module map), compiles embedded Mermaid diagrams to static SVGs via Node.js + JSDOM, and emits static JSON to `content/dist/`.
4. **Dual Transactional Email Providers**: Outbound email is sent via either **Brevo** or **Resend** (selected by `PRIMARY_EMAIL_PROVIDER`, with automatic Brevo→Resend fallback on failure), both called via raw `fetch` — no email SDK is a dependency. See `lib/email.ts` and [`docs/INTEGRATIONS.md`](INTEGRATIONS.md).
5. **GitHub Actions for Cron Scheduling**: Background queue processing, retries, daily reminders, weekly recaps, and (currently a no-op placeholder) cleanup are scheduled via `.github/workflows/notification-scheduler.yml`. `ci.yml` is a separate workflow for lint/typecheck/test/build/E2E on PRs and pushes to `main`.

---

## 2. Immutable Business Logic Contracts

- **XP Ledger**: XP is append-only. Services insert rows into `public.xp_events`. `users.total_xp` is updated exclusively via PostgreSQL trigger (`update_user_xp_and_level()`).
- **Stable ID Addressing**: User state tracks progress by stable `lessonId` (e.g. `pm-101`), never by volatile URL slugs.
- **Branding Standard**: Primary brand colors are Prodily Green (`#019E75`) and Dark Navy (`#011229`), configured in `lib/brand.ts` and `theme/tokens.ts`.
- **Secret Protection**: `SUPABASE_SERVICE_ROLE_KEY`, `SEND_EMAIL_HOOK_SECRET`, `CRON_SECRET`, and `RESEND_API_KEY` are server-only and must never be exposed to the client.
- **Critical Auth Email Priority**: Authentication emails (`auth.verify_email`, `auth.password_reset`, `auth.email_change_verify`) are critical and bypass optional automation pauses and daily email quota limits.
- **Signup Verification Pending State**: The signup UI (`app/(auth)/signup/page.tsx`) explicitly distinguishes submitted requests from confirmed accounts. Unverified signups display a dedicated verification pending view with 3-step progress, 60s resend cooldown (`/api/auth/resend-verification`), and wrong-email typo recovery. Mailbox validation is inherently asynchronous via Resend webhooks (`/api/email/webhooks`).
- **Header Feedback Trigger**: The authenticated topbar header (`components/layout/Topbar.tsx`) provides a responsive Feedback control (`Search | Feedback | Notifications | Profile`) reusing `LearnerFeedbackProvider` and `ContextualFeedbackModal` for private feedback (`/api/feedback`) and public homepage reviews (`/api/testimonials`).
- **Marketing Campaign Safety**: Re-engagement email campaigns (such as `reengagement_aug_2026`) perform real-time pre-send eligibility queries against Supabase (`public.users`, `public.user_lesson_progress`), check opt-outs and suppressions, enforce event idempotency, and keep campaign execution scripts local outside version control (`.gitignore`).


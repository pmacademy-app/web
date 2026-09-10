# Prodily PM Academy — Developer Handbook

Welcome to the **Prodily PM Academy** workspace (**Prodily** is the brand, **PM Academy** is the flagship product). This document serves as the canonical developer guide for onboarding, local development setup, architectural invariants, database migrations, testing, and deployment workflows.

---

## 1. Project Overview & Scope

**Prodily PM Academy** is a 100% free, interactive, gamified learning platform for product managers. It features a curated **90-lesson curriculum** divided into **9 modules × 10 lessons each**, interactive quizzes, spaced repetition (SM-2) flashcards, capstone projects, verified certificates, and public learner portfolios.

### Branding Architecture
The platform ships under the **Prodily** brand with **PM Academy** as the product name (`Prodily PM Academy` formally).
- **Brand System**: Primary green (`#019E75`) and dark navy (`#011229`), defined in `apps/web/lib/brand.ts` and `apps/web/theme/tokens.ts`.
- **Logo Hierarchy**: `BrandLogo.tsx` provides `animated-full` (hero marketing), `full` (headers/certificates), and `icon` (collapsed/mobile).
- **Design Tokens**: Glassmorphic theme system with zero hardcoded ad-hoc styles.

### Core Architectural Invariants
* **₹0 Launch Infrastructure**: Built on top of free tiers of Vercel (hosting), Supabase (PostgreSQL + Auth), and a dual email provider setup (Brevo/Resend, both free-tier).
* **Static-First Lesson Content**: Lesson content is authored as flat Markdown files under `content/lessons/` (`lesson-001.md` … `lesson-090.md`, no frontmatter) and compiled to static JSON in `content/dist/`. **Lesson text is never stored in PostgreSQL.**
* **Decoupled Database Model**: PostgreSQL stores user progress, state, XP transactions, streaks, badges, certificates, and system telemetry. References to curriculum content use stable `lessonId` strings, never volatile slugs or database foreign keys to static text.

---

## 2. Repository Structure

```
prodily-monorepo/
├── apps/
│   └── web/                    # Next.js 16 Web Application (workspace code root)
│       ├── app/                # App Router pages, route groups, and API endpoints
│       │   ├── (app)/          # Authenticated learner surface (academy, dashboard,
│       │   │                   #   progress, leaderboard, capstones, badges, settings)
│       │   ├── (auth)/         # Unauthenticated login, signup, reset-password,
│       │   │                   #   verified, email-verified
│       │   ├── (marketing)/    # Public landing page
│       │   ├── (portfolio)/    # Public learner portfolio (p/[username])
│       │   ├── admin/          # Admin Console (19 workspace route folders)
│       │   ├── api/            # Route handlers (auth, cron, admin, settings, webhooks)
│       │   └── verify/[id]/    # Public certificate verification
│       ├── blocks/             # Custom lesson block components
│       ├── components/         # Reusable UI components (Admin, Layout, Feedback, Auth)
│       ├── e2e/                # Playwright E2E browser tests (auth lifecycle)
│       ├── emails/             # React Email templates & rendering components
│       ├── lib/                # Core business services, Supabase client, aggregations
│       │   └── __tests__/      # Vitest unit and integration test files (118 test suites)
│       ├── theme/              # Central design tokens (theme/tokens.ts)
│       ├── types/              # TypeScript types & database.ts (auto-generated schema)
│       ├── proxy.ts            # Next.js 16 request interceptor / auth routing proxy
│       ├── vitest.config.mts   # Vitest unit test runner config
│       └── playwright.config.ts# Playwright E2E runner config
├── content/
│   ├── lessons/                # 90 flat Markdown source lessons (lesson-001.md … lesson-090.md)
│   └── dist/                   # Build-time compiled lesson JSON & search index
├── docs/                       # Canonical system documentation
│   ├── INDEX.md                # Documentation reading map & index
│   ├── ARCHITECTURE.md         # System architecture & known debt
│   ├── DATABASE.md             # PostgreSQL schema & 46 versioned migrations
│   ├── TESTING.md              # Testing framework & suite inventory
│   ├── LEADERBOARD.md          # Leaderboard, cohorts, friend accountability
│   └── ...                     # Subsystem-specific specifications
├── scripts/
│   ├── brand/                  # Brand asset generation scripts
│   └── compiler/               # Markdown table parser, Mermaid SVG compiler, search builder
└── supabase/
    └── migrations/             # 46 timestamped PostgreSQL SQL migrations
```

---

## 3. Tech Stack

| Layer | Technology | Version / Notes |
|---|---|---|
| **Framework** | Next.js App Router | `16.2.12` (Turbopack engine) |
| **Language** | TypeScript | `^5.x` (Strict mode) |
| **UI Library** | React | `19.2.4` |
| **Styling** | Tailwind CSS v4 + CSS design tokens | Centralized design system, light/dark theming |
| **Charts (Admin)**| Recharts | `^3.x` (MIT, free) |
| **Database** | Supabase PostgreSQL | 46 versioned migrations |
| **Authentication** | Supabase Auth | Email/password + PKCE, custom cookie session bridge |
| **Transactional Email**| Brevo (primary) + Resend (fallback), via Supabase Auth Hook | Both called via raw `fetch`, no SDK dependency |
| **Search Engine** | FlexSearch | Pre-indexed JSON at build time |
| **Unit Testing** | Vitest | 118 test files in `apps/web/lib/__tests__/` (1256 tests) |
| **E2E Testing** | Playwright | 3 auth-lifecycle specs in `apps/web/e2e/auth/` |
| **Hosting** | Vercel Serverless | Configured at `apps/web/` root |

---

## 4. Environment Variables Reference

Create `apps/web/.env.local` with the following variables:

```env
# Public (Client + Server)
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXXXX

# Server Only (Never expose to browser)
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
PRIMARY_EMAIL_PROVIDER=brevo   # or "resend" — selects the primary provider; auto-falls back
BREVO_API_KEY=your-brevo-api-key
BREVO_FROM_EMAIL=welcome@prodily.adityagangwani.me
BREVO_WEBHOOK_SECRET=your-brevo-webhook-secret
RESEND_API_KEY=re_your_api_key
RESEND_FROM_EMAIL=welcome@prodily.adityagangwani.me
RESEND_WEBHOOK_SECRET=whsec_your_webhook_secret
SEND_EMAIL_HOOK_SECRET=your_auth_hook_secret
CRON_SECRET=your_cron_secret_token
ADMIN_EMAILS=admin@example.com
```

> [!CAUTION]
> **Secret Protection**: `SUPABASE_SERVICE_ROLE_KEY`, `BREVO_API_KEY`, `RESEND_API_KEY`, `SEND_EMAIL_HOOK_SECRET`, and `CRON_SECRET` must **never** be used in client components (`'use client'`) or committed to version control.

See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) for the complete, authoritative environment variable reference.

---

## 5. Admin Panel (Operations Center)

The **Prodily Admin Panel** is a centralized operational control center located at `/admin`.

### Access & Authentication
- **URL**: `http://localhost:3000/admin` (Login: `/admin/login`)
- **Access Guard (RBAC)**: Access is protected at multiple layers:
  1. **Proxy Middleware (`proxy.ts`)**: Rejects unauthenticated requests and redirects non-admins to `/admin/login` or `/admin/access-denied`.
  2. **Server-Side Layout Guard (`app/admin/(console)/layout.tsx`)**: Re-verifies active session authorization via `isAdminUser()` before rendering the shell.
  3. **Server-Side API Guard (`requireAdminUser()`)**: Enforces admin authorization on 100% of `/api/admin/**` route handlers before executing database queries or mutations.
- **Authorization Criteria**: A user is granted admin access if:
  - Their email is listed in the comma-separated `ADMIN_EMAILS` environment variable; **OR**
  - Their account has `is_admin = true` in the `public.users` PostgreSQL table.

### Core Workspaces & Capabilities

The Admin Console has 19 route folders; several are thin redirects into a unified hub. Full detail lives in [`docs/ADMIN_PANEL.md`](docs/ADMIN_PANEL.md) and [`docs/admin/`](docs/admin/).

| Workspace | Route | Capabilities |
|---|---|---|
| **Dashboard** | `/admin` | Real-time KPI metrics, daily learner & learning charts, conversion funnel, a 4-item Attention Center (failed emails, contact messages, pending testimonials, system alerts), 6-row system snapshot, and custom date range filters. |
| **Global Search & Attention** | Header (`Cmd+K` / `Ctrl+K`) | Multi-entity global search across learners, curriculum, certificates, and inquiries. |
| **Users** | `/admin/users` | Learner directory with search/filtering, a detail drawer (role toggle, PM Fellow toggle, Portfolio Verification override, progress reset, account deletion, production email dispatch). |
| **Communications** | `/admin/communications` | Unified hub (11 tabs): overview, broadcasts, announcements, in-app notifications, email history/queue, automations, templates, contact inbox, plus cross-links to testimonial/feedback moderation. |
| **Moderation** | `/admin/moderation` | 5 tabs: testimonials, product feedback (read-only), capstones, the legacy Fellow-designation portfolio queue, and the newer Fellow Requests review queue. |
| **Curriculum** | `/admin/curriculum` | 9-module / 90-lesson browser, clarity quality scores, learner feedback inspection. (There is no publish/unpublish control — lesson status is a static display field.) |
| **Achievements** | `/admin/achievements` | Issued certificate registry with QR verification links, badge catalog, and a developer test-certificate generator. |
| **Leaderboard** | `/admin/leaderboard` | Leaderboard inspection console, anomaly detection, and privacy/opt-out management. |
| **Analytics** | `/admin/analytics` | Active learner metrics (DAU/WAU/MAU), lesson completion drop-off funnels, quiz pass rates, level/streak distributions. |
| **System** | `/admin/system` | Platform health, auth-failure telemetry, storage cleanup, grouped error tracking (severities: `critical`/`error`/`warning`), and searchable `admin_audit_logs`. |
| **Settings** | `/admin/settings` | Product settings, runtime XP values, notification defaults, feature flag toggles, onboarding goal options. |

### Configuration & Security Considerations
- **Environment**: Ensure `ADMIN_EMAILS` is configured with authorized administrator email addresses.
- **Audit Logging**: All administrative actions (user role changes, progress resets, deletions, settings modifications, feature flag toggles, broadcasts, and email sends) automatically record structured metadata in `admin_audit_logs`.
- **Search Engine Isolation**: The entire `/admin` route tree is marked with `robots: { index: false, follow: false }` to prevent indexing.

---

## 6. Local Setup & Quickstart

### Step 1: Install Dependencies
From the repository root:
```bash
npm install
```

### Step 2: Configure Environment
```bash
cp apps/web/.env.example apps/web/.env.local
# Fill in your Supabase, Resend, and secret tokens in apps/web/.env.local
```

### Step 3: Compile Lesson Content
Compile Markdown lessons and build-time Mermaid diagrams into static JSON:
```bash
cd apps/web
npm run content:compile
```

### Step 4: Run Development Server
```bash
npm run dev
# Starts development server at http://localhost:3000
```

---

## 7. Content Compilation Pipeline

The content compiler (`scripts/compiler/compile.ts`) runs at build time:

1. **Markdown Parsing**: Reads each flat lesson file in `content/lessons/lesson-001.md` … `lesson-090.md`. Lessons have **no YAML frontmatter** — metadata (module, difficulty, prerequisites, next lesson) is parsed from an in-body `## Learning Path` table, and the lesson-number → module-slug mapping is a hardcoded range table in `compile.ts`.
2. **Static Mermaid Compilation**: Extracts ````mermaid``` code blocks and renders them to static inline SVGs using the Node.js + JSDOM runtime via `scripts/compiler/mermaid-svg.ts`.
3. **Cross-Lesson Validation**: Enforces stable `lessonId` uniqueness, 4-option quiz counts, and key takeaway presence.
4. **Curriculum & Search Aggregation**: Generates `content/dist/curriculum.json` and pre-indexes content into `content/dist/search-index.json`.

---

## 8. Testing & Quality Verification

All automated tests are executed from `apps/web/`:

```bash
# Run all 100 unit and integration test suites via Vitest
npm test                    # alias: npx vitest run

# Run tests in watch mode
npm run test:watch

# Run Playwright E2E browser tests
npx playwright test

# Run ESLint linting
npm run lint

# Run TypeScript type check
npm run typecheck

# Run full production build (content compilation + Next.js build)
npm run build
```

---

## 9. Schedulers & Background Jobs

Background jobs and queue processing are managed by GitHub Actions:
- **`ci.yml`**: Runs lint, type check, unit tests, content compile, Next.js build, Playwright E2E, and (on push to `main`) a Supabase migration deploy job.
- **`notification-scheduler.yml`**: Scheduled runner for:
  - Email queue processing (`/api/cron/process-email-queue`, every 5 min) & scheduled broadcast execution (`/api/cron/process-broadcasts`, every 5 min)
  - Failed email retries (`/api/cron/retry-failed`, hourly)
  - Daily reminder emails (`/api/cron/daily-reminder`)
  - Weekly recap distribution (`/api/cron/weekly-recap`)
  - `/api/cron/cleanup` is scheduled but currently a no-op placeholder (returns `{ cleanedRows: 0 }`, performs no cleanup)

---

## 10. Canonical Documentation Suite

All system documentation lives directly under `docs/`:

| Document | Purpose |
|---|---|
| [`docs/INDEX.md`](docs/INDEX.md) | Canonical documentation entry point and reading map |
| [`docs/HARDENING_LEDGER.md`](docs/HARDENING_LEDGER.md) | Production-hardening implementation status: what is built, what remains, next batch |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | High-level system architecture & technical invariants |
| [`docs/ADMIN_PANEL.md`](docs/ADMIN_PANEL.md) | Comprehensive Admin Console guide (workspaces, APIs, security) |
| [`docs/DATABASE.md`](docs/DATABASE.md) | PostgreSQL schema, 46 migration files, table definitions |
| [`docs/TESTING.md`](docs/TESTING.md) | Vitest test suite inventory (118 files, 1256 tests) & Playwright E2E |
| [`docs/AUTHENTICATION.md`](docs/AUTHENTICATION.md) | Auth flows, session bridge, signup + email-change verification lifecycle |
| [`docs/EMAIL_SYSTEM.md`](docs/EMAIL_SYSTEM.md) | Supabase Auth Send Email Hook, email queue, dual Brevo/Resend delivery |
| [`docs/CRON_AND_SCHEDULING.md`](docs/CRON_AND_SCHEDULING.md) | GitHub Actions workflows & cron endpoints |
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) | Vercel production hosting & environment variables |
| [`docs/LEADERBOARD.md`](docs/LEADERBOARD.md) | Leaderboard ranking modes, cohorts, friend accountability |
| [`docs/PORTFOLIO.md`](docs/PORTFOLIO.md) | Public portfolio, OG cards, Automatic Portfolio Verification, certificates |
| [`docs/ISSUES_KNOWN.md`](docs/ISSUES_KNOWN.md) | Active issue register & production gap tracker |
| [`docs/CHANGELOG.md`](docs/CHANGELOG.md) | Chronological release and commit changelog |

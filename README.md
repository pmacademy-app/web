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
* **₹0 Launch Infrastructure**: Built on top of free tiers of Vercel (hosting), Supabase (PostgreSQL + Auth), and Resend (transactional email).
* **Static-First Lesson Content**: Lesson content is authored as Markdown under `content/modules/` and compiled to static JSON in `content/dist/lessons/`. **Lesson text is never stored in PostgreSQL.**
* **Decoupled Database Model**: PostgreSQL stores user progress, state, XP transactions, streaks, badges, certificates, and system telemetry. References to curriculum content use stable `lessonId` strings (e.g. `pm-101`), never volatile slugs or database foreign keys to static text.

---

## 2. Repository Structure

```
pm-academy/
├── apps/
│   └── web/                    # Next.js 16 Web Application (workspace code root)
│       ├── app/                # App Router pages, route groups, and API endpoints
│       │   ├── (auth)/         # Unauthenticated login, signup, reset-password, verified
│       │   ├── academy/        # 90-lesson curriculum browser & lesson viewer
│       │   ├── admin/          # Admin Console (9 multi-workspace operations center)
│       │   ├── api/            # Route handlers (auth, cron, admin, settings, webhooks)
│       │   ├── dashboard/      # Learner dashboard, streak tracker, activity graph
│       │   ├── p/[username]/   # Public learner portfolio page
│       │   └── verify/[id]/    # Public certificate verification
│       ├── blocks/             # Custom lesson block components
│       ├── components/         # Reusable UI components (Admin, Layout, Feedback, Auth)
│       ├── e2e/                # Playwright E2E browser tests (auth lifecycle)
│       ├── emails/             # React Email templates & rendering components
│       ├── lib/                # Core business services, Supabase client, aggregations
│       │   └── __tests__/      # Vitest unit and integration test files (44 test suites)
│       ├── theme/              # Central design tokens (theme/tokens.ts)
│       ├── types/              # TypeScript types & database.ts (auto-generated schema)
│       ├── proxy.ts            # Next.js 16 request interceptor / auth routing proxy
│       ├── vitest.config.mts   # Vitest unit test runner config
│       └── playwright.config.ts# Playwright E2E runner config
├── content/
│   ├── modules/                # 90 human-authored Markdown source lessons (9 modules)
│   └── dist/                   # Build-time compiled lesson JSON & search index
├── docs/                       # Canonical system documentation (23 flat documents)
│   ├── INDEX.md                # Documentation reading map & index
│   ├── ARCHITECTURE.md         # System architecture & known debt
│   ├── DATABASE.md             # PostgreSQL schema & 30 versioned migrations
│   ├── TESTING.md              # Testing framework & suite inventory
│   └── ...                     # Subsystem-specific specifications
├── scripts/
│   ├── brand/                  # Brand asset generation scripts
│   └── compiler/               # Markdown AST parser, Mermaid SVG compiler, search builder
└── supabase/
    └── migrations/             # 30 timestamped PostgreSQL SQL migrations
```

---

## 3. Tech Stack

| Layer | Technology | Version / Notes |
|---|---|---|
| **Framework** | Next.js App Router | `16.2.12` (Turbopack engine) |
| **Language** | TypeScript | `^5.x` (Strict mode) |
| **UI Library** | React | `19.x` |
| **Styling** | Vanilla CSS Tokens / Tailwind | Centralized design system |
| **Charts (Admin)**| Recharts | `^3.x` (MIT, free) |
| **Database** | Supabase PostgreSQL | 30 versioned migrations |
| **Authentication** | Supabase Auth | PKCE flow + custom proxy bridge |
| **Transactional Email**| Resend API + Supabase Auth Hook | Branded transactional emails |
| **Search Engine** | FlexSearch | Pre-indexed JSON at build time |
| **Unit Testing** | Vitest | 44 test files in `apps/web/lib/__tests__/` |
| **E2E Testing** | Playwright | Multi-browser auth lifecycle tests |
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
RESEND_API_KEY=re_your_api_key
RESEND_FROM_EMAIL=welcome@prodily.adityagangwani.me
RESEND_WEBHOOK_SECRET=whsec_your_webhook_secret
SEND_EMAIL_HOOK_SECRET=your_auth_hook_secret
CRON_SECRET=your_cron_secret_token
ADMIN_EMAILS=admin@example.com
```

> [!CAUTION]
> **Secret Protection**: `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `SEND_EMAIL_HOOK_SECRET`, and `CRON_SECRET` must **never** be used in client components (`'use client'`) or committed to version control.

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
| Workspace | Route | Capabilities |
|---|---|---|
| **Dashboard** | `/admin` | Real-time KPI metrics, daily learner & learning charts, conversion funnel, recent activity stream, system snapshot, and custom date range filters (`Today`, `7D`, `30D`, `90D`, `Custom`). |
| **Global Search & Attention** | Header (`Cmd+K` / `Ctrl+K`) | Multi-entity global search across learners, curriculum, certificates, and inquiries. Header Attention Bell displays live counts and links for failed emails, contact messages, and feedback. |
| **Users** | `/admin/users` | Learner directory with search, filtering, detailed user drawers, progress reset, account deletion, and custom individual production email dispatching. |
| **Communications** | `/admin/communications` | Email queue status, failed email retries, transactional template previews & test sends, system announcements broadcast, and contact message inbox. |
| **Moderation** | `/admin/moderation` | Review and publish/reject learner testimonials, capstone project deliverables, and product feedback. |
| **Curriculum** | `/admin/curriculum` | Visual 9-module / 90-lesson browser, lesson metadata inspection, publish/unpublish toggles, and live previews. |
| **Achievements** | `/admin/achievements` | Issued certificate registry with verification links, badge catalog, and credential issuance logs. |
| **Analytics** | `/admin/analytics` | Active learner metrics (DAU/WAU/MAU), lesson completion drop-off funnels, quiz pass rates, XP velocity, and SRS retention habits. |
| **System** | `/admin/system` | Platform health monitoring, database latency, grouped error tracking with stack traces, severity-based alerts, and searchable `admin_audit_logs`. |
| **Settings** | `/admin/settings` | Product settings, runtime XP values, notification defaults, feature flag toggles, and dynamic onboarding goal option management. |

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

1. **Markdown Parsing**: Reads frontmatter and body AST from `content/modules/module-01/` through `module-09/`.
2. **Static Mermaid Compilation**: Extracts ````mermaid``` code blocks and renders them to static inline SVGs using the Node.js + JSDOM runtime via `scripts/compiler/mermaid-svg.ts`.
3. **Cross-Lesson Validation**: Enforces stable `lessonId` uniqueness, 4-option quiz counts, and key takeaway presence.
4. **Curriculum & Search Aggregation**: Generates `content/dist/curriculum.json` and pre-indexes content into `content/dist/search-index.json`.

---

## 8. Testing & Quality Verification

All automated tests are executed from `apps/web/`:

```bash
# Run all 54 unit and integration test suites via Vitest
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
- **`ci.yml`**: Runs lint, type check, unit tests, brand check, content compile, and Next.js build on every PR and push to `main`.
- **`notification-scheduler.yml`**: Scheduled runner for:
  - Email queue processing (`/api/cron/process-email-queue`)
  - Failed email retries (`/api/cron/retry-failed`)
  - Weekly recap distribution (`/api/cron/weekly-recap`)
  - Log & temporary error cleanups (`/api/cron/cleanup`)

---

## 10. Canonical Documentation Suite

All system documentation lives directly under `docs/`:

| Document | Purpose |
|---|---|
| [`docs/INDEX.md`](docs/INDEX.md) | Canonical documentation entry point and reading map |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | High-level system architecture & technical invariants |
| [`docs/ADMIN_PANEL.md`](docs/ADMIN_PANEL.md) | Comprehensive Admin Console guide (workspaces, APIs, security) |
| [`docs/DATABASE.md`](docs/DATABASE.md) | PostgreSQL schema, 30 migration files, table definitions |
| [`docs/TESTING.md`](docs/TESTING.md) | Vitest test suite inventory (54 files, 439 tests) & Playwright E2E |
| [`docs/AUTHENTICATION.md`](docs/AUTHENTICATION.md) | PKCE Auth, session bridge, signup verification lifecycle |
| [`docs/EMAIL_SYSTEM.md`](docs/EMAIL_SYSTEM.md) | Supabase Auth Send Email Hook, email queue, Resend delivery |
| [`docs/CRON_AND_SCHEDULING.md`](docs/CRON_AND_SCHEDULING.md) | GitHub Actions workflows & cron endpoints |
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) | Vercel production hosting & environment variables |
| [`docs/ISSUES_KNOWN.md`](docs/ISSUES_KNOWN.md) | Active issue register & production gap tracker |
| [`docs/CHANGELOG.md`](docs/CHANGELOG.md) | Chronological release and commit changelog |

# Prodily PM Academy — Web Application (`apps/web`)

This directory contains the Next.js 16 web application for **Prodily PM Academy**, the flagship interactive learning platform for product managers.

---

## 1. Overview & Architecture

Built with a static-first curriculum architecture and a lightweight Supabase PostgreSQL state engine:
- **Next.js 16.2.12 App Router**: Server Components for zero-bundle-size data fetching and Route Handlers for backend APIs.
- **Turbopack Build Engine**: Fast compile times and optimized static page generation.
- **Design Tokens**: Glassmorphic design system configured in `theme/tokens.ts` and `lib/brand.ts`.
- **Database Model**: PostgreSQL persistence for user state, XP events, streaks, badges, certificates, notification queues, and system error telemetry.

---

## 2. Directory Layout

```
apps/web/
├── app/                        # Next.js App Router
│   ├── (auth)/                 # Public auth pages (login, signup, reset-password, verified)
│   ├── academy/                # 90-lesson curriculum browser & lesson viewer
│   ├── admin/                  # Admin Console operations center (9 workspaces)
│   ├── api/                    # Serverless API routes (cron, admin, auth, settings, etc.)
│   ├── badges/                 # Learner badge showcase
│   ├── capstones/              # Capstone project submission & showcase
│   ├── dashboard/              # Learner dashboard, streak tracker, activity heatmap
│   ├── leaderboard/            # Cohort/Friend leaderboard rankings
│   ├── notifications/          # In-app notification center
│   ├── p/[username]/           # Public learner portfolio
│   ├── profile/                # Profile & account settings
│   └── verify/[id]/            # Public certificate authenticity verification
├── blocks/                     # Custom lesson block components
├── components/                 # React UI primitives, Admin, Layout, Auth, and Feedback
├── contexts/                   # React Contexts (auth session, breadcrumbs)
├── e2e/                        # Playwright E2E browser tests (`e2e/auth/`)
├── emails/                     # React Email templates & rendering components
├── hooks/                      # Custom client hooks
├── lib/                        # Core backend services, DB client, aggregations
│   └── __tests__/              # Vitest unit and integration test suites (44 files)
├── theme/                      # Design system tokens (`theme/tokens.ts`)
├── types/                      # TypeScript definitions & auto-generated `database.ts`
├── proxy.ts                    # Next.js 16 request interceptor & auth proxy
├── vitest.config.mts           # Vitest configuration
├── playwright.config.ts        # Playwright E2E configuration
└── vercel.json                 # Vercel deployment configuration (`{ "framework": "nextjs" }`)
```

---

## 3. Key Commands

Run these scripts from within `apps/web/`:

```bash
# Development
npm run dev                 # Start Turbopack dev server at http://localhost:3000

# Content Compilation
npm run content:compile     # Compile Markdown lessons & Mermaid diagrams to static JSON
npm run content:validate    # Validate lesson integrity, IDs, and quiz structure

# Testing & Quality
npm test                    # Run all Vitest unit and integration test suites
npm run test:watch          # Run Vitest in interactive watch mode
npx playwright test         # Run Playwright E2E browser tests
npm run lint                # Run ESLint checks

# Production Build
npm run build               # Compile content and build Next.js production bundle
npm run start               # Start production server locally
```

---

## 4. Environment Variables

Create `.env.local` in `apps/web/` using `.env.example` as a template. See [`../../docs/DEPLOYMENT.md`](../../docs/DEPLOYMENT.md) for full variable descriptions.

---

## 5. Documentation References

For full architectural and engineering documentation, refer to the [`docs/`](../../docs/) directory:
- [`docs/INDEX.md`](../../docs/INDEX.md) — Documentation index and reading map
- [`docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md) — System architecture & technical debt
- [`docs/DATABASE.md`](../../docs/DATABASE.md) — Database schema & 30 migrations
- [`docs/TESTING.md`](../../docs/TESTING.md) — Testing strategy & suite inventory
- [`docs/ADMIN_PANEL.md`](../../docs/ADMIN_PANEL.md) — Admin Console reference
- [`docs/AUTHENTICATION.md`](../../docs/AUTHENTICATION.md) — Auth flow & session bridge

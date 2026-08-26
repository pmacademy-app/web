# Canonical Documentation Index & Reading Map — Prodily PM Academy

**Repository:** `pmacademy-app/web`  
**Current Branch:** `prodily-product-evolution-plan`  
**Current Baseline HEAD:** `2496754`  
**Last Updated:** August 26, 2026  


---

## 1. Documentation Authority Hierarchy

1. **Current Production Behavior** (Live deployed runtime behavior)
2. **Current Source Code** (TypeScript routes, services, React components, compilation scripts)
3. **Database Migrations & Schema** (35 SQL DDL files in `supabase/migrations/`)
4. **Automated Unit & Integration Tests** (61 test files, 506 passed unit tests in `apps/web/lib/__tests__/`)
5. **Master Implementation Plan** (Single consolidated source of truth):
   - [`PRODILY_PRODUCT_IMPLEMENTATION_MASTER_PLAN.md`](../PRODILY_PRODUCT_IMPLEMENTATION_MASTER_PLAN.md) — Verified current state, 13 known issues, 10-phase plan with all corrections applied
6. **Detailed Architectural Documentation** (`docs/*.md`)
7. **Historical Implementation Records** (Previous session logs and stale plans)

---

## 2. Documentation Structure & Map

All project documentation lives directly under `docs/` and repository root:

| Category | Canonical Document | Purpose / Owning Topic | Status |
|---|---|---|---|
| **Master Implementation Plan** | [`PRODILY_PRODUCT_IMPLEMENTATION_MASTER_PLAN.md`](../PRODILY_PRODUCT_IMPLEMENTATION_MASTER_PLAN.md) | Verified current state + 10-phase plan with corrections | 🟢 Current |
| **Core Architecture** | [`ARCHITECTURE.md`](ARCHITECTURE.md) | High-level system architecture, tech stack, directory boundaries, known debt | 🟢 Current |
| **Product & Brand** | [`PRD.md`](PRD.md) | Product vision, target audience, brand rules, non-negotiable invariants | 🟢 Current |
| **Engineering Rules** | [`RULES.md`](RULES.md) | Engineering guidelines, secret safety, verification standards, doc authority | 🟢 Current |
| **Project Memory** | [`MEMORY.md`](MEMORY.md) | Core invariants, locked tech decisions, immutable data contracts | 🟢 Current |
| **Issue Register** | [`ISSUES_KNOWN.md`](ISSUES_KNOWN.md) | Active issue register, production gaps, known observability issues, verified debt | 🟢 Current |
| **Admin Console** | [`ADMIN_PANEL.md`](ADMIN_PANEL.md) | Primary Admin Panel reference: 9 consolidated workspaces, legacy redirects | 🟢 Current |
| **Notifications** | [`NOTIFICATIONS.md`](NOTIFICATIONS.md) | In-app notification center, mobile viewport positioning, delivery logs, idempotency | 🟢 Current |
| **Email Infrastructure**| [`EMAIL_SYSTEM.md`](EMAIL_SYSTEM.md) | Auth Hook, email queue, queue processor, Resend delivery, templates, broadcasts | 🟢 Current |
| **Authentication** | [`AUTHENTICATION.md`](AUTHENTICATION.md) | Supabase Auth, signup flow, 60s rate limit, session bridge, @supabase/ssr note | 🟢 Current |
| **Error Monitoring** | [`ERROR_MONITORING.md`](ERROR_MONITORING.md) | `logSystemError()`, secret sanitization, 15m fingerprint dedup, alerts UI | 🟢 Current |
| **Observability** | [`OBSERVABILITY.md`](OBSERVABILITY.md) | Resend usage vs application quota, queue/delivery metrics, telemetry sources | 🟢 Current |
| **Database & Schema** | [`DATABASE.md`](DATABASE.md) | PostgreSQL schema, 35 migration files, table definitions, RLS policies, types | 🟢 Current |
| **Security & RBAC** | [`SECURITY.md`](SECURITY.md) | Threat model, RBAC authorization, webhook HMAC signatures, secret safety | 🟢 Current |
| **Cron & Scheduling** | [`CRON_AND_SCHEDULING.md`](CRON_AND_SCHEDULING.md) | GitHub Actions workflows (`notification-scheduler.yml`), `CRON_SECRET` endpoints | 🟢 Current |
| **Design System** | [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md) | Prodily palette, typography, glassmorphism, responsive viewports, header feedback | 🟢 Current |
| **Content Pipeline** | [`CONTENT_SYSTEM.md`](CONTENT_SYSTEM.md) | Markdown source, Compiler v2, build-time Mermaid SVGs, FlexSearch | 🟢 Current |
| **User Progress & XP** | [`USER_SYSTEM.md`](USER_SYSTEM.md) | Progress tracking, SM-2 flashcards, XP ledger, streaks, badges | 🟢 Current |
| **Portfolio & Certs** | [`PORTFOLIO.md`](PORTFOLIO.md) | Public portfolio (`/p/[username]`), Certificate v2, LinkedIn sharing | 🟢 Current |
| **External Services** | [`INTEGRATIONS.md`](INTEGRATIONS.md) | External service matrix (Supabase, Resend, GitHub Actions), test mocks | 🟢 Current |
| **Deployment & Hosting**| [`DEPLOYMENT.md`](DEPLOYMENT.md) | Vercel deployment, Next.js build config, environment variable reference | 🟢 Current |
| **Testing & CI/CD** | [`TESTING.md`](TESTING.md) | Vitest unit/integration suites (61 files, 506 tests), Playwright E2E, CI | 🟢 Current |
| **Changelog History** | [`CHANGELOG.md`](CHANGELOG.md) | Chronological commit and release history | 🟢 Current |


# Canonical Documentation Index & Reading Map — Prodily PM Academy

**Repository:** `pmacademy-app/web`  
**Framework:** Next.js 16.2.12 (Turbopack) / React 19 / PostgreSQL (Supabase)  
**Test Suite:** 84 Test Files · 887 Unit & Integration Tests (100% Passing)  
**Database Migrations:** 39 Versioned SQL Migrations in `supabase/migrations/`  
**Last Updated:** August 30, 2026  

---

## 1. Documentation Authority Hierarchy

1. **Current Production Behavior** (Live deployed runtime behavior)
2. **Current Source Code** (TypeScript routes, services, React components, compilation scripts)
3. **Database Migrations & Schema** (39 SQL DDL files in `supabase/migrations/`)
4. **Automated Unit & Integration Tests** (84 test files, 887 passed unit tests in `apps/web/lib/__tests__/`)
5. **Operating Manuals & Workspaces** (`docs/admin/*.md`)
6. **Detailed Architectural Documentation** (`docs/*.md`)
7. **Historical Implementation Records** (Previous session logs and stale plans)

---

## 2. Documentation Structure & Map

### Core Architecture & Technical Documentation (`docs/`)

All primary architectural documentation lives directly under `docs/`:

| Category | Canonical Document | Purpose / Owning Topic | Status |
|---|---|---|---|
| **Core Architecture** | [`ARCHITECTURE.md`](ARCHITECTURE.md) | High-level system architecture, tech stack, directory boundaries, known debt | 🟢 Current |
| **Product & Brand** | [`PRD.md`](PRD.md) | Product vision, target audience, brand rules, non-negotiable invariants | 🟢 Current |
| **Engineering Rules** | [`RULES.md`](RULES.md) | Engineering guidelines, secret safety, verification standards, doc authority | 🟢 Current |
| **Project Memory** | [`MEMORY.md`](MEMORY.md) | Core invariants, locked tech decisions, immutable data contracts | 🟢 Current |
| **Issue Register** | [`ISSUES_KNOWN.md`](ISSUES_KNOWN.md) | Active issue register, production gaps, known observability issues, verified debt | 🟢 Current |
| **Admin Console Reference** | [`ADMIN_PANEL.md`](ADMIN_PANEL.md) | Technical reference for Admin Panel architecture, RBAC, services, and APIs | 🟢 Current |
| **Notifications** | [`NOTIFICATIONS.md`](NOTIFICATIONS.md) | In-app notification center, mobile viewport positioning, broadcasts, delivery logs | 🟢 Current |
| **Email Infrastructure**| [`EMAIL_SYSTEM.md`](EMAIL_SYSTEM.md) | Auth Hook, email queue, queue processor, Resend delivery, broadcasts, templates | 🟢 Current |
| **Authentication** | [`AUTHENTICATION.md`](AUTHENTICATION.md) | Supabase Auth, signup flow, 60s rate limit, session bridge, platform settings | 🟢 Current |
| **Error Monitoring** | [`ERROR_MONITORING.md`](ERROR_MONITORING.md) | `logSystemError()`, secret sanitization, 15m fingerprint dedup, alerts UI | 🟢 Current |
| **Observability** | [`OBSERVABILITY.md`](OBSERVABILITY.md) | Resend usage vs application quota, queue/delivery metrics, telemetry sources | 🟢 Current |
| **Database & Schema** | [`DATABASE.md`](DATABASE.md) | PostgreSQL schema, 39 migration files, table definitions, RLS policies, types | 🟢 Current |
| **Security & RBAC** | [`SECURITY.md`](SECURITY.md) | Threat model, RBAC authorization, webhook HMAC signatures, secret safety | 🟢 Current |
| **Cron & Scheduling** | [`CRON_AND_SCHEDULING.md`](CRON_AND_SCHEDULING.md) | GitHub Actions workflows (`notification-scheduler.yml`), `CRON_SECRET` endpoints | 🟢 Current |
| **Design System** | [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md) | Prodily palette, typography, glassmorphism, responsive viewports, header feedback | 🟢 Current |
| **Content Pipeline** | [`CONTENT_SYSTEM.md`](CONTENT_SYSTEM.md) | Markdown source, Compiler v2, build-time Mermaid SVGs, FlexSearch | 🟢 Current |
| **User Progress & XP** | [`USER_SYSTEM.md`](USER_SYSTEM.md) | Progress tracking, SM-2 flashcards, XP ledger, streaks, badges, referrals | 🟢 Current |
| **Portfolio & Certs** | [`PORTFOLIO.md`](PORTFOLIO.md) | Public portfolio (`/p/[username]`), Fellow designation, dynamic OG card, Certificate v2 | 🟢 Current |
| **External Services** | [`INTEGRATIONS.md`](INTEGRATIONS.md) | External service matrix (Supabase, Resend, GitHub Actions), test mocks | 🟢 Current |
| **Deployment & Hosting**| [`DEPLOYMENT.md`](DEPLOYMENT.md) | Vercel deployment, Next.js build config, environment variable reference | 🟢 Current |
| **Testing & CI/CD** | [`TESTING.md`](TESTING.md) | Vitest unit/integration suites (84 files, 887 tests), Playwright E2E, CI | 🟢 Current |
| **Changelog History** | [`CHANGELOG.md`](CHANGELOG.md) | Chronological commit and release history | 🟢 Current |

---

### Admin Panel Operating Manuals (`docs/admin/`)

Practical operating guides for platform administrators live under `docs/admin/`:

| Guide | Location | Focus Area |
|---|---|---|
| **Admin Hub & Index** | [`docs/admin/README.md`](admin/README.md) | Overview, navigation map, and role-based permissions |
| **Dashboard Operations** | [`docs/admin/dashboard.md`](admin/dashboard.md) | KPIs, Attention Center, real-time charts, learning journey funnel |
| **User Management** | [`docs/admin/users.md`](admin/users.md) | Search, filters, drawer tabs, role toggles, reset & delete actions |
| **Portfolio Verification** | [`docs/admin/portfolio-verification.md`](admin/portfolio-verification.md) | Verification queue, Fellow designation semantics, in-line actions |
| **Moderation Workspace** | [`docs/admin/moderation.md`](admin/moderation.md) | Testimonials, product feedback, capstones, and portfolio queue |
| **Communications & Messaging** | [`docs/admin/communications.md`](admin/communications.md) | Unified communications hub, template editor, contact inbox |
| **Email Operations** | [`docs/admin/emails.md`](admin/emails.md) | Email queue, broadcast builder, automation schedules, test send |
| **In-App Notifications** | [`docs/admin/notifications.md`](admin/notifications.md) | In-app broadcasts, template manager, system announcements |
| **Referrals & Growth** | [`docs/admin/referrals.md`](admin/referrals.md) | Attribution lifecycle, activation rewards, admin user metrics |
| **Curriculum Management** | [`docs/admin/curriculum.md`](admin/curriculum.md) | 90-lesson browser, clarity quality scores, feedback inspection |
| **Achievements & Credentials** | [`docs/admin/achievements.md`](admin/achievements.md) | Certificates registry, verification drawer, badges, test cert generator |
| **Analytics & Reporting** | [`docs/admin/analytics.md`](admin/analytics.md) | Learner acquisition, retention, drop-offs, XP velocity, CSV export |
| **System Health & Monitoring** | [`docs/admin/system.md`](admin/system.md) | Service diagnostics, error logs, alerts, audit trails, queue trigger |
| **Platform Settings & Controls** | [`docs/admin/platform-settings.md`](admin/platform-settings.md) | Maintenance mode, signups, email verification, XP values, feature flags |

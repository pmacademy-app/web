# Canonical Documentation Index & Reading Map — Prodily PM Academy

**Repository:** `prodily-monorepo` (app code at `apps/web/`)
**Framework:** Next.js 16.2.12 (Turbopack) / React 19.2.4 / PostgreSQL (Supabase)  
**Test Suite:** 140 Test Files · 1710 Unit & Integration Tests (100% Passing)  
**Database Migrations:** 48 Applied Migrations in `supabase/migrations/`  
**Last Updated:** September 14, 2026  

> **Where the work stands.** [`HARDENING_LEDGER.md`](HARDENING_LEDGER.md) is the
> authoritative record of implementation status; [`FINAL_IMPLEMENTATION_PLAN.md`](FINAL_IMPLEMENTATION_PLAN.md)
> remains the locked specification. Where they disagree about *status*, the ledger
> wins; about *scope*, the plan wins. **B0–B6 and Phase 1 (B8-A…B8-E, B9-A) are complete and deployed. Phase 2 is in progress on `b10a-b14b/error-boundaries-logout-ci-security` (not merged): the Next.js 16.3.5 security prerequisite, B10-A, B14-B and B7-A through B7-D are complete in code. Next batch: B7-E.**

---

## 1. Documentation Authority Hierarchy

1. **Current Production Behavior** (Live deployed runtime behavior)
2. **Current Source Code** (TypeScript routes, services, React components, compilation scripts)
3. **Database Migrations & Schema** (48 SQL DDL files in `supabase/migrations/`)
4. **Automated Unit & Integration Tests** (140 test files, 1710 passed unit tests in `apps/web/lib/__tests__/`)
5. **Operating Manuals & Workspaces** (`docs/admin/*.md`)
6. **Detailed Architectural Documentation** (`docs/*.md`)
7. **Historical Implementation Records** (Previous session logs and stale plans)

---

## 2. Documentation Structure & Map

### Core Architecture & Technical Documentation (`docs/`)

All primary architectural documentation lives directly under `docs/`:

| Category | Canonical Document | Purpose / Owning Topic | Status |
|---|---|---|---|
| **Implementation Status** | [`HARDENING_LEDGER.md`](HARDENING_LEDGER.md) | **Authoritative execution state:** what is built, what the 2026-09-09 incident fix (`10a21a5`) already delivered, per-batch status B0–B14, open questions, and the next batch | 🟢 Current |
| **Implementation Plan** | [`FINAL_IMPLEMENTATION_PLAN.md`](FINAL_IMPLEMENTATION_PLAN.md) | **LOCKED** specification: locked decisions, P0 safety tasks, 16 initiatives, batch specifications, gates, rollout and signup-reopening criteria. Carries a status overlay pointing at the ledger — check the ledger before starting any batch | 🔒 Locked |
| **Production Audits** | [`audits/`](audits/) | Stage 1–4 read-only audits (architecture, security, frontend/mobile, reliability/operations) and the two 2026-09 signup-abuse incident investigations. **Historical evidence** — findings are preserved as written and several are since fixed; each carries a status banner | 🟡 Historical |
| **Architecture Baseline** | [`archive/PRODUCTION_BLUEPRINT.md`](archive/PRODUCTION_BLUEPRINT.md) | Target-architecture rationale behind the implementation plan. Superseded by `FINAL_IMPLEMENTATION_PLAN.md` for anything actionable | 🟡 Reference |
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
| **Architecture Decisions** | [`decisions/`](decisions/) | ADRs for significant, expensive-to-reverse decisions (email failover, failure classification, config control plane, error taxonomy, redaction, API error contract) | 🟢 Current |
| **Observability** | [`OBSERVABILITY.md`](OBSERVABILITY.md) | Resend usage vs application quota, queue/delivery metrics, telemetry sources | 🟢 Current |
| **Database & Schema** | [`DATABASE.md`](DATABASE.md) | PostgreSQL schema, 41 migration files, table definitions, RLS policies, types | 🟢 Current |
| **Security & RBAC** | [`SECURITY.md`](SECURITY.md) | Threat model, RBAC authorization, webhook HMAC signatures, secret safety | 🟢 Current |
| **Cron & Scheduling** | [`CRON_AND_SCHEDULING.md`](CRON_AND_SCHEDULING.md) | GitHub Actions workflows (`notification-scheduler.yml`), `CRON_SECRET` endpoints | 🟢 Current |
| **Design System** | [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md) | Prodily palette, typography, glassmorphism, responsive viewports, header feedback | 🟢 Current |
| **Content Pipeline** | [`CONTENT_SYSTEM.md`](CONTENT_SYSTEM.md) | Markdown source, Compiler v2, build-time Mermaid SVGs, FlexSearch | 🟢 Current |
| **User Progress & XP** | [`USER_SYSTEM.md`](USER_SYSTEM.md) | Progress tracking, SM-2 flashcards, XP ledger, streaks, badges, referrals | 🟢 Current |
| **Portfolio & Certs** | [`PORTFOLIO.md`](PORTFOLIO.md) | Public portfolio (`/p/[username]`), Automatic Portfolio Verification, dynamic OG card, certificates | 🟢 Current |
| **Leaderboard & Social** | [`LEADERBOARD.md`](LEADERBOARD.md) | Global/Cohort/Friends ranking modes, cohorts, Friend Accountability | 🟢 Current |
| **External Services** | [`INTEGRATIONS.md`](INTEGRATIONS.md) | External service matrix (Supabase, Resend, GitHub Actions), test mocks | 🟢 Current |
| **Deployment & Hosting**| [`DEPLOYMENT.md`](DEPLOYMENT.md) | Vercel deployment, Next.js build config, environment variable reference | 🟢 Current |
| **Testing & CI/CD** | [`TESTING.md`](TESTING.md) | Vitest unit/integration suites (100 files, 1029 tests), Playwright E2E, CI | 🟢 Current |
| **Changelog History** | [`CHANGELOG.md`](CHANGELOG.md) | Chronological commit and release history | 🟢 Current |

---

### Admin Panel Operating Manuals (`docs/admin/`)

Practical operating guides for platform administrators live under `docs/admin/`:

| Guide | Location | Focus Area |
|---|---|---|
| **Admin Hub & Index** | [`docs/admin/README.md`](admin/README.md) | Overview, navigation map, and role-based permissions |
| **Dashboard Operations** | [`docs/admin/dashboard.md`](admin/dashboard.md) | KPIs, Attention Center, real-time charts, learning journey funnel |
| **User Management** | [`docs/admin/users.md`](admin/users.md) | Search, filters, drawer tabs, role toggles, reset & delete actions |
| **PM Fellow Designation** | [`docs/admin/fellow-designation.md`](admin/fellow-designation.md) | Learner-initiated Fellow requests, the legacy admin portfolio-browse queue, `is_fellow` |
| **Portfolio Verification** | [`docs/admin/portfolio-verification.md`](admin/portfolio-verification.md) | Automatic eligibility-based verification (distinct from Fellow), admin override |
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

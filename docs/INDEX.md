# Canonical Documentation Index and Reading Map: Prodily

**Repository:** `prodily-monorepo` (app code at `apps/web/`)
**Framework:** Next.js 16.4.3 (Turbopack) / React 19.2.4 / PostgreSQL (Supabase)
**Test Suite:** 304 tracked Vitest files (`git ls-files 'apps/web/*.test.ts' 'apps/web/*.test.tsx'`) and 6 Playwright spec files under `apps/web/e2e/`
**Database Migrations:** 70 top-level migrations in `supabase/migrations/` (plus `rollback/`, `validation/` and `pending-approval/`, which the Supabase CLI never reads)
**Last Updated:** 2026-11-13

> **Where the work stands.** `main` is at `41ce885` (PR #82). Plan Phases 1 and 2 of
> [`../08-IMPLEMENTATION-PLAN.md`](../08-IMPLEMENTATION-PLAN.md) are merged (PR #64, PR #73), with
> Phase 2 owner steps still to do per [`ops/phase2-owner-runbook.md`](ops/phase2-owner-runbook.md).
> The dead-code "Phase 3" from [`DEAD_CODE_AUDIT.md`](DEAD_CODE_AUDIT.md) is merged (PR #79). The
> follow-up cleanup on branch `chore/post-phase3-cleanup` is **not merged yet**. Plan Phase 3
> (PR-14 to PR-20, platform safety) and Phases 4 and 5 are the remaining work: see
> [`ROADMAP.md`](ROADMAP.md) for the order and [`../tasks/antigravity/README.md`](../tasks/antigravity/README.md)
> for one brief per task. History is in [`CHANGELOG.md`](CHANGELOG.md).

---

## 1. Documentation Authority Hierarchy

1. **Current Production Behavior** (Live deployed runtime behavior)
2. **Current Source Code** (TypeScript routes, services, React components, compilation scripts)
3. **Database Migrations & Schema** (70 top-level SQL files in `supabase/migrations/`; held files in `pending-approval/` are not applied)
4. **Automated Tests** (304 Vitest files in `apps/web/lib/__tests__/` and `apps/web/components/__tests__/`; 6 Playwright spec files in `apps/web/e2e/`)
5. **Operating Manuals & Workspaces** (`docs/admin/*.md`, `docs/ops/*.md`)
6. **Detailed Architectural Documentation** (`docs/*.md`)
7. **Historical Implementation Records** (Previous session logs and stale plans)

---

## 2. Documentation Structure & Map

### Plans, Audit and Status

| Category | Canonical Document | Purpose / Owning Topic | Status |
|---|---|---|---|
| **Remaining Work** | [`ROADMAP.md`](ROADMAP.md) | What is left after Phases 1, 2 and the dead-code Phase 3, in order: plan Phase 3 (PR-14 to PR-20), owner steps, Phases 4 and 5 | 🟢 Current |
| **Task Briefs** | [`../tasks/antigravity/README.md`](../tasks/antigravity/README.md) | One brief per remaining task (AG-xx files), each with scope, files and verify commands | 🟢 Current |
| **Implementation Plan** | [`../08-IMPLEMENTATION-PLAN.md`](../08-IMPLEMENTATION-PLAN.md) | The phased fix plan (PR-01 to PR-30) built from the 2026-10-17 audit, with the finding-ID coverage matrix. Read only | 🔒 Locked |
| **Audit** | [`../audit/00-INDEX.md`](../audit/00-INDEX.md) | The 2026-10-17 seven-report audit (UI/UX, market, security, engineering, code quality, SEO/AEO, product) and the checked headline findings. Source of finding IDs. Read only | 🟡 Reference |
| **Phase 2 Owner Steps** | [`ops/phase2-owner-runbook.md`](ops/phase2-owner-runbook.md) | Dashboard settings, Vault secrets, held SQL and the order to run them in. Nothing in it has been applied yet | 🟠 Owner Action |
| **Held Migrations** | [`../supabase/migrations/pending-approval/README.md`](../supabase/migrations/pending-approval/README.md) | Migrations kept out of the auto-apply path (pg_cron schedule, username CHECK, `lock_public_users`, waitlist drop, retired-flag cleanup, admin backfill) with their rollback and validation files | 🟠 Owner Action |
| **Hardening Ledger** | [`HARDENING_LEDGER.md`](HARDENING_LEDGER.md) | Record of the B0 to B14 hardening batches (September 2026). Historical: current status lives in the roadmap and changelog | 🟡 Historical |
| **Dead Code & Tech Debt** | [`DEAD_CODE_AUDIT.md`](DEAD_CODE_AUDIT.md) | Dead-code inventory, the Phase 3 batches 3-A to 3-D, what landed in PR #79 and on `chore/post-phase3-cleanup`, and the candidates not acted on | 🟢 Done |
| **Changelog History** | [`CHANGELOG.md`](CHANGELOG.md) | Chronological commit and release history | 🟢 Current |

Removed docs: `FINAL_IMPLEMENTATION_PLAN.md`, `B12A_MARKETING_PERFORMANCE_BASELINE.md` and `docs/archive/` (including `PRODUCTION_BLUEPRINT.md`) were deleted in `1dbd2a4`; `docs/audits/` was retired in `76bc600`; `PHASE_HISTORY.md` was deleted in `f4343d3`. Read any of them with `git show <commit>^:<path>`, for example `git show f4343d3^:docs/PHASE_HISTORY.md`.

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
| **Authentication** | [`AUTHENTICATION.md`](AUTHENTICATION.md) | Supabase Auth, signup flow, 60s rate limit, the B13-A single session owner (httpOnly cookies only; the client bridge is deleted), platform settings | 🟢 Current |
| **Error Monitoring** | [`ERROR_MONITORING.md`](ERROR_MONITORING.md) | `logSystemError()`, secret sanitization, 15m fingerprint dedup, alerts UI | 🟢 Current |
| **Architecture Decisions** | [`decisions/`](decisions/) | ADRs for significant, expensive-to-reverse decisions (email failover, failure classification, config control plane, error taxonomy, redaction, API error contract; the activation-programme ADRs 007 collapse-entrance, 008 module-entry unlock, 009 payoff-visible, 010 close-the-loop; 011 Fellow LinkedIn credential). The activation phases and their experiments (all off by default) are recorded in ADR-007 to ADR-010 | 🟢 Current |
| **Observability** | [`OBSERVABILITY.md`](OBSERVABILITY.md) | Resend usage vs application quota, queue/delivery metrics, telemetry sources | 🟢 Current |
| **Database & Schema** | [`DATABASE.md`](DATABASE.md) | PostgreSQL schema, 70 top-level migration files, table definitions, RLS policies, types | 🟢 Current |
| **Baseline Queries** | [`BASELINE_QUERIES.md`](BASELINE_QUERIES.md) | Read-only SQL behind the Phase 0.B activation baseline, run by `npm run baseline:report` | 🟢 Current |
| **Security & RBAC** | [`SECURITY.md`](SECURITY.md) | Threat model, RBAC authorization, webhook HMAC signatures, secret safety | 🟢 Current |
| **Cron & Scheduling** | [`CRON_AND_SCHEDULING.md`](CRON_AND_SCHEDULING.md) | GitHub Actions workflows (`notification-scheduler.yml`), `CRON_SECRET` endpoints | 🟢 Current |
| **Design System** | [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md) | Prodily palette, typography, glassmorphism, responsive viewports, header feedback | 🟢 Current |
| **API Contract** | [`API_CONTRACT.md`](API_CONTRACT.md) | B13-B: the list pagination contract (`limit`/`offset`, envelope, server-side caps as an abuse control) and the API versioning policy: why `/api/v2` is not a version boundary and why versioning defers to D-04/D-01 | 🟢 Current |
| **Content Pipeline** | [`CONTENT_SYSTEM.md`](CONTENT_SYSTEM.md) | Markdown source, Compiler v2, build-time Mermaid SVGs, and the compiler-built JSON search index served by `/api/search-index` | 🟢 Current |
| **User Progress & XP** | [`USER_SYSTEM.md`](USER_SYSTEM.md) | Progress tracking, SM-2 flashcards, XP ledger, streaks, badges, referrals | 🟢 Current |
| **Portfolio & Certs** | [`PORTFOLIO.md`](PORTFOLIO.md) | Public portfolio (`/p/[username]`), Automatic Portfolio Verification, dynamic OG card, certificates | 🟢 Current |
| **Leaderboard & Social** | [`LEADERBOARD.md`](LEADERBOARD.md) | Global/Cohort/Friends ranking modes, cohorts, Friend Accountability | 🟢 Current |
| **Marketing Email History** | [`MARKETING_EMAIL_HISTORY.md`](MARKETING_EMAIL_HISTORY.md) | Record of past marketing and campaign email sends | 🟡 Historical |
| **External Services** | [`INTEGRATIONS.md`](INTEGRATIONS.md) | External service matrix (Supabase, Resend, GitHub Actions), test mocks | 🟢 Current |
| **Deployment & Hosting**| [`DEPLOYMENT.md`](DEPLOYMENT.md) | Vercel deployment, Next.js build config, environment variable reference | 🟢 Current |
| **Testing & CI/CD** | [`TESTING.md`](TESTING.md) | Vitest unit/integration/component suites (304 files), Playwright E2E (6 spec files), CI gates | 🟢 Current |

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

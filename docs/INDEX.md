# Canonical Documentation Index & Reading Map — Prodily PM Academy

**Repository:** `pmacademy-app/web`  
**Current Baseline HEAD:** `875f6ba`  
**Last Updated:** August 11, 2026  

---

## 1. Documentation Structure & Map

All project documentation lives directly under `docs/`. The documentation suite consists of 22 canonical documents:

| Category | Canonical Document | Purpose / Owning Topic | Status |
|---|---|---|---|
| **Core Architecture** | [`ARCHITECTURE.md`](ARCHITECTURE.md) | High-level system architecture, tech stack, directory boundaries | 🟢 Verified |
| **Product & Brand** | [`PRD.md`](PRD.md) | Product vision, target audience, brand rules, non-negotiable invariants | 🟢 Verified |
| **Engineering Rules** | [`RULES.md`](RULES.md) | Engineering guidelines, secret safety, documentation authority rule | 🟢 Verified |
| **Project Memory** | [`MEMORY.md`](MEMORY.md) | Core invariants, locked tech decisions, immutable data contracts | 🟢 Verified |
| **Issue Register** | [`ISSUES_KNOWN.md`](ISSUES_KNOWN.md) | Active issue register, production gaps, known observability issues | 🟢 Verified |
| **Admin Console** | [`ADMIN_PANEL.md`](ADMIN_PANEL.md) | Specification of all 12 Admin tabs, actions, modal flows, and APIs | 🟢 Verified |
| **Notifications** | [`NOTIFICATIONS.md`](NOTIFICATIONS.md) | In-app notification center, mobile viewport positioning, delivery logs | 🟢 Verified |
| **Email Infrastructure**| [`EMAIL_SYSTEM.md`](EMAIL_SYSTEM.md) | Auth Hook, email queue, queue processor, Resend delivery, templates | 🟢 Verified |
| **Authentication** | [`AUTHENTICATION.md`](AUTHENTICATION.md) | Supabase Auth, signup flow, 60s rate limit, unverified user discovery | 🟢 Verified |
| **Error Monitoring** | [`ERROR_MONITORING.md`](ERROR_MONITORING.md) | `logSystemError()`, secret sanitization, 15m fingerprint dedup, alerts UI | 🟢 Verified |
| **Observability** | [`OBSERVABILITY.md`](OBSERVABILITY.md) | Resend usage vs application quota, queue/delivery metrics, telemetry sources | 🟢 Verified |
| **Database & Schema** | [`DATABASE.md`](DATABASE.md) | PostgreSQL schema, 24 migration files, table definitions, RLS policies | 🟢 Verified |
| **Security & RBAC** | [`SECURITY.md`](SECURITY.md) | Threat model, RBAC authorization, webhook HMAC signatures, secret safety | 🟢 Verified |
| **Cron & Scheduling** | [`CRON_AND_SCHEDULING.md`](CRON_AND_SCHEDULING.md) | GitHub Actions workflows (`email-cron.yml`), `CRON_SECRET` endpoints | 🟢 Verified |
| **Design System** | [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md) | Prodily palette, typography, glassmorphism, responsive viewports | 🟢 Verified |
| **Content Pipeline** | [`CONTENT_SYSTEM.md`](CONTENT_SYSTEM.md) | Markdown source, Compiler v2, build-time Mermaid SVGs, FlexSearch | 🟢 Verified |
| **User Progress & XP** | [`USER_SYSTEM.md`](USER_SYSTEM.md) | Progress tracking, SM-2 flashcards, XP ledger, streaks, badges | 🟢 Verified |
| **Portfolio & Certs** | [`PORTFOLIO.md`](PORTFOLIO.md) | Public portfolio (`/p/[username]`), Certificate v2, LinkedIn sharing | 🟢 Verified |
| **External Services** | [`INTEGRATIONS.md`](INTEGRATIONS.md) | External service matrix (Supabase, Resend, GitHub Actions), test mocks | 🟢 Verified |
| **Deployment & Hosting**| [`DEPLOYMENT.md`](DEPLOYMENT.md) | Vercel deployment, Next.js build config, environment variable reference | 🟢 Verified |
| **Testing & CI/CD** | [`TESTING.md`](TESTING.md) | Automated unit test suites, verification commands, GitHub Actions CI | 🟢 Verified |
| **Changelog History** | [`CHANGELOG.md`](CHANGELOG.md) | Chronological commit history up to baseline HEAD `490fea3` | 🟢 Verified |

---

## 2. Documentation Authority Hierarchy

1. **Current Production Behavior** (Live deployed runtime behavior)
2. **Current Source Code** (TypeScript routes, services, React components, compilation scripts)
3. **Database Migrations & Schema** (SQL DDL in `supabase/migrations/`)
4. **Actual External Integration Behavior** (Resend API response structures, Supabase Auth Hooks)
5. **Automated Unit & Integration Tests** (Execution assertions in `apps/web/lib/__tests__/`)
6. **Existing Implementation Reports** (Audit reports produced in conversation history)
7. **Old Documentation** (Historical context only)

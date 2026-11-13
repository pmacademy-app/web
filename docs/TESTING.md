# Automated Testing & Verification Framework (Prodily)

**Repository:** `prodily-monorepo` (app code at `apps/web/`)
**Test Runner:** Vitest (Unit & Integration) / Playwright (E2E)  
**Test Files:** 304 tracked Vitest files (273 in `apps/web/lib/__tests__/`, 31 in `apps/web/components/__tests__/`) and 6 Playwright spec files under `apps/web/e2e/`, measured with `git ls-files` on 2026-11-12  
**Last Updated:** November 12, 2026  

---

## 1. Overview & Test Framework

The repository uses **Vitest** for fast, high-coverage unit and integration testing, and **Playwright** for end-to-end browser flows.

| Test Layer | Runner / Framework | Command | Target Directory |
|---|---|---|---|
| **Unit & Integration** | Vitest | `npx vitest run <file>` (focused) or `npm test` (full, CI) | `apps/web/lib/__tests__/`, `apps/web/components/__tests__/` |
| **Type Checking** | TypeScript | `npm run typecheck` (`tsc --noEmit`) | `apps/web/` |
| **Linting** | ESLint | `npm run lint` | `apps/web/` |
| **Production Build** | Next.js 16.4.3 Turbopack | `npm run build` (CI) | `apps/web/` |
| **E2E Browser Tests** | Playwright | `npm run test:e2e` | `apps/web/e2e/` |

---

## 2. Test Suite Inventory

The list below is a representative sample of `apps/web/lib/__tests__/` grouped by domain, not an exhaustive file-by-file index. The directory holds 273 files (plus 31 component suites under `apps/web/components/__tests__/`) and includes many additional suites (e.g. `dashboard.test.ts`, `analytics-aggregation.test.ts`, `onboarding.test.ts`, `system-monitoring.test.ts`, `portfolio-verification.test.ts`, `friend-accountability.test.ts`, `auth-callback-email-change.test.ts`, several `phaseN-*.test.ts` files) not individually listed here.

### Core Domain, Learning & Gamification Suites
- `xp.test.ts` — XP formulas, level thresholds, and ledger mutations.
- `streaks.test.ts` — Timezone-aware streak evaluations and streak freeze deductions.
- `srs.test.ts` — SuperMemo SM-2 spaced repetition calculation logic.
- `skillRadar.test.ts` — Competency radar scoring and spider chart aggregations.
- `capstones.test.ts` — Capstone business rules, deliverable validation, and public visibility.
- `certificates.test.ts` — Certificate code generation, issuance, and QR verification link building.
- `badges.test.ts` — Milestone badge evaluation and award logic.
- `leaderboard.test.ts` — Global, cohort, and friends leaderboard ranking (consistency-first sort: days studied → lessons completed → weekly XP → streak).
- `curriculum-integrity.test.ts` — 9-module & 90-lesson ID structure alignment.
- `curriculum-prerequisite-access.test.ts` — Prerequisite unlocking and sequential progression.
- `curriculum-access-override.test.ts` — Admin bypass for curriculum prerequisite locks.
- `learning-settings-runtime.test.ts` — Dynamic runtime XP resolution from `system_settings`.
- `lesson-feedback.test.ts` — 1–5 star clarity ratings and issue tag submissions.
- `first-session-activation.test.ts` — First-lesson onboarding and activation triggers.
- `recap-evaluator.test.ts` — Weekly recap evaluation and habit metrics.

### Portfolio, Fellow Designation & SEO Suites
- `portfolio.test.ts` — Public portfolio generation, privacy fallback, and layout ordering.
- `portfolio-admin-verification.test.ts` — Dedicated admin portfolio verification queue, public/private eligibility invariant, and audit logging.
- `portfolio-og-card.test.ts` — Dynamic 1200×630 OpenGraph card generation, brand SVG logo mark, and cache headers.
- `portfolio-credibility.test.ts` — Fellow designation rendering, non-employment claims, and Schema.org JSON-LD Person markup.
- `portfolio-readiness.test.ts` — Public portfolio readiness evaluator and missing items checklist.
- `fellow-status-authorization.test.ts` — RBAC authorization and tamper-proofing for Fellow status.
- `seo-canonicals.test.ts` — Self-referencing canonical tag verification.
- `seo-structured-data.test.ts` — Course, LearningResource, and Person structured JSON-LD.
- `seo-social-metadata.test.ts` — OpenGraph, Twitter cards, and dynamic XML sitemap verification (including public portfolios).

### Referrals & Growth Suites
- `referral-system.test.ts` — Referral attribution, self-referral prevention, rolling rate limits, first-lesson-completion activation trigger, +50 XP reward, and in-app notifications.

### Authentication & Account Security Suites
- `auth-ui-integration.test.ts` — Login, registration form validation, and verification pending UI.
- `auth-errors.test.ts` — Authentication error classification and message mapping.
- `settings-change-password.test.ts` — Password change and strength validation.
- `update-password.test.ts` — Password recovery token update route.
- `unsubscribe.test.ts` — One-click email unsubscribe tokens and preference updates.
- `middleware-auth.test.ts` — Proxy route protection and session token verification.
- `platform-behavior.test.ts` — Platform-wide controls: Maintenance Mode, Allow Signups, Require Email Verification.

### Email & Notification Infrastructure Suites
- `email-hook-reliability.test.ts` — Supabase Send Email Hook timeouts, Svix HMAC signatures, and Brevo fallback.
- `admin-email-test-send.test.ts` — Transactional template preview and direct test dispatch.
- `admin-production-email.test.ts` — Direct user production email modal dispatch.
- `notification-queue-integrity.test.ts` — Email queue claiming, concurrency locks, and dead-letter retries.
- `in-app-notifications.test.ts` — In-app notification creation, unread counts, and mark-as-read.
- `in-app-notification-manager.test.ts` — In-app broadcast campaign engine and recipient estimation.
- `broadcast-service.test.ts` — Targeted email broadcast campaigns and recipient sampling.
- `admin-digest-schedule.test.ts` — Daily reminders and weekly recap cron schedulers.
- `contact.test.ts` — Inbound contact form, rate limiting, and webhook forwarding.

### Admin Workspaces & Operations Suites
- `admin-console.test.ts` — Admin dashboard KPIs, attention center, and feature flags.
- `admin-security-audit.test.ts` — Route-level RBAC protection on all `/api/admin/**` endpoints.
- `admin-settings.test.ts` — Admin settings persistence in `system_settings` across all sections.
- `users-aggregation.test.ts` — User table pagination, search, and activity filtering.
- `curriculum-aggregation.test.ts` — Curriculum quality scores, clarity %, and feedback aggregation.
- `achievements-aggregation.test.ts` — Certificate registry and badge recipient aggregations.
- `feedback-moderation.test.ts` — Testimonial approval/rejection and feedback moderation.
- `admin-queue-recovery.test.ts` — Stalled queue item recovery and retry operations.
- `db-types-alignment.test.ts` — Type alignment between TypeScript definitions and Supabase schema.
- `rls.test.ts` — PostgreSQL Row Level Security policy enforcement.

---

## 3. Standard Verification Commands

```bash
# From apps/web/

# Run one focused Vitest file (preferred locally)
npx vitest run lib/__tests__/<file>.test.ts

# Run a focused domain script (see the test:* scripts in package.json, e.g. test:rls, test:admin, test:a11y)
npm run test:rls

# Run TypeScript typecheck (0 errors)
npm run typecheck

# Run ESLint (0 errors, 0 warnings)
npm run lint

# Full Vitest suite and production build: CI runs these on every PR.
# Both tend to time out on a local machine, so leave them to CI.
npm test
npm run build

# Run Playwright E2E browser tests (6 specs under e2e/auth/, e2e/flows/ and e2e/)
npm run test:e2e
```

---

## 4. Continuous Integration & Release Gates

GitHub Actions (`.github/workflows/ci.yml`) runs these gates on every pull request to `main` and every push to `main`:
1. **Content Pipeline:** `npm run content:build` (compiles and validates the 90 markdown lessons).
2. **TypeScript Typecheck and ESLint:** `npm run typecheck` and `npm run lint` must pass with 0 errors.
3. **Vitest Unit, Integration & Component Suite:** `npm run test` (every tracked suite must pass).
4. **Accessibility Gate:** `npm run test:a11y` (axe-core checks, B11-C).
5. **Brand Hardening Check:** grep gate against hardcoded brand URLs, legacy title suffixes, base64 SVGs in `public/`, and hardcoded brand hex values outside `theme/tokens.ts`.
6. **Next.js Production Build:** `npm run build`.
7. **Playwright E2E (separate `e2e` job, gated):** always runs on `main`. On a pull request it runs only when the diff touches auth-relevant paths (`app/(auth)/`, `app/api/auth/`, `app/api/user/`, `lib/auth/`, `lib/api/actor`, `proxy.ts`, `e2e/`, `playwright.config.ts`, `package-lock.json`); otherwise the job reports that it skipped. The write-heavy flows (signup to XP, session lifecycle) self-skip unless `E2E_ALLOW_WRITES` and staging credentials are set, and `e2e/support/env.ts` refuses to run against the production host.
8. **Security:** dependency audit gate (`scripts/ci/audit-gate.ts`) and a gitleaks secret scan.
9. **On push to `main` only:** the Supabase migration deploy job, which applies every top-level file in `supabase/migrations/`.

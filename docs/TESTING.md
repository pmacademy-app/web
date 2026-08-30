# Automated Testing & Verification Framework — Prodily PM Academy

**Repository:** `pmacademy-app/web`  
**Test Runner:** Vitest (Unit & Integration) / Playwright (E2E)  
**Total Test Files:** 84 Test Suites  
**Total Tests:** 887 Unit & Integration Tests (100% Passing)  
**Last Updated:** August 30, 2026  

---

## 1. Overview & Test Framework

The repository uses **Vitest** for fast, high-coverage unit and integration testing, and **Playwright** for end-to-end browser flows.

| Test Layer | Runner / Framework | Command | Target Directory |
|---|---|---|---|
| **Unit & Integration** | Vitest | `npm test` (or `npx vitest run`) | `apps/web/lib/__tests__/` |
| **Type Checking** | TypeScript | `npm run typecheck` (`tsc --noEmit`) | Entire Monorepo |
| **Linting** | ESLint | `npm run lint` | Entire Monorepo |
| **Production Build** | Next.js 16.2.12 Turbopack | `npm run build` | `apps/web/` |
| **E2E Browser Tests** | Playwright | `npx playwright test` | `apps/web/e2e/` |

---

## 2. Complete Test Suite Inventory (84 Suites, 887 Tests)

### Core Domain, Learning & Gamification Suites
- `xp.test.ts` — XP formulas, level thresholds, and ledger mutations.
- `streaks.test.ts` — Timezone-aware streak evaluations and streak freeze deductions.
- `srs.test.ts` — SuperMemo SM-2 spaced repetition calculation logic.
- `skillRadar.test.ts` — Competency radar scoring and spider chart aggregations.
- `capstones.test.ts` — Capstone business rules, deliverable validation, and public visibility.
- `certificates.test.ts` — Certificate v2 credential hash generation and template versioning.
- `badges.test.ts` — Milestone badge evaluation and automated awards.
- `leaderboard.test.ts` — Global, cohort, and friends leaderboard rankings.
- `curriculum-integrity.test.ts` — 9-module & 90-lesson ID structure alignment.
- `curriculum-prerequisite-access.test.ts` — Prerequisite unlocking and sequential progression.
- `curriculum-access-override.test.ts` — Admin bypass for curriculum prerequisite locks.
- `learning-settings-runtime.test.ts` — Dynamic runtime XP resolution from `system_settings`.
- `lesson-feedback.test.ts` — 1–5 star clarity ratings and issue tag submissions.
- `first-session-activation.test.ts` — First-lesson onboarding and activation triggers.
- `remediation.test.ts` — Knowledge gap remediation and recommendation logic.
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
- `referrals.test.ts` — Referral attribution, self-referral prevention, and rolling rate limits.
- `referral-activation.test.ts` — First-lesson completion trigger, +50 XP reward, and in-app notifications.

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

# Run complete Vitest suite (84 test suites, 887 tests)
npm test

# Run TypeScript typecheck (0 errors)
npm run typecheck

# Run ESLint (0 errors, 0 warnings)
npm run lint

# Run Next.js production build (compiles all 219 static and dynamic routes)
npm run build

# Run Playwright E2E browser tests
npx playwright test
```

---

## 4. Continuous Integration & Release Gates

GitHub Actions (`.github/workflows/ci.yml`) enforces the following gates on every pull request and push to `main`:
1. **Content Compilation:** `npm run content:compile` (validates 90 markdown lessons).
2. **Vitest Unit & Integration Suite:** 100% pass rate required across all 84 test suites.
3. **TypeScript Typecheck:** `tsc --noEmit` must pass with 0 errors.
4. **ESLint:** Must pass with 0 errors.
5. **Next.js Production Build:** Full static and dynamic compilation of all 219 routes.

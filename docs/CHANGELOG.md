# Repository Changelog — Prodily PM Academy

All notable changes to **Prodily PM Academy** (`pmacademy-app/web`) are documented in this file.

---

## [Documentation Cleanup] — 2026-08-23
### Changed
- **Documentation**: Deleted 11 obsolete documents from `docs/`: `IMPLEMENTATION_PHASES.md`, `MASTER_ENGINEERING_STATUS.md`, `VERIFIED_AUDIT.md`, `TARGET_ARCHITECTURE.md`, `REBUILD_INVENTORY.md`, `PRODUCTION_READINESS.md`, `TESTING_STRATEGY.md`, `AUTHENTICATION_ARCHITECTURE.md`, `KNOWN_ISSUES.md`, `Prodily_Quick_Start_Feature.md`, `Prodily_SEO_GEO_AEO_6_Phase_Implementation_Plan.md`. These were pre-implementation planning documents, historical audit reports, and agent-execution specifications that no longer represent the current system state.
- **Documentation**: Updated `DATABASE.md` (corrected migration count to 30, added all new migrations, added type safety section), `TESTING.md` (reflects Vitest + Playwright, 44 test files, e2e specs), `ARCHITECTURE.md` (updated tech stack, migration count, test framework, known architectural debt), `AUTHENTICATION.md` (documents current custom bridge with known gap note), `CRON_AND_SCHEDULING.md` (reflects email-cron.yml removal), `DEPLOYMENT.md` (reflects vercel.json cleanup done), `MEMORY.md` (corrected migration count), `INDEX.md` (updated to reflect clean doc set).

---

## [Notification Idempotency & Avatar Cleanup] — 2026-08-23
### Changed
- Migration `20260823000001_notification_idempotency_and_avatar_cleanup.sql`: Added notification idempotency keys and avatar cleanup.

---

## [System Announcements & Performance] — 2026-08-22
### Changed
- Migration `20260822000001_system_announcements_and_perf.sql`: Added system announcements table and performance indexes.

---

## [Phase 3 — Onboarding & Storage] — 2026-08-19
### Added
- Migration `20260819000001_phase3_onboarding_storage.sql`: Onboarding storage additions.

---

## [Testing & Type Safety Rebuild] — 2026-08-21
### Added
- `apps/web/vitest.config.mts`: Vitest unit and integration test runner configuration.
- `apps/web/vitest.setup.ts`: Test environment setup with mock env fallbacks.
- `apps/web/playwright.config.ts`: Playwright E2E test configuration.
- `apps/web/e2e/auth/login.spec.ts`: E2E spec for login, session persistence, logout.
- `apps/web/e2e/auth/protected-routes.spec.ts`: E2E spec for unauthenticated redirection and admin access gates.
- `apps/web/e2e/auth/password-reset.spec.ts`: E2E spec for password reset flow.
- `apps/web/lib/__tests__/rls.test.ts`: Real RLS integration test suite (replaces the false-passing `rls-service-role.test.ts`).
- `apps/web/types/database.ts`: Complete auto-generated Supabase TypeScript schema.
- Multiple new test files: `middleware-auth.test.ts`, `phase1-learning-notifications.test.ts`, `phase2-announcements-performance.test.ts`, `phase3-final-integrity.test.ts`, `final-learner-notification-integrity.test.ts`, `quick-start.test.ts`, `settings.test.ts`, `achievements-aggregation.test.ts`, `admin-email-test-send.test.ts`, `admin-settings.test.ts`, `curriculum-access-override.test.ts`, `dev-certificate.test.ts`, `unsubscribe.test.ts`.

### Changed
- `apps/web/lib/supabase.ts`: Refactored to re-export `Database` type from `types/database.ts` instead of inline manual definitions.
- `apps/web/package.json`: Updated `"test"` script to `"vitest run"` (replacing legacy tsx chain).
- Deleted `apps/web/lib/__tests__/rls-service-role.test.ts` (always-passing false-confidence test).

### Changed (Deployment)
- Deleted root-level `vercel.json` (Phase 0 Vercel cleanup — Vercel Dashboard uses `Root Directory: apps/web`).

---

## [Post-Phase 10 Consolidation] — 2026-08-16
### Changed
- **Documentation**: Deleted `docs/admin-panel-ui-ux-spec.md` and `docs/admin-panel-implementation-plan.md` (planning documents, fully superseded by implementation). `docs/ADMIN_PANEL.md` rewritten as the primary, current Admin Panel reference.
- **`docs/INDEX.md`**: Removed entries for the two deleted planning documents; updated `ADMIN_PANEL.md` description.
- **`/admin/feature-flags`**: Fixed legacy redirect from `/admin/content` → `/admin/settings?section=feature-flags` (the correct location per final IA).
- **`/admin/content`**: Replaced legacy content page with a redirect to `/admin/curriculum` (curriculum metrics) since the old page mixed curriculum stats + feature flags — both now have proper homes in the new IA.

---

## [`87b8b5a`] — 2026-08-16
### Changed (Phase 10 — Final Production UI/UX Polish)
- `AdminHeader`: Added `/admin/curriculum` to TITLES map; extended dynamic title derivation to cover nested curriculum, lesson and template editor routes.
- `error.tsx` (admin console error boundary): Accepts both `reset` (Next.js standard) and `unstable_retry` (legacy); added `cursor-pointer` and `focus-visible` ring to the Try Again button.
- `AdminDataTable`: Added `focus-visible:ring-2` to sortable column header buttons (previously had no keyboard focus indicator).
- `AdminPagination`: Added `focus-visible` rings + `cursor-pointer` to all page buttons; added `font-bold` to active page for stronger non-colour distinction.
- `AdminRangeSelector`: Added `focus-visible` rings to preset buttons and date inputs; added `px-2` padding to custom date range container.
- `AnalyticsWorkspace`: Added `focus-visible` rings and `cursor-pointer` to tab nav links and Export button.

---

## [`cad3bb8`] — 2026-08-14
### Added
- Admin Panel Phase 2 (Dashboard / Operations Center): added `recharts` 3.x dependency (MIT, free) for dashboard time-series visualizations.
- Rebuilt `/admin` dashboard: date-range selector (Today/7D/30D/90D/Custom via `?range=` search params), Attention Center, 8-KPI grid with prior-period trends, Learner Activity + Learning Activity Recharts, all-time Learning Funnel, Recent Activity timeline, and System Snapshot.
- Added pure aggregation helpers in `lib/admin/dashboard-aggregation.ts` with `npm run test:dashboard` (12 unit tests).
- Post-review hardening: fixed Active Learners trend, added time-based header greeting, added Learning Activity metric switching, made Total Users & Verified Users cumulative with growth trends, derived System Snapshot Database/Auth/Email status from live telemetry.

---

## [`490fea3`] — 2026-08-10
### Fixed
- Fixed ESLint `prefer-const` error in `/api/admin/emails/production-send/route.ts`.
- Removed unused `logSystemError` import in `lib/__tests__/audit-fixes.test.ts`.

---

## [`e9f5d7d`] — 2026-08-10
### Fixed
- Fixed silent failure in Admin Verification Resend by unifying `supabase.auth.admin.generateLink()` with Production Email Queue (`email_queue`) and immediate `processEmailQueue()` Resend delivery dispatch.
- Injected generated `action_link` as `verificationUrl` into `auth.verify_email` template.
- Added regression test case to `lib/__tests__/audit-fixes.test.ts`.

---

## [`5f720c9`] — 2026-08-10
### Added
- Created `lib/__tests__/audit-fixes.test.ts` test suite.
- Added `isVerified` and `emailConfirmedAt` fields to `AdminUserOverview` and `AdminUserDetail` interfaces.
- Added **Verified** (emerald) vs **Unverified** (amber) status badges in Admin Users view.
- Added **Admin Resend Verification Email** action button in User Detail Drawer.
- Added `logSystemError()` instrumentation for missing target user lookup in production email send endpoint.
- Updated signup page to detect existing account responses (`data.user.identities.length === 0`) and present direct **Go to Login →** link button.

---

## [`9456128`] — 2026-08-10
### Added
- Completed error monitoring instrumentation across `/api/email/webhooks` and cron endpoints (`/api/cron/*`).
- Added secret sanitization (`sanitizeErrorDetails()`) and 15-minute fingerprint deduplication to `logSystemError()`.
- Created `public.system_errors` and `public.rate_limits` database tables (`20260810000009_create_system_errors_and_rate_limits.sql`).

---

## [`6256717`] — 2026-08-10
### Added
- Implemented persistent 60-second rate limiter in `public.rate_limits` for user-facing verification resends (`/api/auth/resend-verification`).
- Implemented viewport-bounded fixed panel positioning for Notification Center on mobile viewports (<640px).

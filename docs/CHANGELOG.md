# Repository Changelog — Prodily PM Academy

All notable changes to **Prodily PM Academy** (`pmacademy-app/web`) are documented in this file.

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

# Known Issues & Production Verification Tracker — Prodily PM Academy

**Repository:** `pmacademy-app/web`  
**Current Baseline HEAD:** `21cc985`  
**Last Updated:** August 23, 2026  

---

## 1. Issue Status Classification System

- 🟢 **Verified in Production**: Feature fully verified in live production runtime.
- 🟡 **Implemented — Production Verification Required**: Code is fully implemented and tested, but live behavior depends on production environment configuration (credentials, secrets, DNS).
- 🟠 **Partially Verified / Known Production Failure**: Functionality is implemented and executed, but an unresolved failure or gap occurs in live production requiring investigation.
- 🔴 **Confirmed Code-Level Broken**: Verified functional bugs in codebase logic.
- ⚪ **Not Implemented / Known Architectural Debt**: Planned architecture migrations or features not yet implemented.

---

## 2. Active Issue Register

### 🔴 Confirmed Code-Level Broken
*None identified.* All static App Router pages compile cleanly with 0 TypeScript errors, and all unit/integration test suites pass.

---

### 🟢 Resolved Issues

#### ISSUE-05: Admin Production Email Dispatch Pipeline
- **Status**: 🟢 Resolved & Verified
- **Resolution**: Implemented direct production send handler at `/api/admin/emails/production-send` with end-to-end recipient validation, dynamic template interpolation, direct Resend API dispatch, database queue recording with immediate status update, error handling, and structured audit logging via `logAdminAction()`. Verified with automated suite in `apps/web/lib/__tests__/admin-production-email.test.ts`.

---

### ⚠️ Production Behavior / Integration Requiring Real-World Verification

#### ISSUE-01: Resend Outbound Webhook Verification in Live Production
- **Status**: ⚠️ Production Behavior / Integration Requiring Real-World Verification
- **Description**: Webhook handler (`/api/email/webhooks`) is implemented with Svix HMAC signature verification (`verifySvixSignature`), database event logging, and bounce alert forwarding.
- **Required Verification**: Requires setting endpoint URL (`https://prodily.adityagangwani.me/api/email/webhooks`) and `RESEND_WEBHOOK_SECRET` in production Vercel environment variables.

#### ISSUE-02: Supabase Auth Hook Live Production Triggers
- **Status**: ⚠️ Production Behavior / Integration Requiring Real-World Verification
- **Description**: Supabase Auth Send Email Hook (`/api/auth/send-email-hook`) handles `signup`, `recovery`, `email_change`, `magiclink`, `invite`, and `reauthentication`.
- **Required Verification**: Requires configuring Auth Hook URL in Supabase Auth Dashboard settings and setting `SEND_EMAIL_HOOK_SECRET`.

#### ISSUE-03: GitHub Actions Production Cron Execution
- **Status**: ⚠️ Production Behavior / Integration Requiring Real-World Verification
- **Description**: Background scheduler (`.github/workflows/notification-scheduler.yml`) runs queue processing and maintenance cron triggers.
- **Required Verification**: Requires setting `CRON_SECRET` and `APP_URL` in GitHub Repository Secrets.

---

### 🟡 Known Observability / UX Issues

#### ISSUE-04: Admin Panel Email Quota vs. Resend Account Usage Metric Labeling
- **Status**: 🟡 Known Observability / UX Issues
- **Description**: The Admin Console displays `"Daily Email Quota Usage"` based on `daily_email_quota_count` in `system_settings`.
- **Architectural Fact**:
  - `daily_email_quota_count` tracks **Optional Automation Queue Sends** (`auth.welcome`, `learning.daily_reminder`, etc.). It deliberately excludes critical Auth emails (`auth.verify_email`, `auth.password_reset`), contact form forwards (`/api/contact`), webhook alerts (`/api/email/webhooks`), and test sends.
  - Resend Dashboard tracks **ALL outbound HTTPS API requests** across the entire account.
- **UX Limitation**: The Admin Panel label `"Daily Email Quota Usage"` risks making these two distinct metrics appear equivalent.
- **Recommended Resolution**: Expose two distinct metric cards:
  1. **Resend Account Outbound Usage** (Telemetry/API count)
  2. **Prodily Automation Quota** (Internal Queue Throttling Limit)

---

### ⚪ Known Architectural Debt & Migration Gaps

#### ISSUE-06: Custom Session Bridge vs. `@supabase/ssr`
- **Status**: ⚪ Known Architectural Debt
- **Description**: Current auth session synchronization uses custom cookies (`sb-access-token`, `sb-refresh-token`) via `proxy.ts`, `AuthStateListener.tsx`, and `/api/auth/session`.
- **Impact**: Server components cannot refresh expired tokens automatically (1-hour session expiry risk); slight race condition on initial sign-in.
- **Planned Resolution**: Migrate to official `@supabase/ssr` package (`createServerClient`), delete `/api/auth/session` route and `AuthStateListener.tsx`.

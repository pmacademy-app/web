# Known Issues & Production Verification Tracker — Prodily PM Academy

**Repository:** `pmacademy-app/web`  
**Current Baseline HEAD:** `490fea37ea08813aa582fc5ebbc3896ee4eb070c`  
**Last Updated:** August 10, 2026  

---

## 1. Issue Status Classification System

- 🔴 **Confirmed Code-Level Broken**: Features that contain verified functional bugs in code.
- ⚠️ **Production Behavior / Integration Requiring Real-World Verification**: Fully implemented features whose live behavior depends on production credentials, webhook secrets, or DNS configuration.
- 🟡 **Known Observability / UX Issues**: Architecture works as intended, but the UI or metric representation is misleading or incomplete.

---

## 2. Active Issue Register

### 🔴 Confirmed Code-Level Broken
*None identified.* All 183 static App Router routes compile cleanly with 0 TypeScript errors, and all unit test suites pass.

---

### ⚠️ Production Behavior / Integration Requiring Real-World Verification

#### ISSUE-01: Resend Outbound Webhook Verification in Live Production
- **Status**: ⚠️ Production Behavior / Integration Requiring Real-World Verification
- **Description**: The webhook endpoint (`/api/email/webhooks`) is fully implemented with Svix HMAC signature verification (`verifySvixSignature`), database event logging, bounce alert forwarding, and unit test coverage (`test:monitoring`).
- **Required Verification**: Live verification in production requires configuring the endpoint URL (`https://prodily.adityagangwani.me/api/email/webhooks`) and copying `RESEND_WEBHOOK_SECRET` from the production Resend Dashboard to Vercel environment variables.

#### ISSUE-02: Supabase Auth Hook Live Production Triggers
- **Status**: ⚠️ Production Behavior / Integration Requiring Real-World Verification
- **Description**: The Supabase Auth Send Email Hook (`/api/auth/send-email-hook`) handles `signup`, `recovery`, `email_change`, `magiclink`, `invite`, and `reauthentication` action types.
- **Required Verification**: Live verification requires configuring the Auth Hook URL in the Supabase Auth Dashboard settings and setting `SEND_EMAIL_HOOK_SECRET` in production environment variables.

#### ISSUE-03: GitHub Actions Production Cron Execution
- **Status**: ⚠️ Production Behavior / Integration Requiring Real-World Verification
- **Description**: Schedulers (`.github/workflows/email-cron.yml` and `notification-scheduler.yml`) are configured to run every 5 minutes, 15 minutes, hourly, and daily.
- **Required Verification**: Requires setting `CRON_SECRET` and `APP_URL` in GitHub Repository Secrets so `curl` triggers receive HTTP 200 responses from `/api/cron/*` endpoints.

---

### 🟡 Known Observability / UX Issues

#### ISSUE-04: Admin Panel Email Quota vs. Resend Account Usage Metric Labeling
- **Status**: 🟡 Known Observability / UX Issues
- **Description**: The Admin Console displays `"Daily Email Quota Usage"` based on `daily_email_quota_count` in `system_settings`.
- **Architectural Fact**:
  - `daily_email_quota_count` tracks **Optional Automation Queue Sends** (`auth.welcome`, `learning.daily_reminder`, etc.). It deliberately excludes critical Auth emails (`auth.verify_email`, `auth.password_reset`), contact form forwards (`/api/contact`), webhook alerts (`/api/email/webhooks`), and test sends.
  - Resend Dashboard tracks **ALL outbound HTTPS API requests** across the entire account.
- **UX Limitation**: The Admin Panel label `"Daily Email Quota Usage"` risks making these two distinct metrics appear equivalent.
- **Recommended Resolution**: Future UI update should expose two clearly distinct metric cards:
  1. **Resend Account Outbound Usage** (Telemetry/API count)
  2. **Prodily Automation Quota** (Internal Queue Throttling Limit)

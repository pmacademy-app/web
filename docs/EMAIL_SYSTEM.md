# Email Infrastructure & Delivery Pipeline — Prodily PM Academy

**Repository:** `pmacademy-app/web`  
**Current Baseline HEAD:** `21cc985`  
**Last Updated:** August 23, 2026  

---

## 1. Overview & Delivery Path Matrix

Outbound email delivery is split into distinct, specialized execution paths:

| Outbound Path | Trigger Source | Route / Handler | Uses Queue? | Increments Daily Quota? | Quota Classification | Status |
|---|---|---|---|---|---|---|
| **Signup Verification** | Supabase Auth `signUp()` | `/api/auth/send-email-hook` | NO (Direct via Auth Hook) | NO | Critical Auth | 🟢 Verified in Production |
| **Password Reset** | Supabase Auth `resetPassword()` | `/api/auth/send-email-hook` | NO (Direct via Auth Hook) | NO | Critical Auth | 🟢 Verified in Production |
| **User Verification Resend** | Learner click on `/login` or signup page | `/api/auth/resend-verification` | NO (Direct via Auth Hook) | NO | Critical Auth | 🟢 Verified in Production |
| **Admin Production Verification** | Admin click in `/admin/users` | `/api/admin/emails/production-send` | YES (`email_queue`) | NO | Critical Auth | 🟢 Verified in Production |
| **Welcome Email** | Triggered on new signup | `/api/auth/send-email-hook` | YES (`email_queue`) | YES | Optional Automation | 🟢 Verified in Production |
| **Daily Reminders** | GitHub Actions Cron | `/api/cron/daily-reminder` | YES (`email_queue`) | YES | Optional Automation | 🟡 Implemented — Verification Required |
| **Weekly Recaps** | GitHub Actions Cron | `/api/cron/weekly-recap` | YES (`email_queue`) | YES | Optional Automation | 🟡 Implemented — Verification Required |
| **Admin Production Send** | Admin click in `/admin/communications` | `/api/admin/emails/production-send` | YES (`email_queue`) | YES (if non-critical) | Optional Automation | 🟠 Known Production Failure (`ISSUE-05`) |
| **Admin Test Send** | Admin click "Send Test Email" | `/api/admin/emails/test-send` | NO (Direct send) | NO | Test / Diagnostic | 🟢 Verified in Production |
| **Contact Form Inquiry Forwarding**| User submit `/contact` | `/api/contact` | NO (Direct send) | NO | Administrative Inquiry | 🟢 Verified in Production |
| **Webhook Bounce Alert** | Resend bounce event webhook | `/api/email/webhooks` | NO (Direct alert send) | NO | System Alert | 🟢 Verified in Production |

---

## 2. Supabase Auth Send Email Hook (`/api/auth/send-email-hook`)

Supabase Auth uses a custom HTTP Hook endpoint to render branded emails for core authentication events.

- **Endpoint**: `/api/auth/send-email-hook`
- **Security**: Authenticates requests using `SEND_EMAIL_HOOK_SECRET` via Bearer token, custom header (`x-supabase-auth-secret`), query string, or Webhook/Svix HMAC signature (`webhook-signature`).
- **Action Mapping**:
  - `signup` / `email_change` / `magiclink` / `reauthentication` → `auth.verify_email`
  - `recovery` → `auth.password_reset`
  - `invite` → `auth.welcome`
- **Callback URL Assembly**: Generates canonical verification link pointing to `${siteUrl}/api/auth/callback?token_hash=${tokenHash}&type=${actionType}&next=${nextPath}`.
- **Asynchronous Bounce Handling**: Synchronous inbox-existence checks during signup are technically impossible because Resend accepts emails into its dispatch queue synchronously (HTTP 200) and performs SMTP delivery out-of-band. When a bounce occurs, Resend posts an `email.bounced` webhook to `/api/email/webhooks`, which logs the event in `public.email_delivery_events`.

---

## 3. Persistent Email Queue & Processor Architecture

Optional transactional emails are processed through PostgreSQL queue tables (`public.email_queue`).

### Lifecycle States
1. `pending`: Item enqueued via `enqueueNotificationItem()`.
2. `processing`: Claimed by `processEmailQueue()` for dispatch.
3. `delivered`: Provider accepted email, `resend_id` populated, `delivered_at` set.
4. `failed`: Attempt failed. Retry counter incremented up to `max_attempts` (default: 3).

### Daily Automation Quota Control
- Non-critical queued emails check `email_global_pause` setting and `daily_email_quota_count` against `daily_email_quota_limit` (default: 100).
- If limit is reached, queue processor skips non-critical items without failing.
- Critical Auth emails bypass quota checks completely.

---

## 4. Re-engagement & Marketing Email Campaign Architecture (`reengagement_aug_2026`)

One-time email campaigns (such as `reengagement_aug_2026`) adhere to strict safety, audience verification, and idempotency standards.

### A. Audience Segmentation Rules
- **Audience A (0 completed lessons)**: Learners registered but yet to complete their first theory/quiz module. Receive onboarding/activation guidance.
- **Audience B (1–5 completed lessons)**: Learners who completed early lessons but stalled before reaching core capstone modules. Receive momentum / progress check-in.
- **Exclusion Threshold (6+ completed lessons)**: Active learners with 6 or more completed lessons are automatically excluded from re-engagement messaging.

### B. Single Source of Truth & Real-Time Verification
- **Database Authority**: Supabase (`public.users` and `public.user_lesson_progress`) is the sole source of truth for audience classification.
- **Pre-Send Verification**: Production execution performs a fresh database evaluation immediately prior to each individual send, guaranteeing that learners who completed lessons or updated preferences after audience generation are evaluated against live state.

### C. Opt-Out & Suppression Rules
- **Marketing Opt-Out**: Evaluates user notification preferences and suppresses messages if the learner has unsubscribed (`unsubscribed_at` is set).
- **Suppression Table Check**: Queries `public.email_suppressions` for spam complaints or manual blocks before attempting delivery.

### D. Idempotency & Delivery Controls
- **Duplicate Prevention**: Evaluates previous campaign logs and delivery records by unique event key (`reengagement_aug_2026:${userId}`) to ensure zero duplicate sends.
- **Execution Modes**:
  - **Dry-Run Mode**: Simulates audience queries and logs targeted learners without dispatching emails or modifying data.
  - **Test-Send Mode**: Sends sample campaign templates exclusively to admin test addresses.
  - **Production Mode**: Requires explicit confirmation, executes in rate-limited batches, and records execution progress to `public.admin_audit_logs`.
- **Repository Safety & Local Storage**: Campaign scripts and execution configurations are stored locally and git-ignored (`.gitignore`). Campaign execution code is intentionally kept out of the public GitHub repository.

---

## 5. Known Email System Production Failures

### ISSUE-05: Admin Production Send Zero-Processed Delivery Gap
- **Status**: 🟠 Partially Verified / Known Production Failure
- **Observed Production Evidence**: Sending optional templates (such as `auth.welcome`) from `/api/admin/emails/production-send` resulted in `processResult: { processed: 0, delivered: 0, failed: 0, suppressed: 0, skipped: 0 }` and `queueId: 'unknown'`.
- **Impact**: Zero emails were submitted to Resend, yet `public.admin_audit_logs` recorded the action as successful.
- **Cross-Reference**: Detailed investigation scope documented in `docs/ISSUES_KNOWN.md#issue-05-admin-production-email-zero-processed-delivery-gap`.

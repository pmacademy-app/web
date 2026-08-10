# Email Infrastructure & Delivery Pipeline — Prodily PM Academy

**Repository:** `pmacademy-app/web`  
**Current Baseline HEAD:** `7158925`  
**Last Updated:** August 10, 2026  

---

## 1. Overview & Delivery Path Matrix

Outbound email delivery is split into distinct, specialized execution paths:

| Outbound Path | Trigger Source | Route / Handler | Uses Queue? | Increments Daily Quota? | Quota Classification | Status |
|---|---|---|---|---|---|---|
| **Signup Verification** | Supabase Auth `signUp()` | `/api/auth/send-email-hook` | NO (Direct via Auth Hook) | NO | Critical Auth | 🟡 Implemented — Verification Required |
| **Password Reset** | Supabase Auth `resetPassword()` | `/api/auth/send-email-hook` | NO (Direct via Auth Hook) | NO | Critical Auth | 🟡 Implemented — Verification Required |
| **User Verification Resend** | Learner click on `/login` | `/api/auth/resend-verification` | NO (Direct via Auth Hook) | NO | Critical Auth | 🟡 Implemented — Verification Required |
| **Admin Production Verification** | Admin click in `/admin/users` | `/api/admin/emails/production-send` | YES (`email_queue`) | NO | Critical Auth | 🟢 Verified in Production |
| **Welcome Email** | Triggered on new signup | `/api/auth/send-email-hook` | YES (`email_queue`) | YES | Optional Automation | 🟢 Verified in Production |
| **Daily Reminders** | GitHub Actions Cron (09:00 UTC) | `/api/cron/daily-reminder` | YES (`email_queue`) | YES | Optional Automation | 🟡 Implemented — Verification Required |
| **Weekly Recaps** | GitHub Actions Cron (Mondays) | `/api/cron/weekly-recap` | YES (`email_queue`) | YES | Optional Automation | 🟡 Implemented — Verification Required |
| **Admin Production Send** | Admin click in `/admin/emails` | `/api/admin/emails/production-send` | YES (`email_queue`) | YES (if non-critical) | Optional Automation | 🟠 Known Production Failure (`ISSUE-05`) |
| **Admin Test Send** | Admin click "Send Test Email" | `/api/admin/emails/test-send` | NO (Direct send) | NO | Test / Diagnostic | 🟢 Verified in Production |
| **Contact Form Inquiry Forwarding**| User submit `/contact` | `/api/contact` | NO (Direct send) | NO | Administrative Inquiry | 🟢 Verified in Production |
| **Webhook Bounce Alert** | Resend bounce event webhook | `/api/email/webhooks` | NO (Direct alert send) | NO | System Alert | 🟡 Implemented — Verification Required |

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

## 4. Known Email System Production Failures

### ISSUE-05: Admin Production Send Zero-Processed Delivery Gap
- **Status**: 🟠 Partially Verified / Known Production Failure
- **Observed Production Evidence**: Sending optional templates (such as `auth.welcome`) from `/api/admin/emails/production-send` resulted in `processResult: { processed: 0, delivered: 0, failed: 0, suppressed: 0, skipped: 0 }` and `queueId: 'unknown'`.
- **Impact**: Zero emails were submitted to Resend, yet `public.admin_audit_logs` recorded the action as successful.
- **Cross-Reference**: Detailed investigation scope documented in `docs/ISSUES_KNOWN.md#issue-05-admin-production-email-zero-processed-delivery-gap`.

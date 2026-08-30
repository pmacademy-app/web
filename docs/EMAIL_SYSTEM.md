# Email Infrastructure & Delivery Pipeline — Prodily PM Academy

**Repository:** `pmacademy-app/web`  
**Framework:** Next.js 16.2.12 / React Email / Resend API  
**Last Updated:** August 30, 2026  

---

## 1. Overview & Delivery Path Matrix

Outbound email delivery is organized into distinct, specialized execution pathways:

| Outbound Path | Trigger Source | Route / Handler | Queue Used? | Quota Counted? | Classification | Status |
|---|---|---|---|---|---|---|
| **Signup Verification** | Supabase Auth `signUp()` | `/api/auth/send-email-hook` | NO (Direct via Hook) | NO | Critical Auth | 🟢 Verified in Production |
| **Password Reset** | Supabase Auth `resetPassword()` | `/api/auth/send-email-hook` | NO (Direct via Hook) | NO | Critical Auth | 🟢 Verified in Production |
| **User Verification Resend** | Learner click on login/signup | `/api/auth/resend-verification` | NO (Direct via Hook) | NO | Critical Auth | 🟢 Verified in Production |
| **Welcome Email** | Triggered on new signup | `/api/auth/send-email-hook` | YES (`email_queue`) | YES | Optional Automation | 🟢 Verified in Production |
| **Email Broadcasts** | Admin Broadcast Builder | `/api/admin/emails/broadcasts` | YES (`email_queue`) | YES | Admin Campaign | 🟢 Verified in Production |
| **Individual Production Send** | Admin User Detail Drawer | `/api/admin/emails/production-send` | YES (`email_queue`) | YES (if non-auth) | Admin Directed | 🟢 Verified in Production |
| **Admin Test Send** | Admin Template Editor | `/api/admin/emails/test-send` | NO (Direct send) | NO | Diagnostic Test | 🟢 Verified in Production |
| **Daily Reminders** | Cron Job Scheduler | `/api/cron/daily-reminder` | YES (`email_queue`) | YES | Scheduled Automation | 🟢 Verified in Production |
| **Weekly Recaps** | Cron Job Scheduler | `/api/cron/weekly-recap` | YES (`email_queue`) | YES | Scheduled Automation | 🟢 Verified in Production |
| **Contact Inquiry Forward** | User submit `/contact` | `/api/contact` | NO (Direct send) | NO | Admin Inquiry | 🟢 Verified in Production |
| **Bounce Alert** | Resend Webhook | `/api/email/webhooks` | NO (Direct alert) | NO | System Alert | 🟢 Verified in Production |

---

## 2. Supabase Auth Send Email Hook (`/api/auth/send-email-hook`)

Supabase Auth uses a custom HTTP Hook endpoint to render branded React Email templates for all authentication events:

- **Endpoint:** `/api/auth/send-email-hook`
- **Security:** Requires `SEND_EMAIL_HOOK_SECRET` via Bearer token, custom header (`x-supabase-auth-secret`), query string, or Svix HMAC signature (`webhook-signature`).
- **Action Mapping:**
  - `signup` / `email_change` / `magiclink` / `reauthentication` $\rightarrow$ `auth.verify_email`
  - `recovery` $\rightarrow$ `auth.password_reset`
  - `invite` $\rightarrow$ `auth.welcome`
- **Callback URL Construction:** Generates links pointing to `${siteUrl}/api/auth/callback?token_hash=${tokenHash}&type=${actionType}&next=${nextPath}`.

---

## 3. Persistent Email Queue & Processing Engine

Asynchronous emails are queued in `public.email_queue`:

### Lifecycle States
1. `pending`: Inserted into queue via `enqueueNotificationItem()`.
2. `processing`: Claimed with row locking by `processEmailQueue()`.
3. `delivered`: Provider accepted email, `resend_id` populated, and timestamp recorded.
4. `failed`: Error encountered. Retries incremented up to `max_attempts` (default: 3).

### Daily & Hourly Quota Enforcement
- Checked against `dailySendLimit` (default: 1000) and `hourlySendLimit` (default: 100) from `system_settings`.
- Critical Auth emails bypass quota limits completely.

---

## 4. Email Broadcast Campaign System (`/admin/emails`)

Admins can compose, estimate, test, schedule, and execute targeted email campaigns:

- **Audience Targeting:** Target All Users, Inactive Users, or Segmented cohorts.
- **Recipient Count & Sampling:** `/api/admin/emails/broadcasts/recipient-count` and `/recipient-sample` preview the exact audience size and sample profiles before sending.
- **Execution Lifecycle:**
  - `POST /api/admin/emails/broadcasts`: Create draft.
  - `POST /api/admin/emails/broadcasts/[id]/schedule`: Schedule for future delivery.
  - `POST /api/admin/emails/broadcasts/[id]/execute`: Trigger immediate batch dispatch.
  - `POST /api/admin/emails/broadcasts/[id]/cancel`: Cancel scheduled campaigns.

---

## 5. Direct User Emailing & Template Testing

- **Direct Learner Send (`SendProductionEmailModal.tsx`):** Admins can dispatch transactional templates directly to any user from the User Detail Drawer in `/admin/users`.
- **Template Code View & Live Preview:** Admin template editor at `/admin/communications/templates/[templateKey]` supports live HTML rendering and variable inspection.
- **Admin Test Send (`/api/admin/emails/test-send`):** Instantly dispatches a test template with mock variables to the administrator's email.

---

## 6. Provider Resilience & Fallback

- **Primary Provider:** Resend API.
- **Secondary Fallback:** If Resend encounters an outage (500/503/timeout) and Brevo is configured in environment variables, the engine falls back to Brevo automatically.
- **Webhook Bounce Handling:** Bounces received via `/api/email/webhooks` log structured delivery failure events in `public.notification_delivery_events`.

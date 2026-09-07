# Email Infrastructure & Delivery Pipeline — Prodily PM Academy

**Repository:** `prodily-monorepo` (app code at `apps/web/`)
**Framework:** Next.js 16.2.12 / React Email / dual Brevo+Resend delivery  
**Last Updated:** September 6, 2026  

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
  - `signup` / `magiclink` / `reauthentication` $\rightarrow$ `auth.verify_email`
  - `recovery` $\rightarrow$ `auth.password_reset`
  - `email_change` / `email_change_current` / `email_change_new` $\rightarrow$ **`auth.email_change_verify`** (dedicated key, kept isolated from `auth.verify_email` — see [`AUTHENTICATION.md`](AUTHENTICATION.md) §7)
  - `invite` $\rightarrow$ `auth.welcome`
- **Callback URL Construction:** Generates links pointing to `${siteUrl}/api/auth/callback?token_hash=${tokenHash}&type=${actionType}&next=${nextPath}`.

---

## 3. Persistent Email Queue & Processing Engine

Asynchronous emails are queued in `public.email_queue`:

### Lifecycle States
`pending` → `processing` (claimed with row locking by `processEmailQueue()`) → `delivered` (provider accepted, provider ID + timestamp recorded), or on failure: `retrying`, `dead_letter` (attempts exhausted), `suppressed` (recipient on the suppression list), or `skipped`.

`max_attempts` is **not** a flat default of 3 — it's set per priority level at enqueue time from a priority matrix (`lib/notifications/constants.ts`), ranging from 1 attempt (bulk) to 5 attempts (critical).

### Quota Enforcement — Daily Only

A **daily** send quota is enforced (`email_daily_send_limit` in `system_settings`, default `100`) via the atomic Postgres function `increment_daily_email_quota()`, checked in the queue processor **before** dispatch — until 2026-09-07 it was called *after* a successful send with its result discarded, so it tracked volume but never actually stopped anything (see [`INCIDENT_2026-09-06_SIGNUP_ABUSE.md`](INCIDENT_2026-09-06_SIGNUP_ABUSE.md)). Despite an `hourlySendLimit` field existing in the admin Platform Settings UI, there is **no hourly enforcement anywhere in the send/retry pipeline** — it's a dead/cosmetic setting today (tracked in [`ISSUES_KNOWN.md`](ISSUES_KNOWN.md) ISSUE-22). Critical Auth emails (`auth.verify_email`, `auth.password_reset`, `auth.email_change_verify`) bypass the daily quota completely.

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

- **Provider Selection:** `PRIMARY_EMAIL_PROVIDER` (or the presence of `BREVO_API_KEY`) selects Brevo or Resend as primary. Both providers are called via raw `fetch` — neither is an installed SDK dependency.
- **Fallback:** If the primary provider fails with a **transient** error (network exception, timeout, or 5xx), `lib/email.ts` automatically falls back to the other provider (Brevo→Resend or vice versa). It does **not** fall back on quota exhaustion, invalid recipient, or auth/config errors (4xx) — that distinction was added 2026-09-07 after an unconditional fallback was identified as a risk during a signup-abuse incident (see [`INCIDENT_2026-09-06_SIGNUP_ABUSE.md`](INCIDENT_2026-09-06_SIGNUP_ABUSE.md)).
- **Webhook Bounce Handling:** Bounces/complaints arrive at `/api/email/webhooks`, which verifies **either** a Resend Svix HMAC signature **or** a Brevo shared-secret header, and logs structured delivery failure events.

---

## 7. Template Variable System & Admin Editor

The admin HTML template editor (`AdminTemplateEditor.tsx`, `/admin/communications/templates/[templateKey]`) and the create-new-template modal (`AdminCreateTemplateModal.tsx`) share a single isomorphic source of truth: `lib/admin/template-variables.ts`.

- **`TEMPLATE_SAMPLE_VARIABLES`** — sample values used for live preview and admin test sends.
- **`TEMPLATE_VARIABLE_CATALOG`** — the curated list of variables available to templates, with descriptions.
- **`findUnknownVariables(text, knownNames)`** — flags `{{token}}` references in the Subject/Body that aren't in the known catalog, surfaced as inline warnings in both editor UIs.
- **Variable syntax:** `{{variableName}}`. Both editors support click-to-insert-at-cursor.
- **Editor model:** deliberately a plain HTML `<textarea>` — there is no WYSIWYG editor.
- **Preview:** a fully sandboxed iframe (`sandbox=""`) rendering the template with `TEMPLATE_SAMPLE_VARIABLES` interpolated client-side.
- **Draft/Publish versioning:** `notification_templates` + `notification_template_versions` tables — each save creates a new version row; publishing archives the previous published version.
- **Custom admin-created templates:** admins can create brand-new, DB-only broadcast templates by pasting HTML (`AdminCreateTemplateModal.tsx`), sanitized server-side before persisting (`lib/admin/sanitize-email-html.ts`). These are separate from the static React-Email templates in `emails/`.

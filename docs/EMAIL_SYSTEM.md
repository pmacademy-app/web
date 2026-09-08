# Email Infrastructure & Delivery Pipeline — Prodily PM Academy

**Repository:** `prodily-monorepo` (app code at `apps/web/`)
**Framework:** Next.js 16.2.12 / React Email / dual Brevo+Resend delivery  
**Last Updated:** September 8, 2026  

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

A **daily** send quota (`email_daily_send_limit` in `system_settings`, default `100`) is enforced via the atomic Postgres function `increment_daily_email_quota()`, checked in the queue processor **before** dispatch. Critical Auth emails (`auth.verify_email`, `auth.password_reset`, `auth.email_change_verify`) bypass it entirely.

**The quota day is the UTC day.** The counter key is `email_sent_count_YYYY_MM_DD`, built from the UTC date on both sides: `TO_CHAR((NOW() AT TIME ZONE 'UTC'), 'YYYY_MM_DD')` in SQL (migration `20260908000002_quota_key_utc.sql`) and `lib/notifications/daily-quota-key.ts` in TypeScript, which is the single definition — do not inline the key format anywhere else. Before that migration the SQL side used the Postgres *session* timezone while the application used UTC, so on a non-UTC database the admin dashboard read a different row than the one being incremented. Enforcement was unaffected (the RPC computes the key once and both increments and checks it); the count shown to operators was.

There is **no hourly enforcement** anywhere in the pipeline. The `hourlySendLimit` field and the `GLOBAL_RATE_LIMITS.HOURLY_SEND_LIMIT` constant exist but nothing reads them; the admin control for it was removed in September 2026 rather than left implying enforcement.

### Retry & Backoff

- **Attempt count** is per-priority, taken from `PRIORITY_MATRIX` (`lib/notifications/constants.ts`) at enqueue time: 5 for `critical`, 3 for `high`/`medium`, 2 for `low`, 1 for `bulk`. There is **no global max-retry setting** — the `maxRetryAttempts` field is not read by the pipeline.
- **Backoff** is exponential on an admin-configurable base: `2^attempt × retryDelayMinutes`, default 5 minutes (10m, 20m, 40m). `retryDelayMinutes` is read once per batch from the Email settings section.
- `attempt_count` is incremented by `claim_email_queue_items()`. The non-RPC fallback claim (used only when that function is missing) increments it too, via a per-row compare-and-swap, and reports a `config_missing` incident so the absent migration is visible.

### Dead Letters & Bounce Suppression

- Items that exhaust `max_attempts` move to `dead_letter` and are copied into `email_dead_letter` **with** their `user_id`, `template_key` and template variables, so an operator can tell who was affected. Those variables are redacted before storage — see [ADR-005](decisions/ADR-005-sensitive-data-redaction.md).
- `email.bounced` webhooks now add the recipient to `email_suppressions` with reason `hard_bounce`, alongside the existing `spam_complaint` suppression on `email.complained`. This is what stops the admin retry actions from re-sending to an address that already hard-bounced.
- Admin retry actions (`retry-all`, `retry-selected`, single retry) clear `next_retry_at` and `processing_at` when requeueing. Without that the row stayed unclaimable by `claim_email_queue_items()` for the remainder of its backoff while the UI reported it as requeued.

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

## 6. Provider Resilience & Failover

All outbound email resolves its primary provider through **one** shared function, `resolvePrimaryProvider()` (`lib/notifications/config.ts`). Order: explicit `PRIMARY_EMAIL_PROVIDER` → Brevo when `BREVO_API_KEY` is set → Resend when `RESEND_API_KEY` is set → Brevo. Both providers are called via raw `fetch`; neither SDK is a dependency.

**Failover.** `sendEmailWithFailover()` (`lib/notifications/providers/index.ts`) sends on the primary and, when the failure is failover-eligible, retries **once** on the other provider — never a third attempt. The secondary is skipped unless it actually has credentials, because an unconfigured provider simulates success. `processEmailQueue()` dispatches through this helper; `lib/email.ts` keeps its own transport but applies the same classifier and resolver.

**Classification** (`lib/notifications/providers/failure-classification.ts`):

| Class | Statuses | Behaviour |
|---|---|---|
| `failover` | no HTTP response, 5xx, **402**, **408**, **429** | Try the other provider once |
| `permanent` | 400, 401, 403, 404, 422 | Do not fail over — both would reject it |
| `retry` | anything else | Retry this provider later |

Capacity exhaustion (402/429) **is** failover-eligible. Until 2026-09-07 it was not, which meant an exhausted Brevo allowance took signup verification and password reset down while a healthy Resend key sat idle. Volume containment is enforced upstream by the daily quota gate and signup rate limiting, not by refusing to fail over. See [ADR-002](decisions/ADR-002-provider-failure-classification.md).

**There is no circuit breaker.** Sustained double-provider failure raises a `critical` incident (`email.failover_exhausted`) but is not otherwise rate-limited.

**Provider tracking.** `email_queue.provider` records which provider produced the outcome and `email_queue.provider_attempts` records every attempt with its status code and error (migration `20260907000001_email_provider_failover.sql`).

**Webhook bounce handling.** Bounces and complaints arrive at `/api/email/webhooks`, which verifies either a Resend Svix HMAC signature or a Brevo shared-secret header. Both now write to `email_suppressions`.

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

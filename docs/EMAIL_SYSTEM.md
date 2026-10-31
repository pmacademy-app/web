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

---

## 8. Inbox Deliverability & Primary Tab Placement Architecture (Founder & Lifecycle Broadcasts)

Starting September 2026, Prodily standardized a strict deliverability configuration for founder broadcasts and high-priority lifecycle outreach. This setup was tested and verified to achieve direct **Primary Inbox** placement in Gmail rather than being shunted into Promotions.

### 1. From & Reply-To Alignment
- **Strict Domain Alignment:** Outgoing `From` and `Reply-To` addresses must match the authenticated domain (e.g. `Aditya Gangwani <aditya@prodily.app>` with `Reply-To: aditya@prodily.app`).
- **Never Cross-Wire Webmail:** Avoid pointing `Reply-To` to external free webmail providers (e.g. `@gmail.com`) when `From` is on a custom domain. Mismatched Reply-To is heavily weighted by Bayesian filters as automated bulk/marketing activity.

### 2. Header & Tag Hygiene (`suppressListUnsubscribe` & `suppressMarketingTags`)
- **`suppressListUnsubscribe: true`:** RFC-compliant `List-Unsubscribe` headers flag emails to Google and Yahoo as automated marketing mailings. For founder reflections, direct asks, and transactional messages, this header must be suppressed.
- **`suppressMarketingTags: true`:** Marketing category tags (e.g. `template_key`, `template_version`, or Brevo `X-Mailin-Tag`) leak marketing classification into MIME headers. Omit tags completely on personal founder updates.

### 3. Open & Click Tracking Disabled
- **No Redirect Proxies:** Domain-level open tracking (1x1 transparent tracking pixels) and click tracking (link rewriting via provider proxies) must be disabled. URL rewrites destroy domain reputation and trigger anti-phishing/promotions heuristics.

### 4. HTML Template Structure Rules
- **No Hidden Preheaders:** Never include zero-pixel hidden preview text divs (`display:none; font-size:1px; line-height:1px; max-height:0; opacity:0;`). Email scanners immediately identify this CSS pattern as commercial marketing.
- **No Heavy Marketing CTA Buttons:** Avoid large background-colored button blocks (`<table ... bgcolor="#1F6B4E">` or styled `<button>` tags). Use clean, natural inline typography and text links (`Continue your journey →`).
- **Dual Synchronized Multipart Payload:** Every HTML email must be accompanied by an identical, unformatted `text/plain` alternative payload.
- **Minimal Link Footprint:** Limit hyperlinks to the essential destination and a canonical, unstyled footer unsubscribe link (`Manage Preferences · Unsubscribe: https://prodily.app/settings?tab=notifications`).


---

## 9. Capacity and free-tier ceilings (ENG-10)

Owner decisions: zero budget, free tiers only (D7), and the app quota stays at **100 per day** (Q3). This section is the capacity check that has to pass before the pg_cron scheduler (ENG-01, [`DEPLOYMENT.md`](DEPLOYMENT.md) §7) makes every hourly job actually run.

### 9.1 The three ceilings

| Ceiling | Free-tier limit | What counts against it |
|---|---|---|
| App quota (`email_daily_send_limit`, default and owner value **100**) | 100 per UTC day | Every queued email that is not critical auth: welcome, reminders, recaps, lifecycle, broadcasts, admin production sends |
| Brevo (primary) | 300 per day | Everything sent through Brevo, including critical auth email that bypasses the app quota, admin test sends and the contact form |
| Resend (failover only) | 100 per day (and 3,000 per month) | Only sends that failed over from Brevo (5xx, 402, 408, 429, no response) |

The app quota is the binding one by design. Keeping it at 100 leaves about 200 Brevo sends a day for password resets, email-change confirmations, admin tests and the contact form, which never touch the quota. Resend is headroom for a Brevo outage, not extra daily capacity: the two providers together top out at 400 a day.

### 9.2 Worst-case daily volume

For one UTC day:

```
E = R + W_day + L + T
```

- **R, daily reminders.** Learners who get a reminder today. A learner qualifies when they have an email, are not on `email_suppressions`, have not turned off learning email, have at least one due flashcard, and were not active today. The reminder cadence (owner decision Q8) then limits it to the days since last activity: **daily for days 0 to 3, then day 7, day 14 and day 30, then stop.** Day 0 is in practice skipped, because a learner active today is not reminded. So R is the count of qualifying learners whose last activity was 1, 2, 3, 7, 14 or 30 days ago. Without the cadence, every lapsed learner would be mailed every day and R would grow with the whole lapsed base.
- **W_day, weekly recaps.** W is the number of learners with XP or a completed lesson in the past 7 days (zero-activity recaps are suppressed). On average that is **W / 7** a day, but the default recap slot is Sunday 18:00 local, so for learners on the defaults the **Sunday peak is close to W**. Plan for the Sunday peak.
- **L, lifecycle.** At most one lifecycle email per learner per day: D+1 never started, D+3 started but not finished, and streak broken then quiet for 3 to 4 days. A 30% holdout receives nothing. Roughly `0.7 x (signups in the D+1 and D+3 windows + newly quiet streak-breakers)`.
- **T, queued transactional and admin.** One welcome email per signup, admin production sends, broadcasts (as `bulk`) and any other queued, non-critical template.

**Rule of thumb:** while `R + W_day + L + T` stays under 100, everything sends on time. Above 100, the excess waits (next section). Above roughly 300 a day including auth email, Brevo itself refuses and the overflow fails over to Resend's 100.

### 9.3 Measure the real numbers (read-only)

Run this in the Supabase SQL editor (read-only, safe on production). It approximates "has a due card" with "has completed at least one lesson", which can only overcount, and measures days since last activity in UTC, which can be off by one day for a learner far from UTC.

```sql
WITH reachable AS (
  SELECT u.id, u.last_streak_date::date AS last_active
  FROM public.users u
  LEFT JOIN public.user_notification_preferences p ON p.user_id = u.id
  WHERE u.email IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.email_suppressions s
      WHERE lower(s.email) = lower(u.email) AND (s.expires_at IS NULL OR s.expires_at > now())
    )
    AND coalesce(p.all_notifications, true)
    AND coalesce(p.all_email, true)
    AND coalesce(p.learning_email, true)
),
learners AS (
  SELECT r.*, (current_date - r.last_active) AS days_since
  FROM reachable r
  WHERE EXISTS (
    SELECT 1 FROM public.user_lesson_progress lp
    WHERE lp.user_id = r.id AND lp.completed_at IS NOT NULL
  )
)
SELECT
  (SELECT count(*) FROM reachable)                                                AS reachable_with_email,
  (SELECT count(*) FROM learners)                                                 AS learners_with_a_completed_lesson,
  (SELECT count(*) FROM learners WHERE days_since IN (1, 2, 3, 7, 14, 30))        AS r_reminders_today_with_cadence,
  (SELECT count(*) FROM learners WHERE days_since >= 1)                           AS r_reminders_today_without_cadence,
  (SELECT count(DISTINCT x.user_id) FROM public.xp_events x
     WHERE x.created_at > now() - interval '7 days')                               AS w_weekly_recap_upper_bound,
  (SELECT round(count(*) / 14.0, 1) FROM public.users
     WHERE created_at > now() - interval '14 days')                               AS signups_per_day_14d,
  (SELECT round(count(*) / 14.0, 1) FROM public.email_queue
     WHERE delivered_at > now() - interval '14 days')                             AS queued_delivered_per_day_14d,
  (SELECT count(*) FROM public.email_queue
     WHERE status = 'retrying' AND error_message = 'Daily email send quota reached') AS waiting_on_quota_now;
```

Plug the results in: `R = r_reminders_today_with_cadence`, `W_day` between `w_weekly_recap_upper_bound / 7` (average) and `w_weekly_recap_upper_bound` (Sunday), `L` about `0.7 x 2 x signups_per_day_14d` plus a few streak-breakers, `T` about `signups_per_day_14d` plus planned broadcasts. If the Sunday total is over 100, decide before switching the scheduler on: accept that reminders are deferred or dropped on peak days (the free option), or raise the quota toward Brevo's 300 while leaving room for auth email.

### 9.4 What happens when the quota is hit

- The quota is checked per item just before dispatch (`increment_daily_email_quota()`). It is first come, first served: nothing is reserved for higher-priority mail that arrives later in the day.
- An item refused by the quota goes back to `retrying` with `next_retry_at` one hour later and `error_message = 'Daily email send quota reached'`. The counter resets at 00:00 UTC (05:30 IST).
- When items are claimed, the queue orders them by `priority` (critical 1, high 2, medium 5, low 8, bulk 10), then by `scheduled_at`.

**Policy: reminders are the lowest-priority automated email.** When the day's quota is gone, the daily reminder is the first thing to give up: welcome and transactional mail, then lifecycle and recaps, go first. A reminder that cannot go out on its local date has lost its point and should be dropped, not sent the next day.

Current code does not fully match this yet. The daily reminder, weekly recap and lifecycle runs all enqueue at `medium`, so they compete equally, and a quota-deferred reminder is retried rather than dropped. Follow-ups (code, not done in this doc change): enqueue `learning.daily_reminder` at `low`, and skip a reminder whose local date has passed.

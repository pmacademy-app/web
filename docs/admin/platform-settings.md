# Platform Configuration & Global Behavior Controls — Operating Guide

**Location:** `/admin/settings`  
**Workspace:** Settings $\rightarrow$ Settings  
**Audience:** Platform Administrators & System Operators  

---

## 1. Purpose

The Platform Settings Workspace manages global platform configuration stored in the `public.system_settings` table. It controls platform availability, registration access, email verification requirements, runtime XP awards, the daily email send quota and retry backoff, feature flags, and onboarding preferences.

---

## 2. Access & Permissions

- **Path:** Navigate to `/admin/settings` from the sidebar (or use route alias `/admin/feature-flags` for feature flags).
- **Permissions:** Admin role required (`is_admin = true` or listed in `ADMIN_EMAILS`).
- **Persistence:** Changes are persisted to PostgreSQL via `PATCH /api/admin/settings?section=<key>`.

---

## 3. Platform Settings Sections & Controls

> Every control listed here is read by runtime code. Controls that persisted a value nothing consumed were **removed** in September 2026 rather than left implying enforcement — see §3.G for what went and why.

### A. Product Settings (`?section=product`)

| Setting | Type | Default | Enforced by |
|---|---|---|---|
| **Maintenance Mode** | Toggle | `false` | `proxy.ts` — non-admin learners are blocked and APIs return `503`. Administrators are exempt. |
| **Allow Signups** | Toggle | `true` | `POST /api/auth/signup` — returns `403 SIGNUPS_DISABLED`. |
| **Require Email Verification** | Toggle | `true` | `POST /api/auth/signup` and the auth guard — unconfirmed accounts are blocked from protected pages. |

### B. Learning Settings (`?section=learning`)
XP award values, read by `lib/xp/xp.ts` at award time:

| Setting | Default |
|---|---|
| **XP Per Lesson Complete** | `50 XP` |
| **XP Per Quiz Pass** | `100 XP` |
| **XP Per Flashcard Review** | `10 XP` |
| **XP Per Reflection** | `25 XP` |

### C. Email Settings (`?section=email`)

| Setting | Default | Enforced by |
|---|---|---|
| **Daily Send Limit** | `100` | The pre-dispatch quota gate in `processEmailQueue()`. Critical auth emails bypass it. Shared with the daily limit on the Communications workspace — both write `system_settings.email_daily_send_limit`. |
| **Retry Delay (minutes)** | `5` | Backoff base in `handleRetryableFailure()`; the queue backs off exponentially from this value. |

**Sender & Providers** is read-only. Sender identity comes from `BREVO_FROM_EMAIL` / `RESEND_FROM_EMAIL` and the brand configuration, and the Resend API-key status reflects the environment. None of it is editable here.

### D. Notification Settings (`?section=notifications`)
This section no longer contains controls. Digest schedules and per-template channel toggles are owned by **`/admin/communications`**, which is where the send pipeline reads them from (`system_settings.email_digest_schedules` and `email_automations`). The section links there.

### E. Feature Flags (`?section=feature-flags`)
Flags stored in `system_settings.feature_flags`. Reads are DB-backed with a ~10-second TTL, so a change takes effect on every serverless instance within that window — including the GitHub Actions cron that processes the email queue. `EMAIL_ENABLED` and `QUEUE_PROCESSING_ENABLED` are the operational kill switches. See [ADR-003](../decisions/ADR-003-db-backed-configuration-control-plane.md).

### F. Onboarding Settings (`?section=onboarding`)
Goal Label, Description, Icon, Badge assignment, and Recommended Starting Module for the onboarding flow.

### G. Controls removed in September 2026

Each of these persisted to `system_settings` but had no runtime consumer, so changing it did nothing:

| Section | Removed | Note |
|---|---|---|
| Product | Site Name, Site Description, Contact Email, Session Timeout | Branding comes from `lib/brand.ts`; session lifetime from Supabase. |
| Learning | Quiz Pass Threshold, Streak Freeze Enabled/Cost, Certificate Auto-Issue, Certificate Expiry, Lesson Completion Required | |
| Email | Hourly Send Limit, Max Retry Attempts, Retry Failed Emails, editable From Name / From Email / Reply-To | No hourly gate exists. Attempt counts are per-priority from `PRIORITY_MATRIX`, not global. Sender identity is environment configuration. |
| Notifications | All eight controls | Duplicated the live editors on `/admin/communications`. |

The underlying types and defaults remain in `lib/admin/types.ts`; only the controls were removed. Reshaping the settings schema is separate work.

---

## 4. Saving & Dirty State Behavior

- **Per-Section Persistence:** Each settings tab operates independently. Modifying a field marks the section as dirty and enables the **[ Save Changes ]** and **[ Reset ]** buttons.
- **Navigation Guard:** Switching tabs with unsaved changes triggers an alert warning you to save or discard your changes before leaving.
- **Audit Logging:** Every setting change creates an audit log entry in `public.admin_audit_logs` detailing the updated keys and values.

---

## 5. Warnings & Operational Precautions

> [!CAUTION]
> **Enabling Maintenance Mode:** Maintenance Mode blocks **all active students** from loading lessons, dashboards, or APIs. Only enable this during scheduled maintenance windows or database migrations.

> [!WARNING]
> **Disabling Signups:** Disabling signups immediately prevents prospective learners from creating accounts. Use this during private beta phases or platform load testing.

---

## 6. Practical Example

**Preparing for a scheduled database migration:**
1. Open `/admin/settings` $\rightarrow$ select the **Product Tab**.
2. Toggle **Maintenance Mode** to `ON`.
3. Click **[ Save Changes ]**.
4. Test by opening an incognito browser tab $\rightarrow$ confirm the `/maintenance` screen is displayed.
5. Perform the database migration.
6. Return to `/admin/settings` (admins remain authenticated), toggle **Maintenance Mode** to `OFF`, and click **[ Save Changes ]**.

# Platform Configuration & Global Behavior Controls — Operating Guide

**Location:** `/admin/settings`  
**Workspace:** Settings $\rightarrow$ Settings  
**Audience:** Platform Administrators & System Operators  

---

## 1. Purpose

The Platform Settings Workspace manages global platform configuration stored in the `public.system_settings` table. It controls platform availability, registration access, email verification requirements, runtime XP awards, email delivery quotas, notification defaults, feature flags, and onboarding preferences.

---

## 2. Access & Permissions

- **Path:** Navigate to `/admin/settings` from the sidebar (or use route alias `/admin/feature-flags` for feature flags).
- **Permissions:** Admin role required (`is_admin = true` or listed in `ADMIN_EMAILS`).
- **Persistence:** Changes are persisted to PostgreSQL via `PATCH /api/admin/settings?section=<key>`.

---

## 3. Platform Settings Sections & Controls

### A. Product Settings (`?section=product`)
Global platform behavior and access controls:

| Setting | Type | Default | Operational Impact |
|---|---|---|---|
| **Site Name** | Text | `Prodily` | App brand name across navigation and email headers. |
| **Contact Email** | Email | `support@prodily.app` | Recipient address for `/contact` form inquiries. |
| **Maintenance Mode** | Toggle | `false` | When enabled, non-admin learners are blocked from the application and redirected to `/maintenance` (APIs return `503 MAINTENANCE_MODE`). **Administrators are strictly exempt.** |
| **Allow Signups** | Toggle | `true` | When disabled, new user registrations are blocked (signup API returns `403 Forbidden: "SIGNUPS_DISABLED"`). |
| **Require Email Verification** | Toggle | `true` | When enabled, unconfirmed accounts are blocked from protected app pages (redirected to `/login?error=email_not_confirmed`) and APIs (return `403 AUTH_EMAIL_NOT_CONFIRMED`). |
| **Session Timeout** | Number | `10080` (7d) | Inactivity session duration in minutes. |

### B. Learning Settings (`?section=learning`)
Runtime gamification, XP awards, and completion thresholds:

| Setting | Default | Purpose |
|---|---|---|
| **XP Per Lesson Complete** | `50 XP` | XP awarded upon reading lesson theory. |
| **XP Per Quiz Pass** | `100 XP` | XP awarded upon passing an end-of-lesson quiz. |
| **XP Per Flashcard Review** | `10 XP` | XP awarded per successful SM-2 flashcard recall. |
| **XP Per Reflection** | `25 XP` | XP awarded for qualitative lesson reflections. |
| **Streak Freeze Enabled** | `true` | Allows learners to consume XP to protect broken streaks. |
| **Streak Freeze Cost** | `500 XP` | XP deducted when an automated freeze is triggered. |
| **Quiz Pass Threshold** | `70%` | Minimum score required to pass quizzes and unlock next lessons. |
| **Certificate Auto-Issue** | `true` | Automatically issues verified certificates upon module completion. |

### C. Email Settings (`?section=email`)
Delivery quotas, retry rules, and sender identity:
- **Sender Name & Email:** Configures the `From:` header for outbound emails.
- **Daily Send Limit:** Maximum emails processed per day (default `1000`).
- **Hourly Send Limit:** Maximum emails processed per hour (default `100`).
- **Retry Failed Emails:** Enables automatic retry for failed queue items.
- **Max Retry Attempts:** Number of retry cycles (default `3`) before marking as permanently failed.
- **Retry Delay (Minutes):** Cooldown window before retrying a failed message (default `30` min).

### D. Notification Settings (`?section=notifications`)
Automated reminder and recap scheduling defaults:
- **Daily Reminder:** Default toggle and delivery time (e.g., `09:00 AM IST`).
- **Weekly Recap:** Default day (e.g., `Monday`) and delivery time.
- **Default Channels:** Sets whether new accounts default to In-App and/or Email alerts.

### E. Feature Flags (`?section=feature-flags`)
Dynamic feature flags stored in `system_settings`:
- Toggle platform features on or off in production without redeploying code.
- Supports instant evaluation across client components and server route handlers.

### F. Onboarding Settings (`?section=onboarding`)
Configures the dynamic career goal options presented to new learners during onboarding:
- Goal Label, Description, Icon, Badge assignment, and Recommended Starting Module.

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

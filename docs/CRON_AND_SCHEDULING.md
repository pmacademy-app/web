# Background Schedulers & Cron Architecture — Prodily PM Academy

**Repository:** `pmacademy-app/web`
**Last Updated:** August 23, 2026

---

## 1. Overview & GitHub Actions Cron Architecture

Background jobs, queue processing, and periodic maintenance are executed via **GitHub Actions workflows** calling HTTP Route Handlers. Vercel Cron is not used.

- **Authentication**: All cron Route Handlers enforce Bearer token authentication matching `CRON_SECRET`.
- **Target Host**: URLs are constructed using `APP_URL` or `PRODUCTION_SITE_URL` repository secrets, falling back to `https://prodily.adityagangwani.me`.

---

## 2. GitHub Actions Workflows

There are two active workflow files:

### 1. `ci.yml` (`.github/workflows/ci.yml`)
- **Trigger**: Every push and pull request to `main`.
- **Jobs**: content build → lint → typecheck → vitest → brand check → Next.js build → Supabase migrations (main only).

### 2. `notification-scheduler.yml` (`.github/workflows/notification-scheduler.yml`)
- **Process Email Queue**: `*/15 * * * *` (Fallback 15-minute queue check → `/api/cron/process-email-queue`).
- **Retry Failed Emails**: `0 * * * *` (Hourly retry → `/api/cron/retry-failed`).
- **Weekly Recap**: `0 18 * * 0` (Sunday recap check → `/api/cron/weekly-recap`).
- **Cleanup Timeline & Logs**: `0 2 * * *` (Daily cleanup → `/api/cron/cleanup`).

> **Note**: A previous `email-cron.yml` workflow (with 5-minute queue processing, daily reminders at 09:00 UTC, and weekly recaps on Mondays) has been removed. The `notification-scheduler.yml` now handles queue processing and recap scheduling.

---

## 3. Cron Endpoints Specification

| Endpoint | Method | Action Handled | DB Tables Touched | Status |
|---|---|---|---|---|
| `/api/cron/process-email-queue` | `POST` | Process pending items in `email_queue` | `email_queue`, `notification_delivery_events` | 🟡 Implemented — Verification Required |
| `/api/cron/daily-reminder` | `POST` | Enqueue study reminders for active learners | `users`, `email_queue` | 🟡 Implemented — Verification Required |
| `/api/cron/weekly-recap` | `POST` | Enqueue weekly summary stats | `user_lesson_progress`, `email_queue` | 🟡 Implemented — Verification Required |
| `/api/cron/retry-failed` | `POST` | Retry failed emails under `max_attempts` | `email_queue` | 🟡 Implemented — Verification Required |
| `/api/cron/cleanup` | `POST` | Purge old logs and delivered queue items | `email_queue`, `system_errors` | 🟡 Implemented — Verification Required |

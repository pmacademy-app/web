# Background Schedulers & Cron Architecture — Prodily PM Academy

**Repository:** `pmacademy-app/web`  
**Current Baseline HEAD:** `490fea37ea08813aa582fc5ebbc3896ee4eb070c`  
**Last Updated:** August 10, 2026  

---

## 1. Overview & GitHub Actions Cron Architecture

Background jobs, queue processing, and periodic maintenance are executed via **GitHub Actions workflows** calling HTTP Route Handlers. Vercel Cron is not used.

- **Authentication**: All cron Route Handlers enforce Bearer token authentication matching `CRON_SECRET`.
- **Target Host**: URLs are constructed using `APP_URL` or `PRODUCTION_SITE_URL` repository secrets, falling back to `https://prodily.adityagangwani.me`.

---

## 2. GitHub Actions Workflows

### 1. `email-cron.yml` (`.github/workflows/email-cron.yml`)
- **Queue Processing Job** (`process-email-queue`):
  - Schedule: `*/5 * * * *` (Every 5 minutes).
  - Target: `POST /api/cron/process-email-queue`.
- **Daily Reminders Job** (`daily-reminder`):
  - Schedule: `0 9 * * *` (Daily at 09:00 UTC).
  - Target: `POST /api/cron/daily-reminder`.
- **Weekly Recaps Job** (`weekly-recap`):
  - Schedule: `0 9 * * 1` (Mondays at 09:00 UTC).
  - Target: `POST /api/cron/weekly-recap`.

### 2. `notification-scheduler.yml` (`.github/workflows/notification-scheduler.yml`)
- **Process Email Queue**: `*/15 * * * *` (Fallback 15-minute queue check).
- **Retry Failed Emails**: `0 * * * *` (Hourly retry trigger to `/api/cron/retry-failed`).
- **Weekly Recap**: `0 18 * * 0` (Sunday recap check to `/api/cron/weekly-recap`).
- **Cleanup Timeline & Logs**: `0 2 * * *` (Daily cleanup to `/api/cron/cleanup`).

---

## 3. Cron Endpoints Specification

| Endpoint | Method | Action Handled | DB Tables Touched | Status |
|---|---|---|---|---|
| `/api/cron/process-email-queue` | `POST` | Process pending items in `email_queue` | `email_queue`, `notification_delivery_events` | 🟡 Implemented — Verification Required |
| `/api/cron/daily-reminder` | `POST` | Enqueue study reminders for active learners | `users`, `email_queue` | 🟡 Implemented — Verification Required |
| `/api/cron/weekly-recap` | `POST` | Enqueue weekly summary stats | `user_lesson_progress`, `email_queue` | 🟡 Implemented — Verification Required |
| `/api/cron/retry-failed` | `POST` | Retry failed emails under `max_attempts` | `email_queue` | 🟡 Implemented — Verification Required |
| `/api/cron/cleanup` | `POST` | Purge old logs and delivered queue items | `email_queue`, `system_errors` | 🟡 Implemented — Verification Required |

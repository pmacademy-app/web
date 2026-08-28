# Background Schedulers & Cron Architecture — Prodily PM Academy

**Repository:** `pmacademy-app/web`  
**Last Updated:** Pre-Launch Final Verification  

---

## 1. Overview & GitHub Actions Cron Architecture

Background jobs, queue processing, broadcasts, and periodic maintenance are executed via **GitHub Actions workflows** calling HTTP Route Handlers. Vercel Cron is not used.

- **Scheduler Engine**: GitHub Actions (`.github/workflows/notification-scheduler.yml`).
- **Timezone**: All schedules are configured in UTC to execute at intended **India Standard Time (IST / UTC+5:30)** windows.
- **Authentication**: All cron Route Handlers enforce Bearer token authentication matching `CRON_SECRET` (`Authorization: Bearer ${CRON_SECRET}`).
- **Target Host**: URLs are constructed using `PRODUCTION_SITE_URL` or `APP_URL` repository secrets, falling back to `https://prodily.adityagangwani.me`.

---

## 2. Production Schedule Matrix (IST & UTC)

| Cron Endpoint | HTTP Method | GitHub Job | Schedule (UTC) | Execution Time (IST) | Purpose |
|---|:---:|---|:---:|:---:|---|
| `/api/cron/process-email-queue` | `POST` | `process-email-queue` | `*/5 * * * *` | Every 5 minutes 24/7 | Processes pending items in `email_queue` |
| `/api/cron/process-broadcasts` | `GET` | `process-broadcasts` | `*/5 * * * *` | Every 5 minutes 24/7 | Executes scheduled email & in-app broadcasts |
| `/api/cron/retry-failed` | `POST` | `retry-failed-emails` | `30 * * * *` | Hourly at :00 IST | Retries failed emails under `max_attempts` |
| `/api/cron/daily-reminder` | `POST` | `daily-reminder` | `30 3 * * *` | Daily at 09:00 AM IST | Enqueues SRS reminders and streak freeze alerts |
| `/api/cron/weekly-recap` | `POST` | `weekly-recap` | `30 3 * * 1` | Mondays at 09:00 AM IST | Enqueues weekly progress recap digests |
| `/api/cron/cleanup` | `POST` | `cleanup-logs` | `30 20 * * *` | Daily at 02:00 AM IST | Purges old delivery logs and expired tokens |

---

## 3. Security & Access Control

- All 6 endpoints reject unauthenticated public requests with HTTP `401 Unauthorized`.
- Bearer token must match `process.env.CRON_SECRET`.
- Authenticated admin sessions (`requireAdminUser()`) are supported as fallback for manual admin console triggers (`Run Now`).

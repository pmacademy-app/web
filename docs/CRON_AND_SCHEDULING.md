# Background Schedulers & Cron Architecture: Prodily

**Repository:** `prodily-monorepo` (app code at `apps/web/`)
**Last Updated:** November 15, 2026 (AG-15: pg_cron is the production scheduler; GitHub schedule removed; GET aliases removed)

---

## 1. Overview & Scheduler Architecture

Background jobs, queue processing, broadcasts, and periodic maintenance are scheduled via **pg_cron** inside PostgreSQL, calling HTTP Route Handlers over POST using `pg_net`. Vercel Cron is not used (`apps/web/vercel.json` declares no `crons`).

- **Scheduler Engine**: pg_cron in Supabase (`supabase/migrations/pending-approval/20261024000003_schedule_cron_jobs_pg_cron.sql`). The GitHub Actions workflow (`.github/workflows/notification-scheduler.yml`) is reserved for manual diagnostic dispatch only (`workflow_dispatch`).
- **Dead-Man Alerting**: The in-database dead-man check (AG-01) verifies cron execution freshness directly in PostgreSQL. Note that with the GitHub schedule removed, this check is no longer out-of-band: if pg_cron or the entire database stops, the in-database check cannot fire. For true out-of-band alerting, refer to the optional free external uptime monitor in `docs/ROADMAP.md` section 2.5.
- **Timezone**: Schedules are written in UTC. Reminders, recaps, and lifecycle emails are gated per user on their **local** preferred hour, so those jobs run hourly rather than at one fixed IST time.
- **Authentication**: All cron Route Handlers enforce Bearer token authentication matching `CRON_SECRET` (`Authorization: Bearer ${CRON_SECRET}`).
- **Target Host**: URLs are constructed using `PRODUCTION_SITE_URL` or `APP_URL` repository secrets, falling back to `https://prodily.app`.

---

## 2. Production Schedule Matrix (UTC)

| Cron Endpoint | HTTP Method | Scheduler Job | Schedule (UTC) | Cadence | Purpose |
|---|:---:|---|:---:|:---:|---|
| `/api/cron/process-email-queue` | `POST` | `process-email-queue` | `*/5 * * * *` | Every 5 minutes | Processes pending and retrying items in `email_queue`, with exponential backoff and lease reclamation |
| `/api/cron/process-broadcasts` | `POST` | `process-broadcasts` | `*/5 * * * *` | Every 5 minutes | Executes scheduled email and in-app broadcasts |
| `/api/cron/daily-reminder` | `POST` | `daily-reminder` | `30 * * * *` | Hourly | Enqueues SRS reminders and streak alerts for users whose local preferred hour has arrived; a local-date idempotency key makes it once per day |
| `/api/cron/weekly-recap` | `POST` | `weekly-recap` | `30 * * * *` | Hourly | Enqueues the weekly recap for users at their local recap day and hour (Sunday 18:00 by default), deduplicated per user per local date |
| `/api/cron/lifecycle` | `POST` | `lifecycle-sequences` | `30 * * * *` | Hourly | Enqueues lifecycle reactivation emails at the user's local hour, at most one per user per day, with a 30% deterministic holdout per sequence |
| `/api/cron/cleanup` | `POST` | `cleanup-logs` | `30 20 * * *` | Daily (02:00 IST) | Retention sweep from `lib/retention/policy.ts` plus orphaned avatar storage. **Report-only by default**: it deletes only when the caller posts `{"dryRun": false}` and `RETENTION_DELETE_ENABLED=true` is set. The scheduled job sends no body, so it reports counts and deletes nothing |
| `/api/cron/retry-failed` | `POST` | `retry-failed-emails` | Manual dispatch only | Not scheduled | Kept for manual diagnostic runs (`workflow_dispatch` with `job_to_run: retry`). It runs a normal queue pass, the same work `/api/cron/process-email-queue` does every 5 minutes. Still referenced by the cron heartbeat and the admin System page |

`workflow_dispatch` accepts `job_to_run` = `queue`, `broadcasts`, `retry`, `daily`, `weekly`, `lifecycle`, `cleanup` or `all` (`all` skips `retry`).

The table must stay in step with `CRON_JOB_DEFINITIONS` in `apps/web/lib/monitoring/cron-heartbeat.ts`; `eng01-cron-heartbeat.test.ts` fails if the definitions and the held pg_cron and dead-man migrations drift apart.

---

## 3. Security & Access Control

- All 7 endpoints reject unauthenticated public requests with HTTP `401 Unauthorized`.
- Bearer token must match `process.env.CRON_SECRET`.
- Authenticated admin sessions are accepted as a second caller (`actor: { allow: ['cron', 'admin'] }` in `withRoute`) for manual admin console triggers (`Run Now`).
- Every route exports `POST` only. Legacy `GET` aliases have been removed (AG-15).

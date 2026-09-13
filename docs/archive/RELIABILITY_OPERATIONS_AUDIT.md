# Prodily Reliability & Operations Audit — Stage 4

**Branch:** `architecture-audit-stage1`
**Base:** `main` @ `2b8d281` (= `origin/main`)
**Date:** 2026-09-08
**Scope:** Read-only audit of observability, reliability, testing, CI/CD, infrastructure, and scaling/cost. No application code, configuration, dependencies, or infrastructure modified. No fixes implemented. Nothing pushed.
**Prior stages:** Stage 1 (architecture), Stage 2 (security), Stage 3 (frontend/mobile). Their findings are not re-audited — only their operational consequences.

**Status convention:** **CONFIRMED** (verified in code at this commit) · **ASSUMPTION** (inferred, flagged as such) · **VERIFY-LIVE** (needs a running system, a CI log, or a vendor dashboard).

---

## 1. Executive summary

Prodily has **better reliability machinery than most products at this stage, wired to an operator who has to go looking for problems.** The email queue has `SKIP LOCKED` claiming, exponential backoff, a dead-letter state, per-provider attempt history, and an error logger with fingerprint deduplication, alert cooldowns, and a genuinely excellent redaction layer. Feature-flag kill switches exist for email, queue processing, and in-app notifications. A health endpoint exists and returns 503 correctly. This is real engineering, not a checklist.

Five things undermine it, and four are about the *edges* of that machinery rather than the machinery itself:

**The kill switch does not cover the path that broke.** `EMAIL_ENABLED` is checked in `lib/notifications/queue/processor.ts:45,208`. It is checked **nowhere** in `lib/email.ts` or `/api/auth/send-email-hook` — the direct transport that caused both September incidents. An operator flipping the switch during the attack would have stopped queued newsletters and not one byte of the attack traffic. The only lever that actually worked was closing signups, which is why signups are still closed.

**Stuck jobs are visible and unrecoverable.** No query anywhere reclaims stale `processing` rows. Worse, `app/api/admin/emails/queue/[id]/retry/route.ts:38` explicitly *refuses* to retry an item in `processing`. The admin dashboard surfaces the count, so an operator can watch a number climb and has no lever to act on it. This is guaranteed to happen, not merely possible: the processor iterates 50 items sequentially at an 8-second timeout each — up to 400 s — inside a GitHub Actions job with `timeout-minutes: 5` (300 s).

**The test suite can write to production.** `vitest.setup.ts:4-6` uses `process.env.X || 'mock-value'`, so a real value in the environment wins. `.github/workflows/ci.yml:24-26` injects the real `SUPABASE_SERVICE_ROLE_KEY` and `NEXT_PUBLIC_SUPABASE_URL`. The `global.fetch` guard only intercepts `mock.supabase.co`, so with the real URL every request goes to the real database. **The safety net is disabled precisely where the danger is.** This is the exact mechanism behind the production data leak documented in `lib/rate-limit.ts:88-97`.

**Nothing watches anything.** Alerts are in-app notifications written to the same database they are reporting on, read by an admin who must log in and look — a circular dependency that fails exactly when it matters. `/api/health` is well-built and **nothing polls it**. There is no external channel: no email, no push, no uptime monitor. Failures are detected when a user complains.

**Migrations may not be deploying at all.** `ci.yml:120` guards the migration step with `if: env.SUPABASE_ACCESS_TOKEN != ''`, but `deploy-supabase` defines no job-level `env` and step-level `env` is not available to that step's own `if`. The condition almost certainly evaluates false and the step silently skips — which would explain why `ISSUES_KNOWN.md` tells operators to deploy migrations manually. One CI log settles it.

**On infrastructure complexity: Prodily needs almost none of it.** Explicit assessment in §8.5 — no Redis, no Kafka, no Kubernetes, no microservices, no dedicated workers, no managed queue, no paid observability platform, at any scale in this audit's horizon. The genuine needs are a real scheduler, an uptime monitor, an error tracker, and a non-production database for CI. Three of those four are free.

---

## 2. What is already production-ready

Keep these. Several are load-bearing and better than the codebase average.

1. **The error logger is genuinely well-designed.** `lib/monitoring/logger.ts` — 15-minute fingerprint dedup window with `occurrence_count`; `stabilizeForFingerprint()` collapsing UUIDs, emails, timestamps and numbers so one outage produces one incident rather than one per user; a 1-hour per-fingerprint alert cooldown; and an inline comment explaining a real prior bug where `.maybeSingle()` on a multi-row filter broke dedup during sustained outages. Someone learned this the hard way and wrote it down.
2. **Redaction is best-in-class** (Stage 2 §3). Value-shape *and* key-name redaction, applied to everything persisted to `system_errors`.
3. **Retry architecture is correct.** `processor.ts:495-535` — exponential backoff `2^attempt × base` on an admin-configurable base, `max_attempts` from `PRIORITY_MATRIX`, a terminal `dead_letter` state, `provider_attempts` audit trail, and a structured incident emitted on dead-lettering.
4. **Queue claiming is concurrency-safe.** `claim_email_queue_items()` uses `FOR UPDATE SKIP LOCKED`.
5. **Kill switches exist and are DB-backed.** `EMAIL_ENABLED`, `QUEUE_PROCESSING_ENABLED`, `IN_APP_NOTIFICATIONS_ENABLED` with a 10-second hydration TTL that keeps serving the last known value on failure rather than failing open (`feature-flags/service.ts:114-158`).
6. **Maintenance mode is real and enforced server-side** — `proxy.ts` returns 503 on learner APIs and redirects pages, bypassable only by admins.
7. **The health endpoint is correctly built.** `app/api/health/route.ts` — probes the database, returns 503 when unreachable, sets `no-store`.
8. **Operational metrics already exist.** `app/api/admin/emails/queue/metrics/route.ts:31-37` counts every queue status *including* `processing`, and computes **oldest-pending age** — a ready-made SLO signal that nobody is alerting on.
9. **Frontend RUM is already instrumented.** `app/layout.tsx:145-152` mounts Vercel Analytics, Speed Insights, and GA4. Core Web Vitals data already exists in a dashboard.
10. **CI gates are non-trivial:** lint, typecheck, 1,112 unit tests, a brand-token guard, a production build, and Playwright — all blocking.
11. **Cron jobs use `concurrency` groups** with `cancel-in-progress: false`, so overlapping scheduled runs do not stampede.

---

## 3. Findings

### R-01 · The test suite runs against the production database when CI credentials are present
- **Severity:** Critical · **Area:** Testing / CI · **Status:** CONFIRMED · **Priority:** NOW
- **Evidence:** `apps/web/vitest.setup.ts:4-6` — `process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'mock-service-role-key'` and the same `||` pattern for `NEXT_PUBLIC_SUPABASE_URL`. `.github/workflows/ci.yml:24-29` sets `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `RESEND_API_KEY`, `CRON_SECRET`, and `SEND_EMAIL_HOOK_SECRET` from repository secrets on the `build-and-validate` job. `vitest.setup.ts:11-23` stubs `global.fetch` **only for URLs containing `mock.supabase.co`**; a real project URL falls through to `originalFetch`. `lib/rate-limit.ts:88-97` documents the outcome: "a 2026-09-07 test run leaked real rows into production here."
- **Why it matters:** The `||` fallback reads as a safety net but is inverted — it protects local runs, where no key exists, and disables itself in CI, where the real key does. Every pull request runs 1,112 tests with full RLS-bypassing production credentials and a live network path. This has already caused one production data incident; the guard added afterwards (`ALLOW_TEST_DB_ACCESS`) protects `rate_limits` and `createServiceRoleClient()` warnings, not the other ~40 tables. A malicious PR is also a data-exfiltration path.
- **Recommended direction:** CI must not hold production credentials. Either point CI at a separate Supabase project (free tier is sufficient for tests) or provide no key at all and make the tests fail loudly on a missing mock. Change `||` to a hard override in test mode so a real value cannot win.
- **Dependencies:** Stage 2 S2-H1 is the same root cause viewed from the security side.

### R-02 · The email kill switch does not cover the transport that caused both incidents
- **Severity:** Critical · **Area:** Incident response · **Status:** CONFIRMED · **Priority:** NOW
- **Evidence:** `EMAIL_ENABLED` is consulted at `lib/notifications/queue/processor.ts:45` and `QUEUE_PROCESSING_ENABLED` at `:208`. Grep for `EMAIL_ENABLED`, `isEnabled`, or any feature-flag import in `lib/email.ts` and `app/api/auth/send-email-hook/route.ts` returns **nothing**. Per Stage 1, `lib/email.ts` has 7 direct importers including the Supabase Auth hook, `/api/contact`, and `/api/waitlist`.
- **Why it matters:** During an active email-abuse incident the operator's fastest lever is a kill switch. This one stops queued optional mail and leaves the unauthenticated, attacker-reachable path fully open. That is why the only effective mitigation in September was `allowSignups = false` — a blunt instrument that is still in force and is blocking the product.
- **Recommended direction:** Route every send through one governed transport (Stage 2 §13.4). Until then, at minimum have `sendEmail()` consult `EMAIL_ENABLED` with an explicit `critical` bypass, so the switch means what an operator assumes it means.
- **Dependencies:** Stage 2 S2-C2 / D-08.

### R-03 · Stuck `processing` rows are visible, guaranteed, and unrecoverable
- **Severity:** Critical · **Area:** Queue reliability · **Status:** CONFIRMED · **Priority:** NOW
- **Evidence:** `claim_email_queue_items()` (migration `20260810000008`) selects only `status IN ('pending','retrying')`. Grep across `lib/notifications/queue/*` and all 44 migrations for a stale-`processing` reclaim returns **nothing**. `app/api/admin/emails/queue/[id]/retry/route.ts:38` — `if (['delivered','processing'].includes(item.status))` rejects the retry. `processor.ts:305` iterates claimed rows with a sequential `for` loop; providers use `AbortSignal.timeout(8000)` (`brevo-provider.ts:68`, `resend-provider.ts:65`); default batch is 50 (`processor.ts:205`); `.github/workflows/notification-scheduler.yml` sets `timeout-minutes: 5`.
- **Why it matters:** 50 × 8 s = 400 s against a 300 s job timeout, so under provider slowness the run is killed mid-batch **by design, not by accident**. Every unprocessed claimed row is stranded permanently: the claim function will not re-select it, `retry-failed` performs no dead-letter recovery (D-06), and the admin UI refuses to retry it. The count *is* surfaced (`queue/metrics/route.ts:32`), so the operator watches a number climb with no available action. For `auth.verify_email` and `auth.password_reset` this means users silently never receive account-critical mail.
- **Recommended direction:** Add a stale-`processing` predicate to `claim_email_queue_items()` (e.g. `OR (status = 'processing' AND processing_at < NOW() - INTERVAL '15 minutes')`), and allow admin retry on stale `processing` rows. Process the batch with bounded concurrency so the run fits its window.
- **Dependencies:** None. This is the highest-value small fix in the audit.

### R-04 · Alerting is circular; nothing external watches the system
- **Severity:** High · **Area:** Observability / detection · **Status:** CONFIRMED · **Priority:** NOW
- **Evidence:** `lib/monitoring/logger.ts:176` — critical incidents call `notifyAdminsOnce()`, which at `:213-224` creates **in-app notifications** via `createInAppNotification()` pointing at `/admin/system`. There is no email, push, webhook, or third-party alert channel anywhere in the codebase. `/api/health` exists; grep across `.github/workflows/`, `lib/`, and `app/` finds **no caller**. No uptime-monitor configuration exists in the repository.
- **Why it matters:** The alert is written to the database, about failures that are frequently database or platform failures, and is delivered through the application, to a human who must log into that application to see it. When Supabase is down, the alert cannot be written or read. Even in the happy path, detection latency equals "how long until an admin next opens the console." **Prodily cannot detect failures before users report them**, which matches the pattern of both September incidents.
- **Recommended direction:** One external, out-of-band channel. Free options in §9. Start with an uptime monitor on `/api/health` and email/Telegram on critical incidents — this is under an hour of work and changes the operating posture more than anything else in this report.
- **Dependencies:** R-13 (health endpoint is currently maintenance-gated).

### R-05 · Migration deploy is unreviewed, unrollbackable, uncoordinated — and may never run
- **Severity:** High · **Area:** CI/CD · **Status:** CONFIRMED (code) + VERIFY-LIVE (execution) · **Priority:** NOW
- **Evidence:** `.github/workflows/ci.yml:104-126`. The `deploy-supabase` job defines **no job-level `env`**; `SUPABASE_ACCESS_TOKEN` and `SUPABASE_PROJECT_ID` are declared in the step's own `env:` block, while the step's guard is `if: env.SUPABASE_ACCESS_TOKEN != ''` (line 120). Step-level `env` is not in scope for that step's own `if`, so the expression evaluates against an empty context and the step is skipped. Separately: `supabase db push` runs on every push to `main` with no dry run, no diff output, and no approval gate; Stage 1 confirmed **no down-migrations exist**; there is one Supabase project (no staging); and Vercel deploys on its own git trigger with **no ordering guarantee** relative to this job.
- **Why it matters:** Two failure modes, and they are opposites. If the step is skipped, migrations silently never deploy — consistent with `ISSUES_KNOWN.md` instructing operators that "Deployment requires migrations `20260907000001` and `20260908000001`." If it does run, an unreviewed forward-only schema change lands on production with no rollback and no coordination with the app deploy, so there is a window where code and schema disagree in an unpredictable direction.
- **Recommended direction:** First check a recent Actions log to determine which world you are in. Then: fix the condition, add `supabase db diff` output to the PR, require approval via a GitHub Environment, and make the app deploy wait on the migration job. Adopt expand/contract migrations so any ordering is safe.
- **Dependencies:** A staging project (§7) makes this materially safer.

### R-06 · Backend diagnostics are unstructured and unredacted
- **Severity:** High · **Area:** Observability · **Status:** CONFIRMED · **Priority:** NEXT
- **Evidence:** **294** raw `console.error` / `console.warn` / `console.log` calls in non-test code, many passing full exception objects (e.g. `processor.ts`, `capstones-db.ts`, `proxy.ts:238`). The redaction pipeline is applied only inside `logSystemError` / `logErrorReport`, which write to `system_errors`. There is no correlation/request ID anywhere: grep for `requestId`, `x-request-id`, or `traceId` returns nothing. No structured logger (pino/winston) is a dependency.
- **Why it matters:** Two consequences. **Security:** Vercel logs receive unredacted Supabase, PostgREST, and provider error text — precisely the content `redaction.ts`'s own threat model says can carry connection strings and API keys. **Operations:** with no correlation ID, a single user's failing request cannot be reconstructed from interleaved serverless logs. Vercel's log retention is short on lower plans (**VERIFY-LIVE** — depends on plan), so the evidence expires before most investigations start.
- **Recommended direction:** One structured logger emitting JSON with a request ID generated in `proxy.ts` and threaded through, routed through the existing `redaction.ts`. Convert `console.*` opportunistically rather than in one pass.
- **Dependencies:** Overlaps Stage 2 S2-H6.

### R-07 · No client-side error reporting; the frontend is a blind spot
- **Severity:** High · **Area:** Observability · **Status:** CONFIRMED · **Priority:** NEXT
- **Evidence:** `app/(app)/error.tsx:15-17` contains the comment "Log the error to an analytics or reporting service" followed by `console.error`. No Sentry, no `window.onerror`, no `unhandledrejection` handler. The only client telemetry is `lib/auth/telemetry.ts` → `/api/auth/telemetry`, scoped to auth error codes. Vercel Analytics and Speed Insights are mounted but are usage/CWV tools, not error trackers.
- **Why it matters:** Stage 3 found 74% of components are client components and 126 client-side `fetch` calls each hand-roll error handling. A crash or a failing fetch anywhere outside auth produces zero signal. Combined with R-04, both halves of the system are unwatched.
- **Recommended direction:** Sentry's free tier covers client and server in one SDK and would also resolve R-06's correlation problem. If a dependency is unwanted, extend the existing `/api/auth/telemetry` pattern to a general endpoint — but note Stage 2 S2-H13: its rate limiter is a per-instance in-memory map keyed on a spoofable header, so it needs hardening before carrying more traffic.
- **Dependencies:** Stage 2 S2-H13; Stage 3 F-11.

### R-08 · No test covers a critical path end to end
- **Severity:** High · **Area:** Testing · **Status:** CONFIRMED · **Priority:** NEXT
- **Evidence:** 113 test files, ~1,112 tests — all under `lib/__tests__/`, which `vitest.config.mts:8` enforces via `include: ['lib/__tests__/**/*.test.ts']` with `environment: 'node'`. **No component or rendering tests exist and none can, under this config.** E2E is 3 Playwright specs (`e2e/auth/login|password-reset|protected-routes`); reading them shows page-load and client-validation assertions only — `password-reset.spec.ts` checks that the form renders and that an empty submit is blocked. No test exercises signup → verification → first lesson → XP → progress, or login → session persistence → protected route.
- **Why it matters:** The suite is large and proves module-level logic, not that the product works. The bugs Stage 1 found — a leaderboard querying a non-existent column and silently returning zero, duplicate XP under concurrency, PostgREST truncating at 1,000 rows — are exactly the class that unit tests with mocked clients cannot catch, and all three survived 1,112 passing tests.
- **Recommended direction:** Three or four real E2E journeys against a seeded non-production project, run in CI. That is worth more than another 500 unit tests. Widen the vitest `include` so component tests become possible.
- **Dependencies:** R-01 (needs a non-production database first).

### R-09 · Mocks shape production code, so tests validate their own artifact
- **Severity:** High · **Area:** Testing · **Status:** CONFIRMED · **Priority:** NEXT
- **Evidence:** `lib/capstones-db.ts:333` — `(supabase.from('users') as unknown as DBChain)?.select?.(...)?.eq?.(...)`, optional-chained method calls commented "mock-safe fallback" because a hand-written mock may not implement `.select()`. `lib/rate-limit.ts:88-97` documents that an incomplete mock silently fell through to the in-memory limiter *and* to live credentials. Stage 1 counted 30 files carrying hand-rolled `DBChain` escape types.
- **Why it matters:** Production control flow exists to satisfy test doubles. The mocks are incomplete in ways nobody can see, and when they are incomplete the code takes a fallback path that only exists because of them — which is how a test run reached production. The suite's green status carries less information than its size suggests.
- **Recommended direction:** One shared Supabase fake, complete enough that production code needs no defensive optional chaining. This falls out of Stage 1's typed `lib/db/` layer.
- **Dependencies:** Stage 1 §9.1.

### R-10 · No retention policy; several tables grow without bound
- **Severity:** High · **Area:** Infrastructure / cost · **Status:** CONFIRMED · **Priority:** NEXT
- **Evidence:** `app/api/cron/cleanup/route.ts` is an explicit no-op — "NOT IMPLEMENTED. No retention policy has been decided, so this route deletes nothing" — scheduled daily by `notification-scheduler.yml`. Unbounded tables: `system_errors`, `email_delivery_events`, `email_queue`, `notification_events`, `user_notification_timeline`, `rate_limits`, and one `system_settings` row per day for the email quota counter (`increment_daily_email_quota`). `AvatarService.cleanupOrphanedAvatars()` exists but is reachable **only** through the admin-triggered `/api/admin/system/storage-cleanup` route, defaulting to `dryRun: true`; no cron calls it.
- **Why it matters:** On Supabase's free tier the database size limit is the binding constraint long before user count is (**VERIFY-LIVE** — current plan and usage unknown). `rate_limits` grows one row per unique key forever, which under the signup abuse pattern means one row per attacker-supplied IP. Orphaned avatars accumulate in storage with no automatic reclaim. This is a slow-motion outage with a predictable date that nobody is tracking.
- **Recommended direction:** Decide retention per table (90 days for `system_errors` and delivery events, 30 for timeline, immediate for expired `rate_limits`), implement the cron, and wire avatar cleanup into it with `dryRun: false`.
- **Dependencies:** Product decision on audit-retention obligations.

### R-11 · No CI security gates and no dependency automation
- **Severity:** Medium · **Area:** CI/CD / supply chain · **Status:** CONFIRMED · **Priority:** NEXT
- **Evidence:** `.github/workflows/ci.yml` contains no `npm audit`, no secret scanning, no CodeQL/SAST, no dependency review, and no restriction on dependency install scripts. No `.github/dependabot.yml` and no `renovate.json` exist. Stage 2 recorded `npm audit`: 5 vulnerabilities (4 high, 1 moderate).
- **Why it matters:** Stage 2 verified git history is currently clean of secrets — but nothing enforces that going forward, and a single careless commit is unrecoverable once pushed. Dependencies drift with no signal. Note Stage 3's correction: the `sharp`/libvips CVE is not currently reachable because every remote image render passes `unoptimized`, so this is hygiene rather than an active exposure.
- **Recommended direction:** Add `npm audit --audit-level=high`, gitleaks, and Dependabot (all free on public and private GitHub repos). Enable `--ignore-scripts` in CI installs.
- **Dependencies:** None.

### R-12 · No backups, disaster recovery, or environment separation are documented
- **Severity:** High · **Area:** Infrastructure · **Status:** CONFIRMED (absence in repo) + VERIFY-LIVE (actual vendor config) · **Priority:** NOW (verify) / NEXT (implement)
- **Evidence:** `docs/DEPLOYMENT.md` describes hosting and env vars only. No mention of backups, PITR, restore procedure, RTO/RPO, or a staging environment anywhere in `docs/`. `supabase/config.toml` is the local CLI config (`site_url = "http://127.0.0.1:3000"`). CI links to a single `SUPABASE_PROJECT_ID`.
- **Why it matters:** Supabase's free tier historically provides no point-in-time recovery and pauses projects after inactivity (**VERIFY-LIVE** — confirm the current plan and its backup terms). If the plan is free, a bad migration or an accidental `DELETE` is unrecoverable, and Stage 1 confirmed there are no down-migrations. Nobody has tested a restore. There is also no staging, so every migration and every deploy is a production experiment.
- **Recommended direction:** Determine the current plan today. If backups are absent, that is the single most consequential gap in this report. Add a staging Supabase project — which also solves R-01 and R-08.
- **Dependencies:** Budget decision (§8).

### R-13 · The health endpoint reports failure during maintenance and costs a DB call per poll
- **Severity:** Medium · **Area:** Operations · **Status:** CONFIRMED · **Priority:** NEXT
- **Evidence:** `proxy.ts` exempts only `/api/auth/`, `/api/admin/`, `/api/cron/`, `/api/email/`, `/api/waitlist`, and `/api/contact`. `/api/health` is therefore a "protected learner API", so it runs `SettingsService.getProductSettings()` and returns **503 `MAINTENANCE_MODE`** while maintenance is on.
- **Why it matters:** Once an uptime monitor is attached (R-04), planned maintenance will page as an outage — the classic way alerting gets muted and then ignored. It also means every poll performs a settings lookup, which on a cold serverless instance is a database round trip.
- **Recommended direction:** Exempt `/api/health` from the maintenance gate and have it report maintenance as a distinct field rather than an error status.
- **Dependencies:** Should be fixed before R-04 goes live.

### R-14 · GitHub Actions is the production scheduler, with no failure notification
- **Severity:** Medium · **Area:** Scheduled jobs · **Status:** CONFIRMED · **Priority:** NEXT
- **Evidence:** `.github/workflows/notification-scheduler.yml` drives all six jobs. Grep for `if: failure()`, `continue-on-error`, or any notification step returns nothing — failure signalling relies on GitHub's default email to the workflow actor. Stage 1 noted GH Actions schedules are best-effort with no SLA and are auto-disabled after 60 days of repository inactivity. `vercel.json` declares no crons.
- **Why it matters:** The entire email delivery path depends on a scheduler that may delay or skip runs, and whose failures surface only in a default email that is easy to filter. A repository quiet for two months silently stops sending verification email.
- **Recommended direction:** Move to Vercel Cron (colocated, observable, no extra cost on Pro). Until then add an explicit `if: failure()` notification step.
- **Dependencies:** Vercel plan (§8).

### R-15 · Retry backoff has no jitter
- **Severity:** Low · **Area:** Queue reliability · **Status:** CONFIRMED · **Priority:** LATER
- **Evidence:** `processor.ts:499` — `const nextRetryMinutes = Math.pow(2, attemptCount) * backoffBase`, purely deterministic.
- **Why it matters:** A provider outage fails a whole batch at once, so every item schedules its retry at the same instant and the batch re-hits the recovering provider simultaneously. At current volume this is harmless; it becomes a self-inflicted thundering herd as volume grows.
- **Recommended direction:** Multiply by a random factor in `[0.5, 1.5]`. One line, whenever the file is next touched.
- **Dependencies:** None.

### R-16 · No operational runbooks
- **Severity:** Medium · **Area:** Incident response · **Status:** CONFIRMED · **Priority:** NEXT
- **Evidence:** `docs/` contains two post-hoc incident investigations (`INCIDENT_2026-09-06`, `INCIDENT_2026-09-08`) and a descriptive `DEPLOYMENT.md`. There is no procedure for: email queue stuck, provider outage, rollback, restore, credential rotation, or escalation. Stage 2 additionally found no key-rotation runbook.
- **Why it matters:** The incident documents are excellent forensics and unusable at 2 a.m. The knowledge lives with one person. Note that several needed levers do not exist yet anyway (R-02, R-03), so writing runbooks first would document a capability gap — worth sequencing after those.
- **Recommended direction:** Three short runbooks — queue stuck, provider outage, bad deploy — each naming the exact query, the exact toggle, and the escalation. Link them from the alerts created in R-04.
- **Dependencies:** R-02, R-03 (the levers must exist to be documented).

---

## 4. Observability maturity assessment

**Level: instrumented, unmonitored.** The collection layer is strong; the detection layer does not exist.

| Capability | State |
|---|---|
| Structured error records | **Strong** — `system_errors` with severity, domain, kind, retryability, next-action, fingerprint, occurrence count |
| Deduplication | **Strong** — 15-min window, stabilized fingerprints |
| Sensitive-data protection | **Strong** for the DB sink; **absent** for `console.*` (R-06) |
| Application logs | **Weak** — 294 unstructured `console.*`, no correlation ID, no log levels |
| Metrics | **Partial** — queue counts and oldest-pending age exist (`queue/metrics`); no RED metrics on API routes, no latency percentiles anywhere |
| Tracing | **None** — and correctly so at this scale (§8.5) |
| Frontend errors | **None** outside auth (R-07) |
| Frontend performance | **Strong** — Vercel Speed Insights + Analytics already mounted |
| Alerting | **Circular** — in-app only, no external channel (R-04) |
| Uptime monitoring | **None** — `/api/health` exists and is unpolled (R-04) |

**Can failures be detected before users report them? No.** Every detection path terminates at an admin who must log in and look.

**SLO candidates already computable from existing data** — no new instrumentation needed:
1. **Email delivery latency** — oldest-pending age is already computed at `queue/metrics/route.ts:37`. Target: p95 under 15 minutes.
2. **Stuck-job count** — `processing` count already computed at `:32`. Target: zero older than 15 minutes.
3. **Dead-letter rate** — already counted at `:35`.
4. **Availability** — `/api/health`, once polled.
5. **Critical incident rate** — `system_errors` where `severity = 'critical'`.

---

## 5. Testing maturity assessment

**Level: high volume, narrow depth, unsafe isolation.**

| Dimension | State |
|---|---|
| Unit/module tests | **1,112 tests, 113 files** — substantial |
| Component/UI tests | **Zero**, and structurally impossible (`vitest.config.mts:8` restricts to `lib/__tests__`, `environment: 'node'`) |
| E2E | **3 smoke specs** — page render and client validation only (R-08) |
| Critical-path coverage | **None end to end** — signup→verify→lesson→XP untested as a journey |
| Test-data isolation | **Broken in CI** (R-01) |
| Mock fidelity | **Inverted** — production code defends against incomplete mocks (R-09) |
| Regression tests for known incidents | **Present and good** — `deferred-items-d02-d07.test.ts` covers the quota-key rollover; `email-hook-reliability`, `capstone-integrity`, `notification-queue-integrity` exist |
| Load/stress | **None.** `scripts/benchmark-concurrency.ts` exists but is not in CI and its behavior was not verified here (**ASSUMPTION**) |
| Security tests | **Partial** — `rls.test.ts`, `middleware-auth.test.ts` exist; no test asserts that the anon key cannot read `users.email` (Stage 2 S2-C2) |

**The gap that matters:** three of Stage 1's confirmed production bugs — the leaderboard's non-existent `amount` column, duplicate XP under concurrency, and PostgREST's silent 1,000-row truncation — all survived a fully green suite. They are the class of bug that only integration tests against a real database catch, and the reason to build R-08 before adding more unit tests.

---

## 6. CI/CD & deployment assessment

**Gates (all blocking, on every PR and push):** content compile → lint → typecheck → 1,112 unit tests → brand-token guard → production build → Playwright E2E. That is a stronger gate set than most projects this size.

**Gaps:**

| Area | State |
|---|---|
| Security scanning | **None** — no audit, secret scan, or SAST (R-11) |
| Secret handling | **Production credentials in the test job** (R-01) |
| Dependency automation | **None** — no Dependabot or Renovate (R-11) |
| Migration safety | **No review, no dry run, no rollback; possibly never runs** (R-05) |
| App/migration ordering | **Uncoordinated** — Vercel and GitHub Actions deploy independently (R-05) |
| Staging | **None** — single Supabase project (R-12) |
| Rollback | **Vercel instant rollback available for code** (**VERIFY-LIVE**); **none for schema** |
| Branch strategy | `main` is the deploy trigger; 25 stale branches exist locally, several at the same commit — housekeeping, not a risk |

**Asymmetry worth naming:** code rollback is one click; schema rollback does not exist. Since the two deploy independently and forward-only, a bad migration is the one deployment failure with no recovery path.

---

## 7. Infrastructure assessment

Repository-derived. Vendor plans and dashboard settings are **VERIFY-LIVE** throughout.

| Component | State |
|---|---|
| **Vercel** | Next.js 16 on serverless, `apps/web` root, `vercel.json` is `{ "framework": "nextjs" }`. **No `maxDuration` set anywhere** — all routes use the plan default, which is 10 s on Hobby and 15 s (configurable) on Pro. Given R-03's 400 s worst-case batch, the queue route depends entirely on the plan; **VERIFY-LIVE**. No crons declared. |
| **Supabase** | Single project, 44 migrations, ~45 tables, ~70 indexes. Client is `@supabase/supabase-js` over PostgREST, so **connection pooling is Supabase's concern, not the app's** — a genuine advantage of this architecture at serverless scale. |
| **Storage** | Avatars in Supabase Storage, 2 MB cap, MIME allowlist. Orphan cleanup exists but is manual and defaults to dry-run (R-10). |
| **External services** | Brevo (primary) + Resend (failover), both raw `fetch` with 8 s timeouts and a shared failure classifier. Supabase Auth. GA4. |
| **Scheduler** | GitHub Actions (R-14). |
| **Backups / DR** | **Nothing in the repository** (R-12). |
| **Environment separation** | **None** — one project serves production, CI, and E2E (R-01, R-12). |
| **Secret rotation** | No runbook, no schedule, no separation between CI and production credentials. |

---

## 8. Scaling & cost assessment

**Method:** derived from code and architecture. Vendor pricing and quotas change; treat every figure as **VERIFY-LIVE** and confirm against current plans before budgeting.

### 8.1 ~1K users
Everything holds. The binding constraint is **email provider quota, not infrastructure** — Brevo's free tier has historically been ~300 emails/day and Resend's ~100/day and 3,000/month. Signup verification, welcome, daily reminders, and weekly recap for 1K users exceeds that comfortably. This is likely a paid email plan (~$0–25/mo) before anything else costs money.

**Also true at 1K:** R-01, R-02, R-03, R-04, R-12 are all live risks *today*. None of them is a scale problem.

### 8.2 ~10K users
Correctness cliffs arrive before capacity limits (Stage 1 §6): PostgREST's 1,000-row cap silently truncates the leaderboard and admin analytics; `.in('user_id', [10k UUIDs])` produces a ~370 KB URL and fails. **These produce confidently wrong numbers, not errors** — the operational consequence is that the admin console becomes untrustworthy exactly when the business starts depending on it.

Expected costs: Supabase Pro (~$25/mo — MAU and database size), Vercel Pro (~$20/mo — and **commercial use requires Pro regardless of usage**, which likely already applies), email $20–50/mo. **Roughly $65–95/mo total.**

### 8.3 ~100K users
- **Email is the dominant cost and the hardest ceiling.** The sequential 50-per-5-minute processor caps at ~600 emails/hour; a single announcement to 100K users would take a week. Needs bounded concurrency and a real scheduler. Provider cost at this volume plausibly runs $100–300/mo.
- **`auth.getUser()` on every request** (Stage 1) makes Supabase Auth a hard dependency in every request's latency budget and a rate-limit surface. Local JWKS verification removes the hop.
- **The `xp_events` trigger** re-sums a user's whole history per insert while holding a lock on their `users` row.
- **Retention becomes mandatory** — R-10's unbounded tables drive database size and therefore plan cost.
- Expected: Supabase Pro plus compute add-on, Vercel Pro plus usage. **Roughly $200–500/mo.**

### 8.4 Significantly larger
Read replica for admin analytics; materialized leaderboard snapshots (`weekly_leaderboard_snapshots` already exists — use it); partition or roll up `xp_events`; a dedicated queue worker process. Still one application, one database.

### 8.5 Explicit assessment of infrastructure often reached for

| Technology | Verdict |
|---|---|
| **Redis** | **No, at every scale in this horizon.** Its plausible uses here are rate limiting and caching. Rate limiting belongs in Postgres as a single atomic statement — the codebase already contains that exact pattern in `increment_daily_email_quota()`. Caching is served by Next's data cache and ISR. Revisit only if per-instance cache divergence becomes a user-visible complaint. |
| **Kafka** | **No.** There is one producer and one consumer, and the volume is emails per hour. `email_queue` with `SKIP LOCKED` is the right tool and is already correct. |
| **Kubernetes** | **No.** There is one Next.js app. Serverless removes the operational burden that Kubernetes exists to manage. |
| **Microservices** | **No** (Stage 1 reached the same conclusion independently). The problems are boundary discipline inside the monolith; splitting would add network partitions to a system that cannot yet detect its own failures. |
| **Dedicated worker process** | **Not yet.** The 5-minute HTTP-triggered processor is adequate once R-03 and concurrency are fixed. Revisit around 100K users or when a batch cannot drain in its window even with concurrency. |
| **Managed queue (SQS/QStash/Inngest)** | **Not yet — but this is the closest call.** `email_queue` already does claiming, backoff, and dead-lettering correctly. Its missing piece is a *reliable trigger*, and Vercel Cron supplies that at no extra cost. If GH Actions delays continue after that, Inngest's free tier is the cheapest correct answer. |
| **Paid observability (Datadog/New Relic)** | **No.** Cost is disproportionate. Sentry's free tier plus Vercel's built-in logs and Speed Insights covers the real gaps (R-06, R-07). |

---

## 9. Recommended free / low-cost tooling

Ordered by impact per unit of effort. Every item is free at Prodily's current scale.

| Need | Tool | Cost | Effort | Closes |
|---|---|---|---|---|
| Know when the site is down | **UptimeRobot** or **Better Stack** on `/api/health` | Free | ~15 min | R-04 |
| Error tracking, client + server | **Sentry** free tier (5k events/mo) | Free | ~1 hr | R-06, R-07 |
| Reliable scheduling | **Vercel Cron** | Included with Pro | ~30 min | R-14 |
| Non-production database | **Second Supabase project** (free tier) | Free | ~1 hr | R-01, R-08, R-12 |
| Secret scanning | **gitleaks** GitHub Action | Free | ~10 min | R-11 |
| Dependency updates | **Dependabot** | Free | ~10 min | R-11 |
| Vulnerability gate | `npm audit --audit-level=high` in CI | Free | ~5 min | R-11 |
| Out-of-band alerts | **Telegram bot** or email from the incident logger | Free | ~1 hr | R-04 |
| Database backups | **Supabase Pro** daily backups + PITR | ~$25/mo | Plan change | R-12 |

**Total to close the top reliability gaps: roughly $25/mo and under a day of work**, most of it configuration rather than code.

---

## 10. Production operations roadmap

### NOW — this changes the operating posture, and most of it is hours not days
1. **R-12 (verify)** — confirm today whether the Supabase plan provides backups. Everything else is secondary to knowing this.
2. **R-05 (verify)** — check one Actions log to see whether the migration step executes. The answer determines which of two very different problems you have.
3. **R-01** — remove production credentials from CI; make the `||` fallback a hard override in test mode.
4. **R-03** — stale-`processing` reclaim in `claim_email_queue_items()`; allow admin retry on stale rows.
5. **R-02** — make `EMAIL_ENABLED` cover the direct transport, so the kill switch means what an operator assumes.
6. **R-13** then **R-04** — exempt `/api/health` from maintenance gating, then attach an uptime monitor and one out-of-band alert channel.

### NEXT — the operational maturity pass
7. **R-08** — three or four real E2E journeys against the staging project from R-01.
8. **R-07** — Sentry for client and server.
9. **R-06** — structured logging with a request ID threaded from `proxy.ts`.
10. **R-14** — move cron to Vercel Cron; add bounded concurrency to the queue loop.
11. **R-10** — decide retention; implement `/api/cron/cleanup`; wire avatar cleanup with `dryRun: false`.
12. **R-11** — `npm audit`, gitleaks, Dependabot in CI.
13. **R-05 (implement)** — migration review gate, diff output, deploy ordering.
14. **R-16** — three runbooks: queue stuck, provider outage, bad deploy.
15. **R-09** — one shared Supabase fake, alongside Stage 1's `lib/db/`.

### LATER — with named triggers
16. **SLOs and a dashboard** from the five signals in §4 — trigger: after R-04 has a month of data.
17. **R-15** — retry jitter, next time the processor is touched.
18. **Load testing** — trigger: before any marketing push, or at 10K users.
19. **Read replica / materialized leaderboard** — trigger: measured admin query latency, not a user count.
20. **Managed queue** — trigger: Vercel Cron proves insufficient, which it probably will not.

---

## 11. Open questions

**Requires live verification (not answerable from the repository)**
1. **What Supabase plan is this, and does it have backups and PITR?** Highest-priority unknown in this audit.
2. **Does the `deploy-supabase` step actually run?** One Actions log settles R-05.
3. **Is the CI Supabase project the production project?** If yes, R-01 is active on every pull request.
4. **What Vercel plan, and what `maxDuration` applies to `/api/cron/process-email-queue`?** Determines how often R-03 fires.
5. **How many `email_queue` rows are stuck in `processing` right now?** Directly measurable, and it quantifies R-03's realized cost.
6. **What is Vercel's log retention on the current plan?** Determines whether R-06 is an inconvenience or means evidence expires before investigation.
7. **Has a database restore ever been tested?** An untested backup is a hypothesis.

**Business and product decisions**
8. **What is the monthly infrastructure budget?** Roughly $25/mo closes the backup gap; $65–95/mo covers 10K users. Most recommendations here are free, but not all.
9. **What retention obligation applies to `admin_audit_logs` and `system_errors`?** Blocks R-10.
10. **What is the acceptable email delivery SLO?** "Verification email within 5 minutes" versus "within an hour" changes whether R-14 is urgent.
11. **Who is on call, and through what channel?** R-04 needs a destination. Alerting nobody in particular is what the current design already does.
12. **What is the expected growth curve?** The NOW list is scale-independent; the ordering of NEXT depends on whether 10K users arrives in six months or three years.

---

## Top 10 production reliability risks

| # | ID | Risk | Severity | Why here |
|---|---|---|---|---|
| 1 | **R-12** | No confirmed backups or DR; single environment | High | Unrecoverable data loss is the only failure with no remedy. Forward-only migrations and no down-migrations make it worse. Verification costs minutes. |
| 2 | **R-01** | Tests can write to the production database | Critical | Already caused one production incident. Fires on every pull request. |
| 3 | **R-03** | Stuck jobs — guaranteed, visible, unrecoverable | Critical | Account-critical email is silently lost, and the operator can see it happening with no lever. Small fix. |
| 4 | **R-02** | The kill switch misses the path that broke | Critical | Both September incidents. Determines whether the next one is contained in minutes or days. |
| 5 | **R-04** | No external detection; alerting is circular | High | Everything else is slower to find and fix while this holds. Cheapest posture change in the report. |
| 6 | **R-05** | Migrations unreviewed, unrollbackable, maybe never running | High | Either schema changes are silently not deploying, or they deploy unreviewed onto production. Both are bad; you do not yet know which. |
| 7 | **R-08** | No end-to-end coverage of any critical path | High | 1,112 green tests coexisted with three confirmed production bugs. The suite's size overstates its assurance. |
| 8 | **R-06 / R-07** | Diagnostics unstructured, unredacted, frontend blind | High | When something breaks, reconstruction is archaeology — and the logs leak secrets while failing to help. |
| 9 | **R-10** | No retention; several tables grow without bound | High | A slow-motion outage with a predictable date and no owner. |
| 10 | **R-11** | No CI security gates or dependency automation | Medium | Nothing enforces the currently-clean history. Prevention is cheap; a leaked secret is not. |

### Recommended order

**First — verify before building (hours):** R-12 and R-05 verification, plus counting stuck `processing` rows. All three are questions, not projects, and each one changes what the rest of the list should look like.

**Second — stop the bleeding (days):** R-01, R-03, R-02. Each is small, independent, and closes a failure mode that is live today rather than at some future scale.

**Third — gain sight (days):** R-13 then R-04, then R-07 and R-06. Detection before more prevention: you cannot manage what you cannot see, and everything after this is faster once you can.

**Fourth — build confidence (weeks):** R-08 and R-09 on the staging project created in step two, then R-10 and R-11.

**Fifth — mature the practice (ongoing):** R-05 implementation, R-14, R-16, then SLOs once R-04 has produced a month of data.

The ordering principle throughout: **verify, then contain, then observe, then prevent.** Prodily's problem is not that it lacks reliability machinery — it has more than most products at this stage. It is that the machinery has no eyes on it and two of its levers are wired to the wrong path.

---

*End of Stage 4. Read-only audit. No application code, configuration, dependencies, or infrastructure modified. No fixes implemented. No Stage 1–3 recommendations implemented. Nothing pushed.*

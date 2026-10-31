# Prodily — Engineering Improvements

**Date:** 2026-10-17 · **Commit:** `d43e3f2` (origin/main, "Merge pull request #57 … fix/admin-guard-and-rpc-grants")
**Auditor topic:** higher-leverage engineering and platform opportunities (architecture, performance, scalability and cost, reliability, testing, CI/CD, observability, developer experience). Line-level defects belong to the code-quality audit, so they appear here only when they point to a structural fix.

---

## Scope & method

- **Read:** `apps/web` (proxy, `next.config.ts`, `vercel.json`, `lib/**`, `app/api/**`, the lesson and dashboard routes, the test configs), `supabase/migrations/**`, `scripts/**`, `.github/workflows/**`, `.github/dependabot.yml`, the root and app `package.json`, `README.md`, and `docs/*.md`. I also used the `.tokencap/agent` maps to find my way around.
- **Read-only runtime evidence:**
  - `gh run list` / `gh run view` for the scheduler and CI history (200 scheduled runs, 2026-09-28 → 2026-10-17).
  - The job logs of CI run `39014204360` (the latest push to `main`), which give test counts, timings and E2E results.
  - Nine anonymous `GET`s of the public `/api/health` endpoint, which reports database latency and the serving region through `x-vercel-id`.
- **Not done:** no build, dev server, install, migration, or edits to the repo. Typecheck, lint and tests are another auditor's job; the counts below come from the CI log.
- **Labels:** "Inference" and "Estimate" mark claims I could not observe directly. Free-tier limits are the vendors' published numbers. Check them against the current plans before acting on them.
- **Code over docs:** where the docs disagree with the code, I trusted the code and listed the drift under ENG-16.

---

## Scorecard

| Area | Score | One-line reason |
|---|:-:|---|
| Architecture | 6 | Strong route contract (`withRoute` + actor model, enforced by a custom ESLint rule) and a clean content pipeline. But the service-role client is used 655 times, 637 `.from()` calls sit outside the data layer, and aggregation happens in Node instead of SQL. |
| Performance | 4 | Functions run in `iad1`. A trivial DB query from production takes 216–886 ms. Each request verifies the session against GoTrue twice. A quiz submit makes ≥10 sequential network calls. Lessons ship ~200 KB of SVG through a client component. |
| Scalability & cost | 4 | The leaderboard and 62 admin/cron call sites page whole tables into memory. Email is capped by free provider tiers and by a hard 1,000/day clamp in code. Retention never deletes against a 500 MB free database. The proxy runs on almost every page. |
| Reliability | 4 | The 5-minute scheduler fired about 3% of its configured triggers. Reminders and recaps gate on an exact local hour, so most users miss them. There is no disaster-recovery backup, and migrations race the Vercel deploy. |
| Testing | 5 | 3,858 tests run in 66 s, plus component and a11y suites. But nothing runs against real Postgres, 57 suites assert on source text, the authenticated E2E flows are skipped in CI, and production code carries a fallback that exists for mocks. |
| CI/CD | 6 | Fast (about 3.5 min), with pinned and checksummed security gates and verified migration pushes. But migrations are not validated in PRs, there is no wired staging, the deploy order is not enforced, and the build runs twice. |
| Observability | 4 | The incident pipeline, request IDs, redaction and heartbeat are well designed. But client and RSC errors are invisible, there is no per-request timing, 324 raw `console.*` calls remain, and a detected scheduler outage alerts no one. |
| Developer experience | 5 | Thorough docs and ADRs. But the README quickstart is broken (`npm install` at the root installs nothing), docs drift on counts, versions and schedules, there are 60+ scripts, tests are named after tickets, and there is no local-database path. |
| **Overall** | **5** | Mean 4.75. The codebase is careful and well defended at the code level. The biggest gains are now in platform configuration (scheduler, region, auth verification) and a real-database test and release tier. |

---

## Executive summary

- **Background jobs run about 3% as often as designed.** Over 18.9 days, the GitHub Actions scheduler produced 200 runs against 313 configured triggers per day (≈10.6/day). The median gap between runs is 103 min and the worst is 9.3 h. Daily reminders, weekly recaps and lifecycle emails only send when the run lands in the user's exact local hour (`app/api/cron/daily-reminder/route.ts:138`). So most learners silently miss them. This is the highest-value fix, and it is small (ENG-01).
- **Compute and database appear to be on different continents.** Production serves from `bom1::iad1`, and `/api/health` measures 216–886 ms for a one-row query. Every page and API call makes several such round trips. Pinning the function region to the Supabase region is a free configuration change, once the region is confirmed (ENG-02).
- **Each authenticated request pays for session verification twice.** The proxy (`proxy.ts:293`) and the route handler (`lib/auth.ts:251`) each call GoTrue `getUser()`. The installed `@supabase/auth-js` supports `getClaims()`, which verifies locally (ENG-03).
- **No test touches a real database.** RLS, RPCs and triggers are checked by string-matching migration files (`lib/__tests__/rls.test.ts`). Production code carries a non-atomic quiz path that exists "for unit mocks" (`lib/academy/lessons-db.ts:269`). A Supabase-local CI tier with pgTAP would also validate every migration before it auto-applies to production (ENG-05).
- **Releases are not ordered and not recoverable.** Migrations apply after Vercel has already deployed the code (ENG-06). Staging is described in the docs but not wired: the three authenticated E2E tests were skipped on the last `main` run. The `pg_dump` backup workflow was never implemented (ENG-07).
- **The scale path runs through SQL, not Node.** The weekly leaderboard reloads every ranked user plus every XP event of the week, per serverless instance, every 45 s. Admin analytics has 62 full-table paged reads. Email is capped well below a 10k-learner reminder volume (ENG-08, ENG-10).
- **Observability blind spots are cheap to close:** `onRequestError`, a client error beacon, one timing line in `withRoute`, alerting on the heartbeat that already exists, and an uptime probe (ENG-11).

---

## Capacity outlook (estimates)

What gives out first as usage grows. The published limits are the vendors' current free-tier figures; verify them against the plans actually in use.

| Resource | Limit | Pressure at ~10k learners | At ~100k learners |
|---|---|---|---|
| Email sends | Brevo free 300/day + Resend free 100/day; code clamps the daily automation limit to ≤1,000 (`lib/admin/settings-service.ts:507`) | Daily reminders alone are roughly 10× the free provider capacity once the scheduler works (ENG-10). | Needs a paid tier or a different channel (push/in-app). |
| Vercel function invocations | Hobby plan quota (1M/month as published); the proxy is its own invocation (`proxy.ts:526-527`) | Estimate: ~60 invocations per learner session (page = proxy + render; API = proxy + handler) × 8 sessions/month ≈ 4.8M/month. | Needs Pro. Hobby is also limited to non-commercial use (cross-topic). |
| Supabase egress | Free 5 GB/month | The leaderboard rebuild moves roughly 2 MB of roster plus ~18 MB of weekly XP rows (assumes 20 XP events per learner per week). 50 rebuilds a day uses the monthly allowance in about 5 days. | Untenable without the SQL ranking in ENG-08. |
| Supabase database size | Free 500 MB | Activity tables (`xp_events`, `notification_events`, timeline, `email_queue`, `rate_limits`, `system_errors`) only grow, because retention runs in dry-run mode (ENG-09). | Paid tier required regardless. |
| Supabase Auth | Free 50k MAU | OK | Exceeded |
| Admin analytics | Function duration | Pages of 1,000 rows fetched one after another over a ~220 ms link (ENG-02) → multi-second loads. | `xp_events` in the millions means thousands of sequential pages, which time out. |

---

## Opportunities

### ENG-01 — Make scheduled jobs actually run, and make time-window jobs tolerate late runs
**Impact:** High · **Effort:** S–M · **Risk:** Low

**Current state**

- All background work is triggered by `.github/workflows/notification-scheduler.yml`:
  - `*/5 * * * *` for the queue and broadcasts.
  - `30 * * * *` for reminders, recaps and lifecycle.
  - `30 20 * * *` for cleanup.
  - That is 313 configured triggers per day.
- `gh run list` shows 200 scheduled runs between 2026-09-28T15:42Z and 2026-10-17T13:56Z, about 10.6 per day. Gaps: p10 18 min, median 103 min, p90 316 min, maximum 557 min.
- A sample of the 40 most recent runs shows about 6 queue runs and about 6 reminder runs per day. On 2026-10-16 the queue ran at 00:45, 05:08, 09:47, 14:21, 18:13, 21:15 and 23:40 UTC.
- The reminder, recap and lifecycle handlers are edge-triggered. They only act when the current local hour equals the target exactly:
  - `app/api/cron/daily-reminder/route.ts:133-138`
  - `app/api/cron/weekly-recap/route.ts:175` (exact day and hour, so one hour per week)
  - `lib/growth/lifecycle-run.ts:259`
- Triggers also fire late: the `:30` trigger ran at 07:24 on 10-16, which counts as hour 7. So a learner on the default UTC 09:00 got no reminder on 2026-10-16 (no run executed in UTC hour 9).
- **Estimate:** with about 6 of 24 hours covered, a given learner receives a daily reminder on roughly 1 day in 4, and a weekly recap in roughly 1 week in 4.
- The queue does record a heartbeat (`app/api/cron/process-email-queue/route.ts:6-27`). The admin System page flags a gap over 15 min (`lib/admin/system-service.ts:63-95`), but nothing pages anyone.
- `docs/ISSUES_KNOWN.md` ISSUE-03 still lists cron execution as "requiring real-world verification". The run history above is that verification.
- A further risk: GitHub disables scheduled workflows in public repositories after 60 days without repository activity, and this repo is public.

**Proposed change**

1. **Move triggering to Supabase `pg_cron` + `pg_net`.** Both are available on the Free plan and run next to the data. Call the same HTTPS endpoints with `CRON_SECRET` kept in Supabase Vault. Alternatively, run the pure-SQL parts (claim/reclaim, retention) directly as SQL jobs. Fallbacks that are also ₹0: Cloudflare Workers cron triggers, or cron-job.org. Keep the GitHub workflow for manual `workflow_dispatch` only.
2. **Make windowed jobs level-triggered.** Send when local time ≥ preferred hour, local time < a cut-off (for example 22:00), and no send has been recorded for this local date. The idempotency keys already exist (`daily-reminder-${user.id}-${localDate}` at `app/api/cron/daily-reminder/route.ts:172`; the workflow comments at `notification-scheduler.yml:7-13` rely on the same keys), so catch-up is safe from duplicates. Apply the same rule to recaps ("on or after the target day and hour, once per local week").
3. **Write a heartbeat for every job** (the reminder, recap, lifecycle and broadcast routes do not record one today). Alert through the existing out-of-band webhook (`lib/monitoring/out-of-band-alert.ts`) when a heartbeat is older than 2× its interval.

**Expected benefit**

- Queue latency drops from hours to minutes. This matters for welcome emails when the in-request flush in ENG-04 is lost.
- Every opted-in learner receives the reminders and recaps the product assumes. Retention experiments stop being confounded by delivery gaps.
- Background jobs no longer depend on GitHub's best-effort scheduler.

**Risk.** A job that starts working sends more email, so pair this with ENG-10's capacity check before switching on.

---

### ENG-02 — Co-locate serverless functions with the database
**Impact:** High · **Effort:** S (configuration) · **Risk:** Low

**Current state**

- A request to production `/api/health` returns `x-vercel-id: bom1::iad1::…`. The edge POP is Mumbai; the functions run in Washington DC (`iad1`), which is Vercel's default.
- The same endpoint times one `select id from users limit 1` (`app/api/health/route.ts`). Nine samples gave 216, 217, 254, 271, 275, 597, 657, 687 and 886 ms.
- No region is configured anywhere: there is no `regions` in `vercel.json`, no `preferredRegion` in `app/**`, and nothing in the docs.
- **Inference:** a 216 ms floor for a one-row query matches a transcontinental link. It is consistent with a Supabase project in an Indian region (the audience is India-first; schedules are written in IST) being reached from `iad1`. The Supabase host sits behind Cloudflare, so DNS cannot confirm the region. Check the Supabase dashboard (Project Settings → General → Region).

**Why it compounds.** The proxy (Node runtime per the bundled Next 16 docs, `proxy.md:255`) makes 1–3 Auth/DB calls. The `(app)` layout awaits `getServerUser`, the email-verification setting and the profile in sequence (`app/(app)/layout.tsx`). The quiz handler makes ≥10 sequential calls (ENG-04). At about 220 ms each, that is roughly 1 s before a dashboard can stream, and 2 s or more per quiz submit.

**Proposed change**

1. Confirm the Supabase region.
2. Set the Vercel project's function region to the nearest match (for example `bom1` for `ap-south-1`). This is available on Hobby as a single-region setting.
3. Re-measure `/api/health` latency and add it to the admin System page trend.
4. Record the choice in `docs/DEPLOYMENT.md`.

**Expected benefit.** **Estimate:** 150–200 ms saved per round trip, so roughly 0.5–1 s off authenticated page TTFB and 2 s or more off a quiz submit. It also helps Indian users, whose dynamic responses currently cross the ocean once more. No code change.

**Risk.** Low. If the database turns out to be in `us-east-1`, the latency comes from something else (compute size, TLS per new client in `createServiceRoleClient()`), and ENG-03/ENG-04 become the main levers.

---

### ENG-03 — Verify sessions locally, once per request, and run the proxy only where needed
**Impact:** High · **Effort:** M · **Risk:** Medium

**Current state**

- **Pages:** `proxy.ts:293` calls `supabase.auth.getUser(accessToken)`, a network call to GoTrue, on every protected page and learner API request. It then calls `refreshSession` on a miss (`proxy.ts:311`).
- **API routes:** route handlers then resolve the actor through `getAuthenticatedUserFromRequest`, which calls `getUser()` again (`lib/auth.ts:251`). Server-rendered pages call it through `getServerUser`, which `react.cache` dedupes only within one render.
- **Result:** every learner API call makes two GoTrue round trips before doing any work. Public `/lessons/*` views by signed-in users add `getUser` plus two DB queries (`proxy.ts:223-240`).
- The installed `@supabase/auth-js` exposes `getClaims()` (`node_modules/@supabase/auth-js/dist/main/GoTrueClient.js:5321`). With Supabase's asymmetric JWT signing keys, it verifies the token locally against a cached JWKS.
- **Proxy coverage:** the matcher (`proxy.ts:565`) runs on every page except static assets and a handful of APIs. That includes all marketing pages, the glossary and `/api/search-index`, mainly so it can set the `?ref=` referral cookie. The file's own comment notes each entry is billed as a separate invocation (`proxy.ts:526-527`).

**Proposed change**

1. Enable asymmetric JWT signing keys in Supabase.
2. Replace `getUser()` with `getClaims()` in the proxy and in `resolveActor` / `getServerUser`. Keep `getUser()` only where freshness matters: admin authorization, password and email change, and account deletion.
3. Narrow the proxy matcher to a positive list:
   - the app, auth and admin paths;
   - protected API prefixes;
   - `{ source: '/:path*', has: [{ type: 'query', key: 'ref' }] }` for attribution. Next 16 proxy matchers support `has`/`missing` (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md:114-118`).
4. Add one E2E test for concurrent requests holding an expired access token. Parallel RSC prefetches can each try to refresh with the same refresh token. This is the known-debt area around the custom session bridge (`docs/ARCHITECTURE.md` §5).

**Expected benefit**

- Two fewer remote calls per API request and one fewer per page.
- Fewer invocations on marketing and SEO traffic, including crawlers. **Estimate:** 30–50% of total invocations.
- Less dependence on GoTrue availability.

**Risk.** With local verification, revocation takes effect at token expiry (default 1 h), so keep `getUser()` on privileged paths. The key rotation needs a short rollout plan.

---

### ENG-04 — Take side effects off the request path
**Impact:** Medium–High · **Effort:** M · **Risk:** Medium

**Current state**

- **Quiz submission** (`recordQuizAttemptAction`, `lib/academy/lessons-db.ts:188-487`). On the happy path it awaits, one after another:
  - a disk read of the full lesson JSON (`:202`, up to 292 KB, not cached on this path);
  - `getRuntimeXpValues` (`:234`);
  - the atomic RPC `record_lesson_quiz_completion` (`:244`);
  - `updateUserStreak` (`:346`);
  - a user read (`:351`);
  - two dynamic imports and up to three `globalNotificationDispatcher.dispatch` calls (`:357-433`);
  - a progress count (`:399`);
  - the referral check (`:419-420`);
  - certificate issuance (`:462-463`).

  That is at least 10 sequential network calls inside the request, so the response waits for notifications and certificate work.
- **Un-awaited background work.** About 74 sites call un-awaited `.catch(...)` or `void` promises (grep heuristic). On serverless, work left pending after the response returns is not guaranteed to finish. The most important case is the "near-real-time flush" for welcome and other high-priority emails (`lib/notifications/queue/processor.ts:221-228`). With the scheduler in its current state (ENG-01), that flush is the only fast delivery path.
- `after()` from `next/server` is not used anywhere. It is stable in this Next version (bundled docs `04-functions/after.md`).

**Proposed change**

1. Keep XP, progress and attempts inside the existing RPC. Move notifications, referral activation, certificate issuance and the queue flush into `after()`; Vercel keeps the function alive for them via `waitUntil`.
2. For anything that must survive a crash, write an outbox row in the same RPC (for example `domain_events`) and let the queue worker fan it out. This also gives one place to retry.
3. Emit a per-lesson answer key at compile time so quiz validation does not parse the full lesson JSON (see ENG-12).

**Expected benefit**

- **Estimate:** quiz-submit latency drops to the RPC plus one or two calls.
- Side effects stop being lost silently.
- One retryable path for notifications instead of 74 ad-hoc ones.

**Risk.** Badges and notifications become eventually consistent by a few hundred ms. The celebration host already reads them asynchronously, so check that it re-polls.

---

### ENG-05 — Add a real-Postgres test tier and validate every migration in the PR
**Impact:** High · **Effort:** M · **Risk:** Low

**Current state**

- **All 267 Vitest files run against a mocked Supabase.** `vitest.setup.ts` points `NEXT_PUBLIC_SUPABASE_URL` at `https://mock.supabase.co` and stubs `fetch` to return `[]`. 100 files use `vi.mock`.
- **The "RLS test" reads migration SQL and asserts substrings** (`lib/__tests__/rls.test.ts:7-40`). So policies, grants, `SECURITY DEFINER` functions, the XP trigger, `claim_email_queue_items` (`FOR UPDATE SKIP LOCKED`), `consume_rate_limit` and `record_lesson_quiz_completion` are never executed by any test.
- **57 test files `readFileSync` application source and assert on its text**, for example the `b7*`, `b10*` and `phase-t*` suites. They break on refactors that preserve behaviour and pass on behaviour changes that preserve text.
- **Mocks shape production code:** `lib/academy/lessons-db.ts:269` reads "Fallback path when running in environments without the RPC (e.g. unit mocks)". In production, a transient RPC error silently falls into a non-atomic multi-write path.
- **Migrations reach production untested.** All 68 migrations auto-apply on merge to `main` (`ci.yml:283-363`); the CI never applies them to an empty database. `supabase/config.toml` (Postgres 17) and `seed.sql` already exist, so a local stack is one command away.
- **DB types come from the production project** (`apps/web/scripts/gen-db-types.js:6`, hard-coded `--project-id`), not from the migrations. No CI step checks for drift.
- **CI E2E covers only unauthenticated flows.** The last `main` run had 14 passed and 3 skipped (signup → XP and the session lifecycle). The specs self-skip without staging credentials.

**Proposed change**

1. **New CI job `db`:** `supabase start` → `supabase db reset` (applies all migrations from zero, plus the seed) → `supabase db lint` → `supabase test db` → `supabase gen types typescript --local` diffed against `types/database.ts`.
2. **pgTAP tests**, one file per concern:
   - RLS per role (anon, authenticated self/other, service);
   - function grants (this would have caught ISSUE-31, governance RPCs executable by `anon`);
   - quiz RPC idempotency;
   - queue claim under concurrency;
   - XP trigger totals.
3. **A small Vitest "integration" project** (`ALLOW_LIVE_DB_TESTS=true`) against the local stack for the 10 or so critical services (lesson completion, XP, queue processor, leaderboard RPC once it exists).
4. **Delete the mock-only fallback** at `lessons-db.ts:269`. On RPC failure, return an error the client retries.
5. **Ratchet the source-text suites.** Rewrite them as behaviour tests or ESLint rules when their area is next touched, and stop adding new ones.

**Expected benefit**

- Migrations are proven to apply cleanly before they auto-deploy.
- Security policies are verified by execution, not by spelling.
- Type drift is caught, and production code loses its test-only branches.

**Risk.** Adds about 2–3 min of CI (Docker images). Run it in parallel with the existing jobs.

---

### ENG-06 — Order releases and wire a real staging environment
**Impact:** High · **Effort:** M · **Risk:** Medium

**Current state**

- **Migrations run after the deploy.** `deploy-supabase` runs only after `build-and-validate` on a push to `main` (`ci.yml:283-285`). Vercel's Git integration deploys `main` on its own schedule; there is no Vercel step in the workflows.
  - In run `39014204360`, migrations applied at 07:39:11–07:39:42Z, about 4 min after the merge.
  - **Inference:** the production deployment was usually already live by then.
  - `docs/DEPLOYMENT.md:162-168` says "apply the migration … then deploy the application code", but nothing enforces it.
- **Staging exists only in the docs.** It appears in `DEPLOYMENT.md` §4.5, but no workflow targets it, the E2E staging secrets are absent (the 3 skipped tests), and the CI log warns that `NEXT_PUBLIC_SUPABASE_URL` is not set.
- **Rollback coverage is partial:** down-migrations exist for 9 of 68 migrations (`supabase/migrations/rollback/`). There is no documented `vercel rollback` runbook.

**Proposed change**

1. **Expand/contract rule.** Every migration must be safe against both the old and the new code. Add a CI lint that rejects `DROP`, `RENAME` and `ALTER … TYPE` outside `pending-approval/`. That folder exists for this purpose (`supabase/migrations/pending-approval/README.md`).
2. **Gate production on migrations.** Turn off automatic production promotion in Vercel. Promote from a GitHub job that `needs: deploy-supabase`, using `vercel deploy --prebuilt --prod` or `vercel promote`. Preview deployments stay automatic.
3. **Create staging as a second Free Supabase project.** Point Vercel Preview env vars at it, apply migrations to it on every PR merge, and set the E2E secrets so the authenticated flows run.
4. **Add a one-page runbook:** app rollback (`vercel rollback`), schema rollback (down file, or forward-fix), and who approves.

**Expected benefit.** No window where new code meets the old schema. Authenticated critical paths are tested on every merge. A rehearsed way back.

**Risk.** Promotion becomes one more step to keep healthy. Keep a manual `workflow_dispatch` escape hatch.

---

### ENG-07 — Implement disaster-recovery backups
**Impact:** High · **Effort:** S · **Risk:** Low

**Current state**

- `scripts/backup/postgrest-data-export.ts:1-9` says plainly that the `pg_dump` workflow ("I-01-B5") "is not implemented". The PostgREST export it provides captures public-schema rows only: no schema, functions, policies, `auth.users` or storage.
- The Supabase Free plan does not include downloadable backups or PITR (verify against the current plan).
- The retention sweep (ENG-09) and future destructive migrations depend on a backup that does not exist.

**Proposed change**

1. A nightly GitHub Actions job runs `supabase db dump` (roles, schema, data) using the `SUPABASE_DB_PASSWORD` secret already defined (`ci.yml:296`).
2. Encrypt the dump with `age`/`gpg`. Artifacts of a public repository are downloadable by any signed-in GitHub user, so never upload plaintext.
3. Store it in a private bucket (for example Cloudflare R2's free tier) with 30-day retention.
4. Run a quarterly restore drill into the local stack from ENG-05.
5. Back up storage avatars weekly.

**Expected benefit.** A recoverable answer to "the database is gone or corrupted" for ₹0.

**Risk.** Key management. Keep the decryption key outside GitHub.

---

### ENG-08 — Move aggregation from Node into Postgres
**Impact:** High at 10k+ learners · **Effort:** M–L · **Risk:** Medium

**Current state**

- **The weekly leaderboard rebuilds from raw rows.** It loads every user with XP (`lib/db/leaderboard.ts:35-43`), every opted-out user, every lesson completed this week and every XP event this week (`:52-91`), each paged 1,000 rows at a time. It then ranks in memory, caching per instance for 45 s (`lib/leaderboard-db.ts:74`). Each warm instance rebuilds independently; see the capacity table for the egress estimate.
- **Admin analytics, curriculum, achievements, communications, lifecycle and weekly-recap code make 62 `fetchAllRows` calls** that page whole tables into memory (for example `lib/admin/analytics-service.ts:360-468`, `lib/admin/curriculum-service.ts:350-407`).
- **There are four separate implementations of the pager:** `lib/db/pagination.ts:37`, `lib/growth/fetch-all-rows.ts:14`, `lib/admin/service.ts:875` and `lib/admin/curriculum-service.ts:48`.
- **The right direction has started.** `20261012000001_admin_analytics_rpc.sql` moved some analytics into SQL, and `lib/db/pagination.ts` documents why silent 1,000-row truncation (`max_rows = 1000`, `supabase/config.toml:18`) was dangerous.

**Proposed change**

1. **Leaderboard:**
   - Option A, an RPC: `get_weekly_leaderboard(week_start, limit, offset)` using `rank() over (…)` with the opt-out join done in SQL.
   - Option B, write-time maintenance: a `leaderboard_weekly(week_start, user_id, xp, lessons, days_active)` table updated by trigger on `xp_events` and lesson completion, indexed on `(week_start, score desc)`.

   Option B makes reads O(page size) regardless of user count.
2. **Admin dashboards:** continue the RPC migration. For the heaviest views, use materialized views refreshed by `pg_cron` (hourly or nightly), which pairs with ENG-01.
3. **Consolidate the pager.** Keep one implementation and allow `fetchAllRows` only in export or backfill code, enforced by an ESLint restriction.

**Expected benefit.** Egress and latency stop growing with total users. Admin pages stay inside function limits at 100k learners. One pagination behaviour.

**Risk.** Ranking-rule parity (days studied → lessons → weekly XP → streak, per `docs/TESTING.md`) must be pinned with pgTAP tests from ENG-05 before switching.

---

### ENG-09 — Data lifecycle and free-tier headroom
**Impact:** Medium · **Effort:** S · **Risk:** Low–Medium

**Current state**

- **Retention never deletes.** `/api/cron/cleanup` is a real retention sweep, not the placeholder the docs describe. But it deletes nothing unless the request body says `dryRun: false` and `RETENTION_DELETE_ENABLED=true` (`app/api/cron/cleanup/route.ts:15-31`). The scheduler posts no body (`notification-scheduler.yml:157-159`), so it is report-only indefinitely.
- **Nothing shows how close the database is to its 500 MB cap.**
- **Duplicate indexes add write cost on the hottest tables:**
  - `idx_user_lesson_progress_user_status` and `idx_user_lesson_progress_status` are both `(user_id, status)` (`20260822000001…:61`, `20260826000002…:65`).
  - `xp_events_user_idx (user_id)` is covered by `(user_id, created_at)` (`20260728000002…:76`).
- **Every rate-limited request writes to Postgres** through `consume_rate_limit` (`lib/rate-limit.ts:137`).

**Proposed change**

1. Read the dry-run counts the route already returns, agree the windows, then enable deletion. Do this after ENG-07 exists.
2. Add database size and the top 10 relation sizes to the admin System page via an RPC over `pg_total_relation_size`. Alert at 70%.
3. Drop the duplicate indexes. Review `pg_stat_user_indexes` for unused ones; Supabase's Index Advisor and `supabase db lint` help here.
4. For cheap read endpoints, consider Vercel WAF rate-limit rules or an Upstash free tier. Keep the DB-backed fail-closed limiter for paths that send email.

**Expected benefit.** Months more headroom on the Free plan, cheaper writes, and an early warning instead of a sudden read-only database.

**Risk.** Deletion is irreversible, which is why ENG-07 comes first.

---

### ENG-10 — An email capacity plan that matches the product's ambitions
**Impact:** Medium (cost/scalability) · **Effort:** S–M · **Risk:** Low

**Current state**

- **A hard ceiling in code:** the daily automation limit is clamped to 10–1,000 (`lib/admin/settings-service.ts:507`), with a default of 1,000 (`:108`).
- **The providers' free tiers are smaller still:** Brevo 300/day and Resend 100/day as published. Provider-quota reservation and failover exist (`lib/notifications/providers/provider-quota.ts:76-107`), which is good.
- Once ENG-01 makes reminders actually fire, a few thousand active learners exceed both.
- Critical auth emails bypass the internal quota by design (`docs/OBSERVABILITY.md` §2) but share the provider allowance. Optional sends can therefore starve verification emails late in the day.

**Proposed change**

1. **Move the daily reminder to in-app plus Web Push** (VAPID, ₹0). Keep email for the weekly recap, lifecycle and transactional mail.
2. **Reserve transactional headroom:** cap optional sends at, say, provider limit − 20%.
3. **Make the 1,000 clamp a setting**, and add a provider-usage card (ISSUE-04 already asks for this split).
4. **Set a paid-tier trigger,** for example when sustained demand exceeds 70% of the free cap for a week.

**Expected benefit.** Predictable delivery, protected signup emails, and a known cost step instead of silent throttling.

**Risk.** Web Push needs a permission UX. That is a cross-topic item for the product and UI/UX auditors.

---

### ENG-11 — Close the observability blind spots
**Impact:** Medium–High · **Effort:** S–M · **Risk:** Low

**Current state**

- **Strong foundations:** a structured, redacted logger (`lib/monitoring/log.ts`), request IDs (`lib/monitoring/request-id.ts`), an error taxonomy with `system_errors` and dedup (ADR-004/005), and an out-of-band alert webhook (`lib/monitoring/out-of-band-alert.ts`).
- **Gaps:**
  - **Server errors outside route handlers are unrecorded.** There is no `instrumentation.ts` / `onRequestError`, so RSC render and Server Action errors only reach platform logs.
  - **Browser errors stay in the browser.** The client error boundaries only `console.error` there (`app/error.tsx:21-22`, `app/global-error.tsx:26-27`).
  - **No request timing.** `withRoute` wraps all 133 routes but emits no status or latency line (`lib/api/with-route.ts`), so there are no RED (rate/errors/duration) metrics.
  - **Most logging is still unstructured:** 324 raw `console.*` calls remain in `app/`, `lib/` and `components/`, against 12 files using `log`.
  - **No Web Vitals** (no Speed Insights, no `useReportWebVitals`).
  - **Short log retention.** Vercel Hobby keeps runtime logs briefly (about 1 hour as published), and log drains need a paid plan (verify).
  - **The alert is silent when unconfigured** (its own header says so). Whether `OUT_OF_BAND_ALERT_WEBHOOK_URL` is set in production is unverified.
  - **Scheduler lag is detected but not alerted** (ENG-01).

**Proposed change**

1. Add `instrumentation.ts` with `onRequestError` → `logErrorReport` (bundled docs `instrumentation.md:36-38`).
2. Add a tiny `/api/client-errors` beacon, rate-limited and redacted, called from both error boundaries. Sentry's free tier is an alternative, with ADR-005 redaction applied.
3. Make `withRoute` emit one `http.request` log line (operation, status, `duration_ms`, actor kind, `requestId`), and sample slow requests into `system_errors` as warnings.
4. Add Web Vitals: `@vercel/speed-insights`, or send LCP/INP to GA4 through the existing consent gate.
5. Set up a free uptime monitor on `/api/health` and the heartbeat alerts from ENG-01. Confirm the webhook URL is set in production.
6. Ship `error` and `warn` events to a free external sink (Axiom, Better Stack or Grafana Cloud free tiers) via `after()` so retention survives Hobby limits.

**Expected benefit.** Failures a learner sees become visible to the team. Latency regressions (ENG-02, ENG-03) can be measured. Outages page someone.

**Risk.** Event volume. Sample `info`, keep everything at `error`.

---

### ENG-12 — Lighten lesson delivery and static payloads
**Impact:** Medium · **Effort:** M · **Risk:** Low–Medium

**Current state**

- **Compiled lessons are heavy because of inline diagrams.** `content/dist/lessons` is 16 MB for 90 lessons. The largest file, `les_7r8npj.json`, is 292 KB, of which about 198 KB is 10 inline Mermaid SVGs.
- **The whole lesson goes through a client component.** The academy lesson page hands the full lesson to `LessonPageContent`, a `'use client'` component of 1,089 lines (`app/(app)/academy/[moduleSlug]/[lessonId]/page.tsx:310-357`, `lesson-content.tsx:1`). By how RSC serializes client props, the block tree, SVGs included, travels in the flight payload as well as in the SSR HTML. The whole block renderer is client-side too (`renderer/block-tree-renderer.tsx:1`).
- **Search downloads everything.** The overlay fetches an 800 KB array of 2,519 docs from `/api/search-index` (`components/search/SearchOverlay.tsx:98`). That is a function behind the proxy, wrapped in `unstable_cache` (`app/api/search-index/route.ts:8-18`), and the search is a linear scan. The docs call it a FlexSearch index; it is not one.
- **Smaller items:**
  - Marketing sections import the full `motion` from `framer-motion` with no `LazyMotion` (9 components).
  - `public/brand/og-image.png` is 1.3 MB (cross-topic SEO).
  - The capstone page is entirely client-rendered (`app/(app)/capstones/[module]/page.tsx`, 587 lines).

**Proposed change**

1. Render static blocks (markdown, Mermaid SVG, glossary, connections) as Server Components. Keep only the quiz, flashcards and concept checks as client islands, each receiving just its own data. Strip `correctAnswer` from what reaches the client; the server already validates (cross-topic security).
2. At compile time, emit `search-index.<hash>.json` into `public/` (CDN-served, no invocation) and a compact `answer-keys/<lessonId>.json` for quiz validation.
3. Use `LazyMotion` + `m`, or CSS transitions for simple fades. Recompress the OG image to under 300 KB.

**Expected benefit.** Smaller lesson payloads and less hydration on low-end Android, which matters for an India-first audience. Fewer function invocations. Faster quiz validation.

**Risk.** The renderer split needs care around `LessonContextProvider`. Do it block type by block type.

---

### ENG-13 — A real data-access layer, with RLS as a second line of defence
**Impact:** Medium · **Effort:** L (incremental) · **Risk:** Medium

**Current state**

- **Learner data bypasses RLS.** `createServiceRoleClient` is referenced 655 times across 134 files, including learner routes such as `app/api/v2/lessons/[lessonId]/progress/route.ts`. Its own docstring says "Do not use this to fetch data on behalf of a specific user" (`lib/supabase.ts:23-28`). The user-scoped `createAuthenticatedServerClient` appears in 6 files. Authorization therefore rests entirely on application code, and RLS policies are effectively untested and unused for learner traffic.
- **Queries are spread everywhere:** 637 `.from('…')` calls live outside `lib/db/`, which holds 4 files used by 9 modules.
- **The client/server boundary is checked only by tests.** `import 'server-only'` is used nowhere; a test allowlist (`lib/__tests__/client-server-boundary.test.ts`) stands in for it.
- **A half-finished domain move:** `lib/xp.ts`, `lib/xp-service.ts`, `lib/badges.ts` and `lib/lessons-db.ts` are one-line re-exports of `lib/xp/*`, `lib/badges/*` and `lib/academy/*`.

**Proposed change**

1. Add `import 'server-only'` to `lib/supabase.ts` and every `*-db.ts`/service module. This makes the boundary a build error instead of a test.
2. Introduce per-domain repositories (`lib/<domain>/repo.ts`) as the only place `.from()` is allowed. Enforce this with an ESLint rule in the style of the existing `require-with-route`.
3. Move learner reads, then writes, to a user-scoped client so RLS becomes a real second layer. Do this after ENG-05, so pgTAP proves the policies first.
4. Finish the domain-folder move and delete the shims.

**Expected benefit.** A bug in one handler's authorization check no longer exposes other users' rows. Queries are easier to find, index and test.

**Risk.** Policy gaps show up as 403s. Migrate per domain behind tests.

---

### ENG-14 — CI efficiency and gate completeness
**Impact:** Low–Medium · **Effort:** S · **Risk:** Low

**Current state.** CI is already fast: `build-and-validate` takes about 3.5 min, and Vitest runs 267 files and 3,858 tests in 65.7 s. Remaining waste and gaps:

- **Content is compiled twice per job.** There is a `content:build` step (`ci.yml:70`), and `npm run build` runs `content:build` again (`apps/web/package.json` `build`). The e2e log shows both, at 07:36:09 and 07:36:44.
- **The production build runs twice:** in `build-and-validate` and again in `e2e` (`ci.yml:206-209`).
- **No build cache:** there is no `.next/cache` cache step.
- **The a11y suite runs twice.** It is inside the `npm run test` include and runs again at `ci.yml:80-81`.
- **Lint warnings do not gate.** There are 45 lint warnings, and `"lint": "eslint"` has no `--max-warnings 0`.
- **Compiler tests are not in CI.** `test:compiler` and `test:parity` (`scripts/compiler/tests/`) sit outside the Vitest include.
- **Coverage is configured but never run or thresholded** (`vitest.config.mts` `coverage`).

**Proposed change.**

1. Build once, upload `.next` and `content/dist` as an artifact, and have e2e download it.
2. Cache `.next/cache`.
3. Drop the duplicate a11y and content steps.
4. Clean the 45 warnings, then set `--max-warnings 0`.
5. Add the compiler tests.
6. Run coverage nightly with a ratchet on `lib/` critical directories.
7. Split lint, typecheck and test into parallel jobs.

**Expected benefit.** About 1–2 min saved per run, stronger gates, and protection for the content compiler, which is a risk hotspot in the TokenCap map.

---

### ENG-15 — Monorepo, build-tool and configuration shape
**Impact:** Low–Medium · **Effort:** S–M · **Risk:** Low

**Current state**

- **The root is not a real monorepo.** The root `package.json` has no `workspaces` (lockfile: 261 bytes) and proxies scripts with `npm --prefix`. The README's "From the repository root: `npm install`" (`README.md:162-166`) installs nothing the app needs.
- **The content compiler borrows the app's `node_modules`.** It lives in the root `scripts/compiler/` but resolves packages through `NODE_PATH` (`apps/web/scripts/compile-content.js:12-22`; `test:compiler`).
- **Build-only packages are runtime dependencies:** `remark-*`, `unified` and `unist-util-visit` are app `dependencies`.
- **Some dependencies are unexplained:** `hermes-parser`, `mdn-data` and `bail` are direct dependencies with no imports. `@types/node` is `^20` on Node 22.
- **`compile-content.js:29-36` hides compiler failures.** When the compiler fails but a previous `content/dist` with 90 lessons exists, it exits 0. A broken compile can therefore ship stale content wherever `dist` survives.
- **Environment variables have no schema.** There are 429 `process.env` reads of 53 variables across 76 files. Only Turnstile is validated at build time (`next.config.ts:2-7`).

**Proposed change**

1. Adopt npm workspaces with `apps/web` and `packages/content-compiler`, each with its own dependencies (remark, unified, mermaid, jsdom), or flatten to a single package.
2. Make the compile fallback opt-in (`--allow-stale`) and fail in CI.
3. Add `lib/env.ts`: a zod schema split into server and public parts, imported by `next.config.ts` so a misconfigured deploy fails at build. Replace direct reads incrementally.
4. Prune the unexplained dependencies, or comment why they are pinned.

**Expected benefit.** A working one-command setup, a smaller runtime dependency tree, and configuration errors caught before deploy.

---

### ENG-16 — Documentation drift and onboarding
**Impact:** Low–Medium · **Effort:** S · **Risk:** Low

**Current state.** The docs are unusually thorough: 11 ADRs, a known-issues register with honest statuses, and a hardening ledger. But they hard-code facts that have moved on:

| Doc says | Code says |
|---|---|
| Next.js 16.2.12 (`ARCHITECTURE.md`, `TESTING.md`, `DEPLOYMENT.md`) | `next` 16.3.8 (`apps/web/package.json`) |
| 41 migrations (`ARCHITECTURE.md`) | 68 |
| 100 test files / 1,029 tests (`ARCHITECTURE.md`, `README.md:205`); 160 suites / 2,180 tests (`TESTING.md`) | 267 files / 3,858 tests (CI run 39014204360) |
| "FlexSearch Index Compiler" (`ARCHITECTURE.md`) | plain JSON array, linear scan (`lib/search.ts`) |
| Daily reminder `30 3 * * *`, weekly `30 3 * * 1`, no lifecycle job (`CRON_AND_SCHEDULING.md`) | hourly `30 * * * *` for all three (`notification-scheduler.yml:14`) |
| `/api/cron/cleanup` is a no-op placeholder (`ARCHITECTURE.md` §5, `CRON_AND_SCHEDULING.md`, ISSUE-21) | dry-run retention sweep (`app/api/cron/cleanup/route.ts`) |
| CI runs E2E on every PR (`TESTING.md` §4, `DEPLOYMENT.md` §1) | E2E is path-gated on PRs, and authenticated flows skip (`ci.yml:160-179`) |
| `npm run test:watch` (`README.md:209`) | no such script |
| The audit brief's "vercel.json crons" | `vercel.json` is `{ "framework": "nextjs" }`; scheduling is GitHub Actions |

**Other friction**

- No local database path: the quickstart has developers fill `.env.local` with hosted keys.
- Types are generated from the production project.
- About 50 test files are named after tickets or phases (`b7c-…`, `phase-t2-…`, `incident-2026-09-09-…`), which makes "what covers X?" hard to answer.
- There are 40+ single-file `test:*` scripts.

**Proposed change**

1. Stop hard-coding counts and versions in prose; link to CI output instead, or generate a `docs/STATUS.md` in CI.
2. Fix the README quickstart.
3. Add `npm run setup`: `supabase start` + seed + content compile (pairs with ENG-05).
4. Reorganize tests into domain folders. Keep ticket IDs in `describe` titles rather than filenames, and replace the per-file scripts with `vitest run <pattern>`.

**Expected benefit.** A new contributor or agent can trust the docs, and onboarding takes minutes without production keys.

---

## Roadmap

**Now (next 2 weeks; mostly configuration, low risk)**

1. ENG-01: move triggers to `pg_cron`/`pg_net` (or an external cron), make reminders, recaps and lifecycle level-triggered, add heartbeat alerts.
2. ENG-02: confirm the Supabase region and pin the Vercel function region. Re-measure `/api/health`.
3. ENG-07: nightly encrypted `supabase db dump`, plus one restore test.
4. ENG-11 quick wins: `onRequestError`, error-boundary beacon, uptime probe, confirm the out-of-band webhook is set.
5. ENG-16: fix the README quickstart and the cron doc.

**Next (1–2 months)**

1. ENG-05: Supabase-local CI job with `db reset`, pgTAP, type-drift check; remove the mock-only fallback.
2. ENG-06: expand/contract lint, promotion gated on migrations, staging project wired to Preview and E2E.
3. ENG-03: asymmetric JWT keys + `getClaims()`; narrow the proxy matcher.
4. ENG-04: `after()` for side effects and the queue flush; outbox for must-deliver events.
5. ENG-08 (leaderboard first): SQL ranking or a maintained weekly table.
6. ENG-09 and ENG-10: enable retention after reviewing dry-run counts, add the DB-size alert, drop duplicate indexes, set the email channel and quota plan.
7. ENG-12 and ENG-14: server-rendered lesson blocks, static search index, CI de-duplication.

**Later (this quarter and beyond)**

1. ENG-13: repositories, `server-only`, user-scoped clients so RLS becomes a real second line.
2. ENG-08 (admin): materialized views refreshed by `pg_cron`.
3. ENG-15: workspaces with a separate content-compiler package, zod env schema.
4. Adopt Cache Components / `use cache` in place of `unstable_cache`. The bundled Next 16 docs say it "is replaced by the `use cache` directive" (`node_modules/next/dist/docs/01-app/02-guides/migrating-to-cache-components.md`); this repo uses `unstable_cache` in about 10 modules.
5. Plan the move off Vercel Hobby and the Supabase Free plan, using the capacity outlook above as triggers.

---

## What's already strong

- **API contract discipline.** Every route goes through `withRoute` with an explicit actor policy (`lib/api/with-route.ts`, `lib/api/actor.ts`), enforced by a custom ESLint rule (`eslint-rules/require-with-route.mjs`). Request IDs propagate from proxy to handler. Error responses follow ADR-006.
- **The queue is engineered for correctness.** It claims with `FOR UPDATE SKIP LOCKED`, reclaims stale leases, dedupes with idempotency keys and unique constraints, bounds concurrency against a deadline, fails over between providers with failure classification (ADR-001/002), and reserves provider quota before dispatch.
- **Security-minded defaults.** The limiter fails closed on money-spending paths (`lib/rate-limit.ts`). Privileged columns are guarded and RPC grants locked down in migrations. Redaction is applied before logs leave the process (ADR-005).
- **CI hygiene.** The gitleaks binary is pinned and checksummed. A dependency-audit gate uses an allowlist. Dependabot is grouped, and its peer-pinned vitest group exists because of a real incident. The auto-merge workflow never checks out PR code. The migration deploy verifies "up to date" after pushing instead of trusting exit codes.
- **The content pipeline keeps lesson text out of Postgres.** It compiles incrementally with a hash-keyed cache (`scripts/compiler/compile.ts:659-768`). Marketing pages, public lessons, reviews and certificate pages are statically generated or ISR (`revalidate` 1800–3600).
- **Cost awareness is already in the code.** Notification polling backs off to 5 min, settings are cached for 60 s, the proxy excludes self-authenticating webhooks and crons, and admin caches are bounded-staleness `unstable_cache` wrappers that never cache failures (`lib/admin/bounded-cache.ts`).
- **A fast, broad suite.** 3,858 tests in about 66 s, an axe-core a11y gate, component tests under jsdom, and E2E specs that refuse to run writes against production (`e2e/support/env.ts`).
- **Honest documentation culture.** ADRs record their trade-offs, deferred items have "revisit when" triggers (`docs/ISSUES_KNOWN.md` D-01…D-08), and statuses distinguish "fixed in code" from "verified in production". The drift in ENG-16 is about stale numbers, not stale thinking.

---

## Cross-topic notes (one line each, for the other auditors)

- **Security:**
  - Learner traffic runs on the service-role client (ENG-13).
  - `CRON_SECRET` is interpolated directly into `run:` scripts in `notification-scheduler.yml` (for example line 44), against the convention stated in `ci.yml:291-293`.
  - The CSP allows `'unsafe-eval'` (`next.config.ts`).
  - Quiz `correctAnswer` is shipped to the client (`blocks/quiz/QuizBlock.tsx:71`).
  - The repository is public.
- **SEO:** `public/brand/og-image.png` is 1.3 MB.
- **Product:** reminder and recap delivery gaps (ENG-01) likely confound retention metrics and experiment readouts gathered since the hourly gating shipped.
- **Platform terms:** Vercel Hobby is limited to non-commercial use. A product with legal-entity and marketing email configuration should plan for Pro.

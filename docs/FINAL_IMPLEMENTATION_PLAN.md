# Prodily — Final Implementation Plan (LOCKED)

**Status:** LOCKED — source of truth for all subsequent implementation work
**Branch of record:** `docs/final-implementation-plan` · **Base:** `main` @ `2b8d281`
**Date:** 2026-09-08
**Supersedes for implementation purposes:** `docs/PRODUCTION_BLUEPRINT.md` (architectural baseline, retained for rationale)
**Audits:** `docs/audits/ARCHITECTURE_AUDIT_STAGE1.md`, `SECURITY_AUDIT_STAGE2.md`, `FRONTEND_MOBILE_READINESS_AUDIT.md`, `RELIABILITY_OPERATIONS_AUDIT.md`

> **Authority.** Where this document and any audit or the blueprint disagree, **this document wins**. Decisions in §4 are locked and must not be re-litigated during implementation. If implementation discovers a concrete technical contradiction, stop the batch, report it, and get the decision revised — do not work around it silently.

---

> ## ⚠️ Status overlay — updated 2026-09-10
>
> **This plan is still the locked specification. It is no longer an accurate record of
> what remains to be built.**
>
> On 2026-09-09 an unplanned production incident fix landed on `main` (commit
> `10a21a5`, *"fix: harden signup email abuse and provider failover"*). It implemented a
> substantial part of **I-03** and **I-04** outside this plan's batch sequence.
>
> **Before starting any batch below, check its current status in
> [`HARDENING_LEDGER.md`](HARDENING_LEDGER.md).** Where this plan and the ledger
> disagree about *status*, the ledger wins; where they disagree about *scope*, this
> document still wins.
>
> Already delivered by `10a21a5` — **do not re-implement**:
> **I-03-B1** (atomic rate-limit RPC) · **I-03-B2** (limiter with an explicit fail
> mode; shipped as `failClosed: boolean`) · **I-03-B5** (global signup ceiling) ·
> **I-04-B6** (verification before durable side effects; `refCode` deferred to the
> verification callback via auth metadata, so its planned migration was not needed).
>
> Partially delivered — **re-scope before starting**: I-03-B3, I-03-B4, I-03-B6,
> I-04-B2, I-04-B3, I-04-B7.
>
> **I-04-B5** (route the auth hook through the queue) was **superseded in mechanism**:
> the hook now runs through the synchronous governed gateway
> (`lib/email-governance.ts`) instead of the queue. Its objective under L-10 — no
> ungoverned egress on the hook path — is met.
>
> **I-04-B3 carries an unresolved conflict.** Its objective states the breaker should
> trip "to a hard stop rather than shifting volume to the secondary", while ADR-002 and
> the shipped code deliberately fail over on capacity exhaustion. This needs a human
> decision before the batch is implemented — see the ledger's *Open questions*.
>
> **Next implementation batch: B2 — Public Portfolio XSS (finding S2-C3, plan ref I-12).**

---

## 1. Executive summary

Prodily is a Next.js 16 / Supabase / Vercel application with genuinely good engineering in places — a correctly claimed email queue, exponential backoff with dead-lettering, a best-in-class secret-redaction layer, an airtight admin API guard (61/61 routes), and real feature-flag kill switches. Four audits found that the weaknesses are not in that machinery but at its edges: nothing watches it, two of its levers are wired to the wrong path, and the layers around it were built route-by-route with no shared contract.

Since the blueprint was written, four things moved from "verify" to **confirmed**, and they change priorities:

1. **The four `SECURITY DEFINER` functions do grant `EXECUTE` to `anon` and `authenticated`.** This is now a confirmed exposure, not a hypothesis. Newly established here: **all four are called exclusively through `createServiceRoleClient()`**, which makes the least-privilege migration low-risk.
2. **24 `email_queue` rows are stuck in `processing` beyond 15 minutes.** Stale-job reclaim is a live production defect with a measured cost, not a theoretical one.
3. **Infrastructure is Supabase Free + Vercel Free with a $0/month budget.** This invalidates the blueprint's Supabase Pro backup recommendation and its Vercel Cron migration. Both are replaced with $0 alternatives.
4. **The Supabase redirect allowlist is scoped correctly** (`pmacademy.adityagangwani.me/**`, `prodily.adityagangwani.me/**`, `localhost:3000/**`). The `emailRedirectTo` concern from Stage 2 is **closed** — no work required.

The plan is 8 P0 preparation items followed by 16 initiatives decomposed into small, independently committable batches. Signup remains **CLOSED** until §20's criteria are met.

---

## 2. Current architecture

| Layer | Current state |
|---|---|
| Hosting | Vercel **Free**, `apps/web` root, `vercel.json` = `{ "framework": "nextjs" }`, no `maxDuration` declared |
| Framework | Next.js 16.2.12 App Router, React 19.2.4, Node 22 |
| Routing/proxy | `apps/web/proxy.ts` — 438 lines; decodes JWT **without signature verification**; drives admin routing, maintenance mode, email-verification gate, onboarding gate |
| API | 126 route handlers under `app/api/` (61 admin, 6 cron, 2 webhook, ~57 learner/public) |
| Services | `lib/` — 33 modules, ~47.5k non-test lines |
| Data access | `@supabase/supabase-js` called directly from routes, `lib/*-db.ts`, and `lib/*-service.ts`; 451 `as unknown as` casts; 30 files with hand-rolled `DBChain` interfaces |
| Database | Supabase **Free**, single project, 44 migrations, ~45 tables, ~70 indexes, 6 SQL functions, 1 trigger |
| Async work | `email_queue` + `processEmailQueue()`, triggered over HTTP |
| Scheduler | **GitHub Actions** (`.github/workflows/notification-scheduler.yml`), 6 jobs, `timeout-minutes: 5` |
| Email | **Two transports** — `lib/email.ts` (ungoverned, 7 importers) and `lib/notifications/providers/*` (queue-governed) |
| Tests | 113 Vitest files (~1,112 tests, node environment only), 3 Playwright smoke specs |
| CI | `.github/workflows/ci.yml` — lint, typecheck, test, brand guard, build, E2E, then a Supabase migration job |
| Frontend | 240 components (177 client), 319 `.tsx` total; 126 raw `fetch('/api/…')` calls in 69 files; no data-fetching library |

---

## 3. Confirmed production findings

Everything in this section is verified in the repository at `2b8d281` or confirmed operationally. Nothing here is speculative.

### 3.1 Security — confirmed

| ID | Finding | Evidence |
|---|---|---|
| **F-SEC-1** | `claim_email_queue_items`, `get_admin_dashboard_summary`, `increment_daily_email_quota`, `increment_portfolio_view_count` all grant `EXECUTE` to `anon`, `authenticated`, `service_role`. `claim_email_queue_items` returns `SETOF email_queue`, whose `template_variables` carry live verification/reset token URLs. | Operationally confirmed; only `update_user_xp_and_level` and `sync_user_xp_and_level_on_update` have `REVOKE` statements, in `20260728164000_supabase_security_hardening.sql:9-14` |
| **F-SEC-2** | `users` policy `for select using (is_portfolio_public = true)` has no role or column restriction — the anon key reads `email` and `is_admin` for every public-portfolio learner. | `20260805000003_add_portfolio_columns.sql:20` |
| **F-SEC-3** | `certificates` is `using (true)` — full roster of `learner_name`, `user_id`, `level`, `career_title` readable with the anon key. | `20260805000004_create_certificates.sql:30` |
| **F-SEC-4** | Stored XSS on the public portfolio: unvalidated `bio` → `JSON.stringify` → `<script>`. `JSON.stringify` does not escape `<` or `/`. No escaping helper exists anywhere in the repo. | `app/(portfolio)/p/[username]/page.tsx:117-127,160`; `app/api/settings/profile/route.ts:50-63` |
| **F-SEC-5** | `/api/auth/login` has no rate limiting. Only 8 of 126 routes have any. | `app/api/auth/login/route.ts` |
| **F-SEC-6** | Rate limiter is a 3-statement read-modify-write, fails open to a per-instance map, and keys on the spoofable leftmost `x-forwarded-for`. | `lib/rate-limit.ts:104-160`; `app/api/auth/signup/route.ts:27-33` |
| **F-SEC-7** | Enumeration oracles: signup `409 USER_EXISTS`; login `403 + requiresVerification + echoed email` vs `401`; resend `alreadyVerified: true`. | `signup/route.ts:126`, `login/route.ts:63-77`, `resend-verification/route.ts:50-55` |
| **F-SEC-8** | Login and signup return `session: authData.session` — access **and** refresh tokens — in the JSON body. The browser Supabase client also persists the session in `localStorage`. | `login/route.ts:100`, `signup/route.ts:224`; `lib/supabase.ts` `createBrowserSupabaseClient()` uses defaults |
| **F-SEC-9** | `/api/auth/session` verifies the supplied access token but never the refresh token, and requires no existing session — a session-fixation path. | `app/api/auth/session/route.ts:30-58` |
| **F-SEC-10** | `proxy.ts:parseJwtUser()` decodes the JWT payload and checks only `exp`; the signature is never verified. Contained today because every admin surface re-verifies — an unwritten invariant. | `proxy.ts:63-88` |
| **F-SEC-11** | `waitlist` grants anon `INSERT` with `check (true)`, bypassing the route's validation and limits. | `20260728000001_create_waitlist.sql:30-35` |
| **F-SEC-12** | `/api/auth/send-email-hook` accepts its secret in four places including a **query string**; three of four comparisons are non-constant-time. | `app/api/auth/send-email-hook/route.ts:57-90` |
| **F-SEC-13** | CI injects production `SUPABASE_SERVICE_ROLE_KEY` and `NEXT_PUBLIC_SUPABASE_URL` into the test job; `vitest.setup.ts` uses `X = process.env.X \|\| 'mock'`, so real values win. Already caused a production data leak. | `ci.yml:24-29`; `vitest.setup.ts:4-6`; documented in `lib/rate-limit.ts:88-97` |
| **F-SEC-14** | 294 raw `console.*` calls send unredacted exception text to Vercel logs; redaction covers only the `system_errors` sink. | repo-wide count |
| **F-SEC-15** | No CI security gates: no `npm audit`, no secret scanning, no SAST, no Dependabot. | `ci.yml`; no `.github/dependabot.yml` |

### 3.2 Reliability — confirmed

| ID | Finding | Evidence |
|---|---|---|
| **F-REL-1** | **24 rows currently stuck in `processing` >15 min.** `claim_email_queue_items()` selects only `pending`/`retrying`; nothing reclaims stale rows; `retry/route.ts:38` explicitly refuses to retry `processing`. | Operationally confirmed; `20260810000008`, `app/api/admin/emails/queue/[id]/retry/route.ts:38` |
| **F-REL-2** | Queue sends sequentially — 50 items × 8 s timeout = 400 s worst case against a 300 s job timeout. Truncation is structural. | `processor.ts:205,305`; `brevo-provider.ts:68`; `notification-scheduler.yml` `timeout-minutes: 5` |
| **F-REL-3** | `EMAIL_ENABLED` is checked in the queue processor only. `lib/email.ts` and `/api/auth/send-email-hook` consult no flag — the kill switch misses the path that caused both incidents. | `processor.ts:45,208`; no flag import in `lib/email.ts` |
| **F-REL-4** | Alerting is in-app notifications written to the same database being reported on; no external channel. `/api/health` exists and nothing polls it. | `lib/monitoring/logger.ts:176,213-224`; no monitor config in repo |
| **F-REL-5** | `/api/health` is not in the proxy's exempt list, so it returns 503 during maintenance and performs a settings DB lookup per request. | `proxy.ts` `isExemptApi` |
| **F-REL-6** | `/api/cron/cleanup` is an explicit no-op; unbounded growth in `system_errors`, `email_delivery_events`, `email_queue`, `notification_events`, `user_notification_timeline`, `rate_limits`, and one `system_settings` row per day. | `app/api/cron/cleanup/route.ts` |
| **F-REL-7** | `deploy-supabase` guards its only step with `if: env.SUPABASE_ACCESS_TOKEN != ''`, but the job defines no job-level `env` and step-level `env` is out of scope for that step's own `if`. The step likely never runs. | `ci.yml:104-126` |
| **F-REL-8** | `lib/notifications/automations/service.ts:93` performs a raw Resend `fetch` with **no timeout**. `app/api/email/webhooks/route.ts:92` likewise. | those lines |
| **F-REL-9** | Retry backoff is deterministic (`2^n × base`), no jitter. | `processor.ts:499` |
| **F-REL-10** | 3 Playwright specs are smoke-level only; no E2E covers signup→verify→lesson→XP or login→session→logout. No component tests are possible (`vitest.config.mts:8` restricts to `lib/__tests__`, `environment: 'node'`). | those files |

### 3.3 Correctness — confirmed

| ID | Finding | Evidence |
|---|---|---|
| **F-COR-1** | `lib/leaderboard-db.ts:138` selects `xp_events.amount`; the column is `xp_amount`. The `error` is destructured away. **Weekly XP is 0 for every user.** | `leaderboard-db.ts:138,141,160`; `types/database.ts:1987-2003` |
| **F-COR-2** | `getTotalXp()` fetches all `xp_events` rows and sums in JS; PostgREST truncates at 1000. `users.total_xp` already holds the correct value via trigger and is not read. | `lib/xp/xp-service.ts:113-128` |
| **F-COR-3** | `xp_events` has only a **non-unique** index on `(user_id, source_type, source_id)`; idempotency is a check-then-insert. Duplicate XP is awardable under concurrency. | `20260824000001_phase9_perf_indexes.sql:5-6`; `xp-service.ts:24-50,90` |
| **F-COR-4** | Unbounded `.select()` calls truncate silently at 1000 rows: leaderboard user fetch, `dashboard-service.ts:102,105,219-232`. `fetchAllRows()` exists but is used only by two admin services. | those lines |
| **F-COR-5** | `app/error.tsx` renders its own `<html>`/`<body>` — that is `global-error.tsx` behavior — and no `global-error.tsx` exists, so root-layout errors have no boundary. | `app/error.tsx` |
| **F-COR-6** | Logout wraps `signOut()`, the cookie-clearing fetch, and navigation in one `try` whose `catch` only logs; on failure the user is not navigated and sees nothing. Duplicated in two places. | `components/layout/Topbar.tsx:53-71`; `lib/admin/session.ts` |
| **F-COR-7** | `/api/settings/profile` writes `name`, `bio`, `avatar_url`, and three URLs with only `.trim()` — no validation, no length caps, no scheme allowlist. `avatar_url` here bypasses the upload endpoint's MIME and size checks. | `app/api/settings/profile/route.ts:50-63` |

### 3.4 Already complete — **do not re-implement**

Verified present and correct. Any batch that appears to duplicate these is misscoped.

- `claim_email_queue_items()` uses `FOR UPDATE SKIP LOCKED` — concurrency-safe claiming.
- `increment_daily_email_quota()` is a single atomic `INSERT … ON CONFLICT … WHERE count < limit RETURNING`.
- Exponential retry backoff, `max_attempts` from `PRIORITY_MATRIX`, `dead_letter` terminal state, `provider_attempts` audit trail.
- `lib/monitoring/redaction.ts` — value-shape **and** key-name redaction with an explicit threat model.
- `lib/monitoring/logger.ts` — 15-min fingerprint dedup, `stabilizeForFingerprint()`, 1-hour alert cooldown.
- ADR-006 error contract (`lib/errors/api-response.ts`) — correct design; adoption is 59/126, which is the gap.
- `requireAdminUser()` on **61/61** admin routes: token verified, `is_admin` re-read from DB, denials audit-logged.
- Svix HMAC verification with replay window and `timingSafeEqual` on `/api/email/webhooks`.
- `/api/auth/callback` blocks cross-origin redirect correctly.
- Feature flags `EMAIL_ENABLED`, `QUEUE_PROCESSING_ENABLED`, `IN_APP_NOTIFICATIONS_ENABLED` — DB-backed, 10 s TTL, fail-safe hydration.
- Maintenance mode enforced server-side in `proxy.ts`.
- Self-hosted fonts (`next/font/google`, `display: swap`, preload) — no CLS.
- `useReducedMotion` adopted across 19 components.
- Git history is clean of real secrets (full-history scan: placeholders only).
- Supabase redirect allowlist correctly scoped — **F-SEC issue closed, no work required**.
- D-02 (admin raw `err.message`) and D-07 (quota UTC key) — **fixed** in `2af6a3c`.

---

## 4. Locked decisions

These are final. Do not re-open them during implementation.

| ID | Decision |
|---|---|
| **L-01** | Supabase = **Free**. Vercel = **Free**. Recurring infrastructure budget = **$0/month**. Do not solve problems by upgrading plans. |
| **L-02** | A **second Supabase Free project** is created for STAGING. Production and staging are separated. CI/test execution must never use the production project. |
| **L-03** | Production has **no PITR**. Do not pretend otherwise. Backups are $0 logical exports with a documented, rehearsed restore. Paid PITR is revisited only when business need justifies it. |
| **L-04** | Scheduler stays **GitHub Actions**. Vercel Cron is **not** adopted (Vercel is Free). Harden the existing scheduler instead of replacing it. |
| **L-05** | The four `SECURITY DEFINER` functions are a confirmed issue. **Inspect before revoking** — definitions, callers, required execution context, whether `SECURITY DEFINER` is needed at all — then apply least privilege with regression coverage. |
| **L-06** | Supabase redirect allowlist stays as configured. **Do not add broad Vercel preview wildcards** without a demonstrated requirement. |
| **L-07** | **Cloudflare Turnstile (Free)**, scoped to: signup, resend-verification, password-reset initiation, waitlist. Not on every endpoint. Turnstile is additive — it does **not** replace atomic rate limiting. |
| **L-08** | Rate limiting becomes atomic, globally-ceilinged, **fail-closed for security-sensitive unauthenticated operations**, and must not trust the leftmost `X-Forwarded-For`. |
| **L-09** | Signup stays **CLOSED** until §20 is satisfied. Reopening is staged, capped, and monitored. Verification precedes durable welcome side effects. `refCode` is stored pending and consumed **after** verification. |
| **L-10** | **One governed email egress path.** No ungated path is acceptable, including the auth hook. Failover is bounded: one primary, at most one secondary, no third. Attempts persisted, failures classified, global ceiling and circuit breaker above failover. |
| **L-11** | Retention: completed queue records 30d · dead letters 90d · delivery logs 90d · system errors 90d · operational telemetry 30d · security/abuse events 180d · admin audit logs 180d · aggregate non-PII analytics long-term. **Active legal/incident holds override automatic deletion.** |
| **L-12** | Flagged accounts: **reversible BAN, not deletion.** Preserve investigability and reversibility. |
| **L-13** | Fail closed for security-sensitive operations (signup, unauthenticated email-triggering endpoints, password reset, verification, abuse controls, authentication, security-sensitive mutations). **Do not make the whole application fail closed.** |
| **L-14** | Monitoring: Admin → System Alerts remains the application-level incident surface. Add an **independent free uptime monitor** for `/api/health`. No paid monitoring initially. |
| **L-15** | No Redis, Kafka, Kubernetes, microservices, managed queues, dedicated workers, read replicas, or additional databases at current scale. |
| **L-16** | Proxy/middleware is **not** the authorization boundary. JWTs are cryptographically verified at the auth boundary via JWKS. `is_admin` comes from trusted database state, never from a token claim. |
| **L-17** | Web auth uses httpOnly cookies. Future mobile uses Bearer. Refresh tokens and session objects are **not** exposed to browser JavaScript. |

---

## 5. Deferred decisions

| ID | Deferred | Why | Revisit when |
|---|---|---|---|
| **D-01** | Mobile platform (React Native/Expo vs native Swift/Kotlin) | No repository evidence supports either; the choice changes scope materially | Before any mobile work. Build client-agnostic contracts meanwhile; **build no mobile-specific infrastructure now** — no device attestation, no push architecture, no shared token packages |
| **D-02** | Paid Supabase / PITR | $0 constraint (L-01, L-03) | Business requirement justifies the cost, or logical export proves insufficient |
| **D-03** | Vercel Cron | Vercel is Free (L-04) | Vercel Pro adopted for another reason |
| **D-04** | API versioning policy | Only meaningful once a non-web client exists | D-01 resolved |
| **D-05** | Admin role model (currently binary) | Single-operator team | A second person needs admin, or a support role appears |
| **D-06** | Structured logger library choice | Sequenced after correlation IDs exist | I-10 B5 complete |

---

## 6. P0 — safety and preparation work

**These precede all normal implementation batches.** Several are human/dashboard tasks, not Antigravity batches; each is marked. No destructive production action happens without inspection, validation, and a recovery path.

### P0-1 · Create the staging Supabase project — **HUMAN**
Create a second Supabase **Free** project named for staging. Apply all 44 migrations via `supabase db push` against it. Do not copy production data. Record the project ref, URL, anon key, service-role key, and DB password.
**Done when:** staging has an identical schema and `SELECT count(*) FROM users` returns 0.

### P0-2 · Define production vs staging environment variables — **HUMAN + doc**
Produce a written matrix of every variable in `apps/web/.env.example` × {local, staging, CI, production}. Explicitly mark which secrets CI may hold. Store it in `docs/DEPLOYMENT.md`.
**Rule:** CI holds **staging** credentials only. Production credentials exist in Vercel and in one dedicated backup workflow environment (P0-4) — nowhere else.

### P0-3 · Prevent CI/test execution from reaching production — **BATCH** (see I-01 B1, B2)
Two independent guards, both required: a hard override in `vitest.setup.ts` so a real env value cannot win, and CI pointed at staging.

### P0-4 · $0 logical backup strategy — **BATCH + HUMAN**
A scheduled GitHub Actions workflow runs `pg_dump` against production, encrypts the dump with `gpg --symmetric` using a repository secret, and uploads it as a workflow artifact (90-day retention, free).

**Honest trade-off, must be stated in the doc:** this workflow needs production database credentials, which is precisely what P0-3 removes from the test job. Mitigation is mandatory — a **separate workflow file** with its own GitHub Environment, restricted secrets, `permissions: {}`, no PR trigger, and no checkout of untrusted code. The dump contains PII and must never be uploaded unencrypted.
**Cadence:** daily. **Retention:** 90 days (GitHub free artifact limit).

### P0-5 · Document backup storage and restore — **DOC**
Write `docs/BACKUP_AND_RESTORE.md`: where dumps live, how to decrypt, how to restore into staging, expected duration, and what is lost (everything since the last daily dump — **RPO = 24 h**, stated plainly). Rehearse one restore into staging and record the actual elapsed time.
**Done when:** a restore has been performed at least once and the runbook reflects what actually happened.

### P0-6 · SECURITY DEFINER least-privilege remediation — **BATCH** (see I-02 B1)
Inspection is already partially complete and recorded here so the implementer does not repeat it:

| Function | Sole caller | Client used | `SECURITY DEFINER` required? | Target grant |
|---|---|---|---|---|
| `claim_email_queue_items` | `lib/notifications/queue/processor.ts:218` | `createServiceRoleClient()` | Yes — needs `FOR UPDATE SKIP LOCKED` and bypasses RLS on `email_queue` | `service_role` only |
| `get_admin_dashboard_summary` | `lib/admin/dashboard-service.ts:58` | `createServiceRoleClient()` | Yes — cross-table aggregation | `service_role` only |
| `increment_daily_email_quota` | `lib/notifications/queue/processor.ts:355` | `createServiceRoleClient()` | Yes — atomic upsert on `system_settings` | `service_role` only |
| `increment_portfolio_view_count` | `lib/portfolio-db.ts:323`, reached from `getPublicPortfolioData` | `createServiceRoleClient()` (page at `app/(portfolio)/p/[username]/page.tsx:23,85`) | Yes — writes a column the caller cannot otherwise update | `service_role` only. **Also missing `SET search_path`** — add it |

**Conclusion: no caller uses the anon or authenticated role.** Revoking from `PUBLIC, anon, authenticated` is safe. The implementer must still re-confirm this with a repo-wide grep before writing the migration, and must apply to staging first.

### P0-7 · Handle the 24 stuck `processing` records — **BATCH + HUMAN**, strictly sequenced
Never mutate the 24 rows before they are captured.

1. **Inspect (read-only).** Export id, `template_key`, `to_email` (masked), `attempt_count`, `max_attempts`, `processing_at`, `provider`, `provider_attempts`, `created_at`. Save the export as an incident artifact.
2. **Classify.** Which are auth-critical (`auth.verify_email`, `auth.password_reset`)? Those users never received account-critical mail and may need direct outreach.
3. **Decide per class.** Critical + still relevant → requeue. Stale (older than the token's validity) → move to `dead_letter` with a reason, not requeued — requeuing an expired verification link helps nobody.
4. **Act only after I-05 B1 exists**, so reclaim is systematic rather than a one-off UPDATE.
5. **Verify.** `processing` count older than 15 minutes returns to 0 and stays there across three cron cycles.

**Rollback:** the step-1 export is the rollback. Do not proceed without it.

### P0-8 · Independent uptime monitoring — **HUMAN**, after I-10 B1
Attach a free monitor (UptimeRobot or Better Stack, 5-minute interval) to `https://<prod>/api/health`. Alert on two consecutive failures.
**Sequencing matters:** I-10 B1 must land first, or planned maintenance will page as an outage (F-REL-5) and the alert will be muted and then ignored.

**P0 order:** P0-1 → P0-2 → P0-3 → P0-6 → I-05 B1 → P0-7 → P0-4 → P0-5 → (I-10 B1) → P0-8.

---

## 7. Target architecture

```
request
  │
  ├─ proxy.ts ................ routing hints only. Never the authorization decision. (L-16)
  │
  └─ withRoute({ auth, schema, rateLimit, handler })
        ├─ resolveActor() ..... JWKS-verified. Bearer-first, cookie fallback. is_admin from DB.
        ├─ zod validation ..... 422 with a machine-readable code
        ├─ abuse gate ......... atomic RPC, multi-dimensional keys, fail-closed per L-08/L-13
        └─ ADR-006 envelope ... { success, error, code, errorId } on 100% of routes
              │
              └─ domain service (lib/<domain>/) ....... business rules, server-only
                    │
                    └─ lib/db/<aggregate>.ts .......... typed repository, no `as unknown as`
                          │
                          └─ Supabase service-role / Postgres RPC for atomic operations
```

**Enforced invariants when complete**
- No route handler is defined outside `withRoute()` — ESLint rule.
- No `as unknown as` inside `lib/db/` — ESLint rule.
- Every unauthenticated endpoint declares a rate limit; omission is a lint error.
- Every retryable mutation is idempotent by a database constraint, not an application check.
- Every external call has a timeout, a classified failure, and a structured incident.

---

## 8. The 16 initiatives

| ID | Name | Priority | Depends on |
|---|---|---|---|
| I-01 | Environment & CI Isolation | **P0** | — |
| I-02 | Database Trust Boundary | **P0** | I-01, P0-1 |
| I-03 | Unified Abuse Control | **P0** | I-01 |
| I-04 | Governed Email Egress | **P0** | I-01, I-05 B1 |
| I-05 | Queue & Scheduler Reliability | **P0** (B1) / P1 | I-01 |
| I-06 | Auth, Session & API Contract | P1 | I-06 B1 → I-07 B1 → I-06 B2+ |
| I-07 | Route Contract Layer | P1 | I-06 B1, I-03 |
| I-08 | Typed Data Layer | **P0** (B1–B3) / P1 | I-15 B1 for B4+ |
| I-09 | Database Invariants & Retention | **P0** (B1–B4) / P1 | I-01 |
| I-10 | Observability & Alerting | **P0** (B1–B3) / P1 | — |
| I-11 | Frontend Data Layer | P2 | I-06 B6 |
| I-12 | Frontend Safety & Correctness | **P0** | — |
| I-13 | Design System Adoption | P2 / ongoing | — |
| I-14 | Frontend Performance | P2 | measurement first |
| I-15 | Testing Foundation | P1 | I-01, P0-1 |
| I-16 | Deployment & Operations Safety | P1 | verification of F-REL-7 |

---

## 9. Dependency graph

The I-06/I-07 cycle from the blueprint is resolved by splitting I-06 B1 out ahead of I-07 B1.

```
                      P0-1  staging project (HUMAN)
                                 │
                      I-01  environment & CI isolation
                                 │
     ┌──────────────┬────────────┼────────────┬──────────────┬─────────────┐
     ▼              ▼            ▼            ▼              ▼             ▼
   I-02          I-09 B1-4    I-15 B1-2    I-05 B1        I-16        I-10 B1-B3
 DB trust       XP invariants  shared fake  queue reclaim  deploy gate   alerting
     │                                          │                            │
     │                                          ▼                            ▼
     │                                    P0-7 stuck rows              P0-8 uptime
     │                                          │
     └────────────────┬─────────────────────────┘
                      ▼
              I-03  unified abuse control  (+ Turnstile, L-07)
                      │
                      ▼
              I-04  governed email egress  (L-10)
                      │
                      ▼
          ═══ SIGNUP MAY REOPEN, CAPPED (§20) ═══


  I-06 B1 (resolveActor)  ──►  I-07 B1 (withRoute)  ──►  I-06 B2-B6  ──►  I-07 B2-B10
                                                              │
                                                              ▼
                                                    I-08 B4+  typed repositories
                                                              │
                                                              ▼
                                                    I-11  frontend data layer
                                                              │
                                                              ▼
                                              ═══ CLIENT-AGNOSTIC API (D-01 open) ═══


  No blockers, may run any time:  I-12  ·  I-08 B1-B3  ·  I-13  ·  I-14 (after measurement)
```

**Cycle check:** `I-06 B1 → I-07 B1 → I-06 B2+ → I-07 B2+` is a strict order with no back-edge. No other cycles exist.

---

## 10. Implementation batches

Every batch specifies initiative, ID, objective, rationale, dependencies, files expected to change, **files that must not change**, migration requirement, tests, validation commands, manual verification, rollback, and commit boundary.

**Validation commands.** The root `package.json` delegates only `test`, `tests`, `typecheck`, `lint`, `build`, `dev`, `start`, and `content:build` to `apps/web`. **Every targeted `test:*` script exists only in `apps/web/package.json`** — run those from `apps/web/`, or from the root as `npm --prefix apps/web run test:rls`. `npm run test`, `npm run typecheck`, `npm run lint`, and `npm run build` work from either location.

---

### I-01 · Environment & CI Isolation

#### **I-01-B1 — Force mock Supabase credentials in test mode**
- **Objective:** A real Supabase value present in the environment can never be used by the test suite.
- **Why:** F-SEC-13. `X = process.env.X || 'mock'` disables the guard exactly in CI, where the real key exists. Already caused a production data leak.
- **Depends on:** none.
- **Changes:** `apps/web/vitest.setup.ts`
- **Must NOT change:** `apps/web/lib/supabase.ts`, `apps/web/lib/rate-limit.ts`, `.github/workflows/ci.yml`, any route.
- **Migration:** no.
- **Tests:** add a test asserting `process.env.NEXT_PUBLIC_SUPABASE_URL === 'https://mock.supabase.co'` even when a different value was set before the setup file ran.
- **Validation:** `npm run test` · `npm run typecheck` · `npm run lint`
- **Manual:** run `NEXT_PUBLIC_SUPABASE_URL=https://real.supabase.co npm run test` and confirm the mock still wins.
- **Rollback:** revert one file.
- **Commit:** `test: force mock Supabase credentials so real env values cannot leak into tests`

#### **I-01-B2 — Point CI at the staging Supabase project**
- **Objective:** CI holds no production credentials.
- **Why:** F-SEC-13, L-02.
- **Depends on:** P0-1, P0-2, I-01-B1.
- **Changes:** `.github/workflows/ci.yml` (the `build-and-validate` env block only).
- **Must NOT change:** the `deploy-supabase` job (I-16 owns it), any application file.
- **Migration:** no.
- **Tests:** none.
- **Validation:** CI green on a draft PR.
- **Manual:** after one CI run, confirm the **production** project shows no new rows in `rate_limits` or `users`.
- **Rollback:** revert the workflow.
- **Commit:** `ci: run tests against the staging Supabase project`

#### **I-01-B3 — Add CI security gates**
- **Objective:** `npm audit --audit-level=high`, gitleaks, and `--ignore-scripts` on install.
- **Why:** F-SEC-15. Git history is clean today; nothing enforces that.
- **Depends on:** I-01-B2.
- **Changes:** `.github/workflows/ci.yml`
- **Must NOT change:** `package.json`, lockfiles, any application file.
- **Migration:** no. **Tests:** none.
- **Validation:** CI green. If `npm audit` fails on the known `sharp`/`fast-uri`/`qs` findings, add a documented, dated allowlist rather than upgrading Next — see DEBT-07.
- **Rollback:** revert the workflow.
- **Commit:** `ci: add dependency audit, secret scanning, and script-free installs`

#### **I-01-B4 — Add Dependabot**
- **Changes:** `.github/dependabot.yml` (new). **Must NOT change:** anything else. **Migration:** no. **Tests:** none.
- **Validation:** file is valid YAML; GitHub accepts it.
- **Commit:** `ci: enable Dependabot for npm and GitHub Actions`

#### **I-01-B5 — Encrypted production backup workflow** *(implements P0-4)*
- **Objective:** Daily encrypted `pg_dump` of production, retained 90 days as a workflow artifact.
- **Why:** L-03 — no PITR on Free.
- **Depends on:** P0-2. **A human must create the GitHub Environment and secrets first.**
- **Changes:** `.github/workflows/backup-production.yml` (new).
- **Must NOT change:** `ci.yml`, `notification-scheduler.yml`, any application file.
- **Constraints, non-negotiable:** separate workflow file · own GitHub Environment with restricted secrets · `permissions: {}` · `schedule` and `workflow_dispatch` triggers only, **never** `pull_request` · dump encrypted with `gpg --symmetric` before upload · no checkout of untrusted refs.
- **Migration:** no. **Tests:** none.
- **Validation:** one manual `workflow_dispatch` run producing an artifact; decrypt it locally and confirm it is a valid dump.
- **Rollback:** delete the workflow. No production state is mutated.
- **Commit:** `ci: add encrypted daily logical backup of the production database`

---

### I-02 · Database Trust Boundary

> **Every batch in this initiative applies to staging first.** No production migration without a staging apply and a verified application smoke test.

#### **I-02-B1 — Least-privilege on the four SECURITY DEFINER functions** *(implements P0-6)*
- **Objective:** `REVOKE EXECUTE … FROM PUBLIC, anon, authenticated` on all four; `GRANT … TO service_role`; add `SET search_path` to `increment_portfolio_view_count`.
- **Why:** F-SEC-1. `claim_email_queue_items` exposes live verification and reset token URLs to anyone holding the public anon key.
- **Depends on:** P0-1, I-01-B2.
- **Pre-work, required:** re-run the caller grep and confirm the P0-6 table still holds. If any caller uses a non-service-role client, **stop and report** — do not adapt the migration silently.
- **Changes:** one new migration `supabase/migrations/<ts>_security_definer_least_privilege.sql`.
- **Must NOT change:** function bodies, any application file.
- **Migration:** **yes.**
- **Tests:** extend `apps/web/lib/__tests__/rls.test.ts` — an anon-key client calling each of the four RPCs must be refused.
- **Validation:** `npm run test:rls` · staging apply · staging smoke: process the email queue, load the admin dashboard, view a public portfolio, confirm the view counter increments.
- **Manual:** re-run the `pg_proc` ACL query on staging and confirm no `=X/` for PUBLIC.
- **Rollback:** a compensating `GRANT` migration. Have it written before applying to production.
- **Commit:** `fix(db): restrict SECURITY DEFINER function execution to service_role`

#### **I-02-B2 — Scope the public `users` read policy**
- **Objective:** `anon` can no longer read `users.email` or `users.is_admin`.
- **Why:** F-SEC-2. RLS is row-level; the current policy exposes every column.
- **Depends on:** I-02-B1.
- **Changes:** one migration creating a column-scoped public-profile view or `SECURITY DEFINER` reader and replacing the policy; plus the portfolio read path in `lib/portfolio-db.ts` **only if** the read must move.
- **Must NOT change:** `app/api/settings/profile/route.ts` (I-12-B2 owns it), admin services.
- **Migration:** **yes.** **Tests:** `rls.test.ts` — anon cannot select `email`/`is_admin`; the public portfolio still renders all displayed fields.
- **Validation:** `npm run test:rls` · staging apply · `npm run test:e2e` · manual load of a public portfolio on staging.
- **Rollback:** restore the prior policy — write the down-migration first.
- **Commit:** `fix(db): restrict anon access to public profile columns only`

#### **I-02-B3 — Scope the `certificates` read policy**
- **Why:** F-SEC-3 — the whole certificate-holder roster is anon-readable.
- **Objective:** verification by `certificate_code` only.
- **Changes:** one migration; `/verify/[certificateId]` read path if required.
- **Migration:** **yes.** **Tests:** anon cannot list all certificates; single-code lookup still works.
- **Validation:** `npm run test:rls` · staging · E2E on certificate verification.
- **Commit:** `fix(db): scope certificate reads to single-code verification`

#### **I-02-B4 — Remove anon write and over-broad read policies**
- **Objective:** drop `waitlist` anon INSERT (F-SEC-11); replace `using(true)` on `weekly_leaderboard_snapshots` and `cohort_members`.
- **Changes:** one migration.
- **Migration:** **yes.** **Tests:** anon `INSERT` into `waitlist` is refused; `POST /api/waitlist` still works.
- **Validation:** `npm run test` · staging · manual waitlist submission on staging.
- **Commit:** `fix(db): remove anon write and over-broad read policies`

#### **I-02-B5 — Anon-key regression suite**
- **Objective:** a permanent test asserting what the anon key **cannot** do.
- **Changes:** `apps/web/lib/__tests__/rls.test.ts`. **Must NOT change:** migrations, application code.
- **Migration:** no. **Validation:** `npm run test:rls`
- **Commit:** `test(security): assert anon key cannot read PII or call privileged RPCs`

---

### I-03 · Unified Abuse Control

#### **I-03-B1 — Atomic rate-limit RPC**
- **Objective:** a single-statement `INSERT … ON CONFLICT DO UPDATE … RETURNING` limiter, modelled on the existing `increment_daily_email_quota()`.
- **Why:** F-SEC-6 — three separate statements cannot hold under concurrency, which is the only condition that matters.
- **Depends on:** I-01-B2.
- **Changes:** one migration. **Must NOT change:** `lib/rate-limit.ts` (B2 owns it).
- **Migration:** **yes.** **Tests:** a concurrency test issuing N parallel calls and asserting at most `limit` succeed.
- **Validation:** `npm run test` · staging apply · run the concurrency test against staging.
- **Commit:** `feat(db): add atomic rate limit RPC`

#### **I-03-B2 — Rewrite the limiter against the RPC, with an explicit fail mode**
- **Objective:** `evaluatePersistentRateLimit()` calls the RPC and takes `failMode: 'open' | 'closed'`.
- **Why:** F-SEC-6, L-08, L-13. Fail-open was the default everywhere when this plan was written.
- **Status 2026-09-10: ✅ delivered by `10a21a5`,** as `failClosed?: boolean` rather than the `failMode: 'open' | 'closed'` shape specified here. Fail-open remains the default for callers that do not opt in; every path that can spend provider credit now opts in. Adopt the shipped shape rather than churning the API.
- **Depends on:** I-03-B1.
- **Changes:** `apps/web/lib/rate-limit.ts`. **Must NOT change:** any route (B4 applies it).
- **Migration:** no. **Tests:** fail-closed returns a denial when the DB errors; fail-open returns the in-memory result.
- **Validation:** `npm run test` · `npm run typecheck`
- **Commit:** `refactor(security): make persistent rate limiting atomic with an explicit fail mode`

#### **I-03-B3 — Trusted client IP helper**
- **Objective:** one helper returning the platform-trusted client IP, never the leftmost `X-Forwarded-For`.
- **Why:** F-SEC-6 — the per-IP limit is bypassable by rotating a header value.
- **Changes:** `apps/web/lib/security/client-ip.ts` (new); call sites in `app/api/auth/signup/route.ts` and `app/api/auth/telemetry/route.ts`.
- **Migration:** no. **Tests:** a spoofed leftmost XFF entry is not returned.
- **Validation:** `npm run test` · `npm run typecheck`
- **Commit:** `fix(security): derive client IP from the platform-trusted header`

#### **I-03-B4 — Apply fail-closed limits to the unprotected endpoints**
- **Objective:** rate limit `login`, `update-password`, `waitlist`; add a per-IP limit to `resend-verification`; set `failMode: 'closed'` on all auth routes.
- **Why:** F-SEC-5 — login is entirely unthrottled, against an account list the anon key could until now enumerate.
- **Depends on:** I-03-B2, I-03-B3.
- **Changes:** `app/api/auth/login/route.ts`, `app/api/auth/update-password/route.ts`, `app/api/auth/resend-verification/route.ts`, `app/api/waitlist/route.ts`.
- **Must NOT change:** `lib/rate-limit.ts`, `app/api/auth/signup/route.ts` (already limited).
- **Migration:** no. **Tests:** each route returns 429 past its limit and denies when the limiter errors.
- **Validation:** `npm run test` · `npm run test:auth`
- **Commit:** `feat(security): rate limit login, password update, waitlist and resend-verification`

#### **I-03-B5 — Global signup ceiling**
- **Objective:** a platform-wide signup counter above the per-key limits, with an admin-visible value.
- **Why:** per-IP limits alone did not hold in either September incident.
- **Depends on:** I-03-B1.
- **Changes:** one migration + `app/api/auth/signup/route.ts`.
- **Migration:** **yes.** **Tests:** the ceiling denies once exceeded regardless of IP or email.
- **Validation:** `npm run test` · staging · scripted burst from rotating IPs against staging.
- **Commit:** `feat(security): add a global signup ceiling above per-key limits`

#### **I-03-B6 — Close the enumeration oracles**
- **Objective:** identical responses for existing and non-existing accounts on signup, login, and resend.
- **Why:** F-SEC-7.
- **Changes:** `app/api/auth/{signup,login,resend-verification}/route.ts`; the auth screens' copy in `app/(auth)/*` if messaging must change.
- **Must NOT change:** `lib/auth/errors.ts` classification codes.
- **Migration:** no. **Tests:** response body, status, and timing class are equal for both cases.
- **Validation:** `npm run test:auth` · `npm run test:e2e`
- **Manual:** confirm the login screen still guides a genuinely unverified user usefully.
- **Rollback:** single revert. **Note:** this changes user-visible copy — review with the product owner before merge.
- **Commit:** `fix(security): return non-enumerating responses from auth endpoints`

#### **I-03-B7 — Cloudflare Turnstile on the four locked surfaces**
- **Objective:** Turnstile (Free) on signup, resend-verification, password-reset initiation, waitlist — **and nowhere else** (L-07).
- **Depends on:** I-03-B4. A human must register the Turnstile site and add the keys first.
- **Changes:** `lib/security/turnstile.ts` (new); those four routes; those four client forms.
- **Must NOT change:** any other route or form.
- **Migration:** no. **Tests:** a missing or invalid token is refused; a valid token passes.
- **Validation:** `npm run test` · `npm run build` · `npm run test:e2e` · manual submission of all four forms on staging.
- **Rollback:** an env flag that disables verification, so a Turnstile outage cannot take signup down.
- **Commit:** `feat(security): require Turnstile on signup, resend, password reset and waitlist`

---

### I-04 · Governed Email Egress

> Highest-risk initiative in the plan — this path carries verification and password reset. **Every batch is verified on staging with a real send before production.**

#### **I-04-B1 — Add `from_email` / `reply_to` to `email_queue`**
- **Why:** removes D-08's stated blocker (campaign scripts needing per-call sender identity) so the transports can merge.
- **Changes:** one migration. **Must NOT change:** any application file.
- **Migration:** **yes**, additive and backward-compatible.
- **Validation:** staging apply; existing queue processing unaffected.
- **Commit:** `feat(db): allow per-item sender identity on email_queue`

#### **I-04-B2 — Make `sendEmail()` respect `EMAIL_ENABLED`**
- **Objective:** the kill switch covers the direct transport, with an explicit `critical` bypass.
- **Why:** F-REL-3. **This is the single most valuable early batch in the initiative** — it gives the operator a working lever before the larger restructure.
- **Changes:** `apps/web/lib/email.ts`. **Must NOT change:** `lib/notifications/**`, the auth hook route.
- **Migration:** no. **Tests:** flag off suppresses non-critical sends; `critical` still sends.
- **Validation:** `npm run test:email` · staging: toggle the flag and confirm behavior both ways.
- **Commit:** `fix(email): honour the EMAIL_ENABLED kill switch in the direct transport`

#### **I-04-B3 — Global send ceiling and circuit breaker above failover**
- **Objective:** a cross-provider send counter that trips to a hard stop rather than shifting volume to the secondary.
- **Why:** L-10 — quota exhaustion on Brevo currently pushes the same volume onto Resend.
- **Changes:** one migration + `lib/notifications/providers/index.ts`.
- **Migration:** **yes.** **Tests:** once tripped, both providers are refused; the breaker resets after its window.
- **Validation:** `npm run test:email` · staging.
- **Commit:** `feat(email): add a global send ceiling and circuit breaker above provider failover`

#### **I-04-B4 — Route `sendEmail()` through `sendEmailWithFailover()`**
- **Objective:** one provider implementation. `sendEmail()`'s signature is unchanged.
- **Changes:** `apps/web/lib/email.ts` internals only.
- **Must NOT change:** the seven call sites, `lib/notifications/providers/*`.
- **Migration:** no. **Tests:** the full email suite passes unchanged.
- **Validation:** `npm run test:email` · **staging: send one of every template and verify `provider` and `provider_attempts` on the row.**
- **Rollback:** single revert; the signature never changed.
- **Commit:** `refactor(email): route the direct transport through the shared provider registry`

#### **I-04-B5 — Route the auth hook through the queue**
- **Objective:** `/api/auth/send-email-hook` enqueues with `critical` priority instead of sending directly.
- **Why:** F-REL-3, L-10 — this is the path both incidents used.
- **Depends on:** I-04-B2, I-04-B4, **I-05-B1 and I-05-B2** (the queue must be reliable and fast enough before verification email depends on it).
- **Changes:** `app/api/auth/send-email-hook/route.ts`.
- **Must NOT change:** the hook's secret verification logic.
- **Migration:** no. **Tests:** the hook enqueues rather than sends; critical items bypass the optional-mail quota but not the ceiling.
- **Validation:** `npm run test:send-email-hook` · **E2E on staging: complete a real signup and receive the verification email within the SLO.**
- **Manual:** measure end-to-end delivery latency; it must stay under 5 minutes.
- **Rollback:** revert. **This batch must not ship on a Friday.**
- **Commit:** `refactor(email): route auth hook email through the governed queue`

#### **I-04-B6 — Verification before durable side effects**
- **Objective:** no `public.users` row, no welcome email, and no referral attribution until the address is verified. `refCode` is validated and stored pending, consumed at verification.
- **Why:** L-09. An attacker-controlled `refCode` currently triggers a welcome email to an unverified address.
- **Depends on:** I-04-B5.
- **Changes:** `lib/auth.ts` (`ensureUserProfile`, `dispatchWelcomeEmailIfNeeded`), `app/api/auth/signup/route.ts`, `app/api/auth/callback/route.ts`, one migration for pending-referral storage.
- **Migration:** **yes.**
- **Tests:** signup with a `refCode` creates no `public.users` row and queues no welcome email; verification creates both exactly once; an invalid `refCode` is rejected at signup.
- **Validation:** `npm run test:auth` · `npm run test:email` · **E2E on staging: signup → verify → exactly one welcome email, correct ordering.**
- **Rollback:** revert code; the migration is additive and can remain.
- **Commit:** `fix(auth): defer profile creation and welcome email until email is verified`

#### **I-04-B7 — Migrate the remaining direct callers**
- **Objective:** `/api/contact`, `/api/waitlist`, `lib/campaigns/*`, admin test-send, and the webhook bounce alert all enqueue. Add a timeout to the raw Resend fetch at `lib/notifications/automations/service.ts:93` (F-REL-8) and at `app/api/email/webhooks/route.ts:92`.
- **Changes:** those files.
- **Migration:** no. **Tests:** each path enqueues; no provider `fetch` exists outside `lib/notifications/providers/`.
- **Validation:** `npm run test:email` · `npm run test:contact` · staging send per path · repo grep proving no stray provider fetch.
- **Commit:** `refactor(email): route all remaining senders through the queue`

---

### I-05 · Queue & Scheduler Reliability

#### **I-05-B1 — Stale `processing` reclaim** ← **P0, unblocks P0-7**
- **Objective:** `claim_email_queue_items()` also selects rows in `processing` whose `processing_at` is older than 15 minutes; admin retry accepts stale `processing` rows.
- **Why:** F-REL-1 — **24 rows are stuck right now** and are unrecoverable through the UI.
- **Depends on:** I-01-B2.
- **Changes:** one migration replacing the function; `app/api/admin/emails/queue/[id]/retry/route.ts` (line 38 guard).
- **Must NOT change:** `processor.ts` (B2 owns concurrency), retry/backoff logic.
- **Migration:** **yes.** Preserve `FOR UPDATE SKIP LOCKED` and the `attempt_count` increment exactly.
- **Tests:** a row artificially aged in `processing` is reclaimed; a fresh one is not; `attempt_count` still increments.
- **Validation:** `npm run test` · **staging: strand a row, run the processor, confirm reclaim** · admin retry of a stale row succeeds.
- **Manual:** on production, after applying — the count of `processing` older than 15 min must return to 0 across three cron cycles.
- **Rollback:** restore the previous function definition — write that migration first.
- **Commit:** `fix(queue): reclaim stale processing rows and allow admin retry`

#### **I-05-B2 — Bounded concurrency in the send loop**
- **Objective:** process claimed rows with ~10 concurrent sends so a batch fits the 300 s GitHub Actions budget.
- **Why:** F-REL-2 — 50 × 8 s = 400 s against a 300 s timeout. L-04 keeps the 5-minute ceiling, so the fix must be in the processor.
- **Depends on:** I-05-B1.
- **Changes:** `apps/web/lib/notifications/queue/processor.ts` (the send loop only).
- **Must NOT change:** the claim RPC, backoff, dead-letter logic, provider code.
- **Migration:** no.
- **Tests:** ordering guarantees preserved; per-item failures do not abort the batch; concurrency is bounded.
- **Validation:** `npm run test:email` · **staging: enqueue 50 items and confirm the run completes in under 300 s.**
- **Rollback:** single revert.
- **Commit:** `perf(queue): send claimed items with bounded concurrency`

#### **I-05-B3 — Retry jitter**
- **Objective:** multiply the backoff by a random factor in `[0.5, 1.5]`.
- **Why:** F-REL-9 — a provider outage currently schedules every retry at the same instant.
- **Changes:** `processor.ts:499` only. **Migration:** no. **Tests:** the delay falls in the expected range.
- **Validation:** `npm run test:email`
- **Commit:** `fix(queue): add jitter to retry backoff`

#### **I-05-B4 — Harden the GitHub Actions scheduler**
- **Objective:** per L-04 — keep GitHub Actions; add `if: failure()` notification to every job, assert the execution budget, document the best-effort scheduling caveat in `docs/CRON_AND_SCHEDULING.md`.
- **Why:** F-REL-2, and failures currently surface only in GitHub's default email.
- **Changes:** `.github/workflows/notification-scheduler.yml`, `docs/CRON_AND_SCHEDULING.md`.
- **Must NOT change:** cron expressions, `ci.yml`, application code.
- **Migration:** no. **Tests:** none.
- **Validation:** trigger `workflow_dispatch` with a deliberately failing job and confirm the notification arrives.
- **Commit:** `ci: notify on scheduler job failure and document scheduling limits`

#### **I-05-B5 — Resolve `retry-failed`**
- **Objective:** implement real dead-letter recovery, **or** delete the route and its workflow job. Decide from the data; do not leave a duplicate of the 5-minute job.
- **Why:** D-06 — it currently duplicates `process-email-queue`.
- **Depends on:** I-05-B1 (reclaim may make it redundant).
- **Changes:** `app/api/cron/retry-failed/route.ts`, `notification-scheduler.yml`.
- **Migration:** no. **Validation:** `npm run test` · staging.
- **Commit:** `fix(cron): implement dead-letter recovery in retry-failed` *(or `chore(cron): remove the redundant retry-failed job`)*

---

### I-06 · Auth, Session & API Contract

> **Ordering note:** B1 lands **before** I-07-B1 to break the blueprint's cycle. B2 onward land after `withRoute()` exists.

#### **I-06-B1 — `resolveActor()` foundation**
- **Objective:** one resolver — JWKS signature verification, Bearer-first then cookie, `is_admin` re-read from the database. Existing helpers delegate to it; **no call site changes behavior yet.**
- **Why:** F-SEC-10, L-16. Four auth patterns exist today.
- **Depends on:** none. **This is the entry point for the contract path.**
- **Changes:** `apps/web/lib/auth/resolve-actor.ts` (new); `lib/auth.ts` delegates.
- **Must NOT change:** `proxy.ts` (B2), any route (B5), `lib/admin/guard.ts`.
- **Migration:** no. **Tests:** a forged-signature token is rejected; a valid token resolves; `is_admin` never comes from a claim.
- **Validation:** `npm run test:auth` · `npm run test:middleware-auth` · `npm run typecheck`
- **Rollback:** single revert; nothing depends on it yet.
- **Commit:** `feat(auth): add a JWKS-verifying actor resolver`

#### **I-06-B2 — `proxy.ts` uses the resolver**
- **Objective:** middleware stops deriving identity from an unverified payload; it consumes verified claims or none.
- **Why:** F-SEC-10, L-16.
- **Depends on:** I-06-B1, I-07-B1.
- **Changes:** `apps/web/proxy.ts`. **Must NOT change:** `resolve-actor.ts`, routes.
- **Migration:** no. **Tests:** `middleware-auth.test.ts` — a forged admin claim does not reach admin routing.
- **Validation:** `npm run test:middleware-auth` · **`npm run test:e2e`** · manual admin and learner navigation on staging.
- **Rollback:** single revert. **Blast radius: every request** — verify on staging first.
- **Commit:** `fix(auth): verify JWT signatures in the routing layer`

#### **I-06-B3 — `POST /api/auth/refresh`**
- **Objective:** a server-side refresh endpoint that rotates and persists cookies; fixes the divergence where the API path refreshes without persisting.
- **Changes:** `app/api/auth/refresh/route.ts` (new); `lib/auth.ts` refresh path.
- **Migration:** no. **Tests:** rotation persists; a reused refresh token is rejected.
- **Validation:** `npm run test:auth` · E2E session expiry on staging.
- **Commit:** `feat(auth): add a server-side session refresh endpoint`

#### **I-06-B4 — Retire the client session bridge**
- **Objective:** stop returning `session` in login/signup bodies; disable `localStorage` persistence on the browser client; remove `AuthStateListener` and `/api/auth/session`.
- **Why:** F-SEC-8, F-SEC-9, L-17.
- **Depends on:** I-06-B3.
- **Changes:** `app/api/auth/login/route.ts`, `app/api/auth/signup/route.ts`, `lib/supabase.ts`, `components/layout/AuthStateListener.tsx` (delete), `app/api/auth/session/route.ts` (delete), `app/layout.tsx`, `app/admin/login/page.tsx`.
- **Migration:** no.
- **Tests:** no token appears in any response body; a session survives navigation and reload.
- **Validation:** `npm run test:auth` · **`npm run test:e2e` full lifecycle: login → navigate → reload → logout** · staging.
- **Manual:** confirm no Supabase session key remains in `localStorage`.
- **Rollback:** revert. ⚠️ **This logs every user out once.** Ship at a low-traffic hour and include it in the release note.
- **Commit:** `refactor(auth): make httpOnly cookies the only session store`

#### **I-06-B5 — Migrate the 16 cookie-only routes**
- **Objective:** every route resolves the actor through `resolveActor()`; Bearer works everywhere.
- **Why:** blocks any non-browser client; the set includes the entire lesson loop.
- **Depends on:** I-06-B4, I-07-B1.
- **Changes:** the 16 routes listed in the Stage 3 audit (`app/api/v2/lessons/*`, `flashcards/[id]/review`, `reflections`, `announcements/*`, `settings/security/*`).
- **Migration:** no. **Tests:** each route authenticates via Bearer and via cookie.
- **Validation:** `npm run test` · **E2E lesson loop** · manual: complete a lesson with `curl` using only a Bearer token.
- **Commit:** `refactor(auth): resolve actors uniformly across cookie-only routes`

#### **I-06-B6 — `code` on every route response**
- **Objective:** 100% ADR-006 coverage; `error` becomes display copy only.
- **Depends on:** I-07 route migration.
- **Changes:** `lib/errors/api-response.ts` and remaining routes.
- **Migration:** no. **Tests:** every route emits a stable `code`.
- **Validation:** `npm run test` · `npm run typecheck`
- **Commit:** `feat(api): emit a machine-readable code on every route response`

---

### I-07 · Route Contract Layer

#### **I-07-B1 — `withRoute()` foundation** *(no route migrated)*
- **Objective:** the wrapper plus unit tests. Auth via `resolveActor()`, zod validation, rate-limit declaration, ADR-006 envelope.
- **Depends on:** I-06-B1, I-03-B2.
- **Changes:** `apps/web/lib/api/with-route.ts` (new) + its test.
- **Must NOT change:** any existing route.
- **Migration:** no. **Validation:** `npm run test` · `npm run typecheck`
- **Rollback:** delete the file; nothing uses it.
- **Commit:** `feat(api): add the withRoute contract wrapper`

#### **I-07-B2 … B9 — Route migration in bounded waves**
One commit per wave. Each wave: convert the routes, keep behavior identical, add no features.

| Batch | Wave | Count | Validation |
|---|---|---|---|
| B2 | `app/api/cron/*` | 6 | `npm run test` |
| B3 | `app/api/auth/*` | 8 | `npm run test:auth` · E2E auth |
| B4 | `app/api/settings/*` | 12 | `npm run test:settings` |
| B5–B8 | `app/api/admin/*` | ~15 per wave | `npm run test:admin` per wave |
| B9 | remaining learner routes | ~30 | `npm run test` · E2E |

**Must NOT change in any wave:** `with-route.ts`, business logic, response shapes beyond adding `code`.
**Rollback:** each wave is one revert.

#### **I-07-B10 — Lint rule enforcing the wrapper**
- **Changes:** `apps/web/eslint.config.mjs`. **Validation:** `npm run lint` passes; a deliberately raw handler fails.
- **Commit:** `chore(lint): require route handlers to use withRoute`

---

### I-08 · Typed Data Layer

#### **I-08-B1 — Fix the leaderboard column bug** ← **P0**
- **Objective:** `amount` → `xp_amount` at the select, the type, and the reducer; stop discarding the query error.
- **Why:** F-COR-1 — **weekly XP is 0 for every user in production today.**
- **Depends on:** none.
- **Changes:** `apps/web/lib/leaderboard-db.ts` lines 138, 141, 160.
- **Must NOT change:** `lib/leaderboard.ts` (pure ranking logic), any route.
- **Migration:** no.
- **Tests:** given XP events in the week, `xpEarned` is non-zero; a query error is logged, not swallowed.
- **Validation:** `npm run test:leaderboard` · `npm run typecheck`
- **Manual:** load the leaderboard on staging with seeded XP and confirm non-zero weekly values.
- **Commit:** `fix(leaderboard): read xp_events.xp_amount and stop discarding query errors`

#### **I-08-B2 — Fix XP total truncation** ← **P0**
- **Objective:** `getTotalXp()` reads `users.total_xp` (trigger-maintained) or a SQL aggregate.
- **Why:** F-COR-2 — PostgREST truncates at 1000 rows, so power users get wrong totals that then drive level-up notifications.
- **Changes:** `apps/web/lib/xp/xp-service.ts`. **Must NOT change:** the trigger, `lib/xp/xp.ts`.
- **Migration:** no. **Tests:** a user with >1000 events reports the correct total.
- **Validation:** `npm run test:xp` · `npm run typecheck`
- **Commit:** `fix(xp): read the authoritative total instead of summing truncated rows`

#### **I-08-B3 — Bound unbounded selects** ← **P0**
- **Objective:** explicit `limit`, `count`, or `fetchAllRows()` on every unbounded `.select()` in the leaderboard and admin dashboard paths.
- **Why:** F-COR-4 — silent truncation produces confidently wrong admin numbers from ~10K users.
- **Changes:** `lib/leaderboard-db.ts`, `lib/admin/dashboard-service.ts`.
- **Migration:** no. **Tests:** results are complete or explicitly paginated past 1000 rows.
- **Validation:** `npm run test:leaderboard` · `npm run test:dashboard`
- **Commit:** `fix(data): bound queries that silently truncate at the PostgREST row cap`

#### **I-08-B4 — `lib/db/` scaffolding + the `xp` repository**
- **Depends on:** I-15-B1. **Changes:** `lib/db/index.ts`, `lib/db/xp.ts` (new); `lib/xp/xp-service.ts` uses it; `DBChain` deleted from that file.
- **Migration:** no. **Validation:** `npm run test:xp` · `npm run typecheck`
- **Commit:** `refactor(db): add the typed repository layer and migrate XP access`

#### **I-08-B5 … B12 — One repository per aggregate**
`leaderboard` → `progress` → `capstones` → `certificates` → `badges` → `streaks` → `portfolio` → `settings`. One file per batch, `DBChain` removed as each lands.
**Validation per batch:** the aggregate's targeted test script + `npm run typecheck`.

#### **I-08-B13 — Lint rule banning `as unknown as` in `lib/db/`**
- **Changes:** `eslint.config.mjs`. **Validation:** `npm run lint`
- **Commit:** `chore(lint): forbid unsafe casts in the repository layer`

---

### I-09 · Database Invariants & Retention

#### **I-09-B1 — Duplicate XP diagnostic (read-only)** ← **P0**
- **Objective:** a script reporting existing duplicate `(user_id, source_type, source_id)` rows in `xp_events`. **Deletes nothing.**
- **Why:** F-COR-3 — a `UNIQUE` constraint cannot apply while duplicates exist, and nobody knows how many there are.
- **Changes:** `scripts/diagnostics/xp-duplicates.ts` (new).
- **Must NOT change:** migrations, `xp-service.ts`.
- **Migration:** no. **Validation:** run against staging and production read-only; save the output as an artifact.
- **Manual:** a human reviews the report before B2 is written.
- **Commit:** `chore(diagnostics): report duplicate XP events`

#### **I-09-B2 — Dedupe and add the UNIQUE constraint** ← **P0**
- **Depends on:** I-09-B1 **and human review of its output**.
- **Changes:** one migration: delete duplicates keeping the earliest row, then `ALTER TABLE … ADD CONSTRAINT … UNIQUE`.
- **Migration:** **yes — destructive.** Requires a fresh backup (P0-4) immediately before production apply.
- **Tests:** a duplicate insert is refused.
- **Validation:** `npm run test:xp` · **staging apply with seeded duplicates** · row-count comparison before and after.
- **Rollback:** drop the constraint. Deleted rows are recoverable only from the backup — hence the mandatory pre-apply dump.
- **Commit:** `fix(db): enforce XP event uniqueness`

#### **I-09-B3 — `ON CONFLICT DO NOTHING` in `awardXp()`** ← **P0**
- **Changes:** `lib/xp/xp-service.ts`; remove the `hasXpEvent()` pre-check.
- **Migration:** no. **Tests:** concurrent identical awards produce exactly one row.
- **Validation:** `npm run test:xp`
- **Commit:** `fix(xp): make awards idempotent at the database level`

#### **I-09-B4 — Same pattern for capstones and lesson progress** ← **P0**
- **Changes:** `lib/capstones-db.ts`, `app/api/v2/lessons/[lessonId]/progress/route.ts`.
- **Migration:** possibly, if a constraint is needed. **Validation:** `npm run test:capstones` · `npm run test`
- **Commit:** `fix(data): replace check-then-write with conflict-safe upserts`

#### **I-09-B5 — Implement retention per L-11**
- **Objective:** `/api/cron/cleanup` deletes per the locked windows, honouring a hold flag.
- **Why:** F-REL-6 — the route is an explicit no-op and several tables grow forever.
- **Changes:** `app/api/cron/cleanup/route.ts`; one migration adding a hold mechanism.
- **Migration:** **yes.**
- **Tests:** each table's window is respected; held records survive; a dry-run mode reports without deleting.
- **Validation:** `npm run test` · **staging with seeded old rows** · production first run in dry-run mode, reviewed by a human before enabling deletion.
- **Rollback:** disable via feature flag. Deleted rows are recoverable only from backup.
- **Commit:** `feat(cron): implement the retention policy`

#### **I-09-B6 — Wire avatar orphan cleanup into the cron**
- **Changes:** `app/api/cron/cleanup/route.ts` calling `AvatarService.cleanupOrphanedAvatars({ dryRun: false })`.
- **Validation:** staging dry-run reviewed, then enabled.
- **Commit:** `feat(cron): reclaim orphaned avatar storage`

---

### I-10 · Observability & Alerting

#### **I-10-B1 — Exempt `/api/health` from maintenance gating** ← **P0, unblocks P0-8**
- **Objective:** health returns 200 with `maintenance: true` during maintenance instead of 503, and skips the settings lookup.
- **Why:** F-REL-5 — otherwise the uptime monitor pages for planned maintenance, and the alert gets muted.
- **Changes:** `apps/web/proxy.ts` (`isExemptApi`), `app/api/health/route.ts`.
- **Must NOT change:** other maintenance-mode behavior.
- **Migration:** no. **Tests:** health returns 200 with the flag during maintenance; 503 only when the database is unreachable.
- **Validation:** `npm run test` · staging: enable maintenance and curl health.
- **Commit:** `fix(ops): keep the health endpoint available during maintenance`

#### **I-10-B2 — Out-of-band alerting for critical incidents** ← **P0**
- **Objective:** critical `system_errors` also reach an external channel (email or Telegram), reusing the existing 1-hour fingerprint cooldown.
- **Why:** F-REL-4 — alerts currently live in the database they are reporting on.
- **Changes:** `apps/web/lib/monitoring/logger.ts` (`notifyAdminsOnce`), one new notifier module.
- **Must NOT change:** dedup, fingerprinting, redaction, in-app notification behavior.
- **Migration:** no. **Tests:** one alert per fingerprint per hour; failure to notify never changes the response.
- **Validation:** `npm run test:monitoring` · **staging: trigger a critical incident and confirm external delivery.**
- **Commit:** `feat(ops): deliver critical incidents to an out-of-band channel`

#### **I-10-B3 — Client and server error tracking**
- **Objective:** Sentry (free tier) wired into both runtimes and into every error boundary.
- **Changes:** `app/layout.tsx`, `instrumentation.ts` (new), `app/error.tsx`, `app/(app)/error.tsx`, `app/admin/(console)/error.tsx`, `package.json`.
- **Migration:** no. **Tests:** boundaries still render correctly.
- **Validation:** `npm run build` · staging: force an error in each runtime and find it in Sentry.
- **Commit:** `feat(ops): add client and server error tracking`

#### **I-10-B4 — Request correlation IDs**
- **Changes:** `proxy.ts` (generate/accept `x-request-id`), `lib/monitoring/logger.ts` (include it).
- **Validation:** `npm run test` · staging: one request traceable end to end.
- **Commit:** `feat(ops): thread a request id through logging`

#### **I-10-B5 — Structured logging on the highest-value paths**
- **Objective:** convert `console.*` to the redacting structured logger in the queue, auth, and webhook paths. **Not a repo-wide sweep.**
- **Why:** F-SEC-14.
- **Changes:** ~10 files in `lib/notifications/queue/`, `app/api/auth/`, `app/api/email/`.
- **Validation:** `npm run test` · staging: confirm no unredacted provider or database text in logs.
- **Commit:** `refactor(ops): route high-value logs through the redacting logger`

---

### I-11 · Frontend Data Layer

| Batch | Objective | Changes | Validation |
|---|---|---|---|
| B1 | Typed API client over `fetch`, branching on `code` | `lib/api/client.ts` (new) | `npm run test` · `npm run typecheck` |
| B2 | Add SWR and wire it to the client | `package.json`, `lib/api/hooks.ts` | `npm run build` |
| B3 | Migrate settings call sites | `components/settings/*` | `npm run test` · manual |
| B4 | Migrate academy call sites | `app/(app)/academy/**` | E2E lesson loop |
| B5–B6 | Migrate admin call sites, two waves | `components/admin/*` | `npm run test:admin` |
| B7 | Retry and offline detection in the client | `lib/api/client.ts` | `npm run test` |

**Depends on:** I-06-B6. **Must NOT change:** route handlers.

---

### I-12 · Frontend Safety & Correctness — **P0, no dependencies**

#### **I-12-B1 — `safeJsonLd()` and its application**
- **Objective:** a helper escaping `<`, `>`, `&`, applied at all 14 JSON-LD `dangerouslySetInnerHTML` sites.
- **Why:** F-SEC-4 — live stored XSS on the public portfolio.
- **Changes:** `apps/web/lib/seo/safe-json-ld.ts` (new); 14 call sites, starting with `app/(portfolio)/p/[username]/page.tsx:160`.
- **Must NOT change:** `lib/portfolio.ts` JSON-LD **shape**, `lib/schema.ts` content.
- **Migration:** no. **Tests:** a bio containing `</script><script>` cannot escape the block; output remains valid JSON-LD.
- **Validation:** `npm run test` · `npm run build` · `npm run test:seo`
- **Manual:** set a hostile bio on staging and confirm no script executes.
- **Commit:** `fix(security): escape JSON-LD before injecting it into script tags`

#### **I-12-B2 — Validate the profile write**
- **Objective:** zod schema — length caps on `name` and `bio`, `https`-only allowlist on the three URLs, and `avatar_url` **rejected** from this route (it has a dedicated upload endpoint with MIME and size checks).
- **Why:** F-COR-7, and the second half of F-SEC-4.
- **Changes:** `app/api/settings/profile/route.ts`.
- **Must NOT change:** `app/api/user/avatar/route.ts`, `lib/avatar/*`.
- **Migration:** no. **Tests:** over-length, non-https, and `avatar_url` payloads are rejected; valid input still saves.
- **Validation:** `npm run test:settings` · `npm run typecheck`
- **Manual:** confirm the settings UI still saves a normal profile on staging.
- **Note:** if the UI currently sends `avatar_url` through this route, the client must be updated in the same commit — check before implementing.
- **Commit:** `fix(security): validate profile input and reject client-supplied avatar URLs`

#### **I-12-B3 — Correct the error boundary structure**
- **Objective:** rename `app/error.tsx` → `app/global-error.tsx`; add a segment `error.tsx` without the document shell.
- **Why:** F-COR-5 — the current file emits `<html>`/`<body>` from a non-global boundary, and root-layout errors have no boundary at all.
- **Changes:** `app/error.tsx` (rename), `app/error.tsx` (new, plain).
- **Must NOT change:** `app/(app)/error.tsx`, `app/admin/(console)/error.tsx`.
- **Migration:** no. **Tests:** none meaningful.
- **Validation:** `npm run build` · manual: force a render error and confirm no nested `<html>`.
- **Commit:** `fix(ui): correct the global and segment error boundary structure`

#### **I-12-B4 — Reliable logout**
- **Objective:** one shared helper; navigation in `finally`; failures surfaced.
- **Why:** F-COR-6 — a failed logout leaves the user on the page with no feedback.
- **Changes:** `lib/auth/logout.ts` (new); `components/layout/Topbar.tsx`; `lib/admin/session.ts`.
- **Must NOT change:** `app/api/auth/session/route.ts` (I-06-B4 owns it).
- **Migration:** no. **Tests:** navigation occurs even when the network call rejects.
- **Validation:** `npm run test` · **`npm run test:e2e`** · manual logout with the network throttled to offline.
- **Commit:** `fix(auth): make logout navigate and report failures reliably`

#### **I-12-B5 — Verified dead-code removal**
- **Objective:** delete files **only after repo-wide reference verification.**
- **Why:** cruft, plus `MarkdownRenderer` is an unsanitized `marked` renderer sitting in `components/ui/` where it looks approved.
- **Verification protocol, mandatory per file:** grep the basename across `app/`, `components/`, `lib/`, `blocks/`, `renderer/`, `e2e/`; grep the import path; check `index.ts` re-exports; then confirm `npm run build` and `npm run typecheck` pass. **Do not delete on appearance.**
- **Candidates (verified unreferenced at `2b8d281`, re-verify at implementation time):** `components/forms/ReflectionForm.tsx`, `components/forms/waitlist-form.tsx`, `components/dashboard/DashboardSkeleton.tsx`, `components/admin/AdminMultiSelect.tsx`, `components/marketing/sections/skill-radar-section.tsx`, `components/quiz/QuizOption.tsx`, `lib/hooks/useUsageTimeTracker.ts` (stale divergent copy of `hooks/useUsageTimeTracker.ts`), and `components/ui/MarkdownRenderer.tsx` (only importer was `ReflectionForm`).
- **Must NOT delete:** anything not verified in this batch. Report skips rather than guessing.
- **Migration:** no. **Validation:** `npm run build` · `npm run typecheck` · `npm run test` · `npm run lint`
- **Commit:** `chore: remove verified-unreferenced components and a stale duplicate hook`

---

### I-13 · Design System Adoption — P2, ongoing

| Batch | Objective | Validation |
|---|---|---|
| B1 | Extend `ui/button.tsx` to cover observed variants; remove framer-motion from `ui/progress-bar.tsx` | `npm run build` |
| B2 | Adopt `button` in the 10 highest-traffic files | build + visual check |
| B3 | Adopt `card` and `skeleton` in dashboard and academy | build |
| B4 | Learner-side `EmptyState` / `ErrorState` mirroring the admin ones | build |
| B5 | axe-core in CI, failing on serious/critical | CI |
| B6 | Extend the CI hex guard beyond the four brand colors | CI |
| B7 | ESLint rule banning raw `<button>` in `components/` | `npm run lint` |

---

### I-14 · Frontend Performance — P2, **measure first**

| Batch | Objective | Validation |
|---|---|---|
| B1 | **Baseline only — no code change.** `next build` bundle report + Lighthouse on the landing page | report committed to `docs/` |
| B2 | Extract animated wrappers; make `hero` and `portfolio` server components | build + Lighthouse delta |
| B3 | Same for the remaining five sections | build + Lighthouse delta |
| B4 | Server-side avatar resize at upload; comment each `unoptimized` site explaining why it stays | `npm run test:avatar` |

**Rule:** B2 does not start until B1 shows a measurable problem.

---

### I-15 · Testing Foundation — P1

| Batch | Objective | Depends on | Validation |
|---|---|---|---|
| B1 | One shared Supabase fake, complete enough that production code needs no defensive optional chaining | I-01-B2 | `npm run test` |
| B2 | Remove `?.select?.` mock-shaped code (`lib/capstones-db.ts:333` and similar) | B1 | `npm run test:capstones` |
| B3 | E2E: signup → verify → first lesson → XP | P0-1, I-04-B6 | `npm run test:e2e` on staging |
| B4 | E2E: login → session persistence → protected route → logout | I-06-B4 | `npm run test:e2e` on staging |
| B5 | E2E: password reset end to end | I-03-B4 | `npm run test:e2e` on staging |
| B6 | Widen the vitest `include` so component tests are possible; add three for the primitives | — | `npm run test` |

---

### I-16 · Deployment & Operations Safety — P1

| Batch | Objective | Validation |
|---|---|---|
| B1 | **Verify first (human):** check a recent Actions log to determine whether `deploy-supabase` runs at all (F-REL-7). Then fix the `if: env.…` guard so it cannot silently skip | observed CI run |
| B2 | Post `supabase db diff` output to the PR | CI |
| B3 | GitHub Environment approval gate on the migration job | CI |
| B4 | Order the Vercel app deploy after the migration job | CI + one observed deploy |
| B5 | Write three runbooks — queue stuck, provider outage, bad deploy — in `docs/RUNBOOKS.md`, linked from the alerts created in I-10-B2 | review |

---

## 11. Testing and validation gates

| Change class | Required gate |
|---|---|
| Internal refactor (I-08 B4+, I-13, I-15 B1–B2) | `npm run typecheck` · `npm run lint` · `npm run test` |
| New contract / wrapper (I-07) | above + the wrapper's own tests + route-level tests per wave |
| Frontend UI (I-12 B3–B5, I-13, I-14) | above + `npm run build` + manual visual check |
| **Auth / session (I-06)** | above + `npm run test:auth` + `npm run test:middleware-auth` + **`npm run test:e2e` full session lifecycle on staging** |
| **Database migration (I-02, I-09, I-03 B1/B5, I-04 B1/B3/B6)** | above + **staging apply** + **written rollback migration** + `npm run test:rls` where policies change |
| **Destructive migration (I-09 B2, I-09 B5)** | above + **fresh backup immediately before production apply** + row-count comparison + human review of the diagnostic output |
| **Email (I-04)** | above + `npm run test:email` + **a real staging send of every affected template** + kill-switch toggle verification |
| **Abuse control (I-03)** | above + **a concurrency test proving the limit holds** + a scripted burst against staging |
| Observability (I-10) | above + staging verification that the signal actually arrives |
| CI/workflow (I-01, I-16) | one green run on a draft PR + the specific manual check named in the batch |

**Universal rule:** no batch merges with a failing `npm run typecheck`, `npm run lint`, or `npm run test`.

---

## 12. Database migration strategy

1. **Expand/contract.** Add columns, functions, and policies before code uses them. Remove the old path only after the new one is live and verified.
2. **Backward compatible with the currently-deployed app.** Deploy ordering is not guaranteed until I-16-B4, so every migration must be safe against the previous app version.
3. **Staging first, always.** No production migration without a staging apply and an application smoke test.
4. **Write the rollback migration before applying the forward one.** For destructive migrations, take a fresh backup immediately before the production apply.
5. **One migration per batch.** Never bundle unrelated schema changes.
6. **Naming:** `<UTC timestamp>_<snake_case_description>.sql`, continuing from `20260908000002`.
7. **Idempotent DDL** (`IF NOT EXISTS`, `CREATE OR REPLACE`) consistent with the existing 44 migrations.
8. **Every new `SECURITY DEFINER` function ships with its `REVOKE`/`GRANT` and `SET search_path` in the same migration.** This is the rule whose absence produced F-SEC-1.

---

## 13. Security principles

1. **The database is internet-facing.** The anon key ships in the browser bundle. Anything reachable with it must be safe assuming the application does not exist.
2. **Middleware is not an authorization boundary** (L-16). Authorization is re-derived server-side, always.
3. **`is_admin` comes from the database**, never from a token claim.
4. **Fail closed on security-sensitive operations** (L-13); fail open elsewhere. This is a per-endpoint decision, not a global default.
5. **Least privilege by default** — `service_role` unless a caller demonstrably needs otherwise.
6. **Secrets never travel in URLs.** Fix `/api/auth/send-email-hook`'s query-string acceptance (F-SEC-12) when that file is next touched.
7. **Redaction applies to every sink**, not just `system_errors`.
8. **CI holds staging credentials only**, with the single documented exception of the backup workflow's isolated environment.
9. **No enumeration oracles** on authentication surfaces.
10. **Turnstile is additive**, never a substitute for atomic rate limiting (L-07).

---

## 14. Email architecture (target)

```
any send request
      │
      ▼
   enqueue(item)  ──────────────►  email_queue
      │                                 │
      │                                 ▼
      │                        processEmailQueue()
      │                                 │
      │   ┌─────────────────────────────┴──────────────────────────────┐
      │   │ 1. kill switch          EMAIL_ENABLED                       │
      │   │    critical may bypass the optional-mail quota,             │
      │   │    never the global ceiling                                 │
      │   │ 2. global ceiling       cross-provider sends per window     │
      │   │ 3. circuit breaker      trips to a HARD STOP, not to #2     │
      │   │ 4. suppression list                                         │
      │   │ 5. idempotency key      exactly-once per logical event      │
      │   │ 6. category quota                                           │
      │   └─────────────────────────────┬──────────────────────────────┘
      │                                 ▼
      │                    sendEmailWithFailover()
      │                    primary → at most ONE secondary
      │                    no third provider (L-10)
      │                    8 s timeout · attempts persisted
      │                                 ▼
      └──────────  delivered │ retrying (2^n × base, jittered) │ dead_letter
```

**Rules**
- `lib/email.ts` becomes a thin wrapper. No provider `fetch` exists outside `lib/notifications/providers/`.
- Per-call `fromEmail` / `replyTo` become queue-row columns (I-04-B1).
- Verification, password reset, and email change are `critical`: exempt from the optional-mail quota, **never** from the global ceiling.
- Welcome mail and `public.users` creation occur only **after** verification (L-09).
- Dead letters have a real recovery path (I-05-B5) or the route is deleted.
- Every failure is classified and produces a structured incident.

---

## 15. Auth and session architecture (target)

| Concern | Web | Future mobile (D-01 open) |
|---|---|---|
| Access token | httpOnly `sb-access-token`, `SameSite=Lax`, `Secure` | `Authorization: Bearer` |
| Refresh token | httpOnly cookie, rotated **server-side only** | `POST /api/auth/refresh` |
| Token in a response body | **Never** (L-17) | Only from login and refresh |
| Session store | Cookies only. `localStorage` persistence disabled; `AuthStateListener` and `/api/auth/session` removed | Platform secure storage |
| Verification | JWKS signature verification in `resolveActor()`; `auth.getUser()` only as fallback | Same resolver |
| Middleware | Routing hints only (L-16) | N/A |
| Logout | `signOut()` + server cookie clear + navigation in `finally` | Endpoint revokes the refresh token |
| Authorization | `withRoute({ auth })`; `is_admin` from the database | Same |
| Enumeration | Uniform non-committal responses | Same |

**Web-specific:** cookie transport, `proxy.ts` routing, ISR/SSR, `revalidatePath`.
**Platform-independent:** `resolveActor()`, `/api/auth/refresh`, every route contract, error `code`s, and domain rules currently living in client components.

---

## 16. Frontend architecture (target)

- **Server components by default.** Client islands only where interaction requires them.
- **One typed API client** branching on `code`; SWR for caching and deduplication. No component calls `fetch` directly.
- **`global-error.tsx`** for root-layout failures; segment `error.tsx` per route group; all reporting to Sentry.
- **react-hook-form + zod**, importing the same schema the route validates with.
- **`components/ui/` primitives** are the only way to build a button, card, skeleton, dialog, or empty/error state — adopted incrementally, then lint-enforced.
- **WCAG 2.1 AA**, with axe-core in CI and labels/live regions supplied by the primitives.
- **Client errors correlated** with server logs via the shared request ID.

---

## 17. Observability and operations (target)

| Concern | Target |
|---|---|
| Application incidents | Admin → System Alerts (existing, unchanged — L-14) |
| Availability | Independent free uptime monitor on `/api/health` (L-14, P0-8) |
| Error tracking | Sentry free tier, client + server |
| Out-of-band alerts | Email or Telegram on critical incidents, reusing the existing fingerprint cooldown |
| Correlation | `x-request-id` generated in `proxy.ts`, present on every log line |
| SLO candidates *(all computable from data that already exists)* | Availability · email delivery p95 < 15 min (oldest-pending age is already computed at `queue/metrics/route.ts:37`) · stuck jobs older than 15 min = 0 · dead-letter rate · critical incidents per week |
| Scheduler | GitHub Actions, hardened (L-04) |
| Queue | Bounded concurrency so a batch fits the 300 s budget |
| Runbooks | `docs/RUNBOOKS.md` — queue stuck, provider outage, bad deploy |

---

## 18. Backup and restore strategy

**Constraint:** Supabase Free, no PITR (L-03).

| Aspect | Decision |
|---|---|
| Method | `pg_dump` via a dedicated GitHub Actions workflow |
| Encryption | `gpg --symmetric` with a repository secret, **before** upload |
| Storage | GitHub Actions artifacts, 90-day retention (free) |
| Cadence | Daily |
| **RPO** | **24 hours.** State this plainly; do not imply better. |
| **RTO** | Measured during the P0-5 rehearsal and recorded — do not estimate it in advance |
| Credential isolation | A separate workflow with its own GitHub Environment, restricted secrets, `permissions: {}`, no PR trigger, no untrusted checkout |
| Restore target | Staging first, always. Restoring to production is an incident procedure requiring explicit human authorization |
| Rehearsal | At least one restore into staging before this strategy is considered done, and quarterly thereafter |
| Revisit | Paid PITR when business need justifies it (D-02) |

**Known limitation, stated honestly:** the dump contains PII. Encryption at rest in GitHub artifacts is the mitigation, and the passphrase must be stored outside GitHub. If that is unacceptable, the alternative is a paid backup — which conflicts with L-01 and would need the decision reopened.

---

## 19. Staging and production environments

| | Production | Staging |
|---|---|---|
| Supabase project | Existing | New Free project (P0-1) |
| Data | Real user data | Synthetic only — **never a production copy** |
| Vercel | Production deployment | Preview deployments |
| CI test execution | **Never** | Yes |
| Migration order | Applied **after** staging verification | Applied first |
| Secrets | Vercel + the backup workflow environment only | GitHub Actions secrets |
| Redirect allowlist | As configured (L-06) — no new wildcards | Staging URL added explicitly, not by wildcard |

**Rules**
1. Every migration reaches staging before production, without exception.
2. E2E runs against staging.
3. Staging never holds production data — a restore rehearsal (P0-5) is the one controlled exception, and the data is deleted afterwards.
4. No broad Vercel preview wildcards in the Supabase redirect allowlist (L-06).

---

## 20. Signup reopening criteria

Signup remains **CLOSED** until **every** item below is complete and verified. This is the gate; there are no partial reopenings before it.

| # | Requirement | Initiative |
|---|---|---|
| 1 | CI cannot reach production; staging exists | I-01-B1, I-01-B2, P0-1 |
| 2 | Anon key cannot read the learner roster or call privileged RPCs | I-02-B1…B5 |
| 3 | Stuck queue rows are reclaimed automatically; the 24 known rows are resolved | I-05-B1, P0-7 |
| 4 | The kill switch covers the direct transport | I-04-B2 |
| 5 | Rate limiting is atomic, fail-closed, and IP-spoof-resistant on all five endpoints | I-03-B1…B4 |
| 6 | A global signup ceiling exists | I-03-B5 |
| 7 | Enumeration oracles are closed | I-03-B6 |
| 8 | Turnstile is live on the four locked surfaces | I-03-B7 |
| 9 | One governed email path; global ceiling and circuit breaker active | I-04-B3…B5 |
| 10 | Verification precedes welcome email, profile creation, and referral attribution | I-04-B6 |
| 11 | Out-of-band alerting is live and tested; uptime monitor attached | I-10-B1, I-10-B2, P0-8 |
| 12 | The 1,233 flagged accounts are **banned, not deleted** (L-12) | human |
| 13 | A backup exists and one restore has been rehearsed | P0-4, P0-5 |

**Reopening procedure**
1. Reopen with the global ceiling set low — **100 signups/day**.
2. Watch for **72 hours**: signup rate, provider send rate, dead-letter count, `processing` count, critical incidents.
3. Raise the ceiling only while the provider send rate stays proportional to legitimate signups.
4. Any anomaly → set `allowSignups = false` immediately. That lever stays available throughout.

---

## 21. Rollback strategy

| Layer | Mechanism |
|---|---|
| Application code | Vercel instant rollback. **[VERIFY]** confirm this is available on the Free plan; if not, redeploy the previous commit |
| Feature-flagged behavior | Toggle `EMAIL_ENABLED` / `QUEUE_PROCESSING_ENABLED` — instant, and the preferred lever wherever it applies |
| Additive migration | Leave it. Additive schema is harmless to the previous app version |
| Destructive migration | Forward-fix first; restore from backup as the last resort. This is why I-09-B2 and I-09-B5 require a fresh pre-apply dump |
| Batch-level | Each batch is one commit — `git revert` is the default rollback |
| Signup | `allowSignups = false` remains available at all times |

**Per-batch rule:** if a batch cannot be reverted with a single `git revert`, it is too big — split it.

---

## 22. Antigravity / Gemini Flash 3.7 High execution protocol

**These rules are binding for every implementation batch.**

1. **Always branch from the latest `main`.** Never implement directly on `main`.
2. **One batch per session.** Do not start the next batch automatically.
3. **Read only what the batch names.** Do not load this entire plan into context — the batch specification is self-contained.
4. **Change only the files listed under "Changes".** If the batch cannot be completed without touching a file under "Must NOT change", **stop and report** — do not proceed.
5. **Do not opportunistically fix unrelated issues.** Note them in the report instead.
6. **Run the batch's validation commands** and include the actual output in the report.
7. **Commit once**, using the commit message from the batch specification.
8. **Do not push** unless explicitly instructed.
9. **Stop after the batch** and produce a report:
   - Files changed
   - Tests added or modified
   - Validation command output
   - Commit hash
   - Remaining concerns or anything skipped, and why
10. **A human reviews the report before the next batch begins.**
11. **If reality contradicts the batch specification** — a file has moved, a caller uses an unexpected client, a test fails for an unrelated reason — **stop and report.** Do not adapt the plan silently.

---

## 23. Definition of Done

**Per batch:** the objective is met; only the listed files changed; validation commands pass with output captured; a rollback path exists; one commit; a report delivered.

**Per initiative:** every batch merged; the initiative's stated problems no longer reproduce; regression tests exist and pass; documentation updated if behavior changed.

**Per phase:**

| Phase | Done when |
|---|---|
| **P0** | Staging exists · CI cannot reach production · the four RPCs are least-privileged · the 24 stuck rows are resolved · a backup exists and one restore is rehearsed · uptime monitoring is live |
| **Security foundation** | No live vulnerability from §3.1 reproduces · anon-key regression suite passes · abuse control holds under a concurrency test |
| **Email** | No provider `fetch` outside `lib/notifications/providers/` · the kill switch stops every non-critical send · verification precedes welcome |
| **Signup reopening** | All 13 criteria in §20 met · 72 hours of clean monitoring at the capped ceiling |
| **Core architecture** | No route handler outside `withRoute()` · no `as unknown as` in `lib/db/` · `code` on every response |
| **Operations** | Failures reach a human out-of-band before users report them · SLOs measured · runbooks written |

---

## 24. Explicitly out of scope

Not in this plan. **Do not implement these**, and do not let a batch drift into them.

| Out of scope | Reason |
|---|---|
| Redis, Kafka, Kubernetes, microservices, managed queues, dedicated workers, read replicas, additional databases | L-15 — unjustified at current scale |
| Vercel Cron migration | L-04 — Vercel is Free (D-03) |
| Supabase Pro / PITR | L-01, L-03 (D-02) |
| Paid observability platforms | L-14 |
| Any mobile-specific infrastructure — device attestation, push, shared token packages, OpenAPI codegen | D-01 unresolved |
| API versioning scheme | D-04 |
| Upgrading Next.js to resolve the `sharp`/libvips CVEs | Not reachable — every remote image uses `unoptimized`. Documented as DEBT-07 |
| Adding DOMPurify to `MarkdownRenderer` | It is deleted in I-12-B5 instead |
| Constant-time comparison for `CRON_SECRET` | Impractical to exploit over HTTP; fix opportunistically |
| Repo-wide `console.*` conversion | I-10-B5 covers the high-value paths only |
| A design-system migration project | I-13 is incremental and opportunistic by design |
| Speculative performance work | I-14-B1 must show a measured problem first |
| Admin RBAC / MFA | D-05 |
| npm workspaces / lockfile consolidation | DEBT-05, trigger-based |
| Splitting components over 300 lines as a project | DEBT-02, opportunistic only |

---

## Appendix A — Technical debt register

| ID | Problem | Impact | Target | Trigger | Mode |
|---|---|---|---|---|---|
| DEBT-01 | 451 `as unknown as`, 30 `DBChain` | Silent runtime bugs | Typed `lib/db/` | — | Opportunistic after I-08-B4 |
| DEBT-02 | 39 components >300 lines | Untestable | Split | Touching the file | Opportunistic |
| DEBT-03 | Design system at 12/319 | Compounding UI cost | Primitives are the default | — | Opportunistic (I-13) |
| DEBT-04 | 272 hex, 867 arbitrary px, 3 radii | Theming is per-file | Tokens, one radius scale | I-13 underway | Opportunistic |
| DEBT-05 | Un-workspaced monorepo, 3 lockfiles, bidirectional `scripts/` ↔ `apps/web` imports | Build fragility | npm workspaces, one lockfile | A second package appears | Trigger-based |
| DEBT-06 | Two settings services, mixed hook naming | Navigation cost | One convention | Touching the file | Opportunistic |
| DEBT-07 | `unoptimized` on all remote images | 2 MB avatars into 96 px boxes | Server-side resize | I-14-B4 | Proactive — **keep `unoptimized`** |
| DEBT-08 | 294 unstructured `console.*` | Unredacted, uncorrelated logs | Structured logger | — | Opportunistic after I-10-B5 |
| DEBT-09 | No API versioning | Blocks mobile | Versioning policy | D-01 resolved | Trigger-based |
| DEBT-10 | Doc drift — `INDEX.md` says 112 test files / 43 migrations; actual is 113 / 44 | Minor | Accurate counts | Next doc pass | Opportunistic |

## Appendix B — Recommended ADRs

Existing ADRs run 001–006. New ones start at **007**. Write each **before** the batch it governs.

| ADR | Decision | Write before |
|---|---|---|
| **007 — Database trust model** | Anon-reachable tables must be safe assuming the app does not exist; service role only behind `withRoute()` | I-02-B1 |
| **008 — Authentication & session architecture** | Cookies for web, Bearer for mobile, one JWKS-verifying resolver, no client session bridge | I-06-B1 |
| **009 — Unified email egress** | One transport; critical mail bypasses the quota, never the ceiling. **Supersedes D-08's deferral** and must record why | I-04-B4 |
| **010 — Abuse control & rate limiting** | Atomic RPC, trusted IP, fail-closed on security-sensitive operations, global ceilings, Turnstile as an additive control | I-03-B2 |
| **011 — API route contract** | `withRoute()` is the only way to define a route; `code` is the contract, `error` is display copy | I-07-B1 |
| **012 — Staging & environment separation** | Separate Supabase Free project; CI never holds production credentials; $0 logical backups with a 24 h RPO | I-01-B2 |
| **013 — Background processing** | Postgres queue + GitHub Actions. Explicitly rejects Redis, Kafka, managed queues, dedicated workers, and Vercel Cron at current scale and cost | I-05-B4 |

**No ADR for:** the frontend data-library choice (reversible), design-system adoption (a practice), retention windows (a policy — L-11 records them), or tooling selections.

## Appendix C — Free-tier tooling

| Need | Tool | Cost | Adopt |
|---|---|---|---|
| Uptime | UptimeRobot / Better Stack | Free | P0-8 |
| Error tracking | Sentry | Free (5k events/mo) | I-10-B3 |
| Secret scanning | gitleaks | Free | I-01-B3 |
| Dependency audit | `npm audit` | Free | I-01-B3 |
| Dependency updates | Dependabot | Free | I-01-B4 |
| Staging database | Second Supabase Free project | Free | P0-1 |
| Backups | GitHub Actions + `pg_dump` + gpg | Free | I-01-B5 |
| CAPTCHA | Cloudflare Turnstile | Free | I-03-B7 |
| Analytics / RUM | Vercel Analytics + Speed Insights + GA4 | Already mounted | Keep |

**Total recurring cost: $0/month**, satisfying L-01.

---

*This plan is planning documentation only. No application code, migrations, tests, CI workflows, environment files, database permissions, or production configuration were modified in its creation.*

# Prodily B7–B14 Master Implementation Roadmap

**Repository:** `prodily-monorepo` (app code at `apps/web/`)
**Audited against:** `main` @ `87c11df` — *"perf: decouple curriculum loading from proxy"*
**Date:** 2026-09-13
**Type:** Planning only. No source, test, migration, dependency, workflow or configuration file was modified in producing this document.

> **Source-of-truth rule applied throughout.** The current repository is authoritative for implementation status. `docs/FINAL_IMPLEMENTATION_PLAN.md` remains authoritative for *scope* and locked decisions; `docs/HARDENING_LEDGER.md` remains the execution record for B0–B6. Where an old audit finding could not be confirmed in the code at `87c11df`, it is marked OBSOLETE with the evidence that closed it, not carried forward on faith.

---

## 1. Executive Summary

**What this is.** A verified reorganization of the remaining B7–B14 work into 26 small, independently executable batches. Every finding below was re-read against the current code before being scheduled. Roughly a third of the original B7–B14 findings are now provably fixed and are listed in §7 rather than scheduled.

**What is already complete.** B0–B6, Turnstile and V-OPT-1/2/3 closed more than the ledger claims in several places. Newly verified as closed and **not scheduled**:

- `F-SEC-9` (session fixation) — `app/api/auth/session/route.ts:91-115` now verifies the refresh token and matches the user id.
- `F-SEC-10` (unverified JWT in the proxy) — `parseJwtUser` no longer exists in `proxy.ts`.
- `F-SEC-13` (CI production credentials reaching tests) — `vitest.setup.ts:4-8` forces mock credentials unless `ALLOW_LIVE_DB_TESTS=true`.
- `F-COR-7` (unvalidated profile write) — `app/api/settings/profile/route.ts:11-37` ships a zod schema.
- `F-REL-5` (`/api/health` maintenance-gated) — `proxy.ts:451` excludes `api/health` from the matcher entirely, so it is never gated.
- `F-REL-2 / 8 / 9` — bounded concurrency, `EMAIL_HTTP_TIMEOUT_MS`, and retry jitter are all present.

**What remains.** 25 verified findings, of which 7 are P0.

**The single most important discovery is not in any batch spec.** `F-REL-7` is still open, which means the hardening migrations may never have reached production. `20260909000001`, `20260910000001` and `20260910000002` are present in `supabase/migrations/`; the `deploy-supabase` job's only step is guarded by an `env:`-context condition that the ledger reports has never fired; and the fail-closed rate limiter merged in B5 *requires* `consume_rate_limit` to exist. If that function is absent in production, `/api/auth/login` and `/api/auth/signup` are returning 429 to real users right now. Nothing else on this roadmap matters until that is established as fact.

**Recommended shape: 26 batches across 4 phases.** The ordering departs from the old B7→B14 boundaries in three deliberate ways:

1. **A production-truth phase runs first.** Verifying migration state and fixing the CI deploy guard precedes all code work, because several already-merged batches are inert without it.
2. **B8's P0 correctness fixes jump ahead of B7.** The leaderboard column bug (`lib/leaderboard-db.ts:138`) means weekly XP is 0 for every user in production today. It is a three-line fix with no dependencies. Making it wait behind a 127-route architecture migration would be indefensible.
3. **B13's session-ownership work moves up next to B7, not after it.** The dual session store (`F-02`) is what makes httpOnly cookies decorative, and it blocks both the frontend data layer and any mobile client. It is an auth-architecture batch wearing a mobile-readiness label.

B11 (design system) and B12 (marketing performance) stay last and stay small. Neither has evidence of a user-visible problem; both are maintainability work, and B12's own plan rule — measure before changing — is retained.

---

## 2. Current State by Stage

| Stage | Status | Remaining Work |
|---|---|---|
| **B7** — Shared API/auth architecture | **Not started.** No `lib/api/`, no `withRoute`, no `resolveActor`. The error contract (`lib/errors/api-response.ts`) exists and is correct but adopted by only **59 of 127** routes. Auth helpers (`getAuthenticatedUserFromRequest`, `requireAdminUser`) exist and are per-request memoized. | 8 batches: context foundation, wrapper, 5 migration waves, lint enforcement |
| **B8** — Typed data layer + DB correctness | **Not started as architecture; 4 P0 correctness bugs still live.** No `lib/db/`. `DBChain` escape-hatch interfaces in ~20 files; 571 `as unknown as` repo-wide. | 7 batches: 5 correctness (P0), 2 repository-layer |
| **B9** — Admin + observability | **Substantially further along than the plan assumes.** Admin authz on 61/61 routes with audit logging; `system_errors` with fingerprint dedup + 1h cooldown; durable scheduler heartbeat; alert status lifecycle; auth-health telemetry. | 4 batches: out-of-band alerting (P0), correlation IDs, structured logging, retention cron |
| **B10** — Frontend API/data layer | **Not started.** 133 raw `fetch('/api/…')` calls across 72 files. No SWR/React Query. Three I-12 correctness leftovers never landed. | 4 batches |
| **B11** — Design system | **Effectively unadopted.** 393 raw `<button>`; only 6 files import `components/ui/button`. `card`/`select`/`toast` have zero consumers. | 3 batches |
| **B12** — Marketing performance | **V-OPT work is done and must not be repeated.** ISR is correct on all marketing routes. Remaining: all 11 sections in `components/marketing/sections/` are `'use client'`. | 2 batches (second gated on measurement) |
| **B13** — Mobile/API readiness | **Transport is already solved** — `getAuthenticatedUserFromRequest` accepts Bearer; `/api/auth/refresh` accepts a body token. **Session ownership is not.** | 2 batches |
| **B14** — CI / security / E2E | **Weakest area.** No `npm audit`, no secret scanning, no Dependabot, no SAST. `deploy-supabase` guard unverified. 3 shallow E2E specs (72 lines total). Component tests structurally impossible. | 3 batches |

---

## 3. Verified Remaining Findings

### P0 — Correctness, security, production safety

| ID | Source | Current code evidence | Status | Severity | Batch |
|---|---|---|---|---|---|
| **F-REL-7** | Plan §3.2 | `.github/workflows/ci.yml` — `deploy-supabase` step guarded by `if: env.SUPABASE_ACCESS_TOKEN != '' && env.SUPABASE_PROJECT_ID != ''` with those vars defined only in the step's own `env:`. Ledger reports migrations "not yet applied". | **STILL VALID** (mechanism: NEEDS FURTHER INVESTIGATION) | Critical | B14-A |
| **N-1** *(new)* | This audit | Migrations `20260909000001`, `20260910000001`, `20260910000002` present in `supabase/migrations/`. `lib/rate-limit.ts` fail-closed paths depend on `consume_rate_limit`; `lib/notifications/queue/processor.ts:258` depends on `reclaim_stale_processing_items`. Neither confirmed applied. | **STILL VALID** | Critical | B14-A (human gate) |
| **F-COR-1** | Plan §3.3 | `lib/leaderboard-db.ts:138` `.select('user_id, amount, created_at')`; `:141` types it as `amount`; `:160` reduces on `curr.amount`. `types/database.ts:1997` declares `xp_amount`. `error` is destructured away at `:136`. | **STILL VALID** | Critical | B8-A |
| **F-COR-2** | Plan §3.3 | `lib/xp/xp-service.ts:113-128` — `getTotalXp()` selects every `xp_events` row and sums in JS. PostgREST caps at 1000. `users.total_xp` is trigger-maintained and unread. | **STILL VALID** | High | B8-B |
| **F-COR-4** | Plan §3.3 | `lib/admin/dashboard-service.ts:102` `.select('total_xp')` unbounded; `:220,226,232,253,266,272,278` likewise. `lib/leaderboard-db.ts:107-141` — four unbounded selects. `fetchAllRows()` exists at `lib/admin/fetch-all.ts` but is used only by achievements/analytics. | **STILL VALID** | High | B8-C |
| **F-COR-3** | Plan §3.3 | `20260824000001_phase9_perf_indexes.sql:5-6` creates a **non-unique** index on `(user_id, source_type, source_id)`. `lib/xp/xp-service.ts:90-111` `hasXpEvent()` is a check-then-insert; `:38-45` insert has no `ON CONFLICT`. | **STILL VALID** | High | B8-D, B8-E |
| **F-REL-4** | Plan §3.2 | `lib/monitoring/logger.ts:222-264` `notifyAdminsOnce()` writes in-app notifications into the same Supabase instance being reported on. No external channel module exists. | **STILL VALID** | High | B9-A |

### P1 — Architecture and reliability

| ID | Source | Current code evidence | Status | Severity | Batch |
|---|---|---|---|---|---|
| **I-07** | Plan §10 | No `apps/web/lib/api/`. 68 of 127 route files do not import `lib/errors/api-response`. `app/api/settings/profile/route.ts:63` returns `error.message` to the client. Cron auth duplicated verbatim in 6 files with `===` comparison. | **STILL VALID** | High | B7-A…H |
| **F-02** | Mobile audit | `lib/supabase.ts:56-73` — browser client created with no auth options, so supabase-js defaults to `persistSession: true` + `localStorage`. `components/layout/AuthStateListener.tsx` mirrors sessions into cookies via `POST /api/auth/session`; mounted at `app/layout.tsx:141`. | **STILL VALID** | High | B13-A |
| **F-SEC-8** | Plan §3.1 | `app/api/auth/login/route.ts:149` and `app/api/auth/signup/route.ts:347` return `session: authData.session` — access **and** refresh tokens — in the JSON body alongside httpOnly cookies. | **STILL VALID** | High | B13-A |
| **F-SEC-12** | Plan §3.1 | `app/api/auth/send-email-hook/route.ts:87-91` still accepts the secret from a **query string**; `:73,83,91` compare with `===`. The HMAC path (`:154`) correctly uses `timingSafeEqual`. | **PARTIALLY COMPLETE** | Medium | B7-D |
| **F-REL-6** | Plan §3.2 | `app/api/cron/cleanup/route.ts:22-30` — explicit no-op, honestly reported. Invoked daily by `notification-scheduler.yml`. `system_errors`, `email_delivery_events`, `rate_limits`, `notification_events` grow without bound. | **STILL VALID** | Medium | B9-D |
| **F-COR-5** | Plan §3.3 | `app/error.tsx:14-15` renders its own `<html>`/`<body>`; no `app/global-error.tsx` exists. Root-layout errors have no boundary. | **STILL VALID** | Medium | B10-A |
| **F-COR-6** | Plan §3.3 | No `lib/auth/logout.ts`. Logic duplicated in `components/layout/Topbar.tsx` and `lib/admin/session.ts`. | **STILL VALID** | Medium | B10-A |
| **F-SEC-15** | Plan §3.1 | `.github/` contains only `workflows/`. No `dependabot.yml`. `ci.yml` has no `npm audit`, no secret scan, no SAST, no `--ignore-scripts`. | **STILL VALID** | High | B14-B |
| **F-REL-10** | Plan §3.2 | `e2e/auth/` holds 3 specs totalling 72 lines, all navigation-only. `vitest.config.mts:8` restricts `include` to `lib/__tests__/**/*.test.ts` with `environment: 'node'` — component tests are impossible. | **PARTIALLY COMPLETE** | Medium | B14-C |
| **I-08** | Plan §10 | No `lib/db/`. `interface DBChain` declared independently in `lib/academy/lessons-db.ts:77`, `lib/admin/service.ts:44`, `lib/badges-db.ts:24`, `lib/avatar/avatar-service.ts:10`, and ~16 more. 571 `as unknown as` occurrences. | **STILL VALID** (architectural debt) | Medium | B8-F, B8-G |

### P2 / P3 — Maintainability, performance, polish

| ID | Source | Current code evidence | Status | Severity | Batch |
|---|---|---|---|---|---|
| **F-03** | Mobile audit | 133 `fetch('/api/…')` call sites across 72 files. No SWR/React Query/TanStack in `package.json`. | **STILL VALID** | Medium | B10-B, B10-C, B10-D |
| **I-13** | Plan §10 | 393 raw `<button>`; 6 files import `components/ui/button`. 109 raw `<input>`. `AdminEmptyState`/`AdminErrorState` exist; no learner equivalents. | **STILL VALID** | Low | B11-A, B11-B |
| **I-14** | Plan §10 | All 11 files in `components/marketing/sections/` begin `'use client'`. ISR is already correct: `revalidate = 3600` on `/`, `/curriculum`, `/lessons/[slug]`; `1800` on `/reviews`. | **STILL VALID**, unmeasured | Low | B12-A, B12-B |
| **F-SEC-14** | Plan §3.1 | 305 `console.*` calls in `lib/` + `app/`. Redaction covers only the `system_errors` sink. | **STILL VALID** (count 294 → 305; net new) | Low | B9-C |
| **I-12-B5** | Plan §10 | **Re-verified 2026-09-13 and largely WRONG.** Only 5 of the 8 candidates were unreferenced; those were removed in the cleanup pass. `MarkdownRenderer` and `QuizOption` are live (imported by `blocks/`), and `lib/hooks/useUsageTimeTracker.ts` is a tested re-export shim, not a stale copy. | **RESOLVED** | Low | done |
| **N-2** *(new)* | This audit | `app/api/settings/profile/route.ts:18` — `validateOptionalUrl` accepts `http://`. The locked plan (I-12-B2) specified an https-only allowlist. | **STILL VALID** (deviation) | Low | B7-F |
| **N-3** *(new)* | This audit | `app/api/settings/profile/route.ts:63` — `catch` returns `error.message` verbatim to an authenticated learner. | **STILL VALID** | Low | B7-F |
| **N-4** *(new)* | This audit | Rate limiting on 12 of 127 routes. No authenticated-write limits on `/api/capstones/*/submit`, `/api/user/avatar`, `/api/reflections`, `/api/settings/*`. | **STILL VALID** | Low | B7-E |
| **N-5** *(new)* | This audit | `next.config.ts:61` — CSP carries `'unsafe-inline' 'unsafe-eval'` on `script-src`. | **STILL VALID** | Low | **Deferred** (§7) |

---

## 4. Proposed Batch Sequence

```
PHASE 0 — PRODUCTION TRUTH (blocking)
  B14-A  migration deploy guard + applied-state verification   [HUMAN GATE]
     │
     ├──────────────────────────────┐
     ▼                              ▼
PHASE 1 — P0 CORRECTNESS      PHASE 1b — P0 OBSERVABILITY
  B8-A leaderboard column        B9-A out-of-band alerting
     │
  B8-B authoritative XP total
     │
  B8-C bound truncating queries
     │
  B8-D XP duplicate diagnostic  [HUMAN REVIEW GATE]
     │
  B8-E uniqueness + conflict-safe award  [DESTRUCTIVE MIGRATION]

PHASE 2 — ARCHITECTURE
  B7-A resolveActor context
     │
  B7-B withRoute wrapper
     │
     ├── B7-C cron wave (6) ──┐
     ├── B7-D auth wave (11) ─┤
     ├── B7-E learner (~45) ──┼──► B7-H lint enforcement
     ├── B7-F settings (12) ──┤
     └── B7-G admin (61, ×2) ─┘
     │
  B13-A single session owner   (depends on B7-A + B7-D)
     │
  B13-B pagination + versioning contract
     │
  B8-F lib/db scaffolding + xp/leaderboard repos
     │
  B8-G remaining repos + lint ban

PHASE 3 — FRONTEND & OPERATIONS  (B10-A, B9-B/C/D, B14-B/C run any time)
  B10-A frontend correctness leftovers      [no dependencies]
  B9-B  request correlation IDs             [after B7-B]
  B9-C  structured logging, high-value paths
  B9-D  retention cron                      [DESTRUCTIVE, dry-run first]
  B14-B CI security gates + Dependabot      [no dependencies]
  B14-C E2E critical paths + component tests
  B10-B typed API client                    [after B7-H]
  B10-C SWR + settings/academy call sites
  B10-D admin call sites
  B11-A button/input primitive adoption
  B11-B learner empty/error/loading states
  B11-C axe-core CI gate + lint rule
  B12-A marketing performance baseline      [measure only]
  B12-B server-component sections           [gated on B12-A evidence]
```

---

## 5. Detailed Batch Specifications

### B14-A — Make migration deployment verifiable and fail-loud

**Priority:** P0 · **Complexity:** Small · **Risk:** Medium

**Objective:** Establish as fact whether the hardening migrations are applied in production, and make it impossible for the migration job to skip silently again.

**Problem:** `F-REL-7` / `N-1`. Three migrations that already-merged code depends on may never have run. If `consume_rate_limit` is absent, the B5 fail-closed limiter returns 429 on `/api/auth/login` and `/api/auth/signup` for every real user. The failure mode is invisible because the CI job reports green either way.

**Evidence:** `.github/workflows/ci.yml` — `deploy-supabase` job defines no job-level `env`; its single step's `if:` reads `env.SUPABASE_ACCESS_TOKEN`/`env.SUPABASE_PROJECT_ID`, which are declared only in that same step's `env:` block. `docs/HARDENING_LEDGER.md` records B1 and B6 as "migration not yet applied". `supabase/migrations/20260909000001`, `20260910000001`, `20260910000002` are present in the repo.

**Scope:** `.github/workflows/ci.yml`. A read-only verification script under `scripts/diagnostics/`. No application code.

**Implementation:**
1. **Human first:** query the production `supabase_migrations.schema_migrations` table (or run `supabase migration list`) and record which of the three are applied. Capture the output as an artifact under `docs/audits/`.
2. Replace the `env.`-context guard with an explicit `secrets.` check in a preceding step that sets a job output, so the condition is evaluated in a context that provably contains the value.
3. Add a **fail-loud** branch: if the secrets are absent on a `main` push, the job fails with a named error rather than skipping.
4. Add a post-push `supabase migration list` step whose output is printed to the job log.

**Tests:** None meaningful in unit tests. Verification is an observed CI run on `main` plus the migration-list output.

**Security:** The verification script must be read-only and must never print connection strings. Do not echo `SUPABASE_DB_PASSWORD`.

**Performance:** None.

**Dependencies:** None. **Blocks everything else.**

**Production verification:** Required, and it is the entire point. One observed `main` run showing the deploy step executing, plus a migration-list diff before and after.

**Completion criteria:** A human-reviewed record exists stating exactly which migrations are applied in production; the deploy step is observed running; a run with missing secrets fails rather than skips.

**Explicitly excluded:** Applying the migrations themselves (separate, human-approved operational step), the GitHub Environment approval gate, `supabase db diff` PR comments, deploy ordering against Vercel.

**Claude skill objective:** *Verify-then-fix a CI guard.* READ the workflow and the migrations directory; VERIFY the applied state via a read-only query and stop for human confirmation; PLAN the guard rewrite; IMPLEMENT workflow-only changes; TEST by asserting the condition shape; AUDIT DIFF to confirm no application file changed; COMMIT; STOP before any production apply.

---

### B8-A — Correct the leaderboard XP column and stop discarding query errors

**Priority:** P0 · **Complexity:** Small · **Risk:** Low

**Objective:** Weekly XP reads the real column, and a failed query is logged instead of silently producing zeros.

**Problem:** `F-COR-1`. Every user's weekly XP is 0 in production.

**Evidence:** `lib/leaderboard-db.ts:136-141` destructures only `data`, selects `amount`, and types the row as `{ amount: number }`; `:160` reduces on `curr.amount`. The column is `xp_amount` (`types/database.ts:1997`). PostgREST returns an error for the unknown column, which the destructuring discards.

**Scope:** `lib/leaderboard-db.ts` only.

**Implementation:** Change the select to `xp_amount`, correct the row type, correct the reducer, and capture `error` — routing it through `logErrorReport` with domain `data`.

**Tests:** `lib/__tests__/leaderboard.test.ts` — given seeded XP events inside the week, `xpEarned` is non-zero; given a query error, the error is reported and the function does not return a silently-zeroed board.

**Security:** None.

**Performance:** None. Same query shape.

**Dependencies:** B14-A (so the fix is deployable).

**Production verification:** Load `/leaderboard` and confirm non-zero weekly values for a user with recent XP.

**Completion criteria:** Weekly XP is non-zero for active users; a forced query error surfaces as a `system_errors` row.

**Explicitly excluded:** `lib/leaderboard.ts` ranking logic, cache TTL changes, the unbounded selects in the same function (B8-C), the `.in()` URL-size concern (B8-C).

**Claude skill objective:** *Single-file correctness fix with a regression test.* Verify the column against `types/database.ts` before editing; change three lines plus error handling; prove the bug with a failing test first.

---

### B8-B — Read the authoritative XP total

**Priority:** P0 · **Complexity:** Small · **Risk:** Low

**Objective:** `getTotalXp()` stops summing a truncated row set.

**Problem:** `F-COR-2`. Past 1000 XP events, totals are wrong, and those wrong totals drive level-up notifications.

**Evidence:** `lib/xp/xp-service.ts:113-128`. The trigger-maintained `users.total_xp` already holds the correct value and is never read. `awardXp` at `:35` calls `getTotalXp` to compute the level transition, so the bug compounds.

**Scope:** `lib/xp/xp-service.ts`.

**Implementation:** Read `users.total_xp`; fall back to a SQL aggregate only if the row is missing. Keep the function signature.

**Tests:** `npm run test:xp` — a user with >1000 seeded events reports the correct total; the level-transition path in `awardXp` uses it.

**Security:** None.

**Performance:** Improvement — one indexed row read replaces an unbounded fetch on a path called on every XP award.

**Dependencies:** B8-A (same file family, sequential to keep diffs reviewable).

**Production verification:** Compare a power user's reported total against `select total_xp from users`.

**Completion criteria:** Totals match `users.total_xp` for a user above the row cap.

**Explicitly excluded:** The XP trigger, `lib/xp/xp.ts` level math, idempotency (B8-E).

**Claude skill objective:** *Replace a client-side aggregate with the authoritative source.* Confirm the trigger maintains the column before trusting it.

---

### B8-C — Bound the queries that silently truncate

**Priority:** P0 · **Complexity:** Medium · **Risk:** Low

**Objective:** Every unbounded `.select()` on the leaderboard and admin-dashboard paths becomes explicitly bounded, paginated, or a DB-side aggregate.

**Problem:** `F-COR-4`. Above ~1000 rows the admin dashboard reports confidently wrong numbers with no error. Related: `lib/leaderboard-db.ts:129,138` pass every qualifying user id into `.in()`, which becomes a URL-length failure as the user base grows.

**Evidence:** `lib/admin/dashboard-service.ts:102` (`.select('total_xp')` with no bound), `:220,226,232,253,266,272,278`. `lib/leaderboard-db.ts:107,117,126,137`. `fetchAllRows()` exists at `lib/admin/fetch-all.ts` and is used only by `achievements-service.ts` and `analytics-service.ts`.

**Scope:** `lib/leaderboard-db.ts`, `lib/admin/dashboard-service.ts`. Possibly one migration if a DB-side aggregate proves necessary for the leaderboard weekly roll-up.

**Implementation:** For counts, use `{ count: 'exact', head: true }` (already the pattern at `:96-101`). For row sets genuinely needed in full, use `fetchAllRows()`. For the leaderboard weekly aggregate, prefer a bounded server-side aggregation over fetching every event; if that requires an RPC, that is the inseparable migration.

**Tests:** `npm run test:leaderboard`, `npm run test:dashboard` — a seeded set above 1000 rows produces complete results; the `.in()` path is exercised with a large id list.

**Security:** None.

**Performance:** Net improvement; the `.in()` removal also removes a latent request-size failure.

**Dependencies:** B8-A, B8-B.

**Production verification:** Compare dashboard totals against direct SQL counts.

**Completion criteria:** No unbounded `.select()` remains in the two files; results verified complete past the row cap.

**Explicitly excluded:** A repo-wide unbounded-query sweep (other call sites operate on naturally small sets — schedule only if evidence appears), the repository layer (B8-F).

**Claude skill objective:** *Audit-then-bound.* Enumerate every `.select()` in the two files, classify each as count/bounded/full, and justify the choice inline before changing it.

---

### B8-D — Duplicate XP diagnostic (read-only)

**Priority:** P0 · **Complexity:** Small · **Risk:** Low

**Objective:** Produce a reviewable report of existing duplicate `(user_id, source_type, source_id)` rows in `xp_events`. **Deletes nothing.**

**Problem:** `F-COR-3` precondition. A UNIQUE constraint cannot be added while duplicates exist, and nobody knows the count.

**Evidence:** `20260824000001_phase9_perf_indexes.sql:5-6` creates a non-unique index. `lib/xp/xp-service.ts:90-111` is a check-then-insert with no constraint behind it.

**Scope:** `scripts/diagnostics/xp-duplicates.ts` (new). Nothing else.

**Implementation:** A read-only script reporting duplicate groups, their sizes, the total excess row count, and the XP value at stake. Output saved as an artifact.

**Tests:** The script's grouping logic against a seeded fixture.

**Security:** Read-only credentials. Must not print user emails — user ids only.

**Performance:** Runs against production once, off the hot path.

**Dependencies:** B8-C.

**Production verification:** Run read-only against production; **a human reviews the output before B8-E is written.**

**Completion criteria:** A committed report exists and has been reviewed.

**Explicitly excluded:** Any deletion, any migration, any change to `xp-service.ts`.

**Claude skill objective:** *Read-only diagnostic with a hard stop.* The skill must refuse to write a migration in this batch and must end by asking for human review.

---

### B8-E — Enforce XP event uniqueness and make awards conflict-safe

**Priority:** P0 · **Complexity:** Medium · **Risk:** **High** — destructive migration

**Objective:** Duplicate XP becomes impossible at the database level, and `awardXp()` stops relying on a check-then-write race.

**Problem:** `F-COR-3`. Concurrent identical awards produce duplicate rows today.

**Evidence:** `lib/xp/xp-service.ts:24-50` (insert with no conflict clause), `:90-111` (`hasXpEvent` pre-check).

**Scope:** One migration (dedupe keeping the earliest row, then `ADD CONSTRAINT … UNIQUE`), `lib/xp/xp-service.ts`.

**Implementation:** Delete duplicates keeping the earliest row per group; add the UNIQUE constraint; convert the insert to `ON CONFLICT DO NOTHING`; remove the `hasXpEvent()` pre-check from the award path.

**Tests:** A duplicate insert is refused by the database; concurrent identical awards produce exactly one row; the level-transition path still fires once.

**Security:** None directly, but the migration is irreversible for the deleted rows.

**Performance:** Removes one round-trip per award.

**Dependencies:** B8-D **and human review of its output.**

**Production verification:** **Required, with a fresh logical backup taken immediately before apply.** Staging apply with seeded duplicates first; row-count comparison before and after.

**Completion criteria:** Constraint present; duplicate insert refused; pre-check removed; row counts reconcile with the B8-D report.

**Explicitly excluded:** The same pattern for capstones and lesson progress — schedule separately once this pattern is proven; retention (B9-D).

**Claude skill objective:** *Gated destructive migration.* The skill must refuse to proceed without the B8-D artifact and an explicit human approval line, must require a backup confirmation, and must apply to staging before production.

---

### B9-A — Deliver critical incidents out of band

**Priority:** P0 · **Complexity:** Small · **Risk:** Low

**Objective:** Critical `system_errors` also reach a channel that does not depend on the database being reported on.

**Problem:** `F-REL-4`. Today a Supabase outage produces alerts that are written into Supabase.

**Evidence:** `lib/monitoring/logger.ts:222-264` — `notifyAdminsOnce()` fans out in-app notifications only. No notifier module exists outside the DB path.

**Scope:** `lib/monitoring/logger.ts` (`notifyAdminsOnce` call site), one new notifier module under `lib/monitoring/`.

**Implementation:** Add an out-of-band notifier (email via the governed gateway, or a webhook/Telegram channel — operator's choice) invoked alongside the existing in-app fan-out, reusing the existing 1-hour fingerprint cooldown at `:231-241`. Failure to notify must never change the response or throw.

**Tests:** `npm run test:monitoring` — one external alert per fingerprint per hour; a notifier failure is swallowed; the test-environment guard at `:227` still suppresses delivery.

**Security:** The alert body is already redacted (ADR-005) before it reaches this function. Do not add unredacted fields. The channel credential is an env secret, absent in tests.

**Performance:** Off the request path, already inside a `try` that cannot affect the response.

**Dependencies:** B14-A.

**Production verification:** **Required.** Trigger a critical incident on staging and confirm external delivery; confirm the cooldown suppresses the second.

**Completion criteria:** A critical incident reaches the external channel; dedup and redaction behavior unchanged.

**Explicitly excluded:** Sentry (§7), external uptime monitoring (operator task), a new alerting product, changes to fingerprinting or dedup.

**Claude skill objective:** *Add a side-channel without perturbing the primary path.* Prove by test that every existing `notifyAdminsOnce` behavior is unchanged.

---

### B7-A — Canonical authenticated request context (`resolveActor`)

**Priority:** P1 · **Complexity:** Medium · **Risk:** Low

**Objective:** One function resolves who is making a request — learner, admin, cron, webhook, internal, or anonymous — returning a typed actor. **No route is migrated in this batch.**

**Problem:** Actor resolution is spread across `getAuthenticatedUserFromRequest`, `requireAdminUser`, and six hand-rolled `CRON_SECRET` comparisons. There is no single place to add a policy.

**Evidence:** `lib/auth.ts:237` (Bearer + cookie + refresh fallback, WeakMap-memoized), `lib/admin/guard.ts:69` (admin, WeakMap-memoized, audit-logged), `app/api/cron/*/route.ts` × 6 (duplicated `authHeader === \`Bearer ${cronSecret}\`` with non-constant-time comparison).

**Scope:** `apps/web/lib/api/actor.ts` (new) + its test. **No existing route or helper changes.**

**Implementation:** A discriminated-union `Actor` type. `resolveActor(request, policy)` delegates to the existing memoized helpers — it wraps, it does not reimplement — and adds constant-time cron-secret comparison. Preserve the per-request WeakMap memoization.

**Tests:** Each actor kind resolves correctly; an unknown actor is anonymous, never a fallback-admin; cron comparison is constant-time; memoization holds.

**Security:** This is the security-critical foundation. It must not weaken `requireAdminUser`'s DB re-read of `is_admin`, and must not introduce a path where a missing secret grants access.

**Performance:** Neutral — memoization preserved.

**Dependencies:** B14-A.

**Production verification:** None (nothing uses it yet).

**Completion criteria:** File exists, fully tested, imported by nothing.

**Explicitly excluded:** Any route change, `withRoute` (B7-B), session-model changes (B13-A).

**Claude skill objective:** *Foundation-only batch.* The skill must assert at the end that `git diff --name-only` touches exactly two new files and zero routes.

---

### B7-B — `withRoute()` contract wrapper

**Priority:** P1 · **Complexity:** Medium · **Risk:** Low

**Objective:** The wrapper: actor policy, zod validation, declarative rate limiting, ADR-006 error envelope, uniform unexpected-exception handling. **No route migrated.**

**Problem:** 68 of 127 routes hand-roll their preamble and 68 are off the error contract, so some return raw exception text (`app/api/settings/profile/route.ts:63`).

**Evidence:** `lib/errors/api-response.ts` already provides `apiError`, `apiInternalError`, `apiClassifiedAuthError`, `adminErrorMessage`. Adoption is the gap, not the design.

**Scope:** `apps/web/lib/api/with-route.ts` (new) + test.

**Implementation:** `withRoute({ actor, body?, query?, rateLimit? }, handler)`. Build on `resolveActor` and the existing `lib/rate-limit.ts` fail-closed limiter. Unexpected exceptions route through `apiInternalError`. Response shapes stay additive — `error` remains a string per ADR-006's documented reasoning.

**Tests:** Unauthorized actor → 401/403 with a `code`; invalid body → 400 `VALIDATION`; handler throw → 500 with `errorId` and an incident row; rate-limit refusal does not disclose which bucket tripped (preserves the `I-03-B6` enumeration fix).

**Security:** Fail-closed by default. An actor policy must be mandatory, not optional-defaulting-to-public.

**Performance:** One wrapper frame per request; negligible.

**Dependencies:** B7-A.

**Production verification:** None.

**Completion criteria:** Wrapper tested; zero routes changed.

**Explicitly excluded:** All route migration; the lint rule (B7-H).

**Claude skill objective:** *Foundation-only, contract-preserving.* Must prove the envelope is byte-compatible with what `lib/errors/api-response.ts` already emits.

---

### B7-C — Migrate the cron routes (6)

**Priority:** P1 · **Complexity:** Small · **Risk:** Low

**Objective:** All six cron routes use `withRoute` with the cron actor policy; the duplicated secret comparison disappears.

**Problem:** Six copies of the same non-constant-time auth check.

**Evidence:** `app/api/cron/{cleanup,daily-reminder,process-broadcasts,process-email-queue,retry-failed,weekly-recap}/route.ts`.

**Scope:** Those six files.

**Implementation:** Replace the preamble with the wrapper. Preserve the admin-session fallback (both cron and admin are accepted today) and the unauthorized-attempt `logSystemError` in `retry-failed`.

**Tests:** `npm run test` — each route rejects a wrong secret, accepts the right one, accepts an admin session; `notification-scheduler.yml`'s exact call shape still succeeds.

**Security:** Constant-time comparison arrives here. Do not widen who may call these.

**Performance:** None.

**Dependencies:** B7-B.

**Production verification:** Observe one successful scheduled run of each of the five workflow jobs after deploy.

**Completion criteria:** All six migrated; scheduler runs green.

**Explicitly excluded:** Retention implementation (B9-D); `retry-failed` deduplication against `process-email-queue` (deferred — §7).

**Claude skill objective:** *Bounded migration wave.* Behavior-identical; no response-shape change beyond adding `code`; one commit.

---

### B7-D — Migrate the auth routes (11) and close the hook-secret gap

**Priority:** P1 · **Complexity:** Medium · **Risk:** Medium

**Objective:** The `app/api/auth/*` routes adopt the wrapper; `F-SEC-12`'s query-string secret and non-constant-time comparisons are removed.

**Problem:** Auth routes are the highest-risk surface and carry the most bespoke preamble. `send-email-hook` still accepts its secret in a URL.

**Evidence:** `app/api/auth/send-email-hook/route.ts:87-91` (query-string secret), `:73,83,91` (`===`). Eleven route files under `app/api/auth/`.

**Scope:** `app/api/auth/{login,signup,logout,refresh,session,callback,resend-verification,send-email-hook,telemetry,update-password}/route.ts`.

**Implementation:** Migrate to the wrapper preserving every existing behavior exactly: Turnstile ordering on signup and resend, rate-limit ordering, the non-enumerating signup response, cookie attributes. Separately, drop query-string secret acceptance and make the remaining direct comparisons constant-time.

**Tests:** `npm run test:auth`, `npm run test:send-email-hook`, `npm run test:update-password`, plus the E2E auth specs. A query-string secret must now be **rejected**.

**Security:** The highest-risk batch in B7. The enumeration fixes from I-03-B6 and the Turnstile/rate-limit ordering are invariants — assert them by test, not by reading.

**Performance:** None.

**Dependencies:** B7-B. **Do not combine with B13-A** — session-model change and wrapper migration in one diff would be unreviewable.

**Production verification:** **Required.** Exercise signup, login, logout, refresh, password reset and the Supabase auth hook on staging before promoting. Confirm the hook still authenticates after the query-string path is removed — **this can break email delivery if Supabase is configured to pass the secret in the URL; verify the configured hook URL first.**

**Completion criteria:** All 11 migrated; auth E2E green; query-string secret rejected; hook verified working.

**Explicitly excluded:** Removing `session` from response bodies (B13-A); retiring the client bridge (B13-A).

**Claude skill objective:** *High-risk migration wave with invariant assertions.* The skill must enumerate the security invariants first, write assertions for them, then migrate.

---

### B7-E — Migrate the learner routes (~45) and add declarative write limits

**Priority:** P1 · **Complexity:** Large · **Risk:** Medium

**Objective:** Learner-facing routes adopt the wrapper; authenticated write endpoints gain rate limits (`N-4`).

**Problem:** The largest group of hand-rolled preambles, and 115 of 127 routes have no abuse control at all.

**Evidence:** Routes under `app/api/{badges,capstones,certificates,cohorts,feedback,flashcards,friends,leaderboard,notifications,referrals,reflections,review,skill-radar,streaks,v2,xp,user}/`. Rate limiting present on only 12 files.

**Scope:** ~45 route files. **Split into two commits if the diff exceeds ~25 files.**

**Implementation:** Wrapper migration, behavior-identical. Add declarative per-user limits to write endpoints — `/api/capstones/*/submit`, `/api/user/avatar`, `/api/reflections`, `/api/feedback` — using the existing fail-closed limiter with conservative ceilings.

**Tests:** `npm run test` full suite; targeted suites per aggregate; new tests asserting each added limit refuses past its ceiling and does not disclose the bucket.

**Security:** New limits must fail **closed** consistently with B5, and must not lock out normal usage — pick ceilings from observed behavior, not guesses.

**Performance:** One extra `consume_rate_limit` round-trip on newly-limited writes. Acceptable on write paths; do **not** add limits to reads.

**Dependencies:** B7-B, and B14-A (the limiter needs `consume_rate_limit` to exist).

**Production verification:** Recommended — exercise the lesson loop, capstone submit and avatar upload on staging.

**Completion criteria:** All learner routes migrated; write limits active and tested.

**Explicitly excluded:** Admin routes (B7-G), settings routes (B7-F), any business-logic change.

**Claude skill objective:** *Large bounded wave, split-aware.* The skill must count files first and split the commit if over threshold.

---

### B7-F — Migrate the settings routes (12) and close the profile leaks

**Priority:** P1 · **Complexity:** Medium · **Risk:** Low

**Objective:** `app/api/settings/*` adopts the wrapper; `N-2` and `N-3` are fixed.

**Problem:** `app/api/settings/profile/route.ts:63` returns `error.message` to the client; `:18` accepts `http://` where the locked plan specified https-only.

**Evidence:** Those lines, plus 11 other files under `app/api/settings/`.

**Scope:** `app/api/settings/**`, and `lib/portfolio.ts` if the URL validator is tightened there rather than at the schema.

**Implementation:** Wrapper migration; route raw exceptions through `apiInternalError`; tighten the URL allowlist to https-only. **Check the settings UI first** — if it currently submits `http://` URLs, update the client in the same commit.

**Tests:** `npm run test:settings` — an `http://` URL is rejected with a clear message; an exception yields generic copy plus an `errorId`; a valid profile still saves.

**Security:** Closes an internal-message leak and the second half of `F-SEC-4`'s write-side hardening.

**Performance:** None.

**Dependencies:** B7-B.

**Production verification:** Save a normal profile on staging; confirm existing users with stored `http://` URLs are not broken on read (validation is write-side only).

**Completion criteria:** 12 routes migrated; `http://` rejected on write; no raw exception text on the wire.

**Explicitly excluded:** Avatar upload internals (`lib/avatar/*`), portfolio rendering.

**Claude skill objective:** *Migration wave plus two scoped fixes.* Must check existing stored data before tightening validation.

---

### B7-G1 / B7-G2 — Migrate the admin routes (61, two waves)

**Priority:** P1 · **Complexity:** Large (each) · **Risk:** Low

**Objective:** All 61 admin routes adopt the wrapper with the admin actor policy.

**Problem:** The largest single group; each re-implements `requireAdminUser` + status mapping.

**Evidence:** 61 route files under `app/api/admin/`. `requireAdminUser` is already on 61/61 — this is preamble consolidation, not an authorization fix.

**Scope:** G1 — `admin/{emails,notifications,announcements}/**`. G2 — `admin/{users,system,feedback,fellow-requests,capstones,content,settings,audit,search,summary,contact,feature-flags,verify,dev}/**`.

**Implementation:** Wrapper migration. **Preserve `adminErrorMessage()` semantics** — admins deliberately keep failure detail (D-02); do not genericize admin errors. Preserve `logAdminAction` denial audit logging.

**Tests:** `npm run test:admin`, `npm run test:admin-settings`, `npm run test:admin-email` per wave.

**Security:** Do not weaken the DB re-read of `is_admin`. Do not lose the denial audit log.

**Performance:** None.

**Dependencies:** B7-B.

**Production verification:** Walk the admin console after each wave.

**Completion criteria:** Both waves migrated; admin console fully functional; audit logging intact.

**Explicitly excluded:** Admin UI, admin service logic, D-03 server-side faceting (retained by decision).

**Claude skill objective:** *Repetitive bounded wave with a preserved exception.* Must explicitly assert that admin error detail is still surfaced.

---

### B7-H — Lint rule requiring the wrapper

**Priority:** P1 · **Complexity:** Small · **Risk:** Low

**Objective:** A new raw route handler fails lint.

**Evidence:** `apps/web/eslint.config.mjs`.

**Scope:** `eslint.config.mjs`.

**Implementation:** A rule requiring exported handlers in `app/api/**/route.ts` to be produced by `withRoute`, with a documented allowlist for any route deliberately exempt.

**Tests:** `npm run lint` passes; a deliberately raw handler fails.

**Dependencies:** B7-C…G2 all complete.

**Production verification:** None.

**Completion criteria:** Rule active; zero exemptions beyond documented ones.

**Explicitly excluded:** The `as unknown as` ban (B8-G); the raw-`<button>` rule (B11-C).

**Claude skill objective:** *Enforcement-only.* Zero source files may change.

---

### B13-A — Single session owner: retire the client session bridge

**Priority:** P1 · **Complexity:** Large · **Risk:** **High**

**Objective:** One session store. Server-issued httpOnly cookies for web; `Authorization: Bearer` for native. `session` stops appearing in response bodies for browser clients.

**Problem:** `F-02` + `F-SEC-8`. The refresh token sits in `localStorage` *and* an httpOnly cookie, which makes the cookie protection decorative, lets the two stores diverge, and cannot be participated in by a native client.

**Evidence:** `lib/supabase.ts:56-73` (browser client, default `persistSession: true`); `components/layout/AuthStateListener.tsx` mounted at `app/layout.tsx:141`; `app/api/auth/login/route.ts:149` and `app/api/auth/signup/route.ts:347` return the full session.

**Scope:** `lib/supabase.ts`, `components/layout/AuthStateListener.tsx` (delete), `app/layout.tsx`, `app/api/auth/{login,signup,session}/route.ts`, every client component reading the browser session.

**Implementation:** Disable `persistSession` on the browser client. Delete the bridge. Stop returning `session` to browser clients; keep returning it only when an explicit client-type signal marks a native caller. Ensure server-side refresh via `/api/auth/refresh` covers what the bridge did. `POST /api/auth/session` becomes sign-out-only or is retired.

**Tests:** `npm run test:auth`, `npm run test:middleware-auth`; new tests that no token is present in a browser login response and that the native path still receives one. **E2E: login → navigate → refresh across token expiry → logout.**

**Security:** The point of the batch. Risk is a partial migration leaving a client component reading a session that no longer exists — grep every `createBrowserSupabaseClient` consumer before changing the default.

**Performance:** Removes one bridge round-trip per auth state change.

**Dependencies:** B7-A, B7-D. Must land **after** the auth wrapper wave so the two diffs stay separable.

**Production verification:** **Required, and this batch can log everyone out.** Full auth regression on staging, then a monitored production deploy with a rollback plan.

**Completion criteria:** No `localStorage` session; bridge deleted; browser login response carries no tokens; native path documented and tested; session survives access-token expiry.

**Explicitly excluded:** Building a mobile client; CORS (not needed — a native client is not browser-origin-bound); API versioning (B13-B).

**Claude skill objective:** *High-risk architecture migration with an exhaustive consumer sweep.* The skill must enumerate every browser-session consumer and prove each is handled before changing the client default, and must require staging verification before commit.

---

### B13-B — Client-agnostic response contract: pagination and versioning

**Priority:** P2 · **Complexity:** Medium · **Risk:** Low

**Objective:** List endpoints expose a consistent pagination contract; a versioning policy is decided and documented.

**Problem:** One route in 127 uses `.range()`. Four routes sit under `/api/v2/` and 123 do not, with no stated policy.

**Evidence:** `app/api/v2/lessons/[lessonId]/{feedback,progress,quiz,theory-read}/route.ts`; a single `.range()` across all of `app/api/`.

**Scope:** List-returning routes; `docs/` for the contract. Uses the B7 wrapper's declarative surface.

**Implementation:** A uniform cursor or limit/offset envelope applied to list endpoints via the wrapper. Decide and document whether `/v2` is the target prefix or an accident to be absorbed — **this is a human decision, surface it rather than choosing unilaterally.**

**Tests:** Pagination round-trips; no route returns an unbounded list.

**Security:** Pagination is also an abuse control — cap page size server-side.

**Dependencies:** B7-H, B13-A.

**Production verification:** Optional.

**Completion criteria:** Contract documented; list endpoints conform.

**Explicitly excluded:** Renaming existing routes, CORS, upload handling (already MIME/size-checked at `/api/user/avatar`).

**Claude skill objective:** *Contract design with a human decision point.* Must stop and ask about the `/v2` policy before implementing.

---

### B10-A — Frontend correctness leftovers

**Priority:** P1 · **Complexity:** Small · **Risk:** Low

**Objective:** Close the three I-12 items that never landed: error-boundary structure, reliable logout, verified dead-code removal.

**Problem:** `F-COR-5`, `F-COR-6`, and a trap: `components/ui/MarkdownRenderer.tsx` is an unsanitized `marked` → `dangerouslySetInnerHTML` renderer sitting in the approved-primitives directory.

**Evidence:** `app/error.tsx:14-15` emits `<html>`/`<body>` from a segment boundary; no `app/global-error.tsx`. No `lib/auth/logout.ts`; logic duplicated in `components/layout/Topbar.tsx` and `lib/admin/session.ts`. All 8 dead-code candidates still present.

**Scope:** `app/error.tsx` → `app/global-error.tsx` plus a new plain `app/error.tsx`; `lib/auth/logout.ts` (new) + its two consumers; deletion of the 8 verified-unreferenced files.

**Implementation:** As specified in I-12-B3/B4/B5. **The deletion protocol is mandatory:** grep the basename across `app/`, `components/`, `lib/`, `blocks/`, `renderer/`, `e2e/`; grep the import path; check `index.ts` re-exports; then confirm `build` and `typecheck`. Report skips rather than guessing.

**Tests:** Logout navigates even when the network call rejects; `npm run test:e2e`; `build` + `typecheck` + `lint` after deletions.

**Security:** Removing `MarkdownRenderer` eliminates a latent XSS trap, though it is currently unreachable.

**Performance:** Marginal bundle reduction.

**Dependencies:** None. **Can run in parallel with B7.**

**Production verification:** Force a render error and confirm no nested `<html>`; log out with the network throttled offline.

**Completion criteria:** Boundaries correct; one logout helper; deletions verified and builds green.

**Explicitly excluded:** `app/api/auth/session/route.ts` (B13-A owns it); any file not individually verified unreferenced.

**Claude skill objective:** *Three small fixes with a mandatory deletion protocol.* The skill must execute and show the grep evidence per file before any deletion, and must skip rather than guess.

---

### B9-B — Request correlation IDs

**Priority:** P2 · **Complexity:** Small · **Risk:** Low

**Objective:** One request is traceable from proxy through handler to incident.

**Evidence:** No `x-request-id` anywhere in `proxy.ts` or `lib/monitoring/`.

**Scope:** `proxy.ts`, `lib/monitoring/logger.ts`, `lib/api/with-route.ts`.

**Implementation:** Generate or accept `x-request-id` at the proxy; thread it through the wrapper's context; include it in `logErrorReport` details alongside the existing `errorId`.

**Tests:** A supplied id is preserved; an absent one is generated; the id reaches the incident row.

**Dependencies:** B7-B.

**Production verification:** Trace one request end-to-end on staging.

**Completion criteria:** Id present in logs and incidents.

**Explicitly excluded:** Distributed tracing, an APM product.

**Claude skill objective:** *Thread one value through three layers without changing behavior.*

---

### B9-C — Structured logging on the highest-value paths

**Priority:** P2 · **Complexity:** Medium · **Risk:** Low

**Objective:** Convert `console.*` to the redacting structured logger in the queue, auth and webhook paths. **Not a repo-wide sweep.**

**Problem:** `F-SEC-14`. 305 raw `console.*` calls send unredacted exception text to Vercel logs; redaction covers only the `system_errors` sink.

**Evidence:** repo-wide count over `lib/` and `app/`.

**Scope:** ~10 files in `lib/notifications/queue/`, `app/api/auth/`, `app/api/email/`.

**Implementation:** Route these through `lib/monitoring/logger.ts`, which already redacts by value shape and key name (ADR-005).

**Tests:** `npm run test` — no unredacted provider or database text in the converted paths.

**Security:** The whole point. Prioritize paths that handle provider responses and auth errors.

**Dependencies:** B9-B (so converted logs carry the correlation id).

**Production verification:** Inspect staging logs for the converted paths.

**Completion criteria:** The named paths carry no raw `console.*` with exception text.

**Explicitly excluded:** The other ~295 call sites. Converting them all is churn for little gain.

**Claude skill objective:** *Scoped conversion.* Must enumerate and justify the file list before converting, and must not exceed it.

---

### B9-D — Implement the retention policy

**Priority:** P2 · **Complexity:** Medium · **Risk:** **High** — production data mutation

**Objective:** `/api/cron/cleanup` stops being a no-op and deletes per locked windows, honoring a hold flag.

**Problem:** `F-REL-6`. `system_errors`, `email_delivery_events`, `email_queue`, `notification_events`, `user_notification_timeline`, `rate_limits` grow forever, plus one `system_settings` row per day.

**Evidence:** `app/api/cron/cleanup/route.ts:22-30`.

**Scope:** `app/api/cron/cleanup/route.ts`; one migration adding a hold mechanism.

**Implementation:** Per-table windows per L-11, a hold flag that exempts records, and a **dry-run mode that reports without deleting**. Also wire `AvatarService.cleanupOrphanedAvatars({ dryRun: false })` — the two are inseparable because they share the cron's execution budget and dry-run discipline.

**Tests:** Each window respected; held records survive; dry-run deletes nothing.

**Security:** Retention windows must not delete audit records a security review would need — `admin_audit_logs` is **not** in scope for deletion.

**Performance:** Bounded delete batches; must complete inside the 5-minute workflow timeout.

**Dependencies:** B14-A, B9-A.

**Production verification:** **Required.** Staging with seeded old rows; then production **first run in dry-run mode, reviewed by a human before deletion is enabled.** Fresh backup before the first live run.

**Completion criteria:** Windows enforced; dry-run reviewed; avatar orphans reclaimed.

**Explicitly excluded:** Deleting the 1,233 flagged abuse accounts (ISSUE-23 — separate, human-approved); `admin_audit_logs`.

**Claude skill objective:** *Destructive cron with a mandatory dry-run gate.* The skill must ship dry-run-default and require explicit human approval to flip it.

---

### B14-B — CI security gates and Dependabot

**Priority:** P1 · **Complexity:** Small · **Risk:** Low

**Objective:** Dependency, secret and audit gates run on every PR.

**Problem:** `F-SEC-15`. No `npm audit`, no secret scanning, no SAST, no Dependabot.

**Evidence:** `.github/` contains only `workflows/`. `ci.yml` has lint, typecheck, test, brand-guard, build, E2E — no security step.

**Scope:** `.github/workflows/ci.yml`, `.github/dependabot.yml` (new).

**Implementation:** `npm audit --audit-level=high` with a documented policy for accepted advisories (the `sharp` CVE is documented as unreachable — record the reasoning rather than silencing it blindly); secret scanning (gitleaks or equivalent); Dependabot for npm and github-actions.

**Tests:** A deliberately introduced fake secret fails the scan.

**Security:** The entire batch.

**Performance:** Adds CI minutes; keep the audit step non-blocking for `moderate` and blocking for `high`+.

**Dependencies:** None. **Can run in parallel with everything.**

**Production verification:** None.

**Completion criteria:** All three gates active; a planted secret fails; the audit policy is documented.

**Explicitly excluded:** SAST beyond secret scanning (§7); branch protection (repo settings, human).

**Claude skill objective:** *CI-only batch.* Zero application files may change.

---

### B14-C — Critical-path E2E and component-test capability

**Priority:** P1 · **Complexity:** Large · **Risk:** Low

**Objective:** The two flows that matter most are covered end to end, and component tests become possible.

**Problem:** `F-REL-10`. Three specs, 72 lines, all navigation-only. `vitest.config.mts:8` makes component tests structurally impossible.

**Evidence:** `e2e/auth/{login,password-reset,protected-routes}.spec.ts`; `vitest.config.mts:5,8`.

**Scope:** `e2e/**` (new specs), `vitest.config.mts`, a small number of new component tests.

**Implementation:** E2E for signup → verify → first lesson → XP, and login → session persistence → protected route → logout. Widen the vitest `include` and add a jsdom environment for component tests; add three tests for the primitives. **Keep `environment: 'node'` as the default for `lib/__tests__`** so the 129 existing suites are untouched.

**Tests:** Both new specs green against staging.

**Security:** E2E must run against staging, never production. Signup E2E needs Turnstile test keys — reuse the documented dummies already in `ci.yml`.

**Performance:** CI time grows; run E2E on `main` and on PRs touching auth.

**Dependencies:** B13-A (session behavior must be final), B14-A.

**Production verification:** Runs against staging by definition.

**Completion criteria:** Both flows covered; component tests run; existing 129 suites unaffected.

**Explicitly excluded:** Broad component-test coverage; visual regression testing.

**Claude skill objective:** *Test-infrastructure batch.* Must prove the existing suite count and pass rate is unchanged after the config widening.

---

### B10-B — Typed API client

**Priority:** P2 · **Complexity:** Medium · **Risk:** Low

**Objective:** One typed client over `fetch` that branches on `code`, normalizing the ADR-006 envelope for every consumer.

**Problem:** `F-03`. 133 call sites each hand-roll error handling.

**Evidence:** `lib/auth/errors.ts:397` `resolveApiAuthError()` already does this correctly for auth — it is the template.

**Scope:** `lib/api/client.ts` (new) + test. **No call site migrated.**

**Dependencies:** B7-H — the contract must be uniform before a client can rely on it.

**Completion criteria:** Client tested; imported by nothing.

**Explicitly excluded:** SWR (B10-C), call-site migration.

**Claude skill objective:** *Client-side foundation mirroring the server contract.*

---

### B10-C — SWR and the settings/academy call sites

**Priority:** P2 · **Complexity:** Large · **Risk:** Medium

**Objective:** Add SWR wired to the typed client; migrate the settings and academy call sites.

**Scope:** `package.json`, `lib/api/hooks.ts` (new), `components/settings/**`, `app/(app)/academy/**`.

**Tests:** `npm run test`; E2E lesson loop.

**Dependencies:** B10-B.

**Production verification:** Manual walk of settings and the lesson loop.

**Explicitly excluded:** Admin call sites (B10-D), retry/offline (fold into B10-D if evidence supports it).

**Claude skill objective:** *Introduce a dependency and migrate one bounded surface.*

---

### B10-D — Admin call sites

**Priority:** P2 · **Complexity:** Large · **Risk:** Low

**Scope:** `components/admin/**`. **Two commits if over ~25 files.**

**Tests:** `npm run test:admin`.

**Dependencies:** B10-C.

**Explicitly excluded:** Admin UI redesign.

**Claude skill objective:** *Repetitive bounded migration.*

---

### B11-A — Button and input primitive adoption, wave 1

**Priority:** P2 · **Complexity:** Medium · **Risk:** Low

**Objective:** Extend `components/ui/button.tsx` to cover the variants actually in use, then adopt it in the 10 highest-traffic files.

**Evidence:** 393 raw `<button>`; 6 files import the primitive; 109 raw `<input>`.

**Scope:** `components/ui/button.tsx`, `components/ui/input.tsx`, ~10 high-traffic components.

**Tests:** `npm run build`; visual check.

**Dependencies:** None.

**Completion criteria:** Primitive covers observed variants; 10 files migrated with no visual regression.

**Explicitly excluded:** All 393 sites. Migrate on evidence of duplication or inconsistency, never for theoretical consistency.

**Claude skill objective:** *Inventory-then-adopt.* Must catalogue the variants in use before extending the primitive.

---

### B11-B — Learner empty, error and loading states

**Priority:** P2 · **Complexity:** Medium · **Risk:** Low

**Objective:** Learner-side `EmptyState`/`ErrorState` mirroring `components/admin/AdminEmptyState.tsx` and `AdminErrorState.tsx`; replace hand-rolled `animate-pulse` skeletons with `components/ui/skeleton`.

**Evidence:** Admin equivalents exist; learner side has only `components/review/EmptyState.tsx` and `components/feedback/error-state.tsx`. 39 hand-rolled skeletons per the audit.

**Scope:** New shared components; the dashboard and academy surfaces.

**Dependencies:** B11-A.

**Explicitly excluded:** The D-04 two-token-family consolidation — that has a documented approach and belongs in its own visual-review PR.

**Claude skill objective:** *Extract a duplicated pattern into a shared component.*

---

### B11-C — Accessibility gate and the raw-button lint rule

**Priority:** P3 · **Complexity:** Small · **Risk:** Low

**Objective:** axe-core in CI failing on serious/critical; an ESLint rule banning raw `<button>` in `components/`.

**Scope:** `ci.yml`, `eslint.config.mjs`.

**Dependencies:** B11-A, B11-B — enforce only after the primitives cover real usage, or the rule becomes an allowlist.

**Explicitly excluded:** Extending the CI hex guard beyond the four brand colors (marginal).

**Claude skill objective:** *Enforcement-only, after adoption.*

---

### B12-A — Marketing performance baseline (measurement only)

**Priority:** P2 · **Complexity:** Small · **Risk:** Low

**Objective:** A committed bundle report and Lighthouse run for the landing page. **No code change.**

**Problem:** All 11 marketing sections are `'use client'`, each importing framer-motion, on the most SEO- and CWV-sensitive page. Whether this is a *measured* problem is unknown — and the locked plan's own rule is measure first.

**Evidence:** `components/marketing/sections/*.tsx` — all 11 begin `'use client'`. ISR is already correct (`revalidate = 3600` on `/`, `/curriculum`, `/lessons/[slug]`; `1800` on `/reviews`), so caching is not the variable.

**Scope:** A report under `docs/`. Zero source changes.

**Dependencies:** None.

**Completion criteria:** Report committed; a human decides whether B12-B proceeds.

**Explicitly excluded:** Any optimization. This batch is allowed to conclude "no action needed."

**Claude skill objective:** *Measurement-only with a hard stop.* The skill must assert that `git diff` touches only `docs/`.

---

### B12-B — Server-render the marketing sections

**Priority:** P3 · **Complexity:** Medium · **Risk:** Low · **GATED**

**Objective:** Extract the animated wrappers so the section bodies become server components, starting with `hero` and `portfolio`.

**Scope:** `components/marketing/sections/*.tsx`.

**Tests:** `npm run build`; Lighthouse delta against the B12-A baseline.

**Dependencies:** **B12-A showing a measurable problem.** If the baseline is healthy, this batch is cancelled, not deferred.

**Explicitly excluded:** Image work — `next/image` is used everywhere (zero raw `<img>`), fonts are already textbook, and the four `unoptimized` sites are deliberate. Analytics changes.

**Claude skill objective:** *Evidence-gated optimization.* Must read the B12-A report and refuse to proceed if it shows no problem.

---

### B8-F / B8-G — Typed repository layer

**Priority:** P2 · **Complexity:** Large (each) · **Risk:** Low

**Objective:** `lib/db/` replaces the `DBChain` escape hatch, one aggregate at a time.

**Problem:** `interface DBChain` is declared independently in ~20 files; 571 `as unknown as` repo-wide. Every data-access site defeats the generated types, which is how `F-COR-1` survived review — the compiler could not see that `amount` was not a column.

**Evidence:** `lib/academy/lessons-db.ts:77`, `lib/admin/service.ts:44`, `lib/badges-db.ts:24`, `lib/avatar/avatar-service.ts:10`, `lib/admin/{announcements,feedback,fellow-request,leaderboard-admin,moderation}-service.ts`, and more.

**Scope:** B8-F — `lib/db/index.ts`, `lib/db/xp.ts`, `lib/db/leaderboard.ts`; their consumers; `DBChain` deleted from those files. B8-G — `progress`, `capstones`, `certificates`, `badges`, `streaks`, `portfolio`, `settings`, then the lint rule banning `as unknown as` inside `lib/db/`. **One aggregate per commit.**

**Tests:** Each aggregate's targeted script plus `typecheck`.

**Security:** None directly, but this is the structural fix that makes `F-COR-1`-class bugs compile-time failures.

**Dependencies:** B8-C, B14-C (a shared Supabase fake makes this tractable — production code should not need defensive optional chaining like `lib/capstones-db.ts:333`'s `?.select?.` to satisfy a mock).

**Completion criteria:** No `DBChain` in migrated files; lint rule active; all targeted suites green.

**Explicitly excluded:** A repo-wide `as unknown as` purge. Most of the 571 are in tests and admin aggregation and carry no correctness risk. Cosmetic type cleanup is not worth the churn.

**Claude skill objective:** *Incremental type-safety migration, one aggregate per commit.* Must verify each migrated query against `types/database.ts` — the point is catching column-name errors, not moving code.

---

## 6. Cross-Batch Dependencies

```
B14-A ─┬─► B8-A ─► B8-B ─► B8-C ─► B8-D ─[HUMAN]─► B8-E
       │                      │
       ├─► B9-A               └────────────────────────► B8-F ─► B8-G
       │      │                                             ▲
       │      └─► B9-D                                      │
       │                                                    │
       └─► B7-A ─► B7-B ─┬─► B7-C ──┐                       │
                         ├─► B7-D ──┤                       │
                         ├─► B7-E ──┼─► B7-H ─► B10-B ─► B10-C ─► B10-D
                         ├─► B7-F ──┤
                         └─► B7-G1/2┘
                              │
                         B7-A + B7-D ─► B13-A ─► B13-B
                                          │
                         B7-B ─► B9-B ─► B9-C
                                          │
                                    B13-A ─► B14-C ──────────┘

NO DEPENDENCIES (may run any time, in parallel):
    B10-A   frontend correctness leftovers
    B14-B   CI security gates + Dependabot
    B11-A ─► B11-B ─► B11-C
    B12-A ─[evidence gate]─► B12-B
```

**Key edges explained:**

- **B14-A → everything.** Several merged batches are inert until migration state is known. Building on an unverified foundation is the largest risk on this roadmap.
- **B7-A → B7-B → waves → B7-H.** Strict order, no back-edge, matching the plan's resolved I-06/I-07 cycle.
- **B7-A + B7-D → B13-A.** The session model can only change once actor resolution is canonical and the auth routes have already moved. Landing them together would produce an unreviewable diff on the most dangerous surface in the product.
- **B13-A → B14-C.** Writing the session-persistence E2E before the session model is final would encode behavior that is about to change.
- **B7-H → B10-B.** A client cannot normalize a contract that is not yet uniform.
- **B14-C → B8-F.** The shared Supabase fake makes the repository migration tractable and lets the mock-shaped defensive code come out.
- **B8-D → B8-E is a human gate,** not a code dependency.

**Independently deployable:** B14-A, B14-B, B8-A, B8-B, B8-C, B9-A, B10-A, every B7 wave, B11-A/B/C, B12-A.

**Require production verification:** B14-A, B8-E, B7-D, B13-A, B9-A, B9-D.

**Mutate production data:** B8-E, B9-D. Both flagged; both require a fresh backup and human approval.

---

## 7. Removed / Obsolete / Deferred Work

### Already fixed — verified in current code, do not re-implement

| Item | Evidence that closed it |
|---|---|
| `F-SEC-1/2/3/11` — SECURITY DEFINER grants, public `users` policy, `certificates` blanket read, waitlist anon insert | `supabase/migrations/20260910000001_security_hardening_b1.sql` (B1) |
| `F-SEC-4` — portfolio stored XSS | `lib/seo/safe-json-ld.ts` exists; applied at the JSON-LD sites (B2) |
| `F-SEC-5/6` — no login rate limiting, non-atomic limiter | `consume_rate_limit` RPC + fail-closed limiter; 12 routes protected (B5) |
| `F-SEC-7` — signup enumeration | Uniform non-enumerating signup response (B5) |
| `F-SEC-9` — session fixation | `app/api/auth/session/route.ts:91-115` verifies the refresh token and matches the user id (B3) |
| `F-SEC-10` — unverified JWT in proxy | `parseJwtUser` no longer exists in `proxy.ts` (B3) |
| `F-SEC-13` — CI production credentials in tests | `vitest.setup.ts:4-8` forces mocks unless `ALLOW_LIVE_DB_TESTS=true` |
| `F-COR-7` — unvalidated profile write | `app/api/settings/profile/route.ts:11-37` zod schema (residual `http://` gap → B7-F) |
| `F-REL-1` — stuck `processing` rows | `reclaimStaleProcessingItems()` + `reclaim_stale_processing_items` RPC (B6) |
| `F-REL-2` — sequential sends | `DEFAULT_DISPATCH_CONCURRENCY = 5` with a 90s deadline (B6) |
| `F-REL-3` — kill switch missed direct sends | `EMAIL_ENABLED` enforced inside `sendEmail()` (B4) |
| `F-REL-5` — `/api/health` maintenance-gated | `proxy.ts:451` excludes `api/health` from the matcher entirely |
| `F-REL-8` — untimed raw fetches | `EMAIL_HTTP_TIMEOUT_MS` + `AbortSignal.timeout` at both sites (B4) |
| `F-REL-9` — deterministic backoff | Jitter present (B6) |
| `I-04-B1` — `from_email`/`reply_to` columns | Evaluated in B4: unnecessary, carried via JSONB template variables |
| Supabase redirect allowlist | Confirmed correctly scoped in the plan's §3.4 |
| CORS `Access-Control-Allow-Origin: *` concern | **Obsolete.** `next.config.ts:44-48` scopes it to `/_next/static/` only, not to `/api/*` |

### Deliberately not scheduled

- **Portfolio cross-request ISR.** Rejected in V-OPT-2 on privacy and invalidation grounds. Nothing has changed. Do not revisit.
- **`content/dist` in the proxy trace.** Resolved in V-OPT-3 (191 → 96 traced files). Closed.
- **Cloudflare Web Analytics.** Explicitly excluded; no evidence it would answer a question we have.
- **Sentry (I-10-B3).** The plan proposed it, but `lib/monitoring/logger.ts` already does fingerprint dedup, stabilization, a 1-hour cooldown and value-plus-key-name redaction (ADR-005). Adding Sentry would create a second, less-redacted error sink and a new egress path for exception text. **B9-A (out-of-band delivery of existing incidents) solves the actual gap — alerts living in the database they report on — at a fraction of the risk.** Revisit only if client-side error volume becomes a question the current system cannot answer.
- **Cloudinary.** Zero raw `<img>`; `next/image` throughout; fonts self-hosted. No evidence of an image-delivery problem.
- **`retry-failed` deduplication.** `/api/cron/retry-failed` duplicates `/api/cron/process-email-queue`'s work but is honestly labelled (D-06 follow-up). Deleting the route means editing the scheduler workflow for zero user-visible benefit. Fold into B9-D if that batch touches the cron surface anyway.
- **D-01 circuit breaker on failover.** Deferred with a documented trigger and a documented conflict with ADR-002. **This is an open question for a human, not a batch.** Resolve the policy before anyone writes code.
- **D-03 server-side alert faceting.** Retained by decision; revisit when `system_errors` routinely exceeds 100 `new` rows.
- **D-04 two UI error-token families.** Deferred with a documented one-PR approach. Not folded into B11 — it is a visual-review change, and mixing it with primitive adoption would obscure both.
- **D-05 dead settings types.** Retained; removal would silently drop keys from stored JSONB blobs on next save, for cosmetic benefit.
- **`N-5` CSP `unsafe-inline`/`unsafe-eval`.** Real, but a nonce-based CSP in the App Router is a large change with a high breakage surface, and the primary XSS vector it would mitigate (`F-SEC-4`) is already closed at the source. P3. Schedule only if a second injection vector appears.
- **Repo-wide `as unknown as` purge (571 sites).** B8-F/G targets the ~20 `DBChain` declarations where the cast hides *column-name* errors. The rest are in tests and admin aggregation and carry no correctness risk. Churn without benefit.
- **Repo-wide `console.*` sweep (305 sites).** B9-C converts ~10 high-value files. The remainder is noise, and a repo-wide sweep would be a large unreviewable diff.
- **SAST beyond secret scanning.** At this codebase size, `npm audit` + secret scanning + the existing typecheck/lint gates cover the realistic surface. A SAST product would mostly produce triage work.
- **Branch protection.** Not visible in the repository; a GitHub settings task for a human.
- **ISSUE-23 cleanup of 1,233 flagged accounts.** Awaiting explicit human approval; ban-not-delete was proposed. Not a code batch.

---

## 8. Recommended Execution Order

**Phase 0 — Production truth. Nothing else starts until this completes.**

| # | Batch | Priority / Complexity / Risk | Flags |
|---|---|---|---|
| 1 | **B14-A** — migration deploy guard + applied-state verification | P0 / Small / Medium | **HUMAN GATE** |

**Phase 1 — P0 correctness and safety.** B9-A may run in parallel with the B8 chain.

| # | Batch | Priority / Complexity / Risk | Flags |
|---|---|---|---|
| 2 | **B8-A** — leaderboard XP column | P0 / Small / Low | |
| 3 | **B9-A** — out-of-band critical alerting | P0 / Small / Low | ‹parallel› |
| 4 | **B8-B** — authoritative XP total | P0 / Small / Low | |
| 5 | **B8-C** — bound truncating queries | P0 / Medium / Low | |
| 6 | **B8-D** — XP duplicate diagnostic | P0 / Small / Low | **HUMAN REVIEW GATE** |
| 7 | **B8-E** — uniqueness + conflict-safe award | P0 / Medium / **High** | **DESTRUCTIVE MIGRATION · BACKUP REQUIRED** |

**Phase 2 — Architecture.** B10-A and B14-B may run in parallel throughout.

| # | Batch | Priority / Complexity / Risk | Flags |
|---|---|---|---|
| 8 | **B10-A** — frontend correctness leftovers | P1 / Small / Low | ‹parallel, no deps› |
| 9 | **B14-B** — CI security gates + Dependabot | P1 / Small / Low | ‹parallel, no deps› |
| 10 | **B7-A** — `resolveActor` context | P1 / Medium / Low | |
| 11 | **B7-B** — `withRoute` wrapper | P1 / Medium / Low | |
| 12 | **B7-C** — cron wave (6) | P1 / Small / Low | |
| 13 | **B7-D** — auth wave (11) + hook-secret fix | P1 / Medium / Medium | **PRODUCTION VERIFICATION** |
| 14 | **B7-F** — settings wave (12) + profile fixes | P1 / Medium / Low | |
| 15 | **B7-E** — learner wave (~45) + write limits | P1 / Large / Medium | |
| 16 | **B7-G1** — admin wave 1 | P1 / Large / Low | |
| 17 | **B7-G2** — admin wave 2 | P1 / Large / Low | |
| 18 | **B7-H** — lint enforcement | P1 / Small / Low | |
| 19 | **B13-A** — single session owner | P1 / Large / **High** | **PRODUCTION VERIFICATION · MAY LOG USERS OUT** |
| 20 | **B9-B** — request correlation IDs | P2 / Small / Low | |
| 21 | **B14-C** — critical-path E2E + component tests | P1 / Large / Low | |

**Phase 3 — Data layer, frontend, operations.**

| # | Batch | Priority / Complexity / Risk | Flags |
|---|---|---|---|
| 22 | **B8-F** — `lib/db/` + xp/leaderboard repos | P2 / Large / Low | |
| 23 | **B9-C** — structured logging, high-value paths | P2 / Medium / Low | |
| 24 | **B10-B** — typed API client | P2 / Medium / Low | |
| 25 | **B10-C** — SWR + settings/academy sites | P2 / Large / Medium | |
| 26 | **B8-G** — remaining repos + lint ban | P2 / Large / Low | |
| 27 | **B10-D** — admin call sites | P2 / Large / Low | |
| 28 | **B9-D** — retention cron | P2 / Medium / **High** | **PRODUCTION DATA MUTATION · DRY-RUN GATE** |
| 29 | **B13-B** — pagination + versioning contract | P2 / Medium / Low | **HUMAN DECISION ON `/v2`** |
| 30 | **B11-A** — button/input adoption | P2 / Medium / Low | |
| 31 | **B11-B** — learner empty/error/loading states | P2 / Medium / Low | |
| 32 | **B12-A** — marketing baseline (measure only) | P2 / Small / Low | |
| 33 | **B11-C** — axe-core gate + lint rule | P3 / Small / Low | |
| 34 | **B12-B** — server-component sections | P3 / Medium / Low | **CANCELLED if B12-A shows no problem** |

*34 numbered steps covering 26 distinct batches plus their gates. B8-D/E, B12-A/B and B13-B carry explicit human decision points.*

---

## 9. Definition of "Prodily Hardening Complete"

After B14, all of the following must be demonstrably true — verified by observation, not by a document claiming it:

**Production truth**

1. Every migration in `supabase/migrations/` is confirmed applied in production, and the CI job that applies them has been *observed* running. A missing secret fails the job rather than skipping it.
2. No merged code depends on a database object that does not exist in production.

**Correctness**

3. Weekly leaderboard XP is non-zero for active users and matches `xp_events`.
4. XP totals match `users.total_xp` for users above the PostgREST row cap.
5. `xp_events` carries a UNIQUE constraint on `(user_id, source_type, source_id)`; duplicate awards are refused by the database, not by a pre-check.
6. No unbounded `.select()` remains on the leaderboard or admin dashboard paths; admin numbers reconcile against direct SQL.

**API and auth architecture**

7. Every route handler is produced by `withRoute`, enforced by lint, with documented exemptions.
8. Every route response carries a stable `code`; no route returns raw exception, provider or database text to a non-admin client.
9. One actor resolver governs learner, admin, cron, webhook, internal and anonymous access. Cron and hook secrets are compared in constant time and are never accepted from a URL.
10. Session state has exactly one owner: httpOnly cookies for web, `Authorization: Bearer` for native. No token is in `localStorage`, and no token is in a browser login response body.

**Data layer**

11. `lib/db/` covers the aggregates that carry correctness risk; `DBChain` is gone from those files; `as unknown as` is lint-banned inside `lib/db/`.

**Observability and operations**

12. A critical incident reaches a channel that does not depend on the database being reported on, at most once per fingerprint per hour.
13. One request is traceable from proxy to handler to incident via a correlation id.
14. The queue, auth and webhook paths log through the redacting logger.
15. Retention runs on a schedule, honors holds, and its first production run was reviewed in dry-run mode. No table grows without bound.
16. An external uptime monitor polls `/api/health` and pages a human. *(Operator task — must be done, is not a code batch.)*

**Testing and CI**

17. E2E covers signup → verify → first lesson → XP, and login → session persistence → protected route → logout, both green against staging.
18. Component tests are possible and at least the primitives are covered. The existing 129 suites still pass.
19. CI runs `npm audit` with a documented policy, secret scanning, and Dependabot for npm and github-actions. A planted secret fails the build.

**Decisions closed**

20. The two open questions in the ledger have human answers on the record: the I-04-B3 / ADR-002 circuit-breaker policy conflict, and whether signup reopens under §20.
21. Everything in §7 above has a written reason for not being implemented — a reader can tell the difference between "decided against" and "forgotten."

Items **16, 20 and 21 are not code.** The program is not complete without them, and no batch will produce them.

---

## 10. Repository Safety Check

Verified at the close of the audit session that produced this document:

```
$ git status --porcelain
(no output)

$ git log --oneline -1
87c11df perf: decouple curriculum loading from proxy

$ git diff --stat
(no output)
```

- **Files changed:** 0
- **Commits created:** 0
- **Working tree:** unchanged (clean, matching the session-start snapshot)
- **HEAD:** unchanged at `87c11df`
- **Untracked implementation files:** none
- **Migrations created:** none
- **Dependencies added:** none
- **Pushes / deploys / merges:** none

The audit performed reads only: `cat`, `sed -n`, `grep`, `find`, `wc`, `ls`, `node -e` against `package.json`, and read-only `git status` / `git log` / `git diff`.

> **Note on this file.** `docs/B7_B14_MASTER_ROADMAP.md` was written after the audit and safety check, at explicit request. It is a planning document: no source, test, migration, dependency, workflow or configuration file was modified, and no commit was created. The file is currently untracked.

---

## Immediate decisions required before B14-A runs

1. **The migration question is urgent.** If `consume_rate_limit` is not in production, login and signup are failing closed for real users right now. Worth checking today, independently of this roadmap.
2. **The I-04-B3 / ADR-002 conflict** still has no human answer, and it is the only thing blocking a clean statement of email-egress policy.
3. **B13-A can log everyone out.** If that is unacceptable in a given week, it is the one batch with real timing constraints.

---

*End of roadmap. No implementation authorized by this document. Each batch requires its own implementation session, skill, and review.*

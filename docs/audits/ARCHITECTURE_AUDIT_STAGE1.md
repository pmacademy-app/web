# Prodily Production Architecture — Stage 1

**Audit branch:** `architecture-audit-stage1`
**Base:** `main` @ `2b8d281` (= `origin/main`)
**Date:** 2026-09-08
**Scope:** Read-only architecture audit. No application code, tests, or configuration were modified. Signup-abuse S1 was **not** implemented.
**Method:** the repository at that commit is the source of truth. Where `docs/` disagrees with code, code wins; drift is noted.

> **📌 Historical record — status as of 2026-09-10.** This document is preserved as
> written; its findings were accurate at the commit it audited and are **not** edited
> here. Several of them have since been fixed by commit `10a21a5` (the 2026-09-09
> signup-abuse / email incident fix) — in particular the non-atomic, fail-open rate
> limiter, the spoofable client-IP derivation, the ungoverned auth-hook email path, the
> missing aggregate signup ceiling, and the Brevo capacity misclassification that
> blocked failover to Resend.
>
> **For current implementation status, read [`HARDENING_LEDGER.md`](../HARDENING_LEDGER.md).**
> Do not schedule work from this document alone.

---

---

## 1. Current architecture

**Shape:** a single Next.js 16 App Router application (`apps/web`) on Vercel, talking to Supabase Postgres, with a build-time Markdown→JSON content compiler and GitHub Actions as the scheduler. There is no separate backend service. This is a monolith, which is the right choice for this product — the problems below are all *inside* the monolith, not caused by it.

**Runtime topology**

| Layer | Implementation |
|---|---|
| Edge/routing | `apps/web/proxy.ts` (438 lines) — auth routing, RBAC redirect, maintenance mode, email-verification gate, referral cookie, onboarding gate |
| HTTP API | 126 route handlers under `app/api/` (61 admin, 6 cron, 2 webhook/unsubscribe, ~57 learner/public) |
| "Service layer" | `lib/` — 33 directories/modules, ~47.5k non-test lines across `lib/` + `app/` |
| Data access | `@supabase/supabase-js` called directly from routes *and* from `lib/*-db.ts` *and* from `lib/*-service.ts` |
| Database | Supabase Postgres, 44 migrations, ~45 tables, ~70 indexes, 5 SQL functions, 1 trigger |
| Async work | `email_queue` table + `processEmailQueue()`, driven by GitHub Actions cron hitting `/api/cron/*` |
| Email | Two independent transports: `lib/email.ts` (direct) and `lib/notifications/providers/*` (registry, queue-gated) |
| Tests | 114 Vitest files in `lib/__tests__`, 3 Playwright specs (auth only) |

**Repository structure.** `prodily-monorepo` is a monorepo by folder name only. The root `package.json` declares **no** `workspaces`; its scripts are `npm --prefix apps/web run …`. There are three lockfiles — an empty root `package-lock.json`, an empty `pnpm-lock.yaml`, and the real `apps/web/package-lock.json`. Root `scripts/compiler/mermaid-svg.ts` imports `../../apps/web/theme/tokens` and resolves `jsdom`/`mermaid` via `require.resolve(..., { paths: [..., cwd + '/apps/web'] })`, while `apps/web` invokes `../../scripts/compiler`. Tooling and app depend on each other in both directions with hand-rolled module resolution.

---

## 2. What is already good

This is a genuinely well-built application in several places, and those places should be the template for the rest.

1. **Admin authorization is airtight at the API layer.** All **61/61** admin routes call `requireAdminUser()`, which verifies the token against Supabase Auth, then re-reads `users.is_admin` from the database and checks `ADMIN_EMAILS`. It is per-request memoized via `WeakMap`, and denials are audit-logged. The admin console layout re-verifies independently (`app/admin/(console)/layout.tsx`). Defense in depth is real here.
2. **The email queue claim is correct.** `claim_email_queue_items()` uses `FOR UPDATE SKIP LOCKED` — a textbook-correct concurrent work-claiming pattern. `increment_daily_email_quota()` is a single atomic `INSERT … ON CONFLICT DO UPDATE … WHERE count < limit RETURNING`. This proves the team knows how to do concurrency properly in Postgres.
3. **Webhook verification is done right.** `/api/email/webhooks` implements Svix HMAC with a 5-minute replay window and `crypto.timingSafeEqual`.
4. **Provider failover is principled.** `classifyProviderFailure()` is a single shared classifier used by both transports; 8-second `AbortSignal.timeout` on every provider call; per-attempt history persisted to `email_queue.provider_attempts`.
5. **The error contract and taxonomy (ADR-004/005/006) are excellent design work.** `apiInternalError()` never leaks a cause to the client, correlates via `errorId`, and `sanitizeErrorMessage()` is applied as a last-resort backstop even when callers are trusted to pass safe copy. The reasoning in the ADRs — including *why* `error` stayed a string rather than nesting — is the kind of documentation most codebases never get.
6. **`docs/ISSUES_KNOWN.md` D-01…D-08 is an honest register.** It records deferrals with explicit revisit triggers and does not overstate what was fixed. This audit confirms its claims where it could check them.
7. **XP is an append-only ledger with a database-side trigger.** The invariant is the right one.
8. **Content is compiled to static JSON and never stored in Postgres.** Correct call; it keeps the read path free.

---

## 3. Critical architectural problems

Ranked by how much future emergency work they will cause.

### C-1. The type system does not protect the data-access layer

There are **451** `as unknown as` casts in non-test code, and **30 files** declare a local escape-hatch interface (`DBChain`, `SupabaseTable`, `DBSelect`) shaped like:

```ts
interface DBChain { [method: string]: (...args: unknown[]) => DBChain & Promise<{data: unknown; error: unknown}> }
```

`types/database.ts` is accurate and current (it has `provider_attempts`, `portfolio_verification_override`, all 45 tables). It is simply being bypassed. `npm run typecheck` **passes** — which is precisely the problem: it proves nothing about database access.

**This is not theoretical.** `lib/leaderboard-db.ts:135` selects `xp_events.amount`. That column does not exist — the column is `xp_amount`. The `error` field is destructured away, so `xpEvents` is null and **weekly XP earned is `0` for every user on every leaderboard**, silently, in production. A typed client would have rejected this at compile time.

*Why this matters:* every "emergency architectural fix" of this class is a runtime discovery of something the compiler already knew. Until the data layer is typed, the cost of every schema change is unbounded.

### C-2. Two email transports with different governance — the incident's root cause

`lib/email.ts` sends directly to Brevo/Resend with **no queue, no quota gate, no suppression check, no dedup, no volume cap**. It has 7 direct importers including `/api/auth/send-email-hook` (the Supabase Auth hook), `/api/contact`, `/api/waitlist`, and `lib/campaigns/`. `lib/notifications/providers/*` is the governed path used by `processEmailQueue()`. A third, separate raw Resend `fetch` lives in `lib/notifications/automations/service.ts:93` with **no timeout at all**.

D-08 defers this and argues the risk is low because failover policy is now shared. That reasoning is correct about *failover*, and it is exactly the wrong frame: the 2026-09-08 incident was not a failover divergence, it was a **governance** divergence. Every control the platform has for containing email volume lives on one path, and the highest-volume attacker-reachable path is the other one. The right fix is not "consolidate the HTTP code" (D-08's framing) but "make the ungated path impossible to construct."

### C-3. The rate limiter is non-atomic and fails open

`evaluatePersistentRateLimit()` (`lib/rate-limit.ts`) is a `SELECT` → decide → `UPDATE` across three separate statements with no locking. Concurrent requests all read the same count, all pass, all write. On a DB error it falls back to a **per-instance in-memory `Map`**, so on serverless the effective limit becomes `N_instances × limit`.

This is the platform's only volume-containment primitive, and it does not hold under concurrency — which is the only condition under which it matters. Note the contrast with `increment_daily_email_quota()` in the same codebase, which does this correctly in one statement.

### C-4. RLS is enabled but effectively unused as an authorization boundary

RLS is on for ~38 tables with ~65 policies. But **71 of 126** route files use `createServiceRoleClient()`, which bypasses RLS entirely; only ~10 routes use the RLS-respecting `createAuthenticatedServerClient()`. Authorization is therefore ~100% application-enforced, and the policies are a second, unexercised implementation of rules that live in TypeScript.

That is a defensible architecture — many production systems do exactly this — but it must be a *decision*, not an accident. Right now the codebase has two authorization systems, one of which is untested in the paths that matter, and no written rule for which client a new route should use. The next developer will guess.

### C-5. Middleware trusts an unverified JWT

`proxy.ts:parseJwtUser()` base64-decodes the JWT payload and checks only `exp`. **The signature is never verified.** The decoded `app_metadata.is_admin`, `email`, `email_confirmed_at`, and `user_metadata.curriculum_access_override` are then used for admin routing, the email-verification API gate, and the onboarding gate.

**Current exploitability is contained**, and I verified this: admin pages re-verify via `getServerUser()` → real `auth.getUser()`, and all 61 admin API routes re-verify. A forged token gets routing decisions, not data. But the containment is an unwritten invariant held up by every downstream consumer independently remembering to re-verify. One future route that trusts the middleware's decision turns this into privilege escalation. Middleware should verify the signature (JWKS/`jose`) or return only "has a token, unverified" and never a claim-derived identity.

### C-6. No transactions, and no compensation for partial failure

Supabase's JS client has no transaction support, and the code does not work around it. `submitCapstoneAction()` performs 5+ sequential round-trips (read submission → count lessons → read user → write submission → award XP → dispatch notification). A failure at step 5 leaves a submitted capstone with no XP. Nothing detects or repairs this.

The application has, in effect, chosen eventual consistency without choosing the machinery that makes eventual consistency safe (idempotency keys, outbox, reconciliation).

### C-7. Layering is nominal, not enforced

Three co-existing module conventions: `lib/xp.ts` (shim) + `lib/xp/` + `lib/xp-service.ts` (shim); `lib/leaderboard.ts` + `lib/leaderboard-db.ts` (no directory); `lib/flashcards-service.ts` (flat). Two settings services (`lib/admin/settings-service.ts`, `lib/settings/settings-service.ts`) with unrelated responsibilities and the same name. Business logic lives in routes (the completed-state guard in `v2/lessons/[lessonId]/progress`), in `*-db.ts`, and in `*-service.ts`, with no rule distinguishing them. Nothing prevents a route from importing anything.

### C-8. Production code is shaped by test mocks

`lib/capstones-db.ts:333` reads:

```ts
const userQuery = (supabase.from('users') as unknown as DBChain)?.select?.('email, name, is_portfolio_public')?.eq?.('id', userId)
```

— optional-chained method calls, commented "mock-safe fallback", because a hand-written Supabase mock might not implement `.select()`. `lib/rate-limit.ts` carries a hard test-environment guard added after a test run leaked rows into production. The test doubles are dictating production control flow, which means the tests are validating a shape that only exists because the tests exist.

---

## 4. Backend/API findings

**Route architecture.** 126 handlers, flat under `app/api/`, one folder per resource. A partial `v2` namespace exists for 4 lesson routes only; everything else is unversioned. No shared handler wrapper — every route re-implements the same preamble.

**Validation.** Zod is used in **11 of 126** route files. The rest hand-roll checks (`typeof content !== 'string'`) or skip validation. `/api/capstones/[module]/submit` accepts an unbounded `content` string with no length limit and no rate limit. Note `lib/schema.ts` is SEO JSON-LD, not validation — a name collision worth fixing.

**Error handling.** The ADR-006 contract is imported by **59 of 126** routes. The remainder return ad-hoc shapes (`{error: 'Unauthorized'}`, no `code`). `/api/capstones/[module]/submit` returns `error.message` — a raw exception — to the client with status 400, which is exactly the class of leak ADR-006 exists to prevent. `Response.json` and `NextResponse.json` are mixed. There is a stray debug statement inlined into a control-flow block at `app/api/v2/lessons/[lessonId]/progress/route.ts:53`.

**Authorization.** Admin: 61/61 guarded, correct. Cron: all 6 gated on `CRON_SECRET`, compared with `===` (not constant-time; low practical risk over HTTP, but free to fix). Learner routes: two competing auth patterns — 35 routes use `getAuthenticatedUserFromRequest()` (Bearer- or cookie-capable), 16 read the `sb-access-token` cookie directly.

**Session handling.** `resolveAuthenticatedUserFromRequest()` calls `auth.refreshSession()` on the refresh-token fallback path but **never writes the rotated tokens back to cookies**. Supabase rotates refresh tokens; outside the reuse-detection window this can invalidate the client's stored token. `proxy.ts` does persist refreshed sessions correctly — so the two paths disagree.

**Every authenticated request makes a network call to Supabase Auth.** `getUser()` is a round-trip, not local JWT verification. At the API layer this is one extra external hop on the critical path of every request.

**Background jobs / cron.** GitHub Actions (`notification-scheduler.yml`) curls `/api/cron/*`. GH Actions schedules are best-effort with no SLA, are commonly delayed 5–30 minutes under platform load, can skip runs, and are auto-disabled after 60 days of repository inactivity. The project runs on Vercel, and `vercel.json` declares no crons.

**Queue processing has no stuck-row recovery.** `processEmailQueue()` claims a batch (default 50), sets `status='processing'`, then iterates **sequentially** with an 8s timeout per send. Worst case is 50 × 8s = 400s against a `timeout-minutes: 5` (300s) job. `claim_email_queue_items()` only selects `status IN ('pending','retrying')`, and no query anywhere reclaims stale `processing` rows. **A timed-out, redeployed, or killed run strands its remaining rows permanently.** Combined with D-06 (`retry-failed` performs no dead-letter recovery; `cleanup` is a documented no-op), nothing in the system recovers these.

**Retries/timeouts.** Provider calls have timeouts and classified retry. Database calls have neither timeout nor retry. `app/api/email/webhooks/route.ts:92` and `lib/notifications/automations/service.ts:93` issue `fetch` calls with no timeout.

**Fire-and-forget work.** `processEmailQueue(5).catch(...)` is invoked un-awaited from within a request (`processor.ts:154`). On serverless the function may be frozen the moment the response is returned, so this work is not guaranteed to run.

---

## 5. Database findings

**Schema.** ~45 tables, sensible normalization, FKs with `on delete cascade`, ~70 indexes including composite ones added deliberately in perf passes. This is above average.

**The critical gap: idempotency is enforced in application code, not by constraints.**

- `xp_events` has `idx_xp_events_user_source ON (user_id, source_type, source_id)` — a **plain, non-unique** index. `awardXp()` is preceded by a `hasXpEvent()` check. Two concurrent requests (double-click, client retry, mobile reconnect) both pass the check and both insert. **Duplicate XP is awardable today.** A `UNIQUE` constraint on that triple would make it impossible.
- Same shape in `submitCapstoneAction()` (read-then-write) and in `v2/lessons/[lessonId]/progress` (read status → upsert).

**Two divergent sources of truth for total XP.** The trigger `update_user_xp_and_level()` computes `sum(xp_amount)` in SQL and writes `users.total_xp` — correct. `getTotalXp()` in `lib/xp/xp-service.ts` fetches **every** `xp_events` row for the user and sums in JavaScript. PostgREST caps responses at 1000 rows by default, so any user past 1000 XP events gets a silently truncated total — which then drives the level-up notification decision. The denormalized column already holds the right answer and is not read.

**PostgREST's 1000-row cap is an unguarded cliff throughout.** `fetchAllRows()` exists and correctly paginates — but is used only by the Achievements and Moderation services. Everywhere else, unbounded `.select()` calls silently truncate: `leaderboard-db.ts` (all users with `total_xp > 0`), `dashboard-service.ts:102` (`users.select('total_xp')`), `dashboard-service.ts:105,219-232` (`xp_events` scans).

**Leaderboard is O(users × rows) in JavaScript.** After fetching all users, it fetches lesson progress and XP events with `.in('user_id', [all user ids])` — a URL-length bomb past a few thousand users — then runs `userList.map(u => lessonProgress.filter(lp => lp.user_id === u.id))`, a nested scan per user. This is a `GROUP BY` that should never have left the database.

**Config table used as a counter store.** Daily email quota counters are written as `system_settings` rows keyed `email_sent_count_YYYY_MM_DD`, accumulating one row per day in the control-plane table. The atomicity is correct (D-07 fixed the UTC-key ambiguity); the placement mixes configuration and metrics.

**RLS.** See C-4. Policies exist and are mostly `auth.uid() = user_id`, but the service-role client bypasses them on 71 of 126 routes.

**Migrations.** 44 files, timestamp-ordered, idempotent (`IF NOT EXISTS`). There is no down-migration convention and no drift check in CI. `docs/ARCHITECTURE.md` says "41 migration files"; it is 44.

---

## 6. Scalability findings

The honest answer: **the first failures are correctness cliffs, not capacity limits.** Nothing here needs enterprise infrastructure.

**~1K users — fine.** Everything works. The leaderboard weekly-XP bug (C-1) is already wrong but invisible.

**~10K users — first real breakage, and it is silent.**
- The 1000-row PostgREST cap starts truncating: leaderboards show a partial user set, admin dashboard fallback numbers go wrong, power users' XP totals truncate. No error is raised anywhere.
- `.in('user_id', [10k UUIDs])` produces a ~370KB URL and starts failing outright.
- The leaderboard's nested JS filter is ~10⁸ comparisons per cache miss.
- Per-instance in-memory caches (settings 60s, leaderboard 45s, rate-limit map) begin visibly disagreeing across Vercel instances.
- **Fix cost: low.** These are SQL aggregation and `count`/`limit` changes, not infrastructure.

**~100K users — capacity limits arrive.**
- Email: sequential 50-per-5-minute processing caps at ~600 emails/hour; a single announcement to 100K users takes a week. Needs intra-batch concurrency and a real scheduler.
- `auth.getUser()` per request makes Supabase Auth a hard dependency on every API call's latency budget and rate limit. Local JWT verification via JWKS removes the hop.
- The `xp_events` trigger re-sums the user's entire history on every insert, while holding a lock on the `users` row. Incremental `total_xp = total_xp + NEW.xp_amount` makes it O(1).
- `rate_limits` read-modify-write becomes a contention hotspot on top of being incorrect.
- **Fix cost: moderate.** Still one database, one app.

**~1M users — architectural work, still not microservices.**
- Materialized/scheduled leaderboard snapshots (`weekly_leaderboard_snapshots` already exists — use it).
- Partition or roll up `xp_events`; consider a read replica for admin analytics.
- A dedicated queue worker process (or Supabase Edge Function / QStash) instead of HTTP-triggered cron.
- Connection pooling review (Supabase pooler) as serverless instance count grows.

**Actual bottleneck ranking:** (1) unbounded queries + 1000-row cap, (2) JS-side aggregation, (3) email queue throughput and stuck rows, (4) `auth.getUser()` per request, (5) per-instance caches, (6) the XP trigger. None of these argues for Kubernetes, Kafka, or service decomposition.

---

## 7. Mobile/API readiness findings

**The good news:** `getAuthenticatedUserFromRequest()` already accepts `Authorization: Bearer <token>`, and 35 routes use it. The Supabase client is available natively on Android and iOS, so a mobile client can obtain the same tokens.

**Four things block a clean mobile client:**

1. **16 routes read the `sb-access-token` cookie directly** and have no Bearer path — including `v2/lessons/*` (the core learning loop), `flashcards/[id]/review`, `reflections`, and all of `settings/security/*`. A mobile client cannot call them without faking cookies.
2. **Session lifecycle lives in web middleware.** Token refresh and cookie rotation happen in `proxy.ts`, which never runs for a native client. There is no `/api/auth/refresh` contract.
3. **The response contract is not uniform.** 59 routes emit `{success, error, code, errorId}`; the rest emit ad-hoc shapes. A mobile client would need per-endpoint error handling. Worse, `error` is a *human-readable English string* that clients are expected to re-classify (`classifyAuthError(new Error(json.error))`, per ADR-006's own note) — that is unshippable for a localized app. `code` exists; clients must be moved onto it before mobile.
4. **No versioning discipline.** `v2` covers 4 of 126 routes. Once a mobile app ships, old versions live in users' pockets for years and breaking changes stop being cheap.

**Verdict: no backend rewrite is needed.** The work is (a) a shared auth resolver applied to all routes, (b) a refresh endpoint, (c) contract uniformity, (d) a versioning policy. That is a focused project, not a re-architecture — *provided* it happens before a mobile client ships, not after.

---

## 8. Technical debt priorities

| # | Debt | Impact | Effort | Order |
|---|---|---|---|---|
| 1 | Untyped data access (451 casts, 30 `DBChain`) | Silent runtime bugs; every schema change is unbounded risk | High | Now (incrementally) |
| 2 | Missing DB uniqueness for idempotent operations | Duplicate XP/submissions under normal retry | Low | **Now** |
| 3 | Non-atomic, fail-open rate limiter | Abuse containment does not hold | Low | **Now** |
| 4 | Unbounded `.select()` / 1000-row cap | Silent wrong data from ~10K users | Medium | Now |
| 5 | Ungated direct email transport | Repeat of the 2026-09-08 incident | Medium | Now |
| 6 | No stuck-`processing` reclaim | Permanently lost emails | Low | **Now** |
| 7 | Unverified JWT in middleware | Latent privilege escalation | Low | Now |
| 8 | Inconsistent route preamble (auth/validation/errors) | Every new route re-litigates; gaps are invisible | Medium | Next |
| 9 | GitHub Actions as production scheduler | Unpredictable delivery latency | Low | Next |
| 10 | JS-side aggregation (leaderboard, dashboard) | CPU + correctness | Medium | Next |
| 11 | Mobile-blocking cookie coupling | Blocks Android/iOS | Medium | Before mobile |
| 12 | Module layout inconsistency (3 conventions) | Navigation cost, wrong-layer logic | Medium | Ongoing |
| 13 | Mock-shaped production code | Tests validate an artifact of themselves | Medium | Ongoing |
| 14 | Un-workspaced monorepo, 3 lockfiles, cross-boundary imports | Build fragility | Low | Later |

---

## 9. Recommended target architecture

**Stay a modular monolith.** Nothing found here justifies service decomposition — the problems are boundary discipline and data-layer typing, and splitting services would make both worse while adding network partitions.

Five changes, each solving a named problem:

**9.1 A typed repository layer (`lib/db/`).**
One module per aggregate, exporting typed functions over the generated `Database` types. Delete `DBChain`. *Solves C-1:* the compiler catches `amount` vs `xp_amount` before it ships. Introduce it incrementally — new code uses it, and files get converted when touched.

**9.2 A single route handler wrapper.**
```
withRoute({ auth: 'user'|'admin'|'cron'|'public', schema: ZodSchema, rateLimit?, handler })
```
*Solves* the 11/126 validation gap, the 59/126 error-contract gap, the two auth patterns, and the 16 cookie-only routes — because there is one place to fix each, and a new route cannot forget. This is the highest-leverage single change in the report.

**9.3 Push invariants into the database.**
`UNIQUE (user_id, source_type, source_id)` on `xp_events`; `INSERT … ON CONFLICT DO NOTHING` instead of check-then-insert; an atomic rate-limit RPC modeled on the existing `increment_daily_email_quota()`; a stale-`processing` reclaim in `claim_email_queue_items()`. *Solves C-3, C-6, and the queue gap.* The database is the only component that sees all concurrent writers — a rule enforced there cannot be raced.

**9.4 One email path.**
Make `sendEmail()` a thin wrapper over `sendEmailWithFailover()`, and route *everything* through the queue with a `critical` flag that bypasses the optional-mail quota but not the volume ceiling. D-08's stated blocker — campaign scripts needing per-call `fromEmail`/`replyTo` — is solved by adding those as optional queue-row fields, not by keeping two transports. *Solves C-2.*

**9.5 Move scheduling to Vercel Cron; process the queue concurrently.**
Vercel Cron is already paid for, colocated, and observable. Process claimed rows with bounded concurrency (~10) instead of sequentially. *Solves* the delivery-latency ceiling and the 400s-in-a-300s-job overrun.

**Deliberately NOT recommended:** microservices, Kubernetes, Kafka/SQS, GraphQL, a separate API gateway, an ORM migration, Redis. At this scale each adds operational surface without solving a problem this audit found. Revisit Redis only when the per-instance cache divergence becomes a product complaint, and a queue service only past ~100K users.

---

## 10. What should be fixed NOW vs LATER

### NOW — before any new feature work

1. `UNIQUE (user_id, source_type, source_id)` on `xp_events` + `ON CONFLICT DO NOTHING` in `awardXp()`. *(Duplicate XP is possible today.)*
2. Atomic rate-limit RPC; decide explicitly whether it fails open or closed and write the decision down. *(Prerequisite for reopening signups.)*
3. Stale-`processing` reclaim in `claim_email_queue_items()`. *(Emails are being lost silently.)*
4. Fix `xp_events.amount` → `xp_amount` in `leaderboard-db.ts`, and stop discarding `error` on that query. *(Weekly XP is 0 for everyone.)*
5. Make `getTotalXp()` read `users.total_xp` or use a SQL aggregate. *(Truncated totals past 1000 events.)*
6. Verify the JWT signature in `proxy.ts`, or stop deriving identity claims there.
7. Bound every unbounded `.select()` — explicit `.limit()`, a `count`, or `fetchAllRows()`.
8. Persist rotated refresh tokens in `resolveAuthenticatedUserFromRequest()`, or remove that fallback and let the proxy own refresh.
9. Delete the untracked `apps/web/lib/__tests__/zz-probe.test.ts` (self-labelled "deleted before commit").

*S1 (signup abuse) is deliberately excluded — not implemented in this stage, per instruction.*

### NEXT — the structural pass (one focused project)

10. Ship `withRoute()`; migrate cron + auth + settings routes first, then the rest opportunistically.
11. Introduce `lib/db/`; convert `xp`, `leaderboard`, and `progress` first (highest cast density).
12. Unify the email transports (9.4).
13. Move cron to Vercel Cron; add concurrency to the queue loop.
14. Move leaderboard and dashboard aggregation into SQL/RPC.

### LATER — when a trigger fires

15. Mobile API readiness — **before** any mobile client ships, not after.
16. Materialized leaderboard snapshots — when the 45s cache stops absorbing load.
17. Real npm workspaces + one lockfile — when a second package appears.
18. Retire the mock-shaped production code as `lib/db/` makes real fakes cheap.
19. Redis/managed queue — only on a measured symptom.

---

## 11. Stage 1 conclusions

1. **The architecture is sound; the discipline is not.** A Next.js + Supabase modular monolith is the correct shape for this product at every scale in the brief. Not one finding argues for decomposition.

2. **The team demonstrably knows how to build this well.** `SKIP LOCKED` claiming, the atomic quota RPC, Svix verification, 61/61 admin guards, and the ADR set are senior-grade work. The problem is that these correct patterns exist as *instances* rather than as *the only available path*. `increment_daily_email_quota()` is atomic and `evaluatePersistentRateLimit()` is not — in the same repository, for the same class of problem.

3. **That is the actual root cause of "repeated emergency architectural fixes."** Every route re-implements auth, validation, and error handling from scratch, so each one can independently be wrong, and no test or type check will say so. The fix is not more review — it is removing the ability to do it differently. `withRoute()` and `lib/db/` are that removal.

4. **The most dangerous single finding is C-1**, because it is the mechanism by which the others stay hidden. A green `typecheck` and 114 passing test files coexist with a leaderboard that has been reporting zero weekly XP.

5. **Failure modes are silent, not loud.** Truncation at 1000 rows, stranded `processing` rows, swallowed query errors, and duplicate XP all produce plausible-looking wrong output rather than an exception. This is the highest-value target for the reliability audit.

6. **Documentation quality is a genuine asset** — the ADRs and D-register are better than most production codebases. Minor drift found: `ARCHITECTURE.md` says 41 migrations (actual: 44) and 100 test files (actual: 114).

7. **Mobile is reachable without a rewrite**, provided the API contract work happens before a client ships.

---

## Questions for later audits

### For the security audit
1. Should `proxy.ts` verify JWT signatures, or should middleware be redefined as "routing hints only, never authorization"? Both are defensible; the current state is neither, written down nowhere.
2. Is service-role-by-default the intended authorization model? If yes, RLS should be documented as defense-in-depth-only and the policies tested. If no, which routes move to the RLS-scoped client?
3. `/api/auth/send-email-hook` accepts its secret via **query string** (`?secret=`) and compares with `===` in several branches. Query-string secrets land in access logs and proxies. Is that path still needed?
4. What is the CAPTCHA decision blocking ISSUE-23, and does S1's design depend on it?
5. Should the rate limiter fail **open** or **closed** when the database is unreachable? Currently open, per-instance.
6. Disposition of the 1,233 flagged accounts (ISSUE-23) — still awaiting approval.

### For the reliability audit
7. How many `email_queue` rows are currently stuck in `processing`? This is measurable today and quantifies the loss.
8. Is delivery latency budgeted? GH Actions' best-effort scheduling may already be violating an unstated expectation.
9. What is the retention policy for `system_errors`, `email_delivery_events`, `notification_events`, and the daily quota rows? `/api/cron/cleanup` is a documented no-op (ISSUE-21/D-06) and nothing is being pruned.
10. Is there alerting on *silent* failure — truncated queries, zeroed metrics, stranded rows — or only on thrown errors?
11. Do un-awaited `processEmailQueue()` calls actually complete on Vercel, or are they frozen at response time?
12. Should `retry-failed` implement genuine dead-letter recovery, or be deleted (D-06 follow-up)?

### For the frontend audit
13. Which clients branch on the `error` *string* rather than `code`? That set must shrink to zero before mobile or i18n.
14. Do any client surfaces depend on middleware-derived state that a native client will never receive?
15. D-04 (two UI error-token families) — resolve the token rule, or keep deferring with the trigger documented?

### Cross-cutting
16. What is the real target scale and timeline? The NOW list is scale-independent correctness; the NEXT list's ordering depends on whether 10K arrives in six months or three years.
17. Is a mobile client actually planned? If yes, section 7's work moves into NEXT.
18. Who owns the "one way to do it" rules once `withRoute()` and `lib/db/` exist — CI enforcement (lint rules, import boundaries), or review convention?

---

*End of Stage 1. No fixes implemented. No application code modified. Nothing pushed.*

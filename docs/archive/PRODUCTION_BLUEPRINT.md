# Prodily Production Blueprint — Final Synthesis

**Branch:** `architecture-audit-stage1` · **Base:** `main` @ `2b8d281`
**Date:** 2026-09-08
**Status:** Planning only. No code, migrations, configuration, dependencies, or infrastructure modified.
**Inputs:** `docs/audits/ARCHITECTURE_AUDIT_STAGE1.md`, `SECURITY_AUDIT_STAGE2.md`, `FRONTEND_MOBILE_READINESS_AUDIT.md`, `RELIABILITY_OPERATIONS_AUDIT.md`, plus the repository at this commit.

**How to use this document.** It is a master plan, not a spec to hand over whole. Take one **batch** at a time, write a focused Antigravity prompt from it, review the resulting commit, then move to the next. Every batch is scoped so that Gemini Flash 3.7 High can execute it without holding this document in context.

**Fact labels:** **[C]** confirmed in code · **[A]** assumption · **[V]** requires live verification · **[D]** decision to be made by a human.

---

## 1. Reconciling the four audits

### 1.1 Conflicts between audits — resolved

Four findings were graded differently across stages. Resolving them prevents wasted work.

| Conflict | Stage 2 said | Stage 3 said | **Resolution** |
|---|---|---|---|
| `sharp`/libvips CVEs | High — reachable via avatar upload | Every remote image uses `unoptimized`; only local SVGs reach the optimizer | **Low.** Not reachable. Do not upgrade Next for this. Add a comment at each `unoptimized` site recording that removing it re-opens the CVE path, and resize avatars server-side instead. → **DEBT-07** |
| `MarkdownRenderer` unsanitized `marked` | XSS primitive in `components/ui/` | Only importer (`ReflectionForm.tsx`) is dead code; both unreachable | **Delete both.** Do not spend effort adding DOMPurify to a component nothing uses. → **I-12 Batch 4** |
| Logout does not revoke | "no `supabase.auth.signOut()`" | `Topbar.tsx:56` and `lib/admin/session.ts` both call it | **Stage 2 was imprecise.** Sessions *are* revoked. The real defect is that the whole sequence sits in one `try` whose `catch` only logs, so on failure the user is not navigated and sees nothing. → **I-12 Batch 3** |
| Email transport consolidation | Root cause of both incidents (Critical) | — | Stage 1's `ISSUES_KNOWN.md` **D-08 deferred it**, reasoning that failover policy is now shared so risk is low. **That reasoning is correct about failover and wrong about governance.** The incidents were not failover divergence; they were an ungated path. **D-08's deferral is overridden.** → **I-04** |

One more reconciliation, not a conflict but a composition: Stage 1 recommended service-role behind a route wrapper; Stage 2 recommended correct RLS. These compose — see the trust rule in §2.2.

### 1.2 Consolidation: 60+ audit findings → 16 initiatives

| Initiative | Consolidates |
|---|---|
| **I-01 Environment & CI isolation** | S2-H1 (prod key in CI), R-01 (tests write to prod), R-11 (no CI gates), R-12 (no staging) |
| **I-02 Database trust boundary** | S2-C1 (SECURITY DEFINER grants), S2-C2 (`users` anon-readable), S2-C4 (`certificates`), S2-H11 (`waitlist` anon insert), S2-H12 (leaderboard snapshots), C-4 (RLS unused) |
| **I-03 Unified abuse control** | Signup + login + password-reset + resend-verification + waitlist limiting; S2-C5, S2-C6, C-3; spoofable IP; fail-open; global ceilings; CAPTCHA; enumeration oracles |
| **I-04 Governed email egress** | C-2 (two transports), D-08, R-02 (kill-switch gap), D-01 (circuit breaker), welcome-before-verification, `refCode`, quota gate, suppression, dedup |
| **I-05 Queue & scheduler reliability** | R-03 (stuck jobs), R-14 (GH Actions), sequential loop vs 300 s timeout, D-06 (`retry-failed`/`cleanup`), R-15 (jitter) |
| **I-06 Auth, session & API contract** | 16 cookie-only routes, session bridge, localStorage tokens, S2-H2/H3, S2-H4 (unverified JWT), F-02, F-05, F-09, enumeration, mobile auth |
| **I-07 Route contract layer** | C-7, validation 11/126, error contract 59/126, rate limiting 8/126, CSRF 1/126, two auth patterns |
| **I-08 Typed data layer** | C-1 (451 casts, 30 `DBChain`), leaderboard `amount` bug, `getTotalXp` truncation, unbounded `.select()`, 1000-row cap |
| **I-09 Database invariants & retention** | Missing `xp_events` UNIQUE, check-then-insert races, C-6 (no transactions), R-10 (retention), migration safety |
| **I-10 Observability & alerting** | R-04 (circular alerting), R-06 (294 console calls), R-07 (no client errors), R-13 (health/maintenance), SLOs |
| **I-11 Frontend data layer** | F-03 (126 hand-rolled fetches), F-18 (offline), F-05 client side |
| **I-12 Frontend safety & correctness** | F-01 (portfolio XSS), F-10 (`global-error`), F-06 (logout), F-14 (dead code) |
| **I-13 Design system adoption** | F-04 (12/319 adoption), F-13 (a11y), F-15 (tokens) |
| **I-14 Frontend performance** | F-07 (client landing page), F-17 (unoptimized images), framer-motion in `ui/progress-bar` |
| **I-15 Testing foundation** | R-08 (no E2E journeys), R-09 (mock-shaped code), C-8, no component tests |
| **I-16 Deployment & operations safety** | R-05 (migration gate), R-16 (runbooks), rollback, expand/contract |

---

## 2. Target architecture

### 2.1 Backend

```
Request
  │
  ├─ proxy.ts ......... routing hints ONLY. JWKS-verified claims or nothing.
  │                     Never the authorization decision.
  │
  └─ withRoute({ auth, schema, rateLimit, handler })
        │  ├─ resolveActor()  → JWKS verify · Bearer-first, cookie fallback · is_admin from DB
        │  ├─ zod validate    → 422 { success:false, code:'VALIDATION', error, details }
        │  ├─ abuse gate      → atomic RPC, multi-dimensional keys, fail-closed on auth routes
        │  └─ error envelope  → ADR-006 contract on 100% of routes
        │
        └─ domain service (lib/<domain>/)   ← business rules live here, server-only
              │
              └─ lib/db/<aggregate>.ts      ← typed repository. No `as unknown as`.
                    │
                    └─ Supabase (service role) / Postgres RPC for atomic operations
```

**Invariants after the roadmap**
- No route defines `export async function POST` outside `withRoute()` — enforced by ESLint.
- No `as unknown as` in data access — enforced by ESLint in `lib/db/`.
- Every unauthenticated endpoint declares a rate limit; omission is a lint error, not a judgement call.
- Every mutation that can be retried is idempotent by a database constraint, not by a read-then-write check.
- Every external call has a timeout, a classified failure, and a structured incident.

### 2.2 Database

**The trust rule** — the single sentence that resolves the service-role question:

> **Anything reachable with the anon key must be safe assuming the application does not exist. Everything else may use the service role, but only behind `withRoute()`.**

The anon key ships in the browser bundle. That makes PostgREST an internet-facing API, and RLS its only guard. Today four tables fail this test.

| Concern | Target |
|---|---|
| Anon-reachable surface | `users`, `certificates`, `weekly_leaderboard_snapshots`, `cohort_members` deny `anon` directly. Public reads go through narrow `SECURITY DEFINER` functions or column-scoped views. `waitlist` loses its anon INSERT policy. |
| `SECURITY DEFINER` | Every function ships with `REVOKE EXECUTE … FROM PUBLIC, anon, authenticated` and `GRANT … TO service_role`, plus `SET search_path`. Enforced by a migration-review rule. |
| Invariants | `UNIQUE (user_id, source_type, source_id)` on `xp_events`; `ON CONFLICT DO NOTHING` replaces check-then-insert everywhere. |
| Atomic operations | Rate limiting, quota, and queue claiming are single statements or RPCs — never read-modify-write. |
| Queue state | `pending → processing → delivered | retrying → dead_letter`, with a **stale-`processing` reclaim predicate** in `claim_email_queue_items()`. |
| Retention | Declared per table, implemented in `/api/cron/cleanup`, monitored by row count. |
| Migrations | Expand/contract, forward-only but always backward-compatible with the previous app version. Reviewed via `supabase db diff` in the PR. |
| Backup/recovery | Daily backups + PITR on a paid plan; one tested restore into staging per quarter. |

### 2.3 Frontend

| Layer | Target |
|---|---|
| Component boundary | Server components by default. Client islands only where interaction requires it. Marketing sections become server components with a thin animated client wrapper. |
| Data | One typed API client over `fetch`, branching on `code`; SWR for caching, dedup, and revalidation. No component calls `fetch` directly. |
| Errors | `global-error.tsx` for root-layout failures, `error.tsx` per segment, all reporting to the error tracker. |
| Forms | react-hook-form + zod, importing the same schema the route validates with. |
| Design system | `components/ui/` primitives are the only way to build a button, card, skeleton, dialog, or empty/error state. Lint-enforced for `<button>`. |
| Accessibility | WCAG 2.1 AA, axe-core in CI, labels and live regions supplied by the primitives. |
| Observability | Client errors and unhandled rejections reported with the same correlation ID as the server. |

### 2.4 Authentication — final model

| Concern | Web | Future mobile |
|---|---|---|
| Access token | httpOnly `sb-access-token` cookie, `SameSite=Lax`, `Secure` | `Authorization: Bearer`, stored in Keychain / EncryptedSharedPreferences |
| Refresh token | httpOnly cookie, rotated **server-side only** | Returned by `POST /api/auth/refresh`, stored in secure storage |
| Token in response body | **Never** | Only from `/api/auth/login` and `/api/auth/refresh`, and only to a non-browser client |
| Session store | Cookies only. `localStorage` persistence disabled on the browser Supabase client; `AuthStateListener` and `/api/auth/session` retired | N/A |
| Verification | JWKS signature verification locally, in one resolver. `auth.getUser()` only as fallback | Same resolver |
| Middleware | Routing hints only. Never the authorization decision | N/A |
| Logout | `signOut()` + server-side cookie clear + guaranteed navigation in `finally` | `POST /api/auth/logout` revokes the refresh token |
| Authorization | `withRoute({ auth })`, `is_admin` always re-read from the database | Same |
| Enumeration | Signup, login, and resend return identical non-committal responses | Same |

**Web-specific vs platform-independent**

| Stays web-specific | Becomes platform-independent |
|---|---|
| Cookie transport, `proxy.ts` routing, ISR/SSR, `revalidatePath` | The auth resolver, `/api/auth/refresh`, every route contract, error `code`s, domain rules currently in client components |

### 2.5 Email — one governed egress

```
Any send  →  enqueue(item)  →  email_queue  →  processEmailQueue()
                  │                                    │
                  ├─ 1 kill switch  EMAIL_ENABLED (critical may bypass quota, never the ceiling)
                  ├─ 2 global ceiling  sends/window across ALL providers
                  ├─ 3 circuit breaker  trips to hard stop, not to provider #2
                  ├─ 4 suppression list
                  ├─ 5 idempotency key  (exactly-once per logical event)
                  └─ 6 per-category quota
                                                       │
                                        sendEmailWithFailover()
                                          Brevo → (classified failure) → Resend
                                          8 s timeout · attempts recorded on the row
                                                       │
                        delivered | retrying (2^n × base, jittered) | dead_letter
```

- `lib/email.ts` becomes a thin wrapper over the queue. The ungated path ceases to exist.
- Per-call `fromEmail` / `replyTo` — D-08's stated blocker — become optional columns on the queue row.
- Welcome email and `public.users` creation move **after** verification. `refCode` is validated and stored on the pending signup, consumed at verification.
- Dead letters get a real recovery path; `retry-failed` either implements it or is deleted.

### 2.6 Operations

| Concern | Target |
|---|---|
| Monitoring | Uptime monitor on `/api/health` (exempt from maintenance gating, reporting maintenance as a field) |
| Error tracking | Sentry, client + server, sharing the request-ID correlation |
| Alerting | At least one **out-of-band** channel — email or Telegram. In-app alerts remain, but never as the only path |
| SLOs | Availability; email delivery p95 < 15 min (oldest-pending age already computed); stuck-jobs = 0; dead-letter rate; critical-incident rate |
| Cron | Vercel Cron, colocated and observable |
| Queue | Bounded concurrency (~10) so a batch fits its window |
| Incident response | Three runbooks: queue stuck, provider outage, bad deploy — linked from the alerts |
| Staging | Separate Supabase project, used by CI and E2E |
| CI/CD | Existing gates + `npm audit`, gitleaks, Dependabot, `supabase db diff` in the PR |
| Migrations | Reviewed, ordered before the app deploy, expand/contract |
| Rollback | Vercel instant rollback for code; forward-fix plus restore for schema |

---

## 3. Mobile readiness

**[D-1] The React Native vs native decision is unresolved and this blueprint does not assume either.** The repository provides no evidence for a choice: no Expo config, no shared-package structure, no mobile branch. The audits establish only that the decision changes scope materially.

| If React Native/Expo | If native Swift/Kotlin |
|---|---|
| `lib/xp`, `lib/leaderboard`, `lib/srs`, `lib/skillRadar`, `lib/capstones` can be shared as a workspace package | Every rule must move server-side first — a genuine backend project |
| Design tokens shareable from `theme/tokens.ts` | Tokens must be exported to a platform-neutral format |
| I-08's typed client is directly reusable | Contract must be formalized (OpenAPI) for codegen |

**Principles that hold either way — build these regardless:**

1. Bearer-first authentication on every route (I-06).
2. A real `/api/auth/refresh` contract; no middleware dependency.
3. `code`-based errors; `error` is display-only (I-06/I-07).
4. API versioning policy before any client ships.
5. Server-authoritative business rules for anything that affects XP, ranking, or unlocks.
6. No web-only payload shapes (`revalidatePath` side effects, cookie-dependent semantics).

**Do not build now:** shared token packages, OpenAPI codegen, device attestation, push infrastructure. All are cheap once **[D-1]** is answered and wasteful before.

---

## 4. Implementation initiatives

Each initiative below is decomposed into batches. **One batch = one objective = one commit.**

---

### I-01 · Environment & CI isolation · **P0**

**Goal:** CI can never touch production data.
**Solves:** S2-H1, R-01, R-11, R-12 (staging half).
**Files:** `apps/web/vitest.setup.ts`, `.github/workflows/ci.yml`, new `.github/dependabot.yml`.
**Dependencies:** None. **This is the root of the dependency graph.**
**Risk:** Low. **[V]** Needs a second Supabase project provisioned by a human.

| Batch | Objective | Files | Gate |
|---|---|---|---|
| 1 | Make test env vars a hard override in test mode so a real value cannot win | `vitest.setup.ts` | test, typecheck, lint |
| 2 | Point CI at the staging Supabase project; remove production secrets from `build-and-validate` | `ci.yml` | CI green on a PR |
| 3 | Add `npm audit --audit-level=high`, gitleaks, `--ignore-scripts` | `ci.yml` | CI green |
| 4 | Add Dependabot config | `.github/dependabot.yml` | CI green |

**Definition of done:** A deliberately destructive test run against CI credentials cannot alter production. Verified by inspecting the staging project's row counts after a CI run.

---

### I-02 · Database trust boundary · **P0**

**Goal:** PostgREST is safe assuming the app does not exist.
**Solves:** S2-C1, S2-C2, S2-C4, S2-H11, S2-H12, C-4.
**Files:** new migrations under `supabase/migrations/`; `app/(portfolio)/p/[username]/page.tsx` and `app/verify/[certificateId]/page.tsx` if reads move to RPCs.
**Dependencies:** I-01 (test the migrations somewhere that is not production).
**Risk:** **High** — a wrong policy breaks the public portfolio or certificate verification.
**[V] Before batch 1:** run the ACL query from `SECURITY_AUDIT_STAGE2.md` §S2-C1 to learn whether the grants are already revoked.

| Batch | Objective | Files | Gate |
|---|---|---|---|
| 1 | `REVOKE EXECUTE` from `PUBLIC/anon/authenticated` on the four `SECURITY DEFINER` functions; grant to `service_role`; add `SET search_path` to `increment_portfolio_view_count` | one migration | staging apply + verify app still works + RLS regression test |
| 2 | Replace `users` anon-read policy with a column-scoped public-profile view or `SECURITY DEFINER` function; deny `anon` direct `SELECT` | one migration + portfolio page read path | staging + E2E on public portfolio |
| 3 | Scope `certificates` read to lookup-by-code; drop the blanket policy | one migration + `/verify` read path | staging + E2E on certificate verification |
| 4 | Remove `waitlist` anon INSERT policy; drop `using(true)` on leaderboard snapshots and cohort members | one migration | staging + waitlist route test |
| 5 | Add regression tests asserting the anon key **cannot** read `users.email` / `is_admin`, dump `certificates`, or insert into `waitlist` | `lib/__tests__/rls.test.ts` | test |

**Definition of done:** A script using only the anon key can retrieve nothing beyond intended public profile fields.

---

### I-03 · Unified abuse control · **P0**

**Goal:** One declarative abuse layer covering every unauthenticated endpoint.
**Solves:** S2-C5, S2-C6, C-3, signup/login/reset/resend/waitlist limiting, spoofable IP, fail-open, global ceilings, enumeration, CAPTCHA.
**Files:** `lib/rate-limit.ts`, new migration, `app/api/auth/{signup,login,resend-verification,update-password}/route.ts`, `app/api/waitlist/route.ts`.
**Dependencies:** I-01. Pairs with I-07 for declarative application.
**Risk:** Medium — fail-closed can lock out legitimate users if thresholds are wrong.
**[D-2]** CAPTCHA provider. Recommendation: **Cloudflare Turnstile** (free, privacy-preserving, no account linkage).

| Batch | Objective | Files | Gate |
|---|---|---|---|
| 1 | Atomic rate-limit RPC — single `INSERT … ON CONFLICT DO UPDATE … RETURNING`, modelled on `increment_daily_email_quota()` | one migration | staging + concurrency test proving N parallel requests cannot exceed the limit |
| 2 | Rewrite `evaluatePersistentRateLimit()` to call the RPC; add a `failMode: 'open' \| 'closed'` parameter | `lib/rate-limit.ts` | test, typecheck |
| 3 | Platform-trusted client IP helper (Vercel-provided, not leftmost XFF) | new `lib/security/client-ip.ts` + signup/telemetry call sites | test |
| 4 | Apply limits to `login`, `update-password`, `waitlist`; add per-IP limit to `resend-verification`; fail-closed on all auth routes | 5 route files | test + security regression test |
| 5 | Global signup ceiling — a platform-wide counter above per-key limits | migration + signup route | staging + load test |
| 6 | Close enumeration oracles — uniform responses on signup / login / resend | 3 route files | test asserting response equality for existing vs non-existing accounts |
| 7 | Turnstile on signup, resend-verification, password reset | 3 routes + 3 client forms | E2E + staging |

**Definition of done:** A scripted burst from rotating IPs against every unauthenticated endpoint is bounded by a measurable global ceiling.

---

### I-04 · Governed email egress · **P0**

**Goal:** One transport. The ungated path ceases to exist.
**Solves:** C-2, D-08 (overridden), R-02, D-01, welcome-before-verification, `refCode`, quota, suppression, dedup.
**Files:** `lib/email.ts`, `lib/notifications/providers/*`, `lib/notifications/queue/processor.ts`, `lib/auth.ts`, `app/api/auth/{signup,send-email-hook}/route.ts`, one migration.
**Dependencies:** I-01, I-05 Batch 1 (fix the queue before routing everything through it).
**Risk:** **High** — this path carries verification and password reset. A mistake means nobody can sign in.

| Batch | Objective | Files | Gate |
|---|---|---|---|
| 1 | Add `from_email` / `reply_to` columns to `email_queue` — removes D-08's stated blocker | one migration | staging |
| 2 | Make `sendEmail()` consult `EMAIL_ENABLED` with an explicit `critical` bypass — **closes the kill-switch gap without restructuring** | `lib/email.ts` | test + staging toggle verification |
| 3 | Global send ceiling + circuit breaker above failover (D-01) | migration + `lib/notifications/providers/index.ts` | test + staging |
| 4 | Re-point `sendEmail()` internals at `sendEmailWithFailover()`; keep the signature identical | `lib/email.ts` | full email test suite + staging send of every template |
| 5 | Route the auth hook through the queue with `critical` priority | `app/api/auth/send-email-hook/route.ts` | **E2E: real signup → verification email received on staging** |
| 6 | Move `ensureUserProfile()` and the welcome dispatch behind verification; validate `refCode` before storing | `lib/auth.ts`, `app/api/auth/signup/route.ts`, `app/api/auth/callback/route.ts` | E2E signup→verify→welcome ordering |
| 7 | Migrate remaining `lib/email.ts` callers (contact, waitlist, campaigns, admin test-send) | 5 route files | test + staging |

**Definition of done:** `grep` finds no provider `fetch` outside `lib/notifications/providers/`. Flipping `EMAIL_ENABLED` off stops every send except explicitly-critical auth mail.

---

### I-05 · Queue & scheduler reliability · **P1** (Batch 1 is **P0**)

**Goal:** No email is ever stranded; the scheduler is trustworthy.
**Solves:** R-03, R-14, D-06, R-15.
**Files:** one migration, `lib/notifications/queue/processor.ts`, `app/api/admin/emails/queue/[id]/retry/route.ts`, `vercel.json`, `.github/workflows/notification-scheduler.yml`.
**Dependencies:** I-01.
**Risk:** Medium.

| Batch | Objective | Files | Gate | Priority |
|---|---|---|---|---|
| 1 | Stale-`processing` reclaim predicate in `claim_email_queue_items()`; allow admin retry of stale rows | migration + retry route | staging: strand a row, confirm reclaim | **P0** |
| 2 | Bounded concurrency (~10) in the send loop so a batch fits the window | `processor.ts` | test + staging timing | P1 |
| 3 | Retry jitter — multiply backoff by `[0.5, 1.5]` | `processor.ts` | test | P1 |
| 4 | Move cron to Vercel Cron; keep GH Actions as fallback for one week | `vercel.json`, scheduler workflow | staging + observed runs | P1 |
| 5 | Implement dead-letter recovery in `retry-failed`, or delete the route and its job | route + workflow | test | P1 |

---

### I-06 · Auth, session & API contract · **P1**

**Goal:** One resolver, one session owner, one machine-readable error contract.
**Solves:** F-02, F-05, F-09, S2-H2, S2-H3, S2-H4, 16 cookie-only routes, mobile auth.
**Files:** `lib/auth.ts`, `proxy.ts`, `lib/errors/api-response.ts`, `components/layout/AuthStateListener.tsx`, `app/api/auth/*`, 16 route files.
**Dependencies:** I-07 Batch 1 (the wrapper is where the resolver is applied).
**Risk:** **High** — every logged-in user passes through this.

| Batch | Objective | Files | Gate |
|---|---|---|---|
| 1 | `resolveActor()` — JWKS verification, Bearer-first then cookie, `is_admin` from DB; keep existing helpers delegating to it | new `lib/auth/resolve-actor.ts`, `lib/auth.ts` | test + E2E login |
| 2 | `proxy.ts` uses `resolveActor()`; stops deriving identity from an unverified payload | `proxy.ts` | test + E2E protected routes |
| 3 | `POST /api/auth/refresh` with server-side rotation; persist rotated cookies in the API path | new route + `lib/auth.ts` | test + E2E session expiry |
| 4 | Stop returning `session` in login/signup bodies; disable `localStorage` persistence; retire `AuthStateListener` and `/api/auth/session` | 4 files | **E2E: full login → navigate → refresh → logout** |
| 5 | Migrate the 16 cookie-only routes to `resolveActor()` | 16 route files | test + E2E lesson loop |
| 6 | `code` on 100% of route responses; retire the string classifier's primacy | `lib/errors/api-response.ts` + remaining routes | test |

**Definition of done:** A `curl` with only `Authorization: Bearer <token>` can complete a full lesson.

---

### I-07 · Route contract layer · **P1**

**Goal:** A route cannot be written without auth, validation, and an error envelope.
**Solves:** C-7, validation 11/126, error contract 59/126, rate limiting 8/126, CSRF 1/126.
**Files:** new `lib/api/with-route.ts`, `eslint.config.mjs`, then routes in waves.
**Dependencies:** I-03 (limiter), I-06 (resolver).
**Risk:** Low per batch, because migration is incremental.

| Batch | Objective | Files | Gate |
|---|---|---|---|
| 1 | `withRoute()` implementation + unit tests. **No route migrated yet.** | new file | test, typecheck |
| 2 | Migrate the 6 cron routes | `app/api/cron/*` | test |
| 3 | Migrate the 8 auth routes | `app/api/auth/*` | test + E2E auth |
| 4 | Migrate the 12 settings routes | `app/api/settings/*` | test |
| 5–8 | Migrate admin routes in four waves of ~15 | `app/api/admin/*` | test per wave |
| 9 | Migrate remaining learner routes | rest | test + E2E |
| 10 | ESLint rule banning raw handlers outside `withRoute()` | `eslint.config.mjs` | lint |

---

### I-08 · Typed data layer · **P1**

**Goal:** The compiler catches `amount` vs `xp_amount` before it ships.
**Solves:** C-1, leaderboard bug, `getTotalXp` truncation, unbounded `.select()`.
**Files:** new `lib/db/*`, then `lib/leaderboard-db.ts`, `lib/xp/xp-service.ts`, `lib/admin/dashboard-service.ts`, and 30 `DBChain` files over time.
**Dependencies:** None for the bug fixes; I-15 Batch 1 for a real fake.
**Risk:** Low — mechanical, and each file is independently verifiable.

| Batch | Objective | Files | Gate |
|---|---|---|---|
| 1 | **Fix `xp_events.amount` → `xp_amount`; stop discarding the query error** | `lib/leaderboard-db.ts` | test asserting non-zero weekly XP |
| 2 | `getTotalXp()` reads `users.total_xp` or a SQL aggregate | `lib/xp/xp-service.ts` | test with >1000 events |
| 3 | Bound every unbounded `.select()` — explicit `limit`, `count`, or `fetchAllRows()` | `leaderboard-db.ts`, `dashboard-service.ts` | test |
| 4 | `lib/db/` scaffolding + `xp` repository, `DBChain` deleted from `xp-service` | new + 1 file | test, typecheck |
| 5 | `leaderboard` repository | 1 file | test |
| 6 | `progress` repository | 1 file | test |
| 7+ | One repository per remaining aggregate, opportunistically | 1 file each | test |
| Last | ESLint rule banning `as unknown as` in `lib/db/` | `eslint.config.mjs` | lint |

---

### I-09 · Database invariants & retention · **P1**

**Goal:** Correctness enforced by the database, not by application memory.
**Solves:** duplicate XP, check-then-insert races, C-6, R-10.
**Files:** migrations, `lib/xp/xp-service.ts`, `app/api/cron/cleanup/route.ts`.
**Dependencies:** I-01. **Batch 1 must dedupe existing rows before adding the constraint.**
**Risk:** Medium — a UNIQUE constraint fails to apply if duplicates already exist.

| Batch | Objective | Files | Gate |
|---|---|---|---|
| 1 | Report existing duplicate `(user_id, source_type, source_id)` rows in `xp_events` — **read-only diagnostic first** | one script | manual review |
| 2 | Dedupe migration + `UNIQUE` constraint | one migration | staging apply, then production |
| 3 | `awardXp()` uses `ON CONFLICT DO NOTHING`; remove `hasXpEvent()` pre-check | `lib/xp/xp-service.ts` | concurrency test proving no duplicate award |
| 4 | Same pattern for capstone submission and lesson progress | 2 files | test |
| 5 | **[D-3]** Decide retention per table, then implement `/api/cron/cleanup` | cleanup route + migration | staging |
| 6 | Wire avatar orphan cleanup into the cron with `dryRun: false` | cleanup route | staging |

---

### I-10 · Observability & alerting · **P1**

**Goal:** Prodily detects its own failures before users do.
**Solves:** R-04, R-06, R-07, R-13, SLOs.
**Files:** `app/api/health/route.ts`, `proxy.ts`, `lib/monitoring/logger.ts`, `app/error.tsx` family, new client error reporting.
**Dependencies:** Stage 2 S2-H13 hardening before the telemetry endpoint carries more traffic (covered by I-03).
**Risk:** Low.

| Batch | Objective | Files | Gate |
|---|---|---|---|
| 1 | Exempt `/api/health` from the maintenance gate; report maintenance as a field, not an error status | `proxy.ts`, health route | test |
| 2 | **[V]** Attach an uptime monitor — configuration, not code | external | manual |
| 3 | Out-of-band alert channel for critical incidents (email or Telegram) | `lib/monitoring/logger.ts` | staging: trigger a critical incident, confirm delivery |
| 4 | Sentry for client + server | `app/layout.tsx`, `instrumentation.ts`, error boundaries | staging: force an error, find it in Sentry |
| 5 | Request-ID generation in `proxy.ts`, threaded into log context | `proxy.ts`, `lib/monitoring/logger.ts` | test |
| 6 | Convert the highest-value `console.*` calls (queue, auth, webhooks) to the structured logger | ~10 files | test |

---

### I-11 · Frontend data layer · **P2**

**Goal:** One typed client; components stop hand-rolling fetch state.
**Solves:** F-03, F-05 (client half), F-18.
**Dependencies:** I-06 Batch 6 (`code` everywhere).
**Risk:** Low — incremental.

| Batch | Objective | Gate |
|---|---|---|
| 1 | Typed API client wrapping `fetch`, branching on `code` | test, typecheck |
| 2 | Add SWR; wire the client into it | build |
| 3–6 | Migrate call sites by area — settings, academy, admin (two waves) | test per wave |
| 7 | Retry and offline detection in the client | test |

---

### I-12 · Frontend safety & correctness · **P0**

**Goal:** Close the live XSS and the silent-failure paths.
**Solves:** F-01, F-10, F-06, F-14.
**Files:** `lib/portfolio.ts`, 14 JSON-LD sites, `app/api/settings/profile/route.ts`, `app/error.tsx`, `components/layout/Topbar.tsx`, `lib/admin/session.ts`, dead components.
**Dependencies:** None. **All four batches are independent and safe to do first.**
**Risk:** Low.

| Batch | Objective | Files | Gate |
|---|---|---|---|
| 1 | `safeJsonLd()` helper escaping `<`, `>`, `&`; apply at all 14 `dangerouslySetInnerHTML` JSON-LD sites | new helper + 14 files | test asserting `</script>` in a bio cannot break out |
| 2 | Zod validation on the profile write — length caps on `bio`/`name`, scheme allowlist on the three URLs | `app/api/settings/profile/route.ts` | test |
| 3 | Rename `app/error.tsx` → `global-error.tsx`; add a segment `error.tsx` without the document shell | 2 files | build + manual |
| 4 | Logout navigates in `finally`, surfaces failure; extract one shared helper | `Topbar.tsx`, `lib/admin/session.ts` | E2E logout |
| 5 | Delete verified-dead components and the stale duplicate hook | ~7 files | build, typecheck |

---

### I-13 · Design system adoption · **P2 / ONGOING**

**Goal:** Primitives become the only way to build common UI.
**Solves:** F-04, F-13, F-15.
**Risk:** Low. **This runs continuously alongside feature work, not as a project.**

| Batch | Objective | Gate |
|---|---|---|
| 1 | Extend `ui/button.tsx` to cover observed variants; remove framer-motion from `ui/progress-bar.tsx` | build |
| 2 | Adopt `button` in the 10 highest-traffic files | build, visual check |
| 3 | Adopt `card` and `skeleton` in the dashboard and academy | build |
| 4 | Learner-side `EmptyState` / `ErrorState` mirroring the admin ones | build |
| 5 | axe-core in CI, failing on serious/critical | CI |
| 6 | Extend the CI hex guard beyond the four brand colors | CI |
| 7 | ESLint rule banning raw `<button>` in `components/` | lint |

---

### I-14 · Frontend performance · **P2**

**Goal:** The landing page stops shipping its whole tree as client JS.
**Solves:** F-07, F-17.
**Dependencies:** **[V]** Confirm with `next build` + Lighthouse before spending effort.

| Batch | Objective | Gate |
|---|---|---|
| 1 | Baseline measurement — bundle report + Lighthouse. **No code change.** | report |
| 2 | Extract animated wrappers; make `hero` and `portfolio` server components | build + Lighthouse delta |
| 3 | Same for the remaining five sections | build + Lighthouse delta |
| 4 | Server-side avatar resize at upload; document why `unoptimized` stays | test |

---

### I-15 · Testing foundation · **P1**

**Goal:** Tests exercise production-like behavior.
**Solves:** R-08, R-09, C-8.
**Dependencies:** I-01 (staging project).
**Risk:** Low.

| Batch | Objective | Gate |
|---|---|---|
| 1 | One shared Supabase fake, complete enough that production code needs no defensive optional chaining | test |
| 2 | Remove `?.select?.` mock-shaped code now that the fake is complete | test |
| 3 | E2E: signup → verify → first lesson → XP | E2E on staging |
| 4 | E2E: login → session persistence → protected route → logout | E2E on staging |
| 5 | E2E: password reset end to end | E2E on staging |
| 6 | Widen the vitest `include` so component tests are possible; add three for the primitives | test |

---

### I-16 · Deployment & operations safety · **P1**

**Goal:** Schema changes are reviewed, ordered, and recoverable.
**Solves:** R-05, R-16, rollback.
**[V] Before batch 1:** check a recent Actions log to determine whether `deploy-supabase` runs at all.

| Batch | Objective | Gate |
|---|---|---|
| 1 | Fix the `if: env.…` guard on the migration step so it cannot silently skip | CI observed |
| 2 | `supabase db diff` output posted to the PR | CI |
| 3 | GitHub Environment approval gate on the migration job | CI |
| 4 | Order the app deploy after the migration job | CI |
| 5 | Three runbooks: queue stuck, provider outage, bad deploy | review |

---

## 5. Dependency graph

```
                          I-01  Environment & CI isolation
                                       │
        ┌──────────────┬───────────────┼───────────────┬──────────────┐
        ▼              ▼               ▼               ▼              ▼
      I-02          I-09 B1-2       I-15 B1-2       I-05 B1        I-16
   DB trust       XP invariants    shared fake    queue reclaim   deploy gate
   boundary            │                │              │
        │              │                │              │
        └──────────────┴────────┬───────┴──────────────┘
                                ▼
                     I-03  Unified abuse control
                                │
                                ▼
                     I-04  Governed email egress
                                │
                                ▼
                    ═══ SIGNUP MAY REOPEN ═══


   I-07 B1 (withRoute)  ──►  I-06 (auth resolver)  ──►  I-07 B2-10 (route migration)
                                     │                          │
                                     ▼                          ▼
                            I-06 B6 (code on 100%)      I-08 (typed data layer)
                                     │
                                     ▼
                            I-11 (frontend data layer)
                                     │
                                     ▼
                          ═══ MOBILE-READY API ═══
                                     │
                                     ▼
                              [D-1] RN vs native


   Independent, no blockers:  I-12 (frontend safety)  ·  I-08 B1-3 (bug fixes)
                              I-10 (observability)    ·  I-13, I-14
```

**Two critical paths.** The **signup path** (I-01 → I-02/I-05 B1 → I-03 → I-04) gates reopening registration. The **contract path** (I-07 B1 → I-06 → I-08 → I-11) gates mobile. They are independent and can run in parallel by different sessions.

---

## 6. Validation gates by change class

| Change class | Gate |
|---|---|
| Internal refactor (I-08, I-13, I-15 B1-2) | typecheck + lint + unit tests |
| New route / contract (I-07) | above + route-level tests |
| Frontend UI (I-12 B3-5, I-13, I-14) | above + build + manual visual check |
| **Auth / session (I-06)** | above + **security regression tests** + **E2E full session lifecycle on staging** |
| **Database migration (I-02, I-09)** | above + **staging apply** + **rollback rehearsal** + **RLS regression tests** |
| **Email (I-04)** | above + **real send verified on staging for every template** + kill-switch toggle verification |
| **Abuse control (I-03)** | above + **concurrency test proving the limit holds** + load test |
| Observability (I-10) | above + staging verification that the signal actually arrives |

---

## 7. Production rollout strategy

**Standing rules**
1. Staging first for anything touching database, auth, or email.
2. Expand/contract: add columns and policies before code uses them; remove old paths only after the new one is live.
3. Every migration must be backward-compatible with the currently-deployed app, because deploy ordering is not yet guaranteed (until I-16 B4).
4. Feature-flag anything reversible. `EMAIL_ENABLED` and `QUEUE_PROCESSING_ENABLED` already exist and should gate I-04 and I-05.
5. Watch for one full cron cycle (5 min) plus one business day after any email or queue change.

**Rollback**
- Code: Vercel instant rollback. **[V]** confirm this is enabled on the current plan.
- Schema: forward-fix. Restore is the fallback and is only real once I-01/R-12 backups are confirmed.
- Feature flags: instant, and the preferred lever for anything they cover.

### The signup reopening sequence

Signup stays **CLOSED** through every step until the last.

| Step | Action | Signup |
|---|---|---|
| 1 | I-01 complete — CI isolated, staging exists | Closed |
| 2 | I-02 complete — anon key cannot read the roster | Closed |
| 3 | I-05 B1 — queue reclaims stranded rows | Closed |
| 4 | I-04 B2 — kill switch covers the direct transport (**gives you a working lever before you need it**) | Closed |
| 5 | I-03 B1–B6 — atomic, fail-closed, unspoofable limits on all five endpoints; enumeration closed | Closed |
| 6 | I-04 B3–B6 — global ceiling, circuit breaker, one transport, verification-before-side-effects | Closed |
| 7 | I-03 B7 — Turnstile on all three email-triggering endpoints | Closed |
| 8 | I-10 B1–B3 — alerting live, so an abuse spike pages someone | Closed |
| 9 | **[D-4]** Resolve the 1,233 flagged accounts (ban vs delete) | Closed |
| 10 | Reopen to a **limited window** — e.g. 100 signups/day global ceiling — and watch for 72 hours | **Open, capped** |
| 11 | Raise the ceiling gradually while the provider send rate stays flat | Open |

**Email provider rollout:** change `PRIMARY_EMAIL_PROVIDER` on staging, send one of every template, verify `provider` and `provider_attempts` on the queue rows, then switch production during low traffic and watch the dead-letter count for one hour.

**Existing users/data:** I-02 changes read paths, not data. I-09 B2 deletes duplicate `xp_events` rows — **run B1's diagnostic first and review what would be deleted.** I-06 B4 invalidates the localStorage session bridge, so **all users will be logged out once**; ship it at a low-traffic hour and say so in the release note.

---

## 8. Scaling roadmap

| Scale | Must build now | Build when measured | Do not build |
|---|---|---|---|
| **~1K (today)** | Everything in P0. These are correctness and safety, not scale. Email provider quota is the only capacity constraint and it is already binding. | — | Any infrastructure |
| **~10K** | I-08 B1–B3 (the 1,000-row cap produces confidently wrong data, not errors) · retention (I-09 B5) · Supabase Pro + Vercel Pro | JWKS verification when auth latency shows in Speed Insights | Redis, workers, replicas |
| **~100K** | Bounded queue concurrency (I-05 B2) · SQL-side aggregation for leaderboard and dashboard · incremental `xp_events` trigger | Dedicated queue worker if batches still cannot drain · read replica if admin queries measurably degrade | Kafka, Kubernetes, microservices |
| **~1M+** | Materialized leaderboard snapshots (`weekly_leaderboard_snapshots` already exists) · `xp_events` partitioning or rollup | Read replica · dedicated worker process · managed queue | Microservices, service mesh, multi-region |

### Infrastructure verdicts

| Technology | Verdict |
|---|---|
| **Redis** | **No, at any scale here.** Its two plausible uses — rate limiting and caching — are served by an atomic Postgres statement (the pattern already exists in `increment_daily_email_quota()`) and by Next's data cache. Revisit only if per-instance cache divergence becomes a user-visible complaint. |
| **Kafka** | **No.** One producer, one consumer, emails-per-hour volume. `email_queue` with `SKIP LOCKED` is correct and already built. |
| **Kubernetes** | **No.** One Next.js app on serverless. |
| **Microservices** | **No.** Stage 1 reached this independently. The problems are boundary discipline inside the monolith; splitting adds network partitions to a system that cannot yet detect its own failures. |
| **Managed queue** | **Not yet — closest call.** The queue is correct; what it lacks is a reliable trigger, and Vercel Cron supplies that free. If delays persist after I-05 B4, Inngest's free tier is the cheapest correct answer. |
| **Dedicated worker** | **Not before ~100K**, and only if bounded concurrency proves insufficient. |
| **Read replica** | **Only on measured admin query latency.** Not on a user count. |
| **Additional databases** | **No.** One Postgres serves every workload here. |

---

## 9. Tooling strategy

| Category | Tool | Solves | Free tier | Outgrow when | Adopt |
|---|---|---|---|---|---|
| Uptime | UptimeRobot / Better Stack | R-04 | Yes — 5-min checks | Multi-region needed | **Now** |
| Error tracking | Sentry | R-06, R-07 | Yes — 5k events/mo | ~10K users | **Now** |
| CI security | gitleaks + `npm audit` | R-11 | Yes | Never | **Now** |
| Dependencies | Dependabot | R-11 | Yes | Never | **Now** |
| DB staging | Second Supabase project | R-01, R-08, R-12 | Yes | When staging needs prod-scale data | **Now** |
| Backups | Supabase Pro (~$25/mo) | R-12 | **No** | — | **Now, if [V] confirms none exist** |
| Alerting | Telegram bot / email from the logger | R-04 | Yes | Team > 3 → PagerDuty | **Now** |
| Analytics | Vercel Analytics + GA4 | — | Already mounted | — | Keep |
| Performance | Vercel Speed Insights | I-14 baseline | Already mounted | — | Keep |
| Cron | Vercel Cron | R-14 | Included with Pro | Sub-minute needed | **Next** |
| CAPTCHA | Cloudflare Turnstile | I-03 B7 | Yes | Never | **Next** |
| Email | Brevo + Resend | — | ~300/day free | ~1K users | Paid **now** |

**Total: ~$25–45/mo now**, most of the value free. Do not add anything not listed.

---

## 10. Technical debt register

| ID | Problem | Impact today | Target | Priority | Trigger | Fix mode |
|---|---|---|---|---|---|---|
| DEBT-01 | 451 `as unknown as`, 30 `DBChain` | Silent runtime bugs | Typed `lib/db/` | P1 | — | **Opportunistic** — convert on touch, after I-08 B4 |
| DEBT-02 | 39 components >300 lines | Untestable, unreusable | Split | P2 | Touching the file | **Opportunistic** |
| DEBT-03 | Design system at 12/319 | Compounding UI cost | Primitives are default | P2 | — | **Opportunistic** (I-13) |
| DEBT-04 | 272 hex, 867 arbitrary px, 3 radii | Theming is per-file | Tokens + one radius scale | P2 | I-13 underway | **Opportunistic** |
| DEBT-05 | Un-workspaced monorepo, 3 lockfiles, bidirectional `scripts/` ↔ `apps/web` imports | Build fragility | npm workspaces, one lockfile | P3 | A second package appears | **Trigger-based** |
| DEBT-06 | Two settings services, duplicate hook, mixed hook naming | Navigation cost | One convention | P3 | Touching the file | **Opportunistic** |
| DEBT-07 | `unoptimized` on all remote images | 2 MB avatars into 96 px boxes | Server-side resize | P2 | I-14 B4 | **Proactive** — and keep `unoptimized` |
| DEBT-08 | 294 unstructured `console.*` | Vercel logs unredacted, uncorrelated | Structured logger | P1 | — | **Opportunistic** after I-10 B5 |
| DEBT-09 | No API versioning (`v2` on 4/126) | Blocks mobile | Versioning policy | P2 | **[D-1]** resolved | **Trigger-based** |
| DEBT-10 | 25 stale local branches | None | Pruned | P3 | — | **Opportunistic** |

**Explicitly do NOT fix just because an audit named it:**
- **`sharp`/libvips CVEs** — not reachable (§1.1). Do not upgrade Next for this.
- **`MarkdownRenderer` sanitization** — delete instead (§1.1).
- **Non-constant-time `===` on `CRON_SECRET`** — impractical to exploit over HTTP. Fix only when the file is touched.
- **`generateMetadata` on 30/61 pages** — most uncovered pages are admin (`noindex`). Verify before treating as a gap.
- **The 13 non-user-fed JSON-LD sites** — fix them with the shared helper in I-12 B1, but do not treat them as vulnerabilities.
- **Retiring the auth error string classifier entirely** — it provides real UX value. Demote it below `code`; do not delete it.

---

## 11. ADR recommendations

Existing ADRs run 001–006. New ones start at **007**. Only decisions that are expensive to reverse warrant an ADR.

| ADR | Decision | Alternatives | Why it matters | Write when |
|---|---|---|---|---|
| **007 — Database trust model** | Anon-reachable tables are protected by RLS alone and must be safe assuming the app does not exist; service role only behind `withRoute()` | Full RLS everywhere; service role everywhere with no policies | The absence of this decision is what shipped S2-C2 and S2-C4 | **Before I-02 B1** |
| **008 — Authentication & session architecture** | Cookies for web, Bearer for native, one JWKS-verifying resolver, no client session bridge | Keep the bridge; adopt `@supabase/ssr`; separate mobile auth service | Touches every request and forces the mobile shape | **Before I-06 B1** |
| **009 — Unified email egress** | One transport through the queue; critical mail bypasses the quota, never the ceiling. **Supersedes D-08's deferral** | Keep two transports; move to a managed provider abstraction | Root cause of both incidents; must record why D-08 was overturned | **Before I-04 B4** |
| **010 — Abuse control & rate limiting** | Atomic RPC, platform-trusted IP, multi-dimensional keys, **fail-closed on auth**, global ceilings | Fail-open; Redis; provider-level limits only | Fail-open vs closed is a deliberate availability/security trade | **Before I-03 B2** |
| **011 — API route contract** | `withRoute()` is the only way to define a route; `code` is the contract, `error` is display copy | Per-route convention; OpenAPI-first; tRPC | Determines mobile readiness and i18n feasibility | **Before I-07 B1** |
| **012 — Staging & environment separation** | Separate Supabase project; CI never holds production credentials | Single project with a test schema; ephemeral branches | Already caused one production incident | **Before I-01 B2** |
| **013 — Background processing** | Postgres-backed queue + Vercel Cron. Explicitly rejects Redis, Kafka, managed queues, dedicated workers at current scale | Inngest; QStash; a worker process | Records *why not*, preventing the question being re-litigated | **With I-05 B4** |
| **014 — Mobile client strategy** | **[D-1] Unresolved.** | React Native/Expo vs native Swift/Kotlin | Determines whether domain logic must move server-side | **When [D-1] is answered** — do not write it speculatively |

**No ADR for:** frontend data-library choice (SWR is reversible), design-system adoption (a practice, not a decision), retention windows (a policy, belongs in `ISSUES_KNOWN.md`), or tooling picks.

---

## 12. Master roadmap

### PHASE 0 — VERIFY / CONTAIN
**Not code. Human and dashboard work. Do this first — it changes what the rest should be.**

| # | Task | Why |
|---|---|---|
| 1 | **[V]** What Supabase plan? Does it have backups/PITR? | The only failure with no remedy |
| 2 | **[V]** Run the `SECURITY DEFINER` ACL query (Stage 2 §S2-C1) | Determines whether S2-C1 is live or already closed |
| 3 | **[V]** Does `deploy-supabase` actually run? Check one Actions log | Two opposite problems; you don't yet know which |
| 4 | **[V]** Is the CI Supabase project the production project? | Determines whether R-01 is live on every PR |
| 5 | **[V]** Count `email_queue` rows in `processing` older than 15 min | Quantifies R-03's realized cost |
| 6 | **[V]** Production Supabase redirect allowlist scope | Determines whether `emailRedirectTo` is exploitable |
| 7 | **[V]** Vercel plan, `maxDuration`, log retention, rollback enabled | Determines how often R-03 fires |

**Signup: CLOSED.** **Outcome:** the unknowns become known. **Rollback:** N/A — read-only.

### PHASE 1 — SECURITY & PRODUCTION FOUNDATION
**Initiatives:** I-01, I-12, I-02, I-05 B1, I-08 B1–B3, I-09 B1–B4, I-03, I-04, I-10 B1–B3
**Dependencies:** Phase 0 answers; I-01 gates I-02/I-03/I-04.
**Gates:** staging apply + RLS regression + concurrency tests + real staging sends.
**Signup:** CLOSED throughout; reopens **capped** at the end (§7).
**Rollback:** feature flags for email/queue; forward-fix for schema; Vercel rollback for code.
**Outcome:** No live vulnerabilities, CI cannot touch production, abuse control holds under concurrency, email has one governed path, failures page a human.

### PHASE 2 — CORE ARCHITECTURE
**Initiatives:** I-07, I-06, I-08 B4+, I-16, I-15
**Dependencies:** I-07 B1 → I-06 → I-07 B2-10; I-01 → I-15.
**Gates:** full E2E session lifecycle for I-06; unit + typecheck for refactors.
**Signup:** open, capped. **Rollback:** per-batch; I-06 B4 logs everyone out once — announce it.
**Outcome:** One route contract, one auth resolver, a typed data layer, real E2E coverage, safe migrations.

### PHASE 3 — FRONTEND & MOBILE READINESS
**Initiatives:** I-11, I-14, I-13 (ongoing), **[D-1]** decision
**Dependencies:** I-06 B6 → I-11.
**Gates:** build + Lighthouse delta + axe-core.
**Signup:** open. **Outcome:** Typed client with caching; landing page off the client-JS path; the API is mobile-consumable.

### PHASE 4 — RELIABILITY & OPERATIONS
**Initiatives:** I-10 B4–B6, I-05 B2–B5, I-09 B5–B6, I-16 B5
**Gates:** staging verification that each signal arrives.
**Outcome:** Structured logs with correlation IDs, Sentry, Vercel Cron, retention implemented, runbooks written, SLOs measured.

### PHASE 5 — SCALE & OPTIMIZATION
**Trigger-based only.** SQL-side aggregation, materialized leaderboard, incremental XP trigger, read replica. Nothing here is scheduled; each waits on a measurement.

### ONGOING
I-13 design system, DEBT-01/02/03/04/06 opportunistically, ADRs as decisions are made, docs reconciled (`ARCHITECTURE.md` says 41 migrations and 100 test files; actual is 44 and 113).

---

## 13. Final decision table

| Initiative | Priority | Why | Depends on | Batches | Do now? |
|---|---|---|---|---|---|
| I-01 Environment & CI isolation | **P0** | CI can write to production; already caused an incident | — | 4 | **Yes** |
| I-12 Frontend safety | **P0** | Live XSS; silent logout failure | — | 5 | **Yes** |
| I-02 Database trust boundary | **P0** | Anon key reads the learner roster | I-01, [V]#2 | 5 | **Yes** |
| I-05 B1 Queue reclaim | **P0** | Auth email silently lost, unrecoverable | I-01 | 1 | **Yes** |
| I-08 B1–B3 Data bug fixes | **P0** | Leaderboard reports zero; XP totals truncate | — | 3 | **Yes** |
| I-09 B1–B4 DB invariants | **P0** | Duplicate XP awardable | I-01 | 4 | **Yes** |
| I-03 Unified abuse control | **P0** | Gates signup reopening | I-01, [D-2] | 7 | **Yes** |
| I-04 Governed email egress | **P0** | Root cause of both incidents | I-01, I-05 B1 | 7 | **Yes** |
| I-10 B1–B3 Alerting | **P0** | Cannot detect failures before users | — | 3 | **Yes** |
| I-16 Deployment safety | P1 | Migrations may never deploy | [V]#3 | 5 | After Phase 0 |
| I-15 Testing foundation | P1 | 1,112 green tests missed 3 prod bugs | I-01 | 6 | Phase 2 |
| I-07 Route contract layer | P1 | Every route re-litigates auth/validation | I-03, I-06 | 10 | Phase 2 |
| I-06 Auth & API contract | P1 | Blocks mobile; dual session stores | I-07 B1 | 6 | Phase 2 |
| I-08 B4+ Typed data layer | P1 | Compiler must catch column typos | I-15 B1 | 7+ | Phase 2 |
| I-05 B2–B5 Queue/scheduler | P1 | Throughput ceiling; unreliable cron | I-01 | 4 | Phase 2 |
| I-09 B5–B6 Retention | P1 | Unbounded table growth | [D-3] | 2 | Phase 4 |
| I-10 B4–B6 Observability | P1 | No client errors; unstructured logs | — | 3 | Phase 4 |
| I-11 Frontend data layer | P2 | 126 hand-rolled fetches | I-06 B6 | 7 | Phase 3 |
| I-14 Frontend performance | P2 | Landing page ships as client JS | [V] baseline | 4 | Phase 3 |
| I-13 Design system | P2 | 12/319 adoption | — | 7 | Ongoing |

---

## The first 10 implementation batches

Give these to Antigravity **in this order, one at a time.** Each is bounded, independently testable, and produces one commit. None requires this document in context — the "Prompt should say" column is the brief.

| # | Batch | Files | Prompt should say | Gate |
|---|---|---|---|---|
| 1 | **Test isolation** (I-01 B1) | `apps/web/vitest.setup.ts` | In test mode, force `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `NEXT_PUBLIC_SUPABASE_ANON_KEY` to mock values — **override rather than fall back**, so a real value in the environment cannot win. Currently `X = process.env.X \|\| 'mock'`, which disables the guard exactly in CI. | `npm test`, typecheck, lint |
| 2 | **Leaderboard column bug** (I-08 B1) | `apps/web/lib/leaderboard-db.ts` | Line 138 selects `xp_events.amount`; the column is `xp_amount`. Fix the select, the type at line 141, and the reducer at line 160. Also stop discarding the query `error` — log it. Add a test asserting weekly XP is non-zero when events exist. | `npm test` |
| 3 | **XP total truncation** (I-08 B2) | `apps/web/lib/xp/xp-service.ts` | `getTotalXp()` fetches every `xp_events` row and sums in JS; PostgREST truncates at 1000 rows. Read `users.total_xp` (maintained by the `update_user_xp_and_level` trigger) or use a SQL aggregate. Add a test with >1000 events. | `npm test` |
| 4 | **JSON-LD escaping** (I-12 B1) | new `apps/web/lib/seo/safe-json-ld.ts` + 14 call sites | `JSON.stringify` does not escape `<` or `/`, so a user-supplied `bio` can break out of a `<script>` block. Add `safeJsonLd()` escaping `<`, `>`, `&`, and apply it at every `dangerouslySetInnerHTML` JSON-LD site — start with `app/(portfolio)/p/[username]/page.tsx:160`. Add a test that `</script>` in a bio cannot escape. | `npm test`, build |
| 5 | **Profile input validation** (I-12 B2) | `apps/web/app/api/settings/profile/route.ts` | The route writes `name`, `bio`, `avatar_url`, `linkedin_url`, `github_url`, `website_url` with only `.trim()`. Add a zod schema: length caps on `name` and `bio`, `https`-only scheme allowlist on the three URLs, and reject `avatar_url` from this route entirely (it has its own upload endpoint with MIME and size checks). | `npm test`, typecheck |
| 6 | **Global error boundary** (I-12 B3) | `apps/web/app/error.tsx` → `global-error.tsx` | `app/error.tsx` renders its own `<html>`/`<body>`, which only `global-error.tsx` may do — and no `global-error.tsx` exists, so root-layout errors have no boundary. Rename it, then add a plain segment `error.tsx` without the document shell. | build, manual |
| 7 | **Logout reliability** (I-12 B4) | `components/layout/Topbar.tsx`, `lib/admin/session.ts` | Both wrap `signOut()`, the cookie-clearing fetch, and navigation in one `try` whose `catch` only logs — so on a network failure the user is not navigated and sees nothing. Navigate in `finally`, surface the failure, and extract one shared helper both call. | E2E logout |
| 8 | **Delete dead code** (I-12 B5) | 7 files | Delete these verified-unreferenced files: `components/forms/ReflectionForm.tsx`, `components/forms/waitlist-form.tsx`, `components/dashboard/DashboardSkeleton.tsx`, `components/admin/AdminMultiSelect.tsx`, `components/marketing/sections/skill-radar-section.tsx`, `components/quiz/QuizOption.tsx`, and `lib/hooks/useUsageTimeTracker.ts` (a stale divergent copy of `hooks/useUsageTimeTracker.ts`). Also delete `components/ui/MarkdownRenderer.tsx` — its only importer was `ReflectionForm`, and it renders `marked` output unsanitized. | build, typecheck, `npm test` |
| 9 | **Health endpoint** (I-10 B1) | `apps/web/proxy.ts`, `app/api/health/route.ts` | `/api/health` is not in the proxy's `isExemptApi` list, so it returns 503 `MAINTENANCE_MODE` during maintenance and runs a settings DB lookup per poll. Exempt it, and add a `maintenance: boolean` field to the response instead of failing. An uptime monitor must not page for planned maintenance. | `npm test` |
| 10 | **Queue stale-job reclaim** (I-05 B1) | new migration + `app/api/admin/emails/queue/[id]/retry/route.ts` | `claim_email_queue_items()` selects only `pending`/`retrying`, so a row stranded in `processing` (a killed cron run) is never retried — and `retry/route.ts:38` refuses to retry `processing` rows. Add `OR (status = 'processing' AND processing_at < NOW() - INTERVAL '15 minutes')` to the claim predicate, and allow admin retry of stale `processing` rows. | staging apply; strand a row and confirm reclaim |

**Notes on this ordering:** batches 1–9 touch no migration and carry near-zero blast radius. Batch 10 introduces a migration and should go to staging first — which is why **[V]#1 and #4 from Phase 0 should be answered before it runs.** Signup stays **CLOSED** through all ten; reopening requires I-03 and I-04, which follow.

---

## Open decisions

| ID | Decision | Blocks | Recommendation |
|---|---|---|---|
| **[D-1]** | React Native/Expo vs native Swift/Kotlin | ADR-014, DEBT-09, scope of moving domain logic server-side | Answer before Phase 3. The blueprint works either way; only the effort changes. |
| **[D-2]** | CAPTCHA provider | I-03 B7, signup reopening | Cloudflare Turnstile — free, privacy-preserving |
| **[D-3]** | Retention windows per table | I-09 B5 | 90 days for `system_errors` and delivery events; 30 for timeline; immediate for expired `rate_limits`. Confirm audit-log obligations. |
| **[D-4]** | The 1,233 flagged accounts — ban or delete | Signup reopening step 9 | Ban (reversible), per the incident doc's own recommendation |
| **[D-5]** | Infrastructure budget | Backups, Vercel/Supabase Pro | ~$25–45/mo now; ~$65–95/mo at 10K |
| **[D-6]** | Rate limiting fail-open or fail-closed | ADR-010, I-03 B2 | **Closed** on auth and email-triggering endpoints; open elsewhere |
| **[D-7]** | Who is on call, through what channel | I-10 B3 | Needs a destination; alerting nobody in particular is what the current design already does |

---

*End of blueprint. Planning only. No code, migrations, configuration, dependencies, or infrastructure modified. No fixes implemented. No branches created. Nothing pushed.*

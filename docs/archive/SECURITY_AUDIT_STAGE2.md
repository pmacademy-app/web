# Prodily Production Security Audit — Stage 2

**Audit branch:** `architecture-audit-stage1`
**Base:** `main` @ `2b8d281` (= `origin/main`)
**Date:** 2026-09-08
**Scope:** Read-only security architecture audit. No application code, tests, configuration, or migrations were modified. **S1 was not implemented.**
**Inputs:** Stage 1 (`docs/ARCHITECTURE_AUDIT_STAGE1.md`), `INCIDENT_2026-09-06_SIGNUP_ABUSE.md`, `INCIDENT_2026-09-08_SIGNUP_EMAIL_ABUSE.md`, ADR-001…006, `ISSUES_KNOWN.md` — each independently re-verified against code.

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

**Finding labels used throughout:**
- **[CONFIRMED]** — verified in code at this commit; the described behavior is what the code does.
- **[WEAKNESS]** — architectural fragility. Not exploitable today, but the invariant holding it closed is unwritten and undefended.
- **[RECOMMENDATION]** — what to build instead.
- **[DEFERRED]** — real, accepted for now, with the trigger that should reopen it.
- **[VERIFY-LIVE]** — the repo declares one thing; the live Supabase project may differ. Must be checked against production before it is treated as either safe or broken.

---

## 1. Executive summary

Prodily's security is **strong where it was deliberately designed and weak wherever the default path was taken.** The redaction pipeline, webhook signature verification, admin API guard, and error-disclosure contract are senior-grade. They cover roughly the surface that the September 2026 incidents forced the team to look at. Everything outside that surface has never had a security pass.

Five things define the current risk:

**1. The database is exposed directly to the internet, and the policies protecting it were written for an app that never uses them.** Stage 1 found 71/126 routes bypass RLS via the service-role client. The security consequence is worse than the architectural one: because nothing exercises RLS, nobody noticed that `users` is readable by `anon` for every public-portfolio learner **with no column restriction** — including `email` and `is_admin`. The Supabase anon key is public by design (it ships in the JS bundle), so this is reachable by anyone. Four `SECURITY DEFINER` functions additionally appear to retain their default `EXECUTE` grant to `PUBLIC`, and one of them returns queued email rows containing live password-reset token URLs.

**2. The signup-abuse incident was correctly diagnosed but incompletely scoped.** The fixes landed on `/api/auth/signup`. `/api/auth/resend-verification` is the same vulnerability class — unauthenticated, triggers the same ungated `sendEmail()` hook path, limited only per-email at 1/60s with no per-IP limit and no global ceiling. Closing signup while leaving this open does not close the incident.

**3. Rate limiting is the wrong shape for what it defends.** Eight of 126 routes have any limit. `/api/auth/login` has none — unthrottled credential stuffing, against an account list an attacker can read from the database (point 1). The limiter itself is non-atomic, fails open to a per-instance map, and keys on a spoofable header.

**4. There is one confirmed stored XSS**, on the public portfolio, via `JSON.stringify` into a `<script>` block fed by a completely unvalidated `bio` field.

**5. The CI pipeline holds a production service-role key** and runs the full test suite with it. This is not theoretical — `lib/rate-limit.ts` carries a comment documenting that a 2026-09-07 test run wrote real rows into production through exactly this path.

None of this requires a rewrite. The target architecture is one authentication resolver, one authorization wrapper, one abuse-control layer, one email egress boundary, and an explicit written decision about what RLS is for.

---

## 2. Current security architecture

| Control | Where it lives | Coverage |
|---|---|---|
| Session transport | httpOnly + `sameSite=lax` + `secure` (prod) cookies, `sb-access-token` / `sb-refresh-token` | All flows — **but tokens are also returned in JSON response bodies** |
| Request auth (pages) | `getServerUser()` → real `auth.getUser()` | Server components |
| Request auth (API) | `getAuthenticatedUserFromRequest()` → real `auth.getUser()` | 35/126 routes; 16 more read the cookie directly |
| Routing auth | `proxy.ts` → **unverified** JWT payload decode | All guarded paths |
| Admin authz | `requireAdminUser()` → token verify + DB `is_admin` + `ADMIN_EMAILS` | **61/61** admin routes |
| Cron authz | `Bearer CRON_SECRET`, `===` comparison | 6/6 cron routes |
| Webhook authz | Svix HMAC + 5-min replay window + `timingSafeEqual` | `/api/email/webhooks` |
| Auth-hook authz | 4 accepted locations incl. **query string**; HMAC path is timing-safe, the other three are not | `/api/auth/send-email-hook` |
| Input validation | Zod | **11/126** routes |
| Rate limiting | `rate_limits` table, non-atomic RMW, fails open | **8/126** routes |
| CSRF | Origin/Referer check | **1/126** routes (`/api/auth/update-password`) |
| Error disclosure | ADR-006 `apiError` / `apiInternalError` | 59/126 routes |
| Secret redaction | `lib/monitoring/redaction.ts` | `system_errors` sink only — **not** `console.*` |
| Security headers | `next.config.ts` | Global: CSP, HSTS, XFO, nosniff, Referrer-Policy, Permissions-Policy |
| DB authorization | RLS (~38 tables, ~65 policies) | **Bypassed on 71/126 routes** |
| Audit logging | `logAdminAction()` → `admin_audit_logs` | **34/61** admin routes |
| CI security gates | — | **None**: no `npm audit`, no secret scanning, no SAST |

---

## 3. What is already strong

Keep these; make them the pattern.

1. **`lib/monitoring/redaction.ts` is exemplary.** It opens with an explicit threat model naming trust boundaries and ranked assets, redacts by **both** value shape and key name (correctly noting either alone is bypassable), preserves diagnostic value by masking rather than dropping emails, and fails closed on unrecognized types. It specifically covers `token_hash` in `verificationUrl` / `resetUrl` — the account-takeover credential.
2. **`/api/email/webhooks` signature verification is correct**: Svix HMAC over `id.timestamp.body`, a 5-minute replay window, `crypto.timingSafeEqual`, and length-checked buffers.
3. **Admin API authorization is complete and layered.** 61/61 routes guarded; the guard verifies the token against Supabase Auth *and* re-reads `users.is_admin` from the database — it never trusts a JWT claim. Denials are audit-logged. `app/admin/(console)/layout.tsx` re-verifies independently.
4. **ADR-006's disclosure contract is well-reasoned**, and `apiError()` applies `sanitizeErrorMessage()` as a backstop even where callers are contractually required to pass safe copy.
5. **`/api/auth/callback` correctly blocks open redirect** — `destination.origin !== requestUrl.origin` falls back to `/dashboard`.
6. **Git history is clean.** A full-history scan for Brevo, Resend, Svix, and JWT credential shapes returned only obvious placeholders (`re_TestPlaceholderResendKey`, `whsec_dGhpcyBpcyBhIHRlc3Qgc2VjcmV0` = "this is a test secret"). No `.env` file is tracked; `.env.example` exists.
7. **Security headers are set globally** including HSTS with preload and a real CSP.
8. **`/api/auth/telemetry` validates strictly** — allowlisted enum codes only, no attacker-controlled free text reaches the database row.
9. **Avatar upload validates MIME type and a 2 MB size cap.**
10. **`/api/auth/update-password` implements Origin/Referer checking and a Content-Type guard** — the right pattern, applied once.

---

## 4. Critical vulnerabilities

### S2-C1 — `SECURITY DEFINER` functions appear to retain `EXECUTE` for `anon`/`authenticated` · **[CONFIRMED in repo] [VERIFY-LIVE]**

The repository contains exactly four privilege statements, all in `20260728164000_supabase_security_hardening.sql`, and they cover only the two XP trigger functions:

```sql
REVOKE EXECUTE ON FUNCTION update_user_xp_and_level() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION sync_user_xp_and_level_on_update() FROM public, anon, authenticated;
```

Four other `SECURITY DEFINER` functions have **no** `REVOKE` anywhere in the migration history. PostgreSQL grants `EXECUTE` to `PUBLIC` by default, and Supabase exposes `public` schema functions as PostgREST RPC endpoints reachable with the **anon key, which ships in the browser bundle**:

| Function | Reachable as | Impact if grant is default |
|---|---|---|
| `claim_email_queue_items(int)` | `POST /rest/v1/rpc/claim_email_queue_items` | **Account takeover.** `RETURNS SETOF public.email_queue`, whose `template_variables` carry live `verificationUrl` / `resetUrl` values containing `token_hash` — per the redaction module's own threat model. Also marks rows `processing`, and Stage 1 confirmed **nothing reclaims stale `processing` rows**, so it doubles as permanent denial of email delivery. |
| `get_admin_dashboard_summary()` | `POST /rest/v1/rpc/get_admin_dashboard_summary` | Unauthenticated disclosure of platform-wide admin metrics, bypassing all 61 admin route guards. |
| `increment_daily_email_quota(int)` | `POST /rest/v1/rpc/increment_daily_email_quota` | Burn the daily email quota → denial of all optional email. |
| `increment_portfolio_view_count(uuid)` | `POST /rest/v1/rpc/increment_portfolio_view_count` | View-count inflation. Minor. Also the **only** `SECURITY DEFINER` function with no `SET search_path` (Supabase linter `function_search_path_mutable`). |

`SECURITY DEFINER` means RLS on `email_queue` is bypassed inside the function body, so RLS is not a mitigation.

**Honest caveat:** grants can have been revoked manually in the Supabase dashboard or by SQL not tracked in this repo. Nothing in the repo declares it. **This is the single highest-priority item, and it is verifiable in about a minute:**

```sql
SELECT p.proname, pg_catalog.array_to_string(p.proacl, E'\n') AS acl
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('claim_email_queue_items','get_admin_dashboard_summary',
                    'increment_daily_email_quota','increment_portfolio_view_count');
```

An `acl` that is `NULL` or contains `=X/` means `PUBLIC` can execute it.

**[RECOMMENDATION]** Revoke `EXECUTE` from `PUBLIC, anon, authenticated` on every `SECURITY DEFINER` function and grant only to `service_role`; add `SET search_path` to `increment_portfolio_view_count`; make "every new `SECURITY DEFINER` function ships with its `REVOKE`" a migration-review rule rather than a memory.

### S2-C2 — `users` is anon-readable with no column restriction · **[CONFIRMED]**

`20260805000003_add_portfolio_columns.sql:20`:

```sql
create policy "Public can view public profiles" on users
  for select using (is_portfolio_public = true);
```

No role restriction (so `anon` and `authenticated`) and — critically — **RLS is row-level, not column-level**. Any holder of the public anon key can `SELECT *` from `users` for every learner with a public portfolio and read:

- **`email`** — bulk PII disclosure of the learner roster.
- **`is_admin`** — lets an attacker enumerate administrator accounts for targeted phishing or credential stuffing, which (S2-C5) is unthrottled.
- `goal`, `timezone`, `auth_provider`, and every other profile column.

This is a direct consequence of the service-role-by-default architecture: because no application path exercises this policy, its blast radius was never reviewed.

**[RECOMMENDATION]** Replace with a `SECURITY DEFINER` function or a dedicated view exposing only the portfolio-presentation columns, and revoke direct `SELECT` on `users` from `anon`.

### S2-C3 — Stored XSS on the public portfolio via JSON-LD `</script>` breakout · **[CONFIRMED]**

Three facts compose:

1. `app/api/settings/profile/route.ts:50-63` writes `name`, `bio`, `avatar_url`, `linkedin_url`, `github_url`, `website_url` with **no validation of any kind** — only `.trim()`. No length cap, no HTML stripping, no URL scheme check.
2. `app/(portfolio)/p/[username]/page.tsx:117-127` feeds `name`, `bio`, `username`, and those URLs into `profilePageJsonLd`.
3. Line 160 renders it as `dangerouslySetInnerHTML={{ __html: JSON.stringify(profilePageJsonLd) }}`.

`JSON.stringify` escapes `"` and `\`. It does **not** escape `<` or `/`. A `bio` containing `</script><script>…</script>` therefore breaks out of the JSON-LD block and executes on a **public page for every visitor**. Verified: no `<` escaping exists anywhere in the codebase.

Session cookies are httpOnly, so `document.cookie` is not the payoff — but same-origin authenticated requests as any logged-in visitor are (change email, submit content, read profile), plus arbitrary phishing content on a `prodily` URL.

The same unescaped `JSON.stringify`-into-`<script>` pattern appears at ~14 sites. The other 13 are fed by compiled repo content, not user input — **[WEAKNESS]** rather than confirmed, but the escaping helper should be applied uniformly rather than per-site.

**Related [CONFIRMED], same root cause:** `avatar_url` is user-settable through this route, which **bypasses the entire avatar-upload validation** (MIME allowlist, 2 MB cap) in `/api/user/avatar`. And `linkedin_url` / `website_url` / `githubUrl` flow into `<a href={…}>` in `PortfolioHero.tsx:152,176` with no scheme allowlist.

### S2-C4 — `certificates` is fully anon-readable · **[CONFIRMED]**

`20260805000004_create_certificates.sql:30` — `create policy "Public can view certificates" … using (true)`. The table holds `learner_name`, `user_id`, `level`, `career_title`, `total_xp`, `lessons_completed`. The intended feature is single-certificate lookup by code at `/verify/[certificateId]`; the policy permits **dumping the entire certificate-holder roster with real names** via the anon key.

**[RECOMMENDATION]** Scope verification to a `SECURITY DEFINER` lookup by `certificate_code` and drop the blanket policy.

### S2-C5 — No rate limiting on `/api/auth/login` · **[CONFIRMED]**

`app/api/auth/login/route.ts` imports no limiter. Only 8 of 126 routes have one, and login is not among them. Combined with S2-C2 (attacker can read the account list, including which accounts are admins) and S2-C8 (enumeration oracles), this is unthrottled credential stuffing against a known-valid user list. GoTrue's own project-level limits are the only backstop, and they are not tuned for this.

Also **[CONFIRMED]** in the same file: when verification is disabled, the unconfirmed-login branch calls `supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })` — an **unauthenticated request triggers a 1,000-user admin listing**, which is both an amplification primitive and silently wrong past 1,000 users.

### S2-C6 — Rate limiting is non-atomic, fails open, and keys on a spoofable header · **[CONFIRMED]**

Three independent defeats of the same control (Stage 1 C-3, re-confirmed and security-framed):

1. **Not atomic.** `evaluatePersistentRateLimit()` is `SELECT` → decide → `UPDATE` across three statements with no lock. Concurrent requests all read the same count and all pass. Concurrency is precisely the attack condition.
2. **Fails open.** On any DB error it falls back to a per-instance in-memory `Map`; on serverless the effective limit becomes `N_instances × limit`.
3. **Spoofable key.** `getClientIp()` in `signup/route.ts` reads the **leftmost** `x-forwarded-for` entry, which is client-supplied. On Vercel the trustworthy value is the platform-provided one, not the leftmost hop.

The same codebase contains `increment_daily_email_quota()`, a single-statement atomic gate — the correct pattern, applied to email but not to abuse control.

---

## 5. High-risk architectural weaknesses

### S2-H1 — CI holds a production service-role key · **[CONFIRMED]**
`.github/workflows/ci.yml` injects `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `RESEND_API_KEY`, `CRON_SECRET`, and `SEND_EMAIL_HOOK_SECRET` into the test job. Every test run — including on pull requests — executes with full production database credentials. **This has already caused a production incident:** `lib/rate-limit.ts` carries a comment stating a 2026-09-07 test run wrote real rows into production through an incomplete mock. The guard added afterwards protects one table. The exposure is the whole database. A malicious or careless PR is a data-exfiltration path.

### S2-H2 — Session tokens returned in JSON response bodies · **[CONFIRMED]**
`/api/auth/login` and `/api/auth/signup` (Flow B) return `session: authData.session` — **access and refresh tokens** — in the response body alongside setting httpOnly cookies. This is deliberate (the client bridges them via `/api/auth/session`), but it means the httpOnly protection is decorative: any XSS reads the refresh token from JS and holds a **30-day** session. S2-C3 is a live XSS. **[RECOMMENDATION]** Cookies are already set server-side; stop returning the session object and remove the client bridge.

### S2-H3 — Session fixation via `/api/auth/session` · **[CONFIRMED]**
The route verifies the supplied `access_token` against Supabase Auth before setting cookies — good — but **never verifies `refresh_token`**, and requires no existing session. An attacker who spends one of their own valid sessions can plant it in a victim's browser; the victim then works inside the attacker's account. `SameSite=lax` does not help, because the endpoint does not depend on the victim's cookies. Cross-origin JSON `POST` triggers a CORS preflight, but `request.json()` does not check `Content-Type`, so a CORS-simple `text/plain` POST reaches the handler. **[RECOMMENDATION]** Verify the refresh token, require Origin, and prefer removing the bridge entirely (see S2-H2).

### S2-H4 — Middleware trusts an unverified JWT · **[WEAKNESS]** (Stage 1 C-5, re-verified)
`proxy.ts:parseJwtUser()` base64-decodes the payload and checks only `exp`; the signature is never verified. Decoded `app_metadata.is_admin`, `email`, `email_confirmed_at`, and `curriculum_access_override` drive admin routing and the API email-verification gate. **Not exploitable today** — I re-confirmed that admin pages call `getServerUser()` (real `auth.getUser()`) and all 61 admin API routes re-verify. A forged token yields routing decisions, not data. But the containment is an unwritten invariant that every future route must independently remember.

### S2-H5 — No CSRF or Origin verification, except on one route · **[WEAKNESS]**
`SameSite=lax` cookies mitigate classic cross-site POST CSRF, and that is load-bearing across 125 routes. `/api/auth/update-password` is the only route with an Origin/Referer check — and it skips the check entirely when neither header is present.

### S2-H6 — Redaction covers the database sink, not the log sink · **[CONFIRMED]**
`logErrorReport` / `logSystemError` correctly route through `redaction.ts`. But there are **294 raw `console.error` / `console.warn` / `console.log` calls** in non-test code, many logging full exception objects — Supabase/PostgREST errors, provider error bodies. These go to Vercel logs unredacted, which is exactly the content the redaction module's threat model says can carry connection strings and API keys.

### S2-H7 — Reachable high-severity dependency CVEs · **[CONFIRMED]**
`npm audit`: **5 vulnerabilities (4 high, 1 moderate).**
- **`sharp <0.35.0`** under `node_modules/next/node_modules/sharp` — libvips CVE-2026-33327/33328/35590/35591. **Reachable**: `next.config.ts` permits remote images from `**.supabase.co`, so user-uploaded avatars are processed by this libvips. Fix requires `next@16.3.4`, outside the stated range — a real upgrade decision, not `npm audit fix`.
- `fast-uri` (high, incl. an SSRF advisory) and `qs` (moderate) — transitive; reachability not established in this audit.

### S2-H8 — No security gates in CI · **[CONFIRMED]**
No `npm audit`, no secret scanning (gitleaks/trufflehog), no SAST/CodeQL, no dependency review. Dependency install scripts are not restricted. CI also runs `supabase db push` against production on `main` with no review gate.

### S2-H9 — Admin audit logging covers 34 of 61 routes · **[CONFIRMED]**
Unlogged mutations include consequential ones: `capstones/[id]/review` (approving learner work), `fellow-requests/[id]` (**granting PM Fellow status — a privilege change**), `announcements/*` publish/pause (platform-wide messaging), `feedback/[id]`, `system/storage-cleanup` (destructive), and `emails/broadcasts/recipient-sample` (**reads learner PII**). Repudiation risk on exactly the actions that need non-repudiation.

### S2-H10 — Over-permissive auth-hook credential surface · **[CONFIRMED]**
`/api/auth/send-email-hook` accepts its secret in **four** places: `Authorization: Bearer`, three custom headers, **the query string (`?secret=`)**, and an HMAC signature. Only the HMAC path uses `timingSafeEqual`; the other three use `===`. A query-string secret lands in Vercel access logs, CDN logs, and `Referer` headers. Each accepted location is an independent bypass surface. Cron routes likewise compare `CRON_SECRET` with `===` (low practical risk over HTTP, but free to fix).

### S2-H11 — `waitlist` accepts direct anon INSERT · **[CONFIRMED]**
`create policy "Anyone can join waitlist" … for insert to anon, authenticated with check (true)`. Reads are correctly denied. But anyone can `POST /rest/v1/waitlist` with the anon key, bypassing `/api/waitlist`'s validation and rate limiting entirely — an unbounded write sink.

### S2-H12 — Leaderboard privacy is enforced only in application code · **[WEAKNESS]**
`weekly_leaderboard_snapshots` and `cohort_members` are `using (true)` — anon-readable. The `is_opted_in` privacy toggle is enforced only in `lib/leaderboard-db.ts`. A user who opts out of the leaderboard remains in the anon-readable snapshot table.

### S2-H13 — Telemetry alert poisoning · **[CONFIRMED]**
`/api/auth/telemetry` is unauthenticated. Its payload validation is strict (allowlisted enums, no free text) — good — but its rate limiter is a **per-instance in-memory Map keyed on the spoofable leftmost XFF**. An attacker can flood `system_errors` with `critical`-severity `AUTH_PROVIDER_UNAVAILABLE` rows, which drive admin system alerts. This degrades exactly the signal needed during an incident.

---

## 6. Authentication architecture

**Verified per-flow:**

| Flow | State |
|---|---|
| Signup | Zod-validated; `allowSignups` gate; per-IP + per-email limits (all three defeats in S2-C6 apply); no CAPTCHA; no global ceiling; **409 enumeration oracle**; `refCode` unbounded and unvalidated before use |
| Login | Zod-validated; **no rate limit**; **enumeration oracle** (403+`requiresVerification`+echoed email vs 401); 1,000-user admin listing on one branch; returns session in body |
| Logout | `/api/auth/session` `action: 'sign_out'` clears cookies. Cookies cleared locally; **no `supabase.auth.signOut()`**, so the refresh token remains valid server-side until expiry — logout does not revoke |
| Email verification | Supabase OTP via `verifyOtp`; callback correctly blocks cross-origin redirect |
| Resend verification | **Unauthenticated email-send primitive**; 1/60s per email only, **no per-IP limit, no global ceiling**; also contains dead code — `supabase.auth.getUser()` on a service-role client with no token always returns null, so the already-verified short-circuit never fires |
| Password reset | Recovery OTP correctly uses the anon client (service role would break session creation); `?mode=update` gate in proxy |
| Password update | The **only** route with Origin/Referer CSRF checking and a Content-Type guard; **no rate limit**; **min length 6** |
| Email change | Rate-limited; callback syncs `auth.users.email` → `public.users.email` in the one place every confirmation passes through — good |
| Session lifecycle | Refresh in `proxy.ts` **persists** rotated cookies; refresh in `lib/auth.ts` **does not** — the two paths disagree, and the second can invalidate the client's stored refresh token |
| JWT handling | Verified in API routes and server components; **unverified in middleware** |

**Password policy [CONFIRMED]:** minimum 6 characters at both signup and update, no complexity requirement, no breach-list check (HIBP k-anonymity), no maximum length. Below the NIST SP 800-63B recommended 8-character floor.

**[RECOMMENDATION] — one authentication resolver.**

```
resolveActor(request) -> { userId, email, emailVerified, isAdmin, source } | null
```

- Verifies the JWT signature locally against Supabase's JWKS (no per-request network hop — which also removes the Stage 1 latency bottleneck), falling back to `auth.getUser()` only on signature/JWKS failure.
- Accepts `Authorization: Bearer` **first**, cookie second — the same function serves web and mobile.
- Owns refresh and cookie rotation in exactly one place.
- Re-reads `is_admin` from the database; never from a JWT claim.
- Is the only thing `proxy.ts`, route handlers, and server components call.

This collapses four current auth patterns (proxy decode, `getServerUser`, `getAuthenticatedUserFromRequest`, direct cookie reads in 16 routes) into one.

---

## 7. Authorization architecture

**Learner authorization is ownership-scoped in application code and, where checked, correct** — routes derive `user.id` from the verified session and filter on it; request-body `user_id` is not trusted. Stage 1's invariant holds on the paths reviewed.

**Admin authorization is the strongest control in the codebase** — 61/61, token-verified, DB-backed, audit-logged, per-request memoized.

**The gap is that there is no single place where authorization happens**, so coverage is a property of 126 independent memories rather than of the architecture. There is no import boundary, lint rule, or type that prevents a new route from omitting the check.

**[RECOMMENDATION]** The `withRoute()` wrapper from Stage 1 §9.2, extended with an authorization contract:

```
withRoute({
  auth:      'public' | 'user' | 'verified-user' | 'admin' | 'cron',
  schema:    ZodSchema,          // required for every body-taking method
  rateLimit: { key, limit, windowMs },
  handler:   (ctx: { actor, body }) => Response,
})
```

Authorization becomes a declared property of the route, reviewable in a diff. Add an ESLint rule forbidding raw `export async function POST` under `app/api/` outside the wrapper, so the gap cannot reopen.

---

## 8. Database / RLS security

**Answering the Stage 1 question directly: the service-role-by-default pattern is an accident, not an architecture.** The evidence:

- If it were intentional, RLS policies would be minimal and documented as defense-in-depth. Instead there are ~65 policies across ~38 tables, several written as though they were the real boundary.
- Those policies contain the two most serious findings in this audit (S2-C2, S2-C4) — precisely because nothing exercises them, so nobody reviewed their blast radius.
- Ten routes *do* use the RLS-scoped client, with no rule distinguishing them from the 71 that don't.

That is the signature of drift: a default that was convenient (service role always works) applied route by route until it became the norm.

**[RECOMMENDATION] — make the decision explicitly, and my recommendation is a hybrid with a written rule:**

| Surface | Client | Rationale |
|---|---|---|
| Anything reachable with the **anon key** (public portfolio, certificate verification, waitlist, leaderboard snapshots) | RLS is the **only** boundary — policies must be correct and column-scoped | PostgREST is internet-facing; there is no application layer in front of it |
| Learner API routes | Service role, with ownership enforced in `withRoute()` | Avoids double-maintaining the same rule in SQL and TypeScript |
| Admin routes | Service role behind `requireAdminUser()` | Already correct |

The critical corollary: **because the anon key is public, every table's RLS must be written as if the app did not exist.** Today four tables fail that test (`users`, `certificates`, `weekly_leaderboard_snapshots`, `waitlist`). Deny `anon` by default and add narrow `SECURITY DEFINER` read functions for the genuinely public surfaces.

Other DB findings:
- **[CONFIRMED]** Four `SECURITY DEFINER` functions with no `REVOKE` — S2-C1.
- **[CONFIRMED]** `increment_portfolio_view_count` has no `SET search_path`; the other five do.
- **[CONFIRMED]** Missing `UNIQUE (user_id, source_type, source_id)` on `xp_events` (Stage 1) is a security issue too, not just correctness: it makes XP awards replayable.
- **[WEAKNESS]** No column-level privileges anywhere; RLS alone cannot restrict columns.

---

## 9. Signup-abuse architecture

The two incident documents are accurate and well-reasoned. Re-verified against code, with the scope gap called out:

| Item | Verified state | Classification |
|---|---|---|
| Direct auth-email hook | `lib/email.ts` has 7 importers incl. the hook; no quota gate, no pause, no suppression, no dedup, no ceiling | **[CONFIRMED]** — root cause, unfixed |
| Email quota bypass | Quota gate lives only in `processEmailQueue()`; the hook path never touches the queue | **[CONFIRMED]** |
| Welcome-before-verification | `ensureUserProfile()` → `dispatchWelcomeEmailIfNeeded()` fires whenever `refCode` is present, before verification | **[CONFIRMED]** |
| `refCode` | `z.string().optional().nullable()` — unbounded, unvalidated; validated only later in `createReferralAttribution()`; also sourced from the `prodily_referrer` cookie set by proxy from an unvalidated `?ref=` | **[CONFIRMED]** |
| Rate-limit atomicity | Non-atomic 3-statement RMW | **[CONFIRMED]** — S2-C6 |
| Spoofable client IP | Leftmost `x-forwarded-for` | **[CONFIRMED]** — S2-C6 |
| Fail-open behavior | Falls back to per-instance in-memory map on DB error | **[CONFIRMED]** — S2-C6 |
| Global signup ceiling | **Does not exist** anywhere | **[CONFIRMED]** |
| Provider failover amplification | `classifyProviderFailure()` treats 402/408/429 as failover-eligible, so Brevo exhaustion pushes volume to Resend | **[CONFIRMED]** — correct in isolation, amplifying without a ceiling above it |
| **Resend verification** | **Unauthenticated; 1/60s per email; no per-IP limit; no global ceiling; same ungated hook path** | **[CONFIRMED] — not covered by the incident docs or the branch fixes** |
| Password reset | Same GoTrue → hook → `sendEmail()` path; app-side reset trigger has no rate limit | **[CONFIRMED]** — third instance of the same class |
| Waitlist | Route sends confirmation email; RLS additionally permits direct anon INSERT bypassing the route | **[CONFIRMED]** — S2-H11 |
| Login abuse | No rate limit at all | **[CONFIRMED]** — S2-C5 |
| CAPTCHA / Turnstile | Not present; ISSUE-23 blocks reopening signup on this decision | **[CONFIRMED]** absent |
| Disposable-email controls | Only Gmail `+alias` canonicalization for the rate-limit key; no disposable-domain policy, no MX check | **[CONFIRMED]** absent |
| Account enumeration | Signup 409 `USER_EXISTS`; login 403 vs 401 + echoed email; resend `alreadyVerified: true` | **[CONFIRMED]** |

**The architectural conclusion: this is not a signup bug. It is a missing egress boundary.** Three unauthenticated endpoints (`signup`, `resend-verification`, password reset) each cause provider sends through a transport with no governance. Patching `signup` alone leaves two open, which is why the second incident followed the first.

**[RECOMMENDATION] — the correct architectural solution (do NOT implement in this stage):**

1. **One email egress boundary.** Every send — critical auth included — passes through one function that enforces, in order: global ceiling → per-recipient dedup/idempotency → suppression list → per-category quota. Critical auth mail bypasses the *optional-mail quota* but never the *global ceiling*. Delete the second transport so an ungated path cannot be written.
2. **A global circuit breaker above failover.** Provider-count-per-window across all providers, tripping to a hard stop rather than shifting volume to provider #2. This is D-01, whose trigger has now fired twice.
3. **One abuse-control layer** in `withRoute()`: atomic DB limiter (single `INSERT … ON CONFLICT … RETURNING`), platform-trusted client IP, multi-dimensional keys (IP, canonical email, ASN, global), applied by declaration to *every* unauthenticated endpoint — not chosen per route.
4. **Proof-of-work or CAPTCHA (Turnstile) on all three unauthenticated email-triggering endpoints**, not signup alone.
5. **Verification before durable side effects.** No `public.users` row, no welcome email, no referral attribution until email is confirmed. `refCode` becomes a strictly-validated short token stored on the pending signup and consumed at verification.
6. **Uniform non-committal responses** on signup / login / resend to close the enumeration oracles.

---

## 10. API security

| Control | State |
|---|---|
| Input validation | **[CONFIRMED]** 11/126 routes use Zod. `/api/settings/profile` validates nothing; `/api/capstones/[module]/submit` accepts an unbounded string |
| Rate limiting | **[CONFIRMED]** 8/126 routes |
| Request authentication | **[CONFIRMED]** Three patterns; 16 routes cookie-only |
| CSRF | **[WEAKNESS]** `SameSite=lax` only, plus one route with Origin checks |
| XSS | **[CONFIRMED]** S2-C3. **[WEAKNESS]** `MarkdownRenderer` and `RichEditor` render `marked.parse()` into `dangerouslySetInnerHTML` with **no DOMPurify** — `marked` does not sanitize. Both are currently fed trusted/self content (lesson prompts; the author's own preview), so **not exploitable today**, but they are unsanitized primitives in the shared UI kit. `isomorphic-dompurify` is already a dependency, used only in `sanitize-email-html.ts` |
| SSRF | **[WEAKNESS]** No user-supplied URL is fetched server-side today. But `avatar_url`, `website_url`, `linkedin_url`, `github_url` are stored unvalidated, and `next.config.ts` permits remote image optimization from `**.supabase.co` — the first feature that fetches a stored profile URL creates SSRF. The transitive `fast-uri` SSRF advisory (S2-H7) sits in the same area |
| Account enumeration | **[CONFIRMED]** Three oracles (§9) |
| Replay protection | **[CONFIRMED]** Present and correct on `/api/email/webhooks` (5-min window). Absent on the auth hook's non-HMAC paths |
| Idempotency | **[WEAKNESS]** Notification dispatch uses idempotency keys — good. XP awards do not (no unique constraint); no request-level idempotency keys on mutations |
| Unsafe redirects | **[CONFIRMED SAFE]** `/api/auth/callback` blocks cross-origin. **[VERIFY-LIVE]** `signup` builds `emailRedirectTo` from the attacker-controllable `Origin` header; Supabase validates against its own redirect allowlist, so safety depends on the production dashboard's `Site URL` / `Additional Redirect URLs` being tightly scoped. The repo's `config.toml` is local-only and cannot confirm this |
| Webhook security | **[CONFIRMED SAFE]** for `/api/email/webhooks`. **[CONFIRMED WEAK]** for `/api/auth/send-email-hook` — S2-H10 |
| CORS | **[CONFIRMED SAFE]** No permissive API CORS; `Access-Control-Allow-Origin: *` is scoped to `/_next/static/` |

---

## 11. Secret / sensitive-data security

**Strong:** git history clean (full-history scan: only obvious placeholders); no `.env` tracked; `.env.example` present; no hardcoded secrets in source; `redaction.ts` is best-in-class for its sink.

**Findings:**
- **[CONFIRMED]** S2-H1 — production service-role key in CI, with a documented prior production-data incident.
- **[CONFIRMED]** S2-H6 — 294 unredacted `console.*` calls; Vercel logs are outside the redaction boundary.
- **[CONFIRMED]** S2-H10 — secret accepted in a query string.
- **[CONFIRMED]** S2-H8 — no secret scanning in CI, so the currently-clean history is unenforced going forward.
- **[CONFIRMED]** PII: learner emails are readable by `anon` (S2-C2), by any admin via `recipient-sample` without an audit-log entry (S2-H9), and are stored in `email_queue.to_email` alongside auth token URLs. No documented retention policy for `system_errors`, `email_delivery_events`, or `notification_events` (Stage 1; `/api/cron/cleanup` is a documented no-op).
- **[WEAKNESS]** No key-rotation runbook and no separation between CI, preview, and production credentials.

---

## 12. Admin security

**Strong:** 61/61 route guard; DB-backed `is_admin`; independent layout re-verification; `access_denied` events audit-logged; admin error text sanitized per ADR-005; admin console `robots: noindex`.

**Findings:**
- **[CONFIRMED]** S2-H9 — 34/61 routes audit-logged; privilege changes (`fellow-requests`) and destructive operations (`storage-cleanup`) among the unlogged.
- **[CONFIRMED]** Bulk operations (`emails/queue/retry-all`, `broadcasts/[id]/execute`, `notifications/broadcast`) have **no rate limiting and no confirmation token**. A single compromised admin session, or a CSRF that survives `SameSite=lax`, can trigger a full-platform broadcast.
- **[CONFIRMED]** `/api/dev/send-test-email` accepts an arbitrary `toEmail` and sends via the ungated `sendEmail()` path. Admin-only, but it is another unmetered egress point.
- **[WEAKNESS]** Admin is binary — no roles (support vs. content vs. superuser). Everyone who can moderate a testimonial can also execute a platform-wide broadcast and read the learner email roster.
- **[WEAKNESS]** `ADMIN_EMAILS` grants admin by email string. Since `auth.users.email` can be changed through the app's own email-change flow, the identity backing that grant is mutable. Not exploitable without first controlling a listed mailbox, but it makes an env var a privilege oracle.
- **[WEAKNESS]** No MFA requirement for admin accounts.

---

## 13. Recommended target security architecture

Five boundaries. Each replaces a class of per-route decisions with one enforced rule.

**13.1 One authentication resolver** (§6). *Solves:* four auth patterns, 16 cookie-only routes, mobile readiness, the middleware trust problem, and the per-request `auth.getUser()` hop.

**13.2 One authorization wrapper** — `withRoute()` with a declared `auth` contract, plus a lint rule making it the only way to define a route (§7). *Solves:* validation at 11/126, error contract at 59/126, rate limiting at 8/126, CSRF at 1/126 — all become properties of a declaration rather than of memory.

**13.3 One abuse-control layer** — atomic DB limiter, platform-trusted IP, multi-dimensional keys, global ceilings, Turnstile on unauthenticated email-triggering endpoints (§9). *Solves:* S2-C5, S2-C6, and the repeat-incident pattern.

**13.4 One email egress boundary** — a single transport, ordered gates, a global circuit breaker above failover (§9). *Solves:* the actual root cause of both incidents.

**13.5 A written database trust model** — anon-facing tables get column-scoped policies and `SECURITY DEFINER` read functions; every `SECURITY DEFINER` function ships with its `REVOKE`; service role is used only behind `withRoute()` (§8). *Solves:* S2-C1, S2-C2, S2-C4, S2-H11, S2-H12.

**Deliberately not recommended:** a WAF appliance, a secrets-management platform (Vercel env vars are adequate at this scale), an API gateway, or a separate auth service. Each adds operational surface without addressing a finding above.

---

## 14. NOW / NEXT / LATER priorities

### NOW — before reopening signup or shipping features

1. **Verify and fix the `SECURITY DEFINER` grants** (S2-C1). Run the ACL query; revoke from `PUBLIC/anon/authenticated`. *One query, then one migration.*
2. **Fix the `users` public-profile policy** (S2-C2) — stop exposing `email` and `is_admin` to `anon`.
3. **Fix the `certificates` blanket read policy** (S2-C4).
4. **Fix the portfolio JSON-LD XSS** (S2-C3) — escape `<`/`/` when serializing into `<script>`, and validate/bound `bio`, `name`, and the URL fields (scheme allowlist) on write.
5. **Rate-limit `/api/auth/login`** (S2-C5) and remove the 1,000-user `listUsers` branch.
6. **Make the rate limiter atomic, fail-closed on auth endpoints, and key it on the platform-trusted IP** (S2-C6).
7. **Remove the production service-role key from CI** (S2-H1) — use a dedicated test project or no key at all.
8. **Stop returning `session` in login/signup response bodies** (S2-H2).
9. **Verify the refresh token and require Origin in `/api/auth/session`**, or remove the bridge (S2-H3).
10. **Confirm the production Supabase redirect allowlist is tightly scoped** (§10, `emailRedirectTo`).
11. **Add `UNIQUE (user_id, source_type, source_id)` on `xp_events`** — replay prevention.

### NEXT — the structural pass

12. Ship the authentication resolver (13.1) and `withRoute()` (13.2), with the lint rule.
13. Ship the abuse-control layer (13.3) including Turnstile.
14. Ship the email egress boundary and global circuit breaker (13.4) — closes D-01 and D-08, whose triggers have fired.
15. Close the enumeration oracles across signup / login / resend.
16. Extend `logAdminAction()` to all 61 admin routes; add confirmation tokens to bulk operations.
17. Add CI gates: `npm audit`, secret scanning, dependency review, blocked install scripts.
18. Resolve the `sharp`/libvips CVEs (S2-H7) — a deliberate Next upgrade.
19. Route `console.*` through the redaction pipeline (S2-H6).
20. Sanitize `marked` output with the already-installed DOMPurify before any user content reaches those components.
21. Raise the password floor to 8 + HIBP k-anonymity check; make logout call `signOut()` so refresh tokens are actually revoked.

### LATER — with named triggers

22. **Admin roles + MFA** — when the admin count exceeds ~3, or before any non-founder gets access.
23. **Column-level grants / a portfolio view** — when the public profile surface grows.
24. **SSRF allowlist** — trigger: the first feature that server-side fetches a user-supplied URL.
25. **PII retention policy and implemented `/api/cron/cleanup`** — trigger: first data-subject deletion request, or 100K users.
26. **Credential rotation runbook + environment separation** — trigger: first hire with production access.
27. **`SECURITY DEFINER` read functions replacing anon table reads** — trigger: any new anon-readable table.

---

## 15. Security requirements before reopening signup

Signup is currently closed (`allowSignups = false`, ISSUE-23). All of the following must be true before it reopens:

1. NOW items 1–6 complete — with **6 (atomic, fail-closed, unspoofable rate limiting)** being non-negotiable, since it is the control the whole reopening depends on.
2. **The email egress boundary and global ceiling exist** (13.4). Without a ceiling, per-IP limits alone did not hold the first two times.
3. **CAPTCHA/Turnstile on all three unauthenticated email-triggering endpoints** — `signup`, `resend-verification`, password reset. Signup alone is insufficient; §9 shows why.
4. **`resend-verification` gains a per-IP limit and a global ceiling** — it is currently the easiest of the three to abuse.
5. **`refCode` is validated before any side effect**, and no welcome email or `public.users` row is created before verification.
6. **A global circuit breaker above provider failover** (D-01) — so quota exhaustion halts rather than shifting to Resend.
7. **Enumeration oracles closed** on signup and login.
8. **Alerting on abnormal signup rate and provider send rate**, with a tested kill switch.
9. **A decision recorded** on the 1,233 flagged accounts (ban vs. delete), so the reopening does not inherit ambiguous state.
10. **Disposable-email policy decided** — allow, block, or restrict — rather than left undefined.

## 16. Security requirements before mobile

1. **The authentication resolver ships first** (13.1) — Bearer-first, one refresh contract, no middleware dependency. All 16 cookie-only routes migrate.
2. **A `/api/auth/refresh` endpoint** with an explicit rotation contract; mobile cannot rely on `proxy.ts`.
3. **Token storage guidance** — refresh tokens in Keychain / EncryptedSharedPreferences, never in app-local plaintext. This makes S2-H2 (tokens in response bodies) a *deliberate* mobile contract rather than a web leak.
4. **Uniform machine-readable error contract** — clients branch on `code`, never on the English `error` string.
5. **A versioning policy**, because shipped app versions cannot be patched in place.
6. **Certificate pinning decision** and a **forced-upgrade mechanism** for revoking a compromised client build.
7. **Turnstile equivalent for native** (App Attest / Play Integrity) — a browser CAPTCHA does not transfer.
8. **Rate limiting keyed on something better than IP**, since mobile carriers NAT aggressively — device attestation or account-scoped keys.

---

## 17. Questions and decisions for final architecture synthesis

**Answers to the ten questions posed:**

1. **Middleware JWT verification?** — **Both, in sequence.** Middleware should verify signatures locally via JWKS (cheap, no network hop, and it removes Stage 1's per-request `auth.getUser()` bottleneck), *and* authorization must always be re-derived server-side. Verification alone is insufficient because JWT claims are stale; server-side re-derivation alone leaves middleware making decisions on forgeable input. Today the codebase has neither in middleware.
2. **Service role or RLS-scoped clients?** — **Hybrid, written down** (§8). Service role behind `withRoute()` for authenticated app routes; RLS as the *sole and therefore correct* boundary for everything the anon key can reach. The current state is neither by design, and that is how S2-C2 and S2-C4 shipped.
3. **Standard authentication resolver?** — One `resolveActor()`: JWKS-verified, Bearer-first then cookie, owns refresh, re-reads `is_admin` from the database (§6).
4. **Standard authorization pattern?** — `withRoute({ auth, schema, rateLimit })` as the only way to define a route, enforced by lint (§7).
5. **Rate limiting: fail open or closed?** — **Closed on authentication and email-triggering endpoints; open elsewhere.** A DB outage should degrade the learning experience, not open the abuse path that caused two incidents. This must be per-endpoint policy, not one global default.
6. **Unified abuse-prevention architecture?** — §13.3: atomic limiter, trusted IP, multi-dimensional keys, global ceilings, attestation/CAPTCHA, declared per route.
7. **Unified email security boundary?** — §13.4: one transport, ordered gates, global ceiling above failover, critical mail exempt from the optional-mail quota but never from the ceiling.
8. **Controls now vs. 10K/100K?** — §14. Everything in NOW is scale-independent correctness. Admin roles/MFA and PII retention are the genuine 10K–100K additions.
9. **Before reopening signup?** — §15.
10. **Before mobile?** — §16.

**Open questions requiring a human decision:**

- **A.** What are the live ACLs on the four `SECURITY DEFINER` functions? *Highest-priority unknown in this audit.*
- **B.** What are the production Supabase `Site URL` and `Additional Redirect URLs`? Determines whether `emailRedirectTo` is an open-redirect / token-theft path.
- **C.** Is the CI Supabase project the production project? If yes, S2-H1 is active credential exposure on every PR.
- **D.** Was the anon key rotated after the September incidents? It is public by design, but it is the key that reaches S2-C1/C2/C4.
- **E.** CAPTCHA provider — Turnstile (free, privacy-preserving) vs. hCaptcha vs. reCAPTCHA. Blocks ISSUE-23.
- **F.** Disposable-email policy: allow, block by list, or require MX validation?
- **G.** The 1,233 flagged accounts: ban or delete? Deletion has GDPR implications either way and should be decided deliberately.
- **H.** Is there a data-protection obligation (GDPR/DPDP) that makes the learner-email exposure in S2-C2 a notifiable event? This is a legal question, not an engineering one, and it should be asked now rather than after.
- **I.** Who is authorized to approve migrations that touch RLS or `SECURITY DEFINER` grants? CI currently pushes migrations to production on `main` with no gate.
- **J.** Admin role model — is binary admin acceptable through 10K users, or does the first support hire force RBAC?

---

*End of Stage 2. No fixes implemented. No application code, tests, configuration, or migrations modified. S1 not implemented. Nothing pushed.*

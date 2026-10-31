# Prodily — Security Audit

- **Date:** 2026-10-17
- **Commit:** `d43e3f2` on `origin/main` (merge of PR #57, which carries `e1aa0eb` "trust auth email in admin guard and lock down governance RPCs")
- **Live host checked:** `https://prodily.adityagangwani.me`. The domain `prodily.app` is NXDOMAIN on public resolvers as of today.

---

## Scope & method

**Covered:**

- **Auth and routing:** `apps/web/proxy.ts`, every `app/api/**/route.ts` handler (133 files), the `withRoute`/`resolveActor` wrappers, `lib/admin/guard.ts` and `authorization.ts`, the admin console layout, and the auth routes (signup, login, callback, session, update-password, change-email, send-email-hook).
- **Request handling:** webhooks, cron routes, the OG image routes, the portfolio, certificate and leaderboard data paths, and every `dangerouslySetInnerHTML` sink.
- **Database:** all 65 SQL migrations plus `post-deploy/`, `config.toml` and `seed.sql`. A delegated pass read every migration in full, and I re-verified each DB finding below against the cited lines myself.
- **CI and supply chain:** `.github/workflows/*`, `dependabot.yml`, `.gitleaks.toml`, `.gitignore`, and `npm audit` (full tree, then `--omit=dev`).
- **Docs:** `docs/ISSUES_KNOWN.md`, `SECURITY.md` and `HARDENING_LEDGER.md`.
- **Recent commits:** `e1aa0eb`, `b348989` and `86ac72f`.

**Method:**

- Static review and reasoning about final state: later migrations override earlier ones, so every DB finding is stated against the final effective definition.
- Against production: passive `curl -sI` of `/` and `/login` only.

**Not tested (no live probing, by rule):**

- I made no calls to Supabase REST/RPC or GoTrue, and no authenticated requests.
- **Assumed:** production table and function grants follow Supabase's legacy default privileges, under which anon and authenticated get ALL on new public tables and views and EXECUTE on new functions. The repo itself supports this assumption:
  - `20261017000001` says so in its header.
  - `docs/ISSUES_KNOWN.md:93` records an anon-key call to a SECURITY DEFINER function returning HTTP 200.
  - `20261013000002` had to revoke a table-wide UPDATE that `authenticated` held.
- **Unseen:** the production Supabase Auth settings ("Confirm email", "Allow new users to sign up", CAPTCHA), the `ADMIN_EMAILS` value, GitHub branch protection, and the DB-stored product/email settings.
- Findings that depend on any of these are marked **Needs verification**, with the check that would confirm them.

---

## Overall security rating: **4 / 10**

**The application layer is well above average for a small team.**

- Every API route goes through one wrapper with a mandatory actor policy.
- User IDs always come from the verified session, never the request body.
- Secrets are compared in constant time.
- Rate limits use a platform-trusted IP and persist across instances; the ones on money-spending paths fail closed.
- Sessions are httpOnly cookies only, webhooks are signature-checked, and CI has a secret scan and an audit gate.

On its own, that layer would rate about 7–8/10.

**The database layer undoes much of it.** The Supabase anon key is public by design, so anything that PostgREST/RPC exposes to `anon` or `authenticated` is effectively a public API that bypasses all of the work above. At this commit:

- One SECURITY DEFINER RPC lets any caller write XP and lesson completion for any user. That is enough to mint certificates.
- One security-definer view very likely lets the anon key edit or delete user rows.
- Two tables have `FOR ALL USING (true)` policies open to `PUBLIC`. One of them feeds the broadcast email cron.
- A further high-severity path depends on configuration: with email verification turned off in production, the `ADMIN_EMAILS` check can be satisfied by anyone who registers an unclaimed admin address.

Until the "Now" items below land, the effective rating is 4.

---

## Scorecard

| Area | Score | One-line justification |
|---|---|---|
| Authentication & sessions | 6 | Cookie-only sessions, rate-limited login and signup, Turnstile. But verification is OFF in production, login auto-confirms unverified accounts, the password minimum is 6, and GoTrue can be called directly. |
| Authorization / IDOR (API routes) | 8 | All 130 wrapped routes declare `allow:` and scope queries by session user ID. No body/query user IDs on learner routes. Minor cohort-leaderboard read. |
| Admin guard & role model | 6 | All 64 `/api/admin/*` routes are `allow: ['admin']`, and the console layout re-checks. But admin can be granted by email string alone, which is fragile with verification off. |
| RLS / DB (policies, definer functions, grants, views) | 2 | RLS is on for all 44 tables, but there is a critical RPC grant, a security-definer view, `PUBLIC` `FOR ALL` policies on 2 tables, and no column limits on learner UPDATE/INSERT. |
| Input validation & XSS | 6 | zod on most mutations, React escaping, `safeJsonLd`, link allow-listing on read. But XP inputs are client-controlled, some routes hand-parse, and markdown renders unsanitized (trusted or self content only). |
| Secrets & config | 7 | No service key in `NEXT_PUBLIC_*`, gitleaks in CI. The Resend key prefix in history is still unrotated, production credentials sit in a dev `.env.local`, and `.gitignore` misses `.env.production`. |
| Headers / CSP | 5 | HSTS, XFO DENY, nosniff and Permissions-Policy are good. The CSP allows `'unsafe-inline' 'unsafe-eval'` and `connect-src https:`, and has no `object-src`/`base-uri`/`form-action`. |
| Rate limiting & abuse | 6 | Strong, layered, fail-closed limits on app routes. But PostgREST and GoTrue can be reached directly with the anon key (signup, testimonials, broadcasts), and XP can be farmed. |
| CI/CD & supply chain | 6 | Careful `pull_request_target` design and a SHA-pinned metadata action. But production secrets are in the env of `npm ci`, the Supabase CLI is unpinned in the deploy job, and auto-merge has no cooldown. |
| Dependencies | 9 | Production tree has 0 advisories. The 9 high and 2 low are dev-only tooling, and the one real root cause (`braces`) is allow-listed with a review date. |
| Privacy / PII | 5 | Emails are masked in logs and certificates are no longer listable. But portfolios are public by default, user UUIDs are exposed, and `public_profiles` lists every public user to anon. |

---

## Executive summary

- **Critical: anyone can forge course completion, XP and certificates.**
  - `record_lesson_quiz_completion` is SECURITY DEFINER and takes `p_user_id` and the XP-per-question value from the caller.
  - It is `GRANT EXECUTE … TO authenticated` and never revoked; via default grants it is very likely callable with the anon key too.
  - Ninety RPC calls and one `POST /api/certificates` produce a genuine-looking verified certificate. The same call can rewrite any other user's progress and XP.
- **Critical (needs a one-query confirmation): the `public_profiles` view runs as its owner and bypasses RLS on `users`.**
  - It is readable by anon for every user, since portfolios default to public.
  - If the default grants include write privileges, which is likely, anon can `PATCH` or `DELETE` user rows through it. A delete cascades through progress, XP and certificates.
  - The app does not use the view at all.
- **High: two policies are open to `PUBLIC` with `USING (true) WITH CHECK (true)`.**
  - On `email_broadcasts`, anyone can create a scheduled broadcast, and the 5-minute cron will send it to the user base.
  - On `fellow_requests`, anyone can read or alter every request.
- **High: the admin console can be taken over through an unclaimed `ADMIN_EMAILS` address.**
  - Production runs with email verification OFF (`docs/ISSUES_KNOWN.md:29`), and signup then creates pre-confirmed accounts for any address.
  - The admin guard grants admin to any session whose email string matches `ADMIN_EMAILS`.
  - Any entry without an existing account can be registered by anyone.
- **High: learners can publish testimonials straight to the homepage.** They do this through PostgREST, setting `status='approved'`, `is_published=true` and any author name, which skips moderation.
- **The app-level API itself also leaks XP and progress integrity.** Flashcard IDs, theory-read lesson IDs and duplicate quiz answers are not validated, so XP can be farmed and lessons completed by script.
- **Supply chain:** CI exposes the production service-role key, Resend key and cron secret to every `npm ci` install script on `main`. Dependabot minor/patch updates auto-merge into that path, and the deploy job runs an unpinned `npx supabase` with the DB password.
- **Everything in the "Now" list is a small change**: about seven SQL statements plus one settings flip. Most are `REVOKE` or `DROP POLICY`, and every affected writer in the app already uses the service-role client, so nothing in the product should break.

---

## Findings

Each finding gives severity, evidence, attack scenario, fix and effort (S/M/L). Paths are relative to `web/`.

### SEC-01 — Unrestricted SECURITY DEFINER RPC forges completion and XP for any user, enabling certificate forgery

- **Severity: Critical.** The anon key is public and the call needs no account (PR:N, very likely) or only a free one (PR:L). There is no user interaction and the attack complexity is low. Integrity impact is high across users: the forged certificates are the product's core trust artifact. Roughly CVSS 8.7–9.1.
- **Evidence:**
  - `supabase/migrations/20260925000002_phase_t2_backend_reliability.sql:144-287` defines `public.record_lesson_quiz_completion(p_user_id uuid, p_lesson_id text, p_score_percentage int, p_correct_count int, p_total_questions int, p_attempts jsonb, p_quiz_correct_xp_per_question int, p_quiz_perfect_bonus_xp int)` as `SECURITY DEFINER` with no `auth.uid()` check. It:
    - upserts `user_lesson_progress` with `status='completed'` for `p_user_id`, unconditionally;
    - inserts `xp_events` of `p_correct_count * p_quiz_correct_xp_per_question`.
  - Line 287: `GRANT EXECUTE ON FUNCTION public.record_lesson_quiz_completion TO authenticated, service_role;`. No later migration revokes it, from `PUBLIC`/`anon` or anyone else.
  - The app only calls it with the service-role client (`apps/web/lib/academy/lessons-db.ts:244`), so the grant serves no purpose.
  - Certificate eligibility is just the set of completed lessons (`apps/web/lib/certificates-db.ts:240-268`).
  - User UUIDs are easy to collect:
    - anon can list them via `public_profiles` (SEC-02);
    - learners see them in the leaderboard API (`apps/web/lib/leaderboard-db.ts:315`);
    - the public portfolio payload includes them (`apps/web/lib/portfolio-db.ts:272`);
    - `GET /api/referrals/resolve` returns them to anonymous callers (`apps/web/app/api/referrals/resolve/route.ts:46`).
  - The same migration also grants `sync_user_xp(uuid)` to authenticated (`:115-137`), with no pinned `search_path`. That function only re-derives XP from the ledger, so it is low impact, but it shows the same pattern.
- **Attack:**
  - An attacker takes the anon key from any page's JS bundle and sends `POST https://<project>.supabase.co/rest/v1/rpc/record_lesson_quiz_completion` with `apikey: <anon>`.
  - The `Authorization` header is `Bearer <anon key>`, or their own access token, which they can copy from their browser cookie.
  - The body is `{"p_user_id":"<self>","p_lesson_id":"les_…","p_score_percentage":100,"p_correct_count":1,"p_total_questions":1,"p_attempts":[],"p_quiz_correct_xp_per_question":100000,"p_quiz_perfect_bonus_xp":0}`.
  - Repeating this for the 90 public lesson IDs, then calling `POST /api/certificates`, yields a "Full curriculum" certificate verifiable at `/verify/<code>`, with inflated XP and level snapshotted onto it.
  - With a victim's UUID, the attacker can instead mark a victim's lessons complete, push them to the top of the leaderboard, or insert junk `quiz_attempts` rows.
- **Fix (S):**
  ```sql
  REVOKE ALL ON FUNCTION public.record_lesson_quiz_completion(uuid,text,int,int,int,jsonb,int,int) FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.record_lesson_quiz_completion(uuid,text,int,int,int,jsonb,int,int) TO service_role;
  REVOKE ALL ON FUNCTION public.sync_user_xp(uuid) FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.sync_user_xp(uuid) TO service_role;
  ALTER FUNCTION public.sync_user_xp(uuid) SET search_path = public, pg_temp;
  ```
  - **Prevent recurrence:**
    - Add `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;`.
    - Add a CI/staging check that fails when any `prosecdef` function in `public` passes `has_function_privilege('anon', oid, 'EXECUTE')` or `has_function_privilege('authenticated', oid, 'EXECUTE')`, unless it is on an explicit allowlist.
  - **Forensics:** after the revoke, look for misuse that may already have happened:
    - `xp_events` rows of type `quiz_correct` whose `xp_amount` exceeds the lesson's question count × the configured XP value;
    - `user_lesson_progress` rows whose `lesson_id` is not in the curriculum;
    - certificates whose holder has `completed` rows with no `theory_read_at`.

### SEC-02 — `public_profiles` is a security-definer, auto-updatable view over `users`

- **Severity: Critical** if the write grants are confirmed; **Medium** (privacy only) if they are not. Write path: AV:N/AC:L/PR:N/UI:N, high integrity and availability impact through cascade deletes.
- **Evidence:**
  - `supabase/migrations/20260910000001_security_hardening_b1.sql:54-78` is a plain `CREATE OR REPLACE VIEW public.public_profiles AS SELECT id, username, name, bio, … FROM public.users WHERE is_portfolio_public = true`. It has no `security_invoker`.
  - Line 78 explicitly grants SELECT to anon.
  - Without `security_invoker`, Postgres checks base-table privileges and RLS as the view owner (`postgres`, which owns `users`). RLS on `users` is therefore bypassed.
  - A single-table view with no joins or aggregates is auto-updatable.
  - `is_portfolio_public` defaults to `true` (`20260805000003_add_portfolio_columns.sql:14`), so effectively every user is in scope.
  - Nothing in the app uses the view; only `apps/web/lib/__tests__/rls.test.ts` references it.
  - Supabase's own database linter flags this pattern as `security_definer_view` (ERROR).
- **Attack:**
  - **Read (confirmed by the explicit grant):** `GET /rest/v1/public_profiles?select=id,name,username,total_xp,last_streak_date` with the anon key lists every user's UUID and profile, including users who never chose a username.
  - **Write (needs verification):** `PATCH /rest/v1/public_profiles?id=eq.<victim>` with the anon key and `{"bio":"…","website_url":"https://evil","is_portfolio_public":false}` defaces or hides any profile. `DELETE /rest/v1/public_profiles?id=neq.00000000-0000-0000-0000-000000000000` deletes every public `users` row, cascading to progress, XP, capstones and certificates.
  - The privileged-column guard trigger still runs as `anon`, so it does block `is_admin` and `is_fellow`. Nothing guards DELETE.
- **Needs verification:** run `select grantee, privilege_type from information_schema.role_table_grants where table_schema='public' and table_name='public_profiles';`. If `anon` has `UPDATE` or `DELETE`, this is Critical. On staging, confirm with `begin; set local role anon; update public.public_profiles set bio = bio where id = '<id>'; rollback;`.
- **Fix (S):** `DROP VIEW public.public_profiles;`, since it is unused. If it is wanted later: `ALTER VIEW … SET (security_invoker = true)` plus `REVOKE INSERT, UPDATE, DELETE ON public.public_profiles FROM PUBLIC, anon, authenticated;`, and expose only the columns a public portfolio needs (drop `id` and `last_streak_date`).

### SEC-03 — `email_broadcasts` is fully writable by anyone; the cron executes what it finds

- **Severity: High.** No privileges needed. The attacker can trigger mass email to the user base, burn provider quota, and block auth email (signup verification and resets) for the day (A:H, I:L). Roughly CVSS 8.2.
- **Evidence:**
  - `supabase/migrations/20260826000003_create_email_broadcasts.sql:62-66` has `CREATE POLICY "Service role has full access to email_broadcasts" ON public.email_broadcasts FOR ALL USING (true) WITH CHECK (true);`. It has no `TO` clause, so it applies to `PUBLIC`.
  - The service role bypasses RLS anyway, so this policy only opens access to anon and authenticated.
  - `apps/web/lib/admin/broadcast-service.ts:496-520`: `processScheduledBroadcasts()` runs every row with `status='scheduled' AND scheduled_at <= now()`, using that row's `template_key` and `recipient_filters`.
  - The cron at `.github/workflows/notification-scheduler.yml` (every 5 minutes) triggers `/api/cron/process-broadcasts`.
- **Attack:** `POST /rest/v1/email_broadcasts` with the anon key and `{"name":"x","template_key":"<any existing template, e.g. a marketing one>","status":"scheduled","scheduled_at":"2026-01-01T00:00:00Z","recipient_filters":{}}`.
  - Within five minutes, the platform mails the template to every matching user.
  - Repeated rows exhaust the daily provider allowance. ISSUE-23/24 showed that this stops verification and password-reset mail.
  - The attacker can also read, cancel or retarget the admin's real broadcasts.
- **Fix (S):** `DROP POLICY "Service role has full access to email_broadcasts" ON public.email_broadcasts;`. Every app writer already uses the service role. Also consider `REVOKE ALL ON public.email_broadcasts FROM anon, authenticated;` as defence in depth.

### SEC-04 — Admin takeover by registering an unclaimed `ADMIN_EMAILS` address while email verification is off

- **Severity: High.** One precondition must hold (AC:H), but the payoff is full admin with no privileges needed (C:H/I:H/A:H). Roughly CVSS 8.1.
- **Evidence:**
  - Production state: `requireEmailVerification` is `false` and `allowSignups` is `true` (`docs/ISSUES_KNOWN.md:29`, read-only check dated 2026-10-17).
  - With verification off, signup calls `supabase.auth.admin.createUser({ email, password, email_confirm: true })` (`apps/web/app/api/auth/signup/route.ts:305-310`). That marks any address confirmed without proving ownership.
  - With verification off, login force-confirms any unconfirmed account that presents the right password (`apps/web/app/api/auth/login/route.ts:103-160`, specifically `:154` `updateUserById(targetUserId, { email_confirm: true })`).
  - Admin is granted if the session email string is in `ADMIN_EMAILS`, in three places:
    - `apps/web/lib/admin/guard.ts:75` (`isAdminEmail(authUser.email)`), which all `/api/admin/*` routes use via `resolveActor`;
    - `apps/web/proxy.ts:363`, which governs the `/admin` pages;
    - `apps/web/lib/admin/authorization.ts:41`, used by the console layout.
- **Attack:**
  - An attacker obtains one `ADMIN_EMAILS` entry that has no auth account yet. Likely candidates are the founder's alternate address, a team or role alias (`admin@`, `hello@`), or a teammate who never signed up. Addresses leak via commit authors, the legal page and the grievance email.
  - They sign up on the normal form with that address, passing Turnstile as a human, and receive a confirmed session.
  - They now hold full admin. They can delete users, run broadcasts to everyone, toggle maintenance and settings, and read the contact inbox, feedback and user PII.
  - Variant: if the attacker had already registered an admin address unconfirmed at any earlier time (the docs note six unconfirmed `auth.users` rows), a plain login now auto-confirms it.
- **Needs verification:** compare every `ADMIN_EMAILS` entry with `auth.users`. Each one must exist, be confirmed, and be controlled by the intended person.
- **Fix (S):**
  1. **Immediately:** set `requireEmailVerification = true`, or claim every `ADMIN_EMAILS` address.
  2. **Stop deriving admin from an email string.** Make `users.is_admin` (already protected by the guard trigger) or `app_metadata.is_admin` the only source. If an env bootstrap is still wanted, key it on user IDs (`ADMIN_USER_IDS`), not emails.
  3. **Delete the auto-confirm branch** in `login/route.ts`.
  4. **Flow B** should never pass `email_confirm: true` for an address that has not been proven.

  The same root cause also lets anyone "squat" any email address (for example `ceo@company.com`). The real owner can then never register, and platform mail goes to their inbox.

### SEC-05 — Learners can publish fake, pre-approved testimonials on the homepage

- **Severity: High (business impact; raw CVSS about 6.5).** Needs a free account (PR:L) and no user interaction. Integrity of public marketing pages, plus fake-endorsement and impersonation exposure (for example under the FTC's 2024 rule on fake reviews).
- **Evidence:**
  - `supabase/migrations/20260809000000_create_testimonials_table.sql:20-23`: `create policy "Users can submit feedback" on testimonials for insert to authenticated with check (auth.uid() = user_id or user_id is null);`. There are no column limits, so `status`, `is_published`, `is_featured`, `author_name`, `author_role` and `rating` are all client-settable.
  - The public site reads `is_published = true AND status = 'approved'` with the service role (`apps/web/lib/admin/feedback-service.ts:338-342`) and renders the result on `/` and `/reviews`.
- **Attack:** `POST /rest/v1/testimonials` with a learner JWT and `{"user_id":null,"content":"Prodily got me hired","status":"approved","is_published":true,"is_featured":true,"author_name":"<real person>","author_role":"Head of Product, <real company>","rating":5,"source_event":"x"}`. It appears on the homepage after the 60-second cache.
  - This skips the moderation queue, the opt-in check and the 3-per-15-minute limit in `apps/web/app/api/testimonials/route.ts`.
  - React escapes the text, so there is no XSS.
- **Fix (S):** drop the INSERT policy, because the API already inserts with the service role. Or keep it with `REVOKE INSERT ON public.testimonials FROM authenticated; GRANT INSERT (content, rating, headline, author_name, author_role) ON public.testimonials TO authenticated;` plus a `WITH CHECK` forcing `status='pending' AND is_published=false`.

### SEC-06 — `fellow_requests` is fully readable and writable by anyone

- **Severity: Medium.** No privileges needed. Exposes internal review data (C:L) and lets anyone tamper with the admin queue (I:L). The public Fellow badge itself is not grantable this way.
- **Evidence:** `supabase/migrations/20260905000001_create_fellow_requests.sql:47-51`: `CREATE POLICY "Service role has full access to fellow_requests" … FOR ALL USING (true) WITH CHECK (true);`, with no `TO` clause, so it applies to `PUBLIC`. The badge comes from `users.is_fellow` (`apps/web/lib/fellow.ts:46`), which the guard protects.
- **Attack:**
  - With the anon key, `GET /rest/v1/fellow_requests` dumps every request: applicant user IDs, admin rejection reasons, reviewer IDs and timestamps.
  - `PATCH` or `DELETE` can approve, reject or erase other learners' pending requests.
  - `POST` can file requests in someone else's name, which poisons the admin queue and the nudge analytics.
- **Fix (S):** drop the policy. The service role does not need it.

### SEC-07 — Learner-writable columns bypass the API's validation (`users`, `capstone_submissions`)

- **Severity: Medium.** Needs a free account. Affects integrity of badges, portfolios and the legal consent record (I:L–M).
- **Evidence:**
  - `users`: `create policy "Users can update own profile" on users for update using (auth.uid() = id);` (`supabase/migrations/20260728000002_create_user_state.sql:225`) has no column limit.
    - The guard trigger (`20261017000001:25-62`) is a deny-list that covers only `is_admin`, `is_fellow`, `curriculum_access_override`, `portfolio_verification_override` and `email`.
    - Learners can therefore write `current_streak`, `longest_streak`, `streak_freezes_available` and `last_streak_date`. Badges read these (`apps/web/lib/badges-db.ts:101-102`) and the leaderboard shows them.
    - They can also write the consent record: `terms_accepted_at`, `terms_version`, `privacy_version`, `age_confirmed_*`. `20260923000001:25` says these come "server-side … never from the request body".
    - `username` is also writable, bypassing `validateUsername` and the reserved names.
    - INSERT on `users` is guarded only for the privileged flags, not for `email` or `total_xp`, and the XP re-derive trigger is BEFORE UPDATE only. This is relevant if a session exists before `ensureUserProfile` runs (see SEC-09).
  - `capstone_submissions`: `"Users manage own capstones" … for all using (auth.uid() = user_id)` (`20260728000002_create_user_state.sql:247`).
- **Attack:**
  - `PATCH /rest/v1/users?id=eq.<self>` with `{"longest_streak":365,"current_streak":365}`, then trigger badge evaluation, earns streak badges.
  - `PATCH /rest/v1/capstone_submissions?id=eq.<own>` with `{"status":"reviewed","reviewed_by":"<admin uuid>","reviewed_at":"…","is_public":true}`. Alternatively, `POST` a capstone for a module the learner has not unlocked.
  - Either way, a fake "reviewed" capstone shows on the public portfolio and counts toward capstone badges and Fellow readiness. The lesson-lock and length checks in `apps/web/lib/capstones-db.ts:266-284, 373-381, 465-471` are skipped.
- **Fix (M):**
  - `REVOKE INSERT, UPDATE ON public.users FROM anon, authenticated;` (all app writers use the service role). Or, if a learner write path is still needed, `GRANT UPDATE (name, bio) ON public.users TO authenticated`.
  - Replace the capstone `FOR ALL` policy with SELECT-only for clients.
  - Treat the guard trigger as an allow-list, not a deny-list.

### SEC-08 — XP and progress integrity through the app's own API (no PostgREST needed)

- **Severity: Medium.** Needs a free account. Lets a learner manipulate the leaderboard, earn levels and badges, and complete the curriculum by script (I:M).
- **Evidence:**
  - **Flashcards:** `POST /api/flashcards/[id]/review` takes any `[id]` string. `recordFlashcardReview` (`apps/web/lib/flashcards-service.ts:185-282`) awards `FLASHCARD_REVIEW` XP once per card ID per day, and never checks the ID against the curriculum. The partial unique index deliberately excludes `flashcard` (`supabase/migrations/20260913000001_xp_event_uniqueness_b8e.sql:128-131`). The route has no rate limit.
  - **Theory read:** for a `lessonId` that is not a real lesson, `recordTheoryReadAction` defaults to a 2-minute estimate and still awards `THEORY_READ` XP (`apps/web/lib/academy/lessons-db.ts:141-185`, `:158`). `active_seconds` and `scroll_percentage` are client-supplied.
  - **Quiz:** the schema has no `max` and does not de-duplicate `question_id` (`apps/web/app/api/v2/lessons/[lessonId]/quiz/route.ts:19`). `correctCount` and `totalQuestions` are computed from the submitted array (`lessons-db.ts:194, 231`), so one known-correct answer repeated N times yields score 100 and N × `QUIZ_CORRECT` XP.
  - Any quiz submission marks the lesson `completed`. The server never checks the curriculum lock before accepting it.
- **Attack:**
  - `for i in 1..10000: POST /api/flashcards/x$i/review {"rating":5}` adds 10,000 × the configured XP.
  - One quiz POST per lesson with the first question's correct answer repeated completes all 90 lessons. `POST /api/certificates` then issues the certificate.
- **Fix (M):**
  - Validate flashcard IDs and lesson IDs against `content/dist`. Reject unknown IDs before any write.
  - Reject duplicate `question_id`s and require `attempts.length === quiz.questions.length`.
  - Enforce the curriculum lock (`resolveLessonAccess`) on the quiz and theory-read routes.
  - Add per-user rate limits on these routes.
  - Consider a minimum score before `completed` is set.

### SEC-09 — Signup abuse controls can be bypassed by calling Supabase Auth directly

- **Severity: Medium.** No privileges needed. Bypasses Turnstile, the IP limits, the `allowSignups` kill switch and consent capture (I:L/A:L). Email cost is bounded by the governed send limits.
- **Evidence:**
  - Turnstile, the per-IP/per-email/aggregate limits and the `allowSignups` switch exist only inside `apps/web/app/api/auth/signup/route.ts:128-225`.
  - The anon key is public, so GoTrue's `POST /auth/v1/signup` and `POST /auth/v1/recover` can be called directly. The docs already note this for password reset (`docs/ISSUES_KNOWN.md:38`).
  - With verification off, `/api/auth/login` force-confirms such accounts (`login/route.ts:154`).
  - The local `supabase/config.toml` has no `[auth.captcha]`, `enable_confirmations = false` and `minimum_password_length = 6`.
- **Attack:** a script creates accounts via `/auth/v1/signup` from rotating IPs, then logs in through `/api/auth/login` to get confirmed sessions. This works even when an admin sets `allowSignups = false`, and the accounts carry no recorded consent.
- **Needs verification:** the production Auth settings for "Allow new users to sign up", "Confirm email" and CAPTCHA.
- **Fix (S/M):**
  - Enable Supabase Auth's native CAPTCHA (Turnstile) so GoTrue enforces it too. Or disable public GoTrue signup and create users only through `admin.createUser` in the route, which Flow B already does.
  - Add a `before_user_created` auth hook that checks `allowSignups`.
  - Remove the auto-confirm branch (see SEC-04).

### SEC-10 — CI hands production secrets to dependency install scripts; the Supabase CLI is unpinned

- **Severity: Medium.** Supply-chain path: a compromised minor or patch release of any of about 1,000 packages, auto-merged, leads to theft of the service-role key and full database access.
- **Evidence:**
  - `.github/workflows/ci.yml:23-29` puts these in the job-level `env` of `build-and-validate`: `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `CRON_SECRET`, `SEND_EMAIL_HOOK_SECRET`. They are live during `npm ci` (`:54`), so every `postinstall` script sees them. The same is true in the `e2e` job (`:133-149`, `npm ci` at `:192`).
  - `.github/workflows/dependabot-auto-merge.yml` auto-merges npm minor and patch updates once checks pass. `dependabot.yml` sets no `cooldown`, so a malicious version published today can reach `main`, and with it the secret-bearing `push` build, within hours.
  - The `deploy-supabase` job runs `npx supabase link/db push` (`ci.yml:325-350`) with `SUPABASE_DB_PASSWORD` and `SUPABASE_ACCESS_TOKEN` in env, with no install step and no version, so it fetches whatever `supabase` npm publishes that day.
- **Fix (S):**
  - Move the secrets out of job-level env, and run `npm ci --ignore-scripts` (rebuild any packages that genuinely need it explicitly).
  - Give tests a staging or mock project, never production keys.
  - Pin the CLI with `npx supabase@<exact>`, or the `supabase/setup-cli` action with a version.
  - Add `cooldown: { default-days: 3 }` in `dependabot.yml`.
  - Confirm that branch protection requires a review if auto-merge stays.

### SEC-11 — Weak Content-Security-Policy

- **Severity: Low.** Defence in depth: I found no XSS sink that takes untrusted input, but the CSP would not contain one if it appeared.
- **Evidence:**
  - `apps/web/next.config.ts:61-62`, confirmed live on `/` and `/login`: `script-src 'self' 'unsafe-inline' 'unsafe-eval' …; connect-src 'self' https: wss:`.
  - It has no `object-src 'none'`, `base-uri 'self'`, `form-action 'self'` or `frame-ancestors`. X-Frame-Options covers framing.
- **Attack:** if any future sink lands untrusted HTML, inline script runs, and `connect-src https:` lets it send data to any host.
- **Fix (M):**
  - Use nonce-based `script-src` (Next 16 supports a per-request nonce set in `proxy.ts`), drop `'unsafe-eval'`, and pin `connect-src` to the Supabase project and analytics hosts.
  - Add `object-src 'none'; base-uri 'self'; form-action 'self'`.
  - Roll out with `Content-Security-Policy-Report-Only` first.

### SEC-12 — CSRF defence rests only on SameSite=Lax; destructive actions need no re-auth

- **Severity: Low.** Exploitable only from a same-site origin (a sibling subdomain of `adityagangwani.me`) or through an admin clicking a link.
- **Evidence:**
  - Session cookies are `SameSite=Lax` (`apps/web/lib/auth/session-cookies.ts`).
  - Only `update-password` checks `Origin`.
  - `POST /api/settings/delete-account` (`route.ts:14-33`) and `/api/settings/reset/*` take no body, no password and no `Origin` check.
  - The app is served from `prodily.adityagangwani.me`, so every other `*.adityagangwani.me` host counts as same-site and its cross-origin POSTs carry the cookies.
  - Cron routes alias `GET = POST` and accept the `admin` actor by cookie (`apps/web/app/api/cron/weekly-recap/route.ts:258`, `daily-reminder/route.ts:221`, `lifecycle/route.ts:84`). A top-level link sent to an admin therefore triggers a run.
- **Fix (S):**
  - In `proxy.ts`, reject non-GET `/api/*` requests whose `Origin` (or `Sec-Fetch-Site`) is not the site origin.
  - Require the current password for delete-account and resets.
  - Remove the `GET` aliases on mutating cron jobs, or make them dry-run for cookie actors.
  - Long term, move to an apex domain the project controls.

### SEC-13 — Unvalidated `avatar_url` is fetched server-side by the OG image route

- **Severity: Low.** A blind, GET-only SSRF from Vercel egress, plus a visitor-tracking pixel.
- **Evidence:**
  - `updatePortfolioSettings` stores `avatar_url: settings.avatarUrl.trim()` with no validation (`apps/web/lib/portfolio-db.ts:531`). It is also writable through PostgREST (SEC-07).
  - `resolveAvatarPublicUrl` passes any `http(s):` or `data:` URL through (`apps/web/lib/avatar/avatar-service.ts:102-109`).
  - The OG route renders `<img src={user.avatarUrl}>` in `ImageResponse` (`apps/web/app/api/og/portfolio/[username]/route.tsx:321-323`), and Satori fetches it server-side.
- **Fix (S):** accept only URLs under `${SUPABASE_URL}/storage/v1/object/public/avatars/<userId>/`, on write and on read, and drop the `data:` and `http:` branches.

### SEC-14 — Markdown rendered without sanitization (self-XSS today)

- **Severity: Low.** The untrusted input is only the learner's own capstone draft.
- **Evidence:**
  - `apps/web/components/capstones/RichEditor.tsx:47-53, 288` renders `marked.parse(value)` into `dangerouslySetInnerHTML`.
  - `apps/web/components/ui/MarkdownRenderer.tsx:46-51` does the same for lesson content, which is repo-authored and so trusted. Its code renderer interpolates the fence language unescaped (`language-${cleanLang}`).
  - Admin and public views render capstone text as plain text (`CapstoneReviewDrawer.tsx:145`, `p/[username]/capstones/[moduleSlug]/page.tsx:132`), so this is not stored XSS today.
- **Fix (S):** run both outputs through `isomorphic-dompurify`, which is already a dependency and used for email HTML, and escape `cleanLang`. This keeps any future reuse of these components on admin or public pages safe.

### SEC-15 — Weak password policy

- **Severity: Low.**
- **Evidence:**
  - `apps/web/app/api/auth/signup/route.ts:23` and `update-password` accept 6 characters with no complexity or breached-password check.
  - `supabase/config.toml:182-185, 228`: `minimum_password_length = 6`, `password_requirements = ""`, `secure_password_change = false`. The production value needs verification.
  - Login is rate-limited (10 per 15 minutes per IP, 5 per 15 minutes per email), which limits online guessing.
- **Fix (S):** minimum length 10 or more, Supabase leaked-password protection on, and `secure_password_change = true`. In-app password change already requires the current password, but a stolen session token can still call GoTrue `PUT /user` directly.

### SEC-16 — Auth email hook accepts weaker verification modes and has no replay window

- **Severity: Low.**
- **Evidence:** `apps/web/app/api/auth/send-email-hook/route.ts:61-160` accepts any of:
  - the raw shared secret as a Bearer or custom header;
  - an HMAC over the raw body alone (no ID or timestamp);
  - base64, base64url or hex encodings.

  It never checks `webhook-timestamp` freshness. Production uses the standard-webhooks `v1,whsec_` mode (`docs/ISSUES_KNOWN.md`, ISSUE-27).
- **Attack:** a captured request can be replayed indefinitely. The impact is resending the same auth email, and idempotency de-duplicates most of it.
- **Fix (S):** accept only the standard-webhooks signature over `id.timestamp.body`, reject timestamps more than 5 minutes old, and remove the plain-secret header modes.

### SEC-17 — Enumeration and data-minimisation gaps

- **Severity: Low.**
- **Evidence:**
  - Anonymous `GET /api/referrals/resolve?code=` returns the user `id` (`apps/web/app/api/referrals/resolve/route.ts:46`).
  - The public portfolio payload includes `user.id` (`apps/web/lib/portfolio-db.ts:272`).
  - Portfolios default to public (`20260805000003:14`): an opt-out model for a learner's progress.
  - `weekly_leaderboard_snapshots` is anon-readable regardless of leaderboard opt-in (`20260805000006:89-90`).
  - `cohort_members` is anon-readable, and anyone can join private cohorts (`20260805000006:111-116`).
  - `GET /api/leaderboard?scope=cohort&cohortId=` serves any cohort to non-members (`apps/web/lib/leaderboard-db.ts:433-458`).
  - `user_friends` lets a user insert one-sided "accepted" friendships.
  - `contact_messages` INSERT is open to `PUBLIC` with `user_id`, `status` and `admin_notes` unconstrained (`20260810000002:22-26`).
  - The waitlist returns 409 for known emails.
  - Flow-B signup returns raw GoTrue `createError.message` (`signup/route.ts:330`).
- **Fix (M):**
  - Drop `id` from public payloads.
  - Make portfolios opt-in.
  - Gate snapshot and cohort reads on opt-in or membership.
  - Constrain the `contact_messages` and `user_friends` policies.
  - Return generic copy for signup errors.

### SEC-18 — Secret hygiene items

- **Severity: Low.**
- **Evidence:**
  - A 28-character prefix of the production `RESEND_API_KEY` is still in git history, and its rotation is still open (`docs/ISSUES_KNOWN.md`, ISSUE-26).
  - The developer machine's `apps/web/.env.local` holds the hosted project's service-role key and a `VERCEL_TOKEN`, among others. It is git-ignored and was not printed. A laptop compromise would therefore mean full production compromise.
  - `.gitignore` ignores `.env` and `.env*.local` but not `.env.production`, `.env.development` or `.env.vercel`. That last one is what `vercel env pull` can produce.
  - gitleaks in CI (`ci.yml:252-273`) would catch a commit, which mitigates this.
- **Fix (S):**
  - Rotate the Resend key.
  - Use a staging project for local development, or scoped and expiring tokens.
  - Ignore `.env*` and allow-list `!.env.example`.

### SEC-19 — Default addresses on an unregistered domain

- **Severity: Low.**
- **Evidence:**
  - `apps/web/lib/admin/settings-service.ts:46, 106-107` default `contactEmail` and `replyToEmail` to `support@prodily.app` and `fromEmail` to `noreply@prodily.app`.
  - Admin audit fallbacks use `admin@prodily.app` (`app/api/admin/announcements/*`).
  - `prodily.app` is NXDOMAIN today.
- **Attack:** if the stored settings fall back to these defaults, whoever registers `prodily.app` receives learner support mail and replies.
- **Needs verification:** check whether `system_settings` overrides all three values.
- **Fix (S):** change the defaults to the live domain, or register `prodily.app` defensively.

### SEC-20 — Dependencies (npm audit)

- **Severity: Info.**
- **Evidence:**
  - `npm audit` in `apps/web` reports 9 high and 2 low:
    - The highs are one root advisory, `braces` GHSA-vfj7-8cjw-p6xm, a stack-exhaustion bug with no fixed release. It fans out through `micromatch` and `fast-glob` into `eslint-config-next`, `@next/eslint-plugin-next`, `shadcn`, `@shadcn/registry`, `ts-morph` and `@ts-morph/common`.
    - The lows are `katex` (prototype pollution) via `mermaid`.
  - All of these are devDependencies. `npm audit --omit=dev` reports **0** vulnerabilities across 245 production packages, and the repo-root lockfile has 0.
  - `braces` is allow-listed in `scripts/ci/npm-audit-allowlist.json`, with a reachability note and a review date of 2026-11-12.
- **Fix:** none needed now. Re-check `braces` by the review date and take `mermaid@12.2` when convenient.

### SEC-21 — Proxy trusts learner-editable `user_metadata` for routing

- **Severity: Info.**
- **Evidence:** `apps/web/proxy.ts:377` (`user_metadata?.curriculum_access_override`) and `:496` (`onboarding_complete`). A user can set both via GoTrue `PUT /user`.
- **Impact:** today this only skips the onboarding redirect. No access decision depends on it.
- **Fix:** read only `app_metadata` or the guarded DB columns, so a future check cannot inherit the trust.

### SEC-22 — SECURITY DEFINER hygiene

- **Severity: Info.**
- **Evidence:**
  - The `CREATE OR REPLACE` at `20260925000002:20-63` and `:78-106` dropped the `SET search_path` that `20260910000001:22` had pinned on `update_user_xp_and_level()` and `sync_user_xp_and_level_on_update()`. Both are trigger-only and revoked, so this is low risk.
  - The guard trigger keys on `current_user IN ('authenticated','anon')`. Any future postgres-owned SECURITY DEFINER function that writes user-supplied columns would bypass it.
- **Fix (S):** re-pin `search_path` on every SECURITY DEFINER function in the same migration as SEC-01, and add the CI grant/search_path check described there.

---

## Prioritized remediation plan

### Now (this week — mostly one migration plus one settings flip)

1. **SEC-01:** revoke `record_lesson_quiz_completion` and `sync_user_xp` from `PUBLIC, anon, authenticated`, then run the forensic queries.
2. **SEC-02:** `DROP VIEW public.public_profiles` (run the grant query first, to know whether it was writable).
3. **SEC-03, SEC-06:** drop the two `PUBLIC` `FOR ALL USING (true)` policies on `email_broadcasts` and `fellow_requests`.
4. **SEC-05:** drop or column-restrict the `testimonials` INSERT policy, and review existing published testimonials for rows that never went through moderation.
5. **SEC-04:** set `requireEmailVerification = true`, check every `ADMIN_EMAILS` entry has a confirmed account owned by the right person, and remove the login auto-confirm branch.
6. **Process:** add a staging/CI check that lists every `public` table, view and function reachable by `anon` or `authenticated` and diffs the result against an allowlist. All three critical and high DB findings are the same mistake: the default Supabase grants plus a missing `TO`/`REVOKE`.

### Next (2–4 weeks)

7. **SEC-04:** make `is_admin` or `app_metadata` the only admin source, and retire email-based admin.
8. **SEC-07:** revoke INSERT/UPDATE on `users` from end-user roles, or column-grant them; make `capstone_submissions` SELECT-only for clients; turn the guard trigger into an allow-list.
9. **SEC-08:** validate flashcard, lesson and question IDs against the curriculum; de-duplicate quiz attempts; enforce the lesson lock server-side; rate-limit the XP routes.
10. **SEC-09:** enable Supabase Auth CAPTCHA, or close GoTrue public signup; add a `before_user_created` hook.
11. **SEC-10:** move secrets out of `npm ci` and use `--ignore-scripts`; pin the Supabase CLI; add a Dependabot cooldown; stop using production keys in CI tests.
12. **SEC-18:** rotate the Resend key and move local development off production credentials.

### Later (next quarter)

13. **SEC-11:** nonce-based CSP, rolled out report-only first.
14. **SEC-12:** Origin check for API mutations in the proxy, re-auth for destructive settings, and an owned apex domain.
15. **SEC-13 to SEC-17, SEC-19:** avatar URL allow-list, DOMPurify on markdown, password policy, hook replay window, data-minimisation items, default addresses.
16. **SEC-20 to SEC-22:** dependency review date, `app_metadata`-only routing, SECURITY DEFINER hygiene.

---

## What's already done well

- **One route contract.**
  - Every API route except the two signature-verified webhooks and the token-based auth callback goes through `withRoute` with a mandatory, non-empty `allow:` policy (`apps/web/lib/api/with-route.ts`, `lib/api/actor.ts`).
  - Learner routes always take the user ID from the session, so I found no body/query user-ID IDOR.
  - All 64 admin API routes are `allow: ['admin']`, and the admin console layout re-checks on the server.
- **Session design.**
  - httpOnly cookies are the only session store. The browser Supabase client has `persistSession: false`, and tokens are never in response bodies for web callers.
  - `getUser()` verification is server-side.
  - Refresh happens in the proxy, and the cookie options are centralised.
- **Careful abuse engineering on the app routes.**
  - Client IP comes from `x-vercel-forwarded-for` or the rightmost XFF hop, not the spoofable leftmost one.
  - Limiters are persistent, and the ones on money-spending paths fail closed.
  - Limits are layered per-IP, per canonical email and aggregate.
  - 429 responses do not reveal which limit was hit.
  - Turnstile runs before costly work, and auth email passes through a governed gateway with per-recipient and global caps.
- **Secrets are handled correctly in code.**
  - `secretsMatch` hashes then uses `timingSafeEqual`.
  - An unset `CRON_SECRET` never authenticates anyone.
  - Webhooks fail closed in production, and Resend webhooks check timestamp freshness.
  - No service-role value reaches any `NEXT_PUBLIC_*` variable or client component.
- **No open redirects.** The callback resolves `next` against its own origin and falls back to `/dashboard` on any origin mismatch, and the hook rebuilds callback links on `NEXT_PUBLIC_SITE_URL`.
- **Output handling.**
  - All JSON-LD goes through `safeJsonLd`.
  - Portfolio links are allow-listed on read (`validateOptionalUrl`), and React 19 blocks `javascript:` URLs.
  - User-generated capstone and reflection text renders as plain text on admin and public pages.
  - Admin-authored email HTML is DOMPurify-sanitised.
- **Database basics.**
  - RLS is enabled on all 44 tables, and service-only tables have no policies.
  - XP, progress, badges and certificates are SELECT-only for clients, and an anti-tamper trigger re-derives `total_xp`.
  - Privileged user columns are trigger-guarded.
  - Most SECURITY DEFINER functions pin `search_path` and are revoked from end-user roles.
  - `e1aa0eb` correctly moved the admin email check onto the verified auth email and closed the governance RPCs.
- **CI and supply chain.**
  - gitleaks runs with a pinned, checksummed binary and a reasoned allowlist.
  - A high/critical `npm audit` gate allows exceptions only with an expiry date.
  - The Dependabot auto-merge workflow never checks out PR code under `pull_request_target`, pins `fetch-metadata` by SHA, and excludes majors, the github-actions ecosystem and non-manifest changes.
  - Scheduler secrets are sent as Bearer headers and never as query strings.
- **Headers.** HSTS (2 years, includeSubDomains), `X-Frame-Options: DENY`, `nosniff`, a strict `Referrer-Policy`, `Permissions-Policy`, and `poweredByHeader: false` are all live in production.
- **Honest internal tracking.** `docs/ISSUES_KNOWN.md` records verified-versus-unverified status and production observations, which made this audit faster and more precise.

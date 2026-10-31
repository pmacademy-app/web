# Prodily — Implementation Fix Plan

**Date:** 2026-10-17
**Baseline:** `pmacademy-app/web`, `main` at `d43e3f2`
**Built from:** the seven audit reports in this folder (01–07) and the verified list in `00-INDEX.md`.

This plan turns about 130 audit findings into a sequenced set of pull requests. Every finding ID from the reports is mapped to a PR or phase in the coverage matrix at the end, so nothing is dropped.

---

## How to read this plan

- **Phases** run in order. Within a phase, PRs marked *parallel* can be worked on at the same time by different people.
- **Each PR** lists the findings it closes, the files involved, the steps, and a "Done when" check. Finding IDs point to the full evidence and suggested code in the topic reports (UX = 01, SEC = 03, ENG = 04, CQ = 05, SEO/AEO = 06, PROD = 07, MKT = 02).
- **Effort:** S = under 2 hours, M = half a day to 2 days, L = more than 2 days.
- **Timeline estimates** assume one full-time engineer plus the founder for decisions and content. Two engineers roughly halve Phases 3 and 4. These are estimates, not measurements.
- Paths are relative to `web/` (the repo root).

### Rules for every PR

1. Branch from `main`; one PR per numbered item below unless it says "can share a PR".
2. Before merging: `npx tsc --noEmit`, `npm run lint`, and `npx vitest run` in `apps/web` all pass. Phase 1 makes `main` green, so this holds from then on.
3. Every migration ships with a `.down.sql` in `supabase/migrations/rollback/` and, for permission changes, a validation script in `supabase/migrations/validation/`, following the pattern of `20261017000001_admin_guard_email_and_rpc_grants.sql`.
4. Anything that touches production settings (Supabase dashboard, Vercel project, DNS) is listed as an **Ops** step and is done by the owner, not by a PR.

---

## Timeline at a glance

| Phase | Goal | Calendar (1 engineer) | Exit criteria |
|---|---|---|---|
| 0 | Owner decisions | Day 0 (a few hours) | D1–D5 decided in writing |
| 1 | Stop the bleeding | Days 1–3 | No anon/learner path to forge XP, send email or edit users; `main` green; the two worst visible bugs gone |
| 2 | Trust and correctness | Weeks 1–2 | Public site states correct facts; emails actually send; learner data correct |
| 3 | Platform safety | Weeks 3–6 | Real-database tests in CI, ordered releases, backups, alerting, hardened auth, accessible app |
| 4 | Growth foundations | Weeks 5–10 | Content exposed to search and AI; capstone feedback loop live; north-star metric tracked |
| 5 | Scale and strategy | Q1 2027 onward | Market bets tested against the kill/pivot criterion |

---

## Phase 0 — Decisions the owner makes first (Day 0)

These block work later in the plan. Each needs a one-line written answer, ideally as an ADR in `docs/decisions/`.

| # | Decision | Why it blocks | Recommended answer | Blocks |
|---|---|---|---|---|
| D1 | **Permanent domain.** `prodily.app` does not resolve; the site and certificates live on `prodily.adityagangwani.me`. | Canonicals, sitemap, certificates, email defaults and cookie scope all depend on it. Search equity is near zero now, so moving is cheapest today. | Register `prodily.app` today. Move the site there with 308 redirects from the subdomain. | PR-09, PR-24, SEC-12, SEC-19, SEO-01 |
| D2 | **Email verification on in production.** Today `requireEmailVerification = false`. | With it off, anyone who registers an unclaimed `ADMIN_EMAILS` address becomes admin (SEC-04). | Turn it on now. | Ops-1 |
| D3 | **Correct title for each module slug.** Four sources disagree; the live `/curriculum` page is wrong. | PR-07 needs one approved list. | Confirm titles against `content/dist/curriculum.json` order: foundations, discovery, design (MVP/PRD/stories), execution, growth (metrics), leadership, technical, strategy, capstone. | PR-07 |
| D4 | **Credential wording.** "Verified" means a complete profile; the certificate requires only lesson completion; Fellow was described as LinkedIn Experience. | PR-08 rewrites the copy. | "Verified" → "Profile complete"; certificate states exactly what it requires; PM Fellow is an award, not a job. | PR-08 |
| D5 | **Turn on the built activation features** (short Core lessons, module-entry unlock) for new signups. | A/B testing needs about 740 learners per group, which is over a year of signups (PROD-01). | Turn on by decision for new accounts; compare before/after cohorts using PR-15's events. | PR-15 Ops step |
| D6 | **Em-dash house style.** Commit `418917d` deleted ~4,950 dashes and broke sentences. | PR-10 needs to know whether to restore dashes or replace them with other punctuation. | Revert the content change; if dashes are banned, replace each by hand with a comma, colon or full stop. | PR-10 |
| D7 | **Paid infrastructure budget.** Vercel Hobby forbids commercial use; Supabase Free caps at 500 MB; free email tiers allow 100–300/day. | Needed before any monetization and before email volume rises (PR-11). | Budget Vercel Pro, Supabase Pro and a paid email tier before Phase 5. | PR-11 capacity check, Phase 5 |
| D8 | **AI capstone grader vs the PRD's "No AI Mentor" rule.** | PROD-04 should not start without it. | Decide in Phase 4; it is not needed before then. | PR-29 |
| D9 | **Dark mode: ship it or remove it.** It is half-built (UX-20). | Affects the design-token work in PR-22. | Remove until there is time to finish it. | PR-22 |

---

## Phase 1 — Stop the bleeding (Days 1–3)

### PR-01 — Lock down database permissions *(Critical; M)*

**Closes:** SEC-01, SEC-02, SEC-03, SEC-05, SEC-06, SEC-22, and the recurrence check from the security report's "Process" item.

**Before writing the migration, run on production (read-only) and save the output:**

```sql
-- Who can execute SECURITY DEFINER functions in public
select p.proname,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_exec
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef order by 1;

-- Was public_profiles writable? (decides SEC-02 severity and forensics)
select grantee, privilege_type from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'public_profiles';

-- Policies that apply to every role
select tablename, policyname, roles, cmd, qual, with_check
from pg_policies where schemaname = 'public' and roles = '{public}' and qual = 'true';
```

**Migration** `supabase/migrations/20261018000001_lockdown_public_grants.sql`:

1. `record_lesson_quiz_completion` and `sync_user_xp`: `REVOKE ALL … FROM PUBLIC, anon, authenticated; GRANT EXECUTE … TO service_role;` and pin `search_path` on `sync_user_xp` (SEC-01). The app calls the quiz RPC only with the service-role client (`apps/web/lib/academy/lessons-db.ts:244`), so nothing in the app breaks.
2. `DROP VIEW public.public_profiles;` (SEC-02). Nothing in the app reads it; update `apps/web/lib/__tests__/rls.test.ts`, which references it.
3. `DROP POLICY "Service role has full access to email_broadcasts" ON public.email_broadcasts;` and the same for `fellow_requests` (SEC-03, SEC-06). The service role bypasses RLS, so these policies only ever opened access to anon and learners. Add `REVOKE ALL ON … FROM anon, authenticated` on both tables.
4. `testimonials`: drop the learner INSERT policy; the API already inserts with the service role (SEC-05).
5. Re-pin `search_path` on every SECURITY DEFINER function that lost it (`update_user_xp_and_level`, `sync_user_xp_and_level_on_update`) (SEC-22).
6. `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;` so future functions start closed.

Ship `rollback/20261018000001_lockdown_public_grants.down.sql` and `validation/20261018000001_lockdown_validation.sql` that re-runs the three queries above and asserts the expected results.

**After deploying, run the forensics** from SEC-01 and SEC-05:
- `xp_events` of type `quiz_correct` whose amount exceeds the lesson's question count × configured XP;
- `user_lesson_progress` rows whose `lesson_id` is not in the curriculum;
- certificates whose holder has completed rows with no `theory_read_at`;
- `testimonials` rows that are published but never passed through the moderation route;
- `email_broadcasts` rows not created by an admin.

Revoke any forged certificates and unpublish any forged testimonials found.

**Done when:** the validation script passes on production; the first query shows no SECURITY DEFINER function executable by `anon` or `authenticated` except an explicit allowlist; quiz completion still works end to end (complete one lesson on production with a test account).

### Ops-1 — Production settings *(owner; S)* — *parallel with PR-01*

In the Supabase dashboard and Vercel:

1. Auth → turn on **Confirm email** and set `requireEmailVerification = true` in app settings (D2, SEC-04).
2. Compare every `ADMIN_EMAILS` entry with `auth.users`. Each must exist, be confirmed and be owned by the intended person. Remove any you don't control (SEC-04).
3. Auth → turn on **leaked-password protection**; set minimum password length to 10 (SEC-15).
4. Auth → enable **CAPTCHA** (Turnstile) so direct GoTrue signups are checked too (SEC-09).
5. Rotate the Resend API key; its prefix is in git history (SEC-18).
6. Register `prodily.app` (D1), even if the move happens later, so nobody else can take it (SEC-19).
7. Check `system_settings` overrides `contactEmail`, `replyToEmail` and `fromEmail`; if not, set them to the live domain (SEC-19).

### PR-02 — Remove the login auto-confirm path *(High; S)*

**Closes:** SEC-04 (code part), part of SEC-09.

- Delete the branch in `apps/web/app/api/auth/login/route.ts:103-160` that calls `updateUserById(…, { email_confirm: true })` for unconfirmed accounts.
- In `apps/web/app/api/auth/signup/route.ts:305-310`, stop passing `email_confirm: true` for an address that has not been proven.
- Return generic copy instead of the raw GoTrue error at `signup/route.ts:330` (SEC-17).

**Done when:** a new signup cannot log in until the email link is clicked; existing tests in `lib/__tests__/auth-*.test.ts` are updated and pass.

### PR-03 — Make `main` green and stop unsafe email sends *(High; M)*

**Closes:** CQ-31, CQ-03, CQ-02, CQ-01. *Can share a PR or be split into four small ones.*

1. **CQ-31:** in `apps/web/components/__tests__/fellow-history-ui.test.tsx:138`, replace `CSS.escape` with a plain attribute selector or polyfill `CSS.escape` in `vitest.setup.ts`.
2. **CQ-03:** in `apps/web/lib/notifications/queue/processor.ts:110-138`, a failed suppression or preferences read must block the send, not allow it. Pass `strict: true` from the daily-reminder and weekly-recap crons.
3. **CQ-02:** disable the scheduler hook for the portfolio-activation campaign until `apps/web/lib/campaigns/portfolio-activation-runner.ts` pages every read with `fetchAllRows`, pages `listUsers` past the first 50, throws on read errors, and sends through the queue.
4. **CQ-01:** in `apps/web/lib/streaks/streaks-db.ts:212` and `:216`, replace `84600000` with a shared `MS_PER_DAY = 86_400_000` (better: step calendar days in the learner's time zone). Throw on a failed profile read instead of returning "not started". Add clock-pinned tests for 20:59 and 21:01 local.

**Done when:** `npx vitest run` is fully green; a forced preferences-read failure in a test blocks the email.

### PR-04 — Fix the two worst visible bugs, plus robots.txt *(High; S)* — *parallel*

**Closes:** UX-01, UX-02, SEO-02, SEO-04 (quick part).

1. **UX-01:** in `apps/web/components/layout/Topbar.tsx:232-236`, remove the `/avatars/aditya.png` fallback and the `includes('aditya')` check. Show the initial, or the `User` icon when there is no name. Search the codebase for other uses of `aditya.png` as a fallback.
2. **UX-02:** in `apps/web/blocks/quiz/QuizBlock.tsx:108-151`, attach the key handler to the quiz container (`onKeyDown` on a focusable wrapper) instead of `window`. Only handle Enter/Space when focus is inside the quiz and not on a button or link. Add a `role="status"` live region that announces "Correct" or "Incorrect: …". Apply the same fix to the flashcard rater if it uses a window listener.
3. **SEO-02:** in `apps/web/app/robots.ts`, change `Disallow: /review` to `/review$` (or list the exact app routes), remove `Disallow: /app`, and add `Allow: /api/og/` before `Disallow: /api/`. Update the robots test.
4. **SEO-04 (quick):** make `/glossary` a 308 (permanent) redirect, or remove it from the sitemap, footer and home page until the glossary hub ships in PR-24.

**Done when:** a learner with no avatar sees their initial; you can Tab to an answer and press Enter on any button while a quiz is on screen; `https://<live host>/robots.txt` no longer blocks `/reviews`, `/apple-touch-icon.png` or `/api/og/…`.

---

## Phase 2 — Trust and correctness (Weeks 1–2)

### PR-05 — Measurement foundation *(enabler; M)* — *start first in Phase 2*

**Closes:** PROD-15. Needed to read PR-06, PR-11, PR-12 and the D5 flag change.

- Add a `product_events` table (service-role writes only, no learner policies) and a small `trackEvent()` helper called from `withRoute` handlers for: signup, onboarding complete, lesson started, lesson completed (with score), quiz submitted, capstone submitted/reviewed, certificate issued, portfolio shared, referral used.
- Add a weekly-cohort retention view and a north-star tile on the admin overview. Proposed north star (PROD-15): **Weekly Mastering Learners**, meaning learners who in a week complete at least one lesson at ≥70% or submit or revise a capstone.
- Relabel the admin experiment readout "No experiment running" while flags are off (it currently compares two control arms).

**Then (Ops, D5):** turn on the Core-lesson and module-entry flags for accounts created after a fixed date. Read first-lesson completion for the two-week cohorts before and after.

### PR-06 — Correct the XP and progress rules in the API *(Medium; M)*

**Closes:** SEC-07, SEC-08, CQ-05.

1. **SEC-07:** migration that revokes INSERT/UPDATE on `public.users` from `anon, authenticated` (all app writers use the service role), makes `capstone_submissions` SELECT-only for clients, and turns the privileged-column guard trigger into an allow-list.
2. **SEC-08:** validate flashcard IDs and lesson IDs against `content/dist` before any write; reject duplicate `question_id`s and require `attempts.length === quiz.questions.length` in `app/api/v2/lessons/[lessonId]/quiz/route.ts`; enforce `resolveLessonAccess` on the quiz and theory-read routes; add per-user rate limits on these three routes.
3. **CQ-05:** in `apps/web/lib/academy/lessons-db.ts:240-270`, log and fall back only when the RPC is missing; on any other RPC error, throw. Use `calculateQuizXp` for the amount.

**Done when:** tests prove that an unknown flashcard ID, a duplicated question and a locked lesson are all rejected; direct `PATCH /rest/v1/users` with a learner token fails.

### PR-07 — One module taxonomy everywhere *(High; M)*

**Closes:** SEO-03, UX-05, PROD-11 (taxonomy part), AEO-05 (module facts). **Needs:** D3.

1. Make `content/dist/curriculum.json` the only source of module order. Add one `MODULE_META` map keyed by module slug with `{ number, title, shortTitle, description }`, using the D3 titles.
2. Point every consumer at it and delete the copies:
   - `apps/web/config/content.ts:21-103` (`MODULES`, marketing and JSON-LD);
   - `apps/web/lib/admin/curriculum-meta.ts:26-99` (academy and onboarding);
   - `MODULE_NAMES` and `MODULE_LABEL` in `apps/web/app/(app)/academy/[moduleSlug]/[lessonId]/page.tsx`;
   - the module mapping in `apps/web/app/(marketing)/lessons/[slug]/page.tsx:23-39`.
3. In `apps/web/app/(marketing)/curriculum/page.tsx:89`, group lessons by `lesson.module`, not by array index.
4. Pick one display scheme, "Module 3 · Lesson 2", for rows, lock text, CTAs, breadcrumbs and the dashboard; keep the global number only in URLs.
5. One word each for Curriculum, Dashboard and Log out; give Leaderboard its own icon.
6. Fix the course-hours figure and the stale capstone numbering and cross-references (PROD-11).
7. Add a test asserting every lesson's breadcrumb module equals the `/curriculum` section that lists it.

**Done when:** live `/curriculum` shows the metrics lessons under the metrics module; the Course JSON-LD `hasPart` matches; the test passes.

### PR-08 — Make credentials and copy say what is true *(High; S–M)* — *parallel*

**Closes:** PROD-08a, PROD-10a, UX-10, UX-18 (copy part), MKT "trust debt", SEO frameworks "proprietary" claim. **Needs:** D4.

1. Rename the portfolio "Verified" check to "Profile complete" (`apps/web/lib/portfolio-readiness.ts:191-197` and its UI).
2. Certificate page and `/verify` state exactly what was required (90 lessons completed).
3. OG card: replace "Evaluated PM Competencies" with "Topics studied".
4. Remove the onboarding line promising recruiters; fix the "quiz calibration" copy so it matches what onboarding actually does, and honour its recommendation (PROD-10a).
5. Rename the leaderboard "Fellow" tier so it doesn't collide with PM Fellow.
6. Remove "~5 mins", hard-coded XP figures, "Start Lesson 1" when that's wrong, and "mastered" copy (UX-10).
7. Replace "See a real portfolio" in `apps/web/config/marketing.ts:15` with a finished exemplar, or remove the link until there is one; fill or remove the founder portfolio's template capstone showing `[Product Name / Feature]`.
8. On `/frameworks`, stop calling well-known frameworks (e.g. IDEO's desirability/feasibility/viability) "proprietary"; credit the source.
9. Send one short correction email to the 234 learners told to list "Company: Prodily" under LinkedIn Experience (owner decision on wording).

**Done when:** none of the claims listed in `02-market-pov.md` "Claims vs reality" is still on the live site.

### PR-09 — Pin the function region *(High; S — config)* — *parallel*

**Closes:** ENG-02.

1. Confirm the Supabase region (Project Settings → General).
2. Set the Vercel project's function region to the nearest match (for example `bom1` for `ap-south-1`); record it in `docs/DEPLOYMENT.md`.
3. Re-measure `/api/health` before and after (today 216–886 ms for one row).

**Done when:** `x-vercel-id` shows the new region and `/api/health` median drops (expected by about 150–200 ms per round trip; estimate).

### PR-10 — Restore lesson punctuation *(High for content; M)* — *content, parallel*

**Closes:** SEO-13. **Needs:** D6.

1. `git revert` the content part of `418917d` (`content/lessons/*.md` only), keep the compiler change if still wanted, and fix its hyphen split in `scripts/compiler/compile.ts`.
2. If dashes are banned, replace each by hand with a comma, colon, parentheses or a full stop. Review in this order: lesson summaries, key takeaways, cheat sheets, first paragraphs, the 479 glossary definitions.
3. Rebuild with `npm run content:build`.

**Done when:** a sample of 20 lessons reads cleanly; lesson 10's "a genuinely well-written vision asynchronous work as the future" sentence is fixed.

### PR-11 — Make scheduled emails actually send *(High; M)*

**Closes:** ENG-01, PROD-05, and the capacity check from ENG-10. **Needs:** D7 (if volume exceeds free tiers).

1. **Capacity check first:** with reminders working, daily email volume will rise from about a quarter of eligible learners to all of them. Compare against the provider limits (Brevo 300/day, Resend 100/day, the app's own default quota of 100/day in `docs/EMAIL_SYSTEM.md:55`). Raise quotas or upgrade before step 2.
2. Move the triggers from GitHub Actions to Supabase `pg_cron` + `pg_net`, calling the same `/api/cron/*` endpoints with `CRON_SECRET` from Supabase Vault. Keep `.github/workflows/notification-scheduler.yml` for manual `workflow_dispatch` only.
3. Make windowed jobs level-triggered: send when local time is at or after the preferred hour and before a cut-off (for example 22:00), and no send is recorded for that local date. The existing idempotency keys (`daily-reminder-${user.id}-${localDate}`) prevent duplicates. Same rule for the weekly recap (once per local week) and lifecycle (`apps/web/lib/growth/lifecycle-run.ts:259`).
4. Write a heartbeat for every job and alert through the existing out-of-band webhook when one is older than twice its interval.
5. **PROD-05 retention bugs:**
   - compute the effective streak (reset to 0 when a day is missed) so the streak-broken email in `apps/web/lib/notifications/lifecycle/segments.ts:102` can fire;
   - use the effective streak in reminder copy (`app/api/cron/daily-reminder/route.ts:181`, `emails/templates/learning/DailyReminder.tsx:23`);
   - back off and cap reminders for lapsed learners;
   - call badge evaluation after XP-awarding events so badges auto-award (ISSUE-23).

**Done when:** for one week, the heartbeat shows every job running on schedule; a test learner at 09:00 local receives a reminder each day; the streak-broken email fires for a test learner who misses a day.

### PR-12 — Activation path fixes *(High; M)*

**Closes:** UX-06, UX-07, PROD-09.

1. **UX-06:** server-render the signup and login page shells; keep only the form inside the client boundary; pass `searchParams` as props. Live `/signup` HTML must contain the heading and form labels, not "Loading signup...".
2. **UX-07:** show a clear message for `?error=email_not_confirmed` on login with a "resend email" action; send verified users to `/onboarding`, not "Go to Dashboard".
3. **PROD-09 / UX-07:** carry a validated `next` parameter through login, signup and onboarding, so "Start Lesson N Free" lands on lesson N after signup. Validate it against the site origin as the auth callback already does.

**Done when:** a Playwright test starting from a public lesson ends on that lesson after signup and verification.

### PR-13 — Code-correctness batch *(High/Medium; M)*

**Closes:** CQ-04, CQ-07, CQ-08, CQ-09, CQ-10, CQ-11, CQ-12, CQ-13, CQ-24. *Can be split by item; each is S except CQ-08.*

- **CQ-08 (High):** `apps/web/hooks/useCapstoneAutosave.ts:144`: flush pending edits on unmount and `pagehide`, make the state updater pure, back up every keystroke, use a user-scoped storage key and clear it on submit. Add tests.
- **CQ-04:** add `event_id` and `.limit(1)` to the legacy dedupe, or move remaining callers to `idempotencyKey`.
- **CQ-07:** flashcards use the typed client, check every `error`, count today's reviews in SQL.
- **CQ-09:** latest-ref callback in `useUsageTimeTracker`; remove the lint suppression. (Two copies exist, in `hooks/` and `lib/hooks/`; keep one.)
- **CQ-10:** stop calling `refreshSession` in `apps/web/lib/auth.ts` resolvers.
- **CQ-11 / CQ-12:** v2 progress route uses typed queries, a conditional update, always returns a row and declares body schemas; same for capstone submit.
- **CQ-13:** replace `void logSystemError(...)` with `after(() => …)` or `await`.
- **CQ-24:** onboarding uses the same `validateUsername` as Settings, including reserved words; add a DB CHECK constraint.

---

## Phase 3 — Platform safety (Weeks 3–6)

### PR-14 — CI supply-chain hardening *(Medium; S)* — *parallel*

**Closes:** SEC-10, SEC-20.

- Move `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `CRON_SECRET` and `SEND_EMAIL_HOOK_SECRET` out of job-level `env` in `.github/workflows/ci.yml` and run `npm ci --ignore-scripts`.
- Tests use a staging or local project, never production keys.
- Pin the Supabase CLI (`supabase/setup-cli` with a version).
- Add `cooldown: { default-days: 3 }` to `.github/dependabot.yml`; confirm branch protection requires review.
- Re-check the `braces` advisory by its allowlist review date (2026-11-12).

### PR-15 — Real-Postgres test tier and permission check *(High; L)*

**Closes:** ENG-05, CQ-32, CQ-33 (partly), and the security report's grant-allowlist check.

- New CI job: `supabase start`, `supabase db reset` (applies every migration), pgTAP tests for RLS, RPCs and triggers, and a generated-types drift check.
- Add a check that lists every `public` table, view and function reachable by `anon` or `authenticated` and fails on anything not in an allowlist. All three Critical/High database findings were this mistake.
- Remove the non-atomic fallback that exists "for unit mocks" in `lessons-db.ts` once tests use a real RPC.
- Fix `dashboard.test.ts` and the 12 suites whose mocks make the code throw unnoticed; add a shared chainable Supabase fake (CQ-32).
- Add behaviour tests for the streak DB layer, capstone autosave and the campaign runner (CQ-33).

### PR-16 — Ordered releases, staging and backups *(High; M)*

**Closes:** ENG-06, ENG-07.

- Gate production promotion on migrations: apply migrations first, then promote the Vercel deployment.
- Wire a staging Supabase project to Vercel Preview and run the authenticated E2E tests there (they were skipped on the last `main` run).
- Nightly encrypted `supabase db dump` to storage outside Supabase; do one restore test and record it in `docs/DEPLOYMENT.md`.

### PR-17 — Error handling and observability *(Medium; M)*

**Closes:** ENG-11, CQ-06, CQ-30, CQ-13 (if not done in PR-13).

- Create `apps/web/instrumentation.ts` (it doesn't exist yet) with `onRequestError`; add an error-boundary beacon for client errors, one timing log line in `withRoute`, and an uptime probe.
- **CQ-06:** remove inner `try/catch` from the ~54 admin handlers so `withRoute` logs incidents; services throw instead of returning `[]`. Start with emails and broadcasts.
- **CQ-30:** one error envelope with a lint rule; migrate raw `fetch('/api…')` to the typed client; replace `console.error` on failure paths with `logSystemError`.

### PR-18 — Auth model hardening *(Medium; M)*

**Closes:** SEC-04 (root cause), SEC-09, SEC-12, SEC-15, SEC-16, SEC-21.

- Admin comes only from `users.is_admin` or `app_metadata.is_admin`; remove email-based admin from `apps/web/lib/admin/guard.ts:75`, `apps/web/proxy.ts:363` and `apps/web/lib/admin/authorization.ts:41`.
- `before_user_created` auth hook that checks `allowSignups` (SEC-09).
- Password minimum 10 in the signup and update-password routes; `secure_password_change = true` (SEC-15).
- Email hook accepts only standard-webhooks signatures over `id.timestamp.body` and rejects timestamps older than 5 minutes (SEC-16).
- Proxy reads `app_metadata` or guarded DB columns, never `user_metadata` (SEC-21).
- Reject non-GET `/api/*` requests whose `Origin` is not the site; require the current password for delete-account and resets; remove `GET` aliases on mutating cron routes (SEC-12).

### PR-19 — Performance on the request path *(Medium; M)*

**Closes:** ENG-03, ENG-04.

- Switch to asymmetric JWT signing keys and `getClaims()` so each request verifies the session locally once instead of calling GoTrue twice (`proxy.ts:293`, `lib/auth.ts:251`).
- Narrow the proxy matcher to routes that need it.
- Move side effects (email flush, badge evaluation, analytics) into `after()`; add an outbox table for events that must be delivered.

### PR-20 — Accessibility and design-system pass *(High; L)* — *frontend track, parallel with PR-14 to PR-19*

**Closes:** UX-03, UX-04, UX-12, UX-13, UX-14, UX-20. **Needs:** D9.

- **UX-04 codemod:** replace emerald/amber/blue/purple-400/500 text on light backgrounds with the success, warning, info and ai tokens; replace `text-locked` body text with `text-ink-muted`. Target 4.5:1 for text.
- **UX-03:** remap shadcn variables in `globals.css` to brand values; split amber out of the `accent` slot so neutral buttons stop glowing orange; add a lint rule against raw palette colours.
- **UX-12 / UX-13:** skip link; move the drawer and all modals to base-ui Dialog (focus trap, Escape, labelled); `aria-current` on nav; one focus style; h1 on every app page.
- **UX-14:** `autoComplete` attributes, 16px inputs (no iOS zoom), reflection label, portfolio switch name and focus, define `--color-destructive-foreground`.
- **UX-20:** remove or finish dark mode per D9.
- Add a Playwright + axe run against real pages (the current a11y gate only covers unused primitives).

---

## Phase 4 — Growth foundations (Weeks 5–10)

Three tracks that can run in parallel: SEO/AEO (content + frontend), product (full-stack), and scale (backend).

### SEO / AEO track

**PR-21 — Metadata, schema and sitemap** *(S–M)*. Closes SEO-06, SEO-07, SEO-08, SEO-09, SEO-10, AEO-05.
- Sitemap: real `lastmod` from content build dates; restore portfolios; add capstone pages; drop redirects.
- Portfolio canonical lowercase plus redirect.
- FAQ answers server-rendered, old brand removed from title, a concrete "how long" answer.
- Schema: replace invalid `CourseUnit`, drop `grantee`, fix the level mapping (85/90 lessons say "Advanced"), add dates; one Person `@id`; Organization `sameAs`.
- `twitter:site`; de-duplicate the brand in titles; compress the OG image.
- **Ops:** verify Google Search Console and Bing Webmaster Tools; submit the sitemap (AEO-01).

**PR-22 — Lesson titles and answer-first content** *(M)*. Closes SEO-05, AEO-02.
- New titles and descriptions for all 90 lessons, the top 20 hand-written first, targeting real queries ("RICE vs MoSCoW", "What is a PRD?") instead of "Lesson 29: …".
- An "In short" answer box at the top of each public lesson; show key terms, the cheat sheet and interview questions publicly; keep quizzes, flashcards and capstones behind sign-in.

**PR-23 — Glossary hub and framework pages** *(M–L)*. Closes SEO-04, SEO-11.
- `/glossary` A–Z hub from `content/master_glossary.json` (479 terms) with `DefinedTermSet`.
- First 10 `/frameworks/[slug]` pages with attribution.
- Auto-link "Lesson N" mentions and glossary terms; add prerequisite and "builds toward" blocks.

**PR-24 — Authority and AI visibility** *(S–M)*. Closes AEO-03, AEO-04, AEO-06, AEO-07, SEO-01 (if moving domain per D1), E-E-A-T items. **Needs:** D1.
- Domain move with 308 redirects and a Search Console change of address, if D1 is to move.
- Visible bylines and "updated" dates on lessons; rewrite `/about` with founder credentials and the editorial process.
- `llms.txt` route; IndexNow on content build; explicit AI-crawler policy in robots; check Vercel bot settings don't block them.
- Monthly AI-answer check on a fixed set of prompts; tag AI referrals in analytics.
- Later: an original-data report from anonymised learner data (AEO-06).

### Product track

**PR-25 — Capstone feedback loop** *(L; do first in this track)*. Closes PROD-03.
- Rubric per capstone from the existing `requirements` lists in `apps/web/config/capstones.ts`.
- Admin review records a score per rubric line and written feedback, not just approve/reject (`app/api/admin/capstones/[id]/review/route.ts:30-35`).
- Allow revise-and-resubmit after rejection (`lib/capstones.ts:170-176`); notify the learner.

**PR-26 — "Completed" means "learned"** *(M)*. Closes PROD-02.
- Mastery state at ≥70%; below that, the lesson is "attempted", not "completed".
- Wrong answers feed the flashcard queue; graded inline concept checks; rewrite the weakest 20% of quiz items (Modules 6–9 first).

**PR-27 — Weekly goal and outcome-based recap** *(M)*. Closes PROD-06, PROD-13a.
- Learner-set weekly goal and session size; goal-at-risk nudge; weekly recap reports progress against the goal and portfolio views.

**PR-28 — App UX second pass** *(M)*. Closes UX-08, UX-09, UX-11, UX-15.
- Lesson reading column 68ch, one body size, three callout styles (UX-08).
- Learner-friendly theory gate message and locked-tab hints (UX-09).
- Dashboard h1 and a single "Up next" driven by the onboarding resolver (UX-11).
- Toasts instead of silent failures and `alert()`; route-shaped skeletons (UX-15).

### Scale track

**PR-29 — Move aggregation into Postgres and protect the free tier** *(M–L)*. Closes ENG-08, ENG-09, ENG-10.
- Leaderboard ranking in SQL or a maintained weekly table instead of reloading every user and XP event per instance.
- Turn on retention jobs after reviewing dry-run counts; add a DB-size alert at 70% of the plan limit; drop duplicate indexes.
- Email channel and quota plan matched to D7.

**PR-30 — Lighter lesson pages and faster CI** *(M)*. Closes ENG-12, SEO-12, ENG-14, CQ-19.
- Server-render public lesson blocks to remove the duplicated RSC payload (50–62% of each page's HTML today); render Mermaid diagrams statically; static search index.
- Drop about 20 unnecessary `"use client"` boundaries (CQ-19).
- De-duplicate the double build in CI; validate migrations in PRs.

---

## Phase 5 — Scale and strategy (Q1 2027 onward)

These are bets, not fixes. Run them against the market report's kill/pivot criterion: if by the end of Q1 2027 Prodily cannot sustain about 50 reviewed capstones a month and no pilot employer would interview from portfolios, stop investing in credential features.

**Market bets (MKT, from `02-market-pov.md`)**
1. Narrow the target: Indian final-year students and in-tech switchers preparing for APM, PM-intern and case-competition rounds. Rewrite the homepage message around "Do the PM assignment before the interview asks for it."
2. Campus pilot: five product clubs or one case competition, a 4-week APM prep sprint, 5–10 volunteer reviewers who are working PMs.
3. Reviewer network with a public rubric; show reviewer name and company on approved work (with consent); commit a review window once turnaround data supports it.
4. Paid expert review or mock-interview test at a low INR price, never gating the certificate or Fellow status.
5. Employer pilot: 2–3 startups set sponsored capstone briefs and see top submissions.
6. Move to paid infrastructure (D7) before the first revenue.

**Product (PROD)**
- PROD-07 module credentials (mastery + approved capstone) and a graduation path.
- PROD-08b Practitioner certificate tier; Fellow requires Practitioner plus a Module 9 case study.
- PROD-12 one case drill per module, saved to the portfolio; later AI mock interviews if D8 allows.
- PROD-14 monthly start cohorts with a weekly cohort email; study pairs with a two-sided referral reward; peer review once the rubric exists.
- PROD-16 content: AI PM mini-track, "Breaking into PM" module, experimentation lab, SQL lesson, one real India case per module; re-scope capstones to skills the lessons teach.
- PROD-04 AI first-pass capstone grader, only after PR-25 and D8.
- PROD-13b opt-in "open to roles" directory, only after PROD-08b.
- PROD-10b placement check / test-out per module.
- The "What to cut" list in `07-product-improvements.md`: two primary progress currencies, 4-button flashcard rater, remove static cohorts, delete unused marketing sections and stubs, keep skill radar private.

**Engineering (ENG)**
- ENG-13 repositories, `server-only`, user-scoped clients so RLS becomes a real second line of defence.
- ENG-15 workspaces with a separate content-compiler package; zod env schema.
- Replace `unstable_cache` with `use cache` (about 10 modules).
- ENG-16 fix the README quickstart (`npm install` at the root installs nothing), docs drift, script sprawl.

**Security (SEC), lower priority**
- SEC-11 nonce-based CSP, rolled out report-only first.
- SEC-13 avatar URL allow-list (only the Supabase avatars bucket).
- SEC-14 DOMPurify on `RichEditor` and `MarkdownRenderer` output; escape the code-fence language.
- SEC-17 data minimisation: drop user `id` from public payloads, portfolios opt-in, gate snapshot and cohort reads, constrain `contact_messages` and `user_friends` policies.
- SEC-18 move local development off production credentials; ignore `.env*` except `.env.example`.

**UX, lower priority**
- UX-16 mobile settings list, 12px text floor, 44px buttons.
- UX-17 `MotionConfig reducedMotion="user"`, no perpetual spinners, cookie-backed sidebar state.
- UX-19 app voice pass; remove internal jargon ("AST Verified").
- UX-21 regenerate design docs; UX-22 remove orphans and dead components.

**Code quality, incremental**
- CQ-14 / CQ-15 widen the `as unknown as` / `DBChain` ban with a shrinking allowlist; remove `as any` where generated types exist.
- CQ-23 / CQ-26 consolidate duplicated helpers (site URL ×51, `formatDateTime`, `escapeHtml`, `fetchAllRows`, option lists).
- CQ-25 split `lib/admin/service.ts`, `AdminCreateBroadcastModal.tsx` and `lesson-content.tsx`.
- CQ-16 / CQ-17 server-load the capstone page; deterministic date formatting during SSR.
- CQ-18, CQ-20, CQ-21, CQ-22, CQ-27, CQ-28, CQ-29: cleanup items and the 22 non-test lint warnings; add `knip` to CI for dead code.

---

## Coverage matrix

Every finding ID in the seven reports and where it is fixed.

### Security (03)

| ID | Fixed in | ID | Fixed in |
|---|---|---|---|
| SEC-01 | PR-01 | SEC-12 | PR-18 |
| SEC-02 | PR-01 | SEC-13 | Phase 5 |
| SEC-03 | PR-01 | SEC-14 | Phase 5 |
| SEC-04 | Ops-1, PR-02, PR-18 | SEC-15 | Ops-1, PR-18 |
| SEC-05 | PR-01 | SEC-16 | PR-18 |
| SEC-06 | PR-01 | SEC-17 | PR-02 (signup copy), Phase 5 |
| SEC-07 | PR-06 | SEC-18 | Ops-1 (key), Phase 5 |
| SEC-08 | PR-06 | SEC-19 | Ops-1 |
| SEC-09 | Ops-1, PR-02, PR-18 | SEC-20 | PR-14 |
| SEC-10 | PR-14 | SEC-21 | PR-18 |
| SEC-11 | Phase 5 | SEC-22 | PR-01 |

### UI / UX (01)

| ID | Fixed in | ID | Fixed in |
|---|---|---|---|
| UX-01 | PR-04 | UX-12 | PR-20 |
| UX-02 | PR-04 | UX-13 | PR-20 |
| UX-03 | PR-20 | UX-14 | PR-20 |
| UX-04 | PR-20 | UX-15 | PR-28 |
| UX-05 | PR-07 | UX-16 | Phase 5 |
| UX-06 | PR-12 | UX-17 | Phase 5 |
| UX-07 | PR-12 | UX-18 | PR-08 |
| UX-08 | PR-28 | UX-19 | Phase 5 |
| UX-09 | PR-28 | UX-20 | PR-20 (D9) |
| UX-10 | PR-08 | UX-21 | Phase 5 |
| UX-11 | PR-28 | UX-22 | Phase 5 |

### Engineering (04)

| ID | Fixed in | ID | Fixed in |
|---|---|---|---|
| ENG-01 | PR-11 | ENG-09 | PR-29 |
| ENG-02 | PR-09 | ENG-10 | PR-11 (check), PR-29 |
| ENG-03 | PR-19 | ENG-11 | PR-17 |
| ENG-04 | PR-19 | ENG-12 | PR-30 |
| ENG-05 | PR-15 | ENG-13 | Phase 5 |
| ENG-06 | PR-16 | ENG-14 | PR-30 |
| ENG-07 | PR-16 | ENG-15 | Phase 5 |
| ENG-08 | PR-29 | ENG-16 | Phase 5 |

### Code quality (05)

| ID | Fixed in | ID | Fixed in | ID | Fixed in |
|---|---|---|---|---|---|
| CQ-01 | PR-03 | CQ-12 | PR-13 | CQ-23 | Phase 5 |
| CQ-02 | PR-03 | CQ-13 | PR-13 | CQ-24 | PR-13 |
| CQ-03 | PR-03 | CQ-14 | Phase 5 | CQ-25 | Phase 5 |
| CQ-04 | PR-13 | CQ-15 | Phase 5 | CQ-26 | Phase 5 |
| CQ-05 | PR-06 | CQ-16 | Phase 5 | CQ-27 | Phase 5 |
| CQ-06 | PR-17 | CQ-17 | Phase 5 | CQ-28 | Phase 5 |
| CQ-07 | PR-13 | CQ-18 | Phase 5 | CQ-29 | Phase 5 |
| CQ-08 | PR-13 | CQ-19 | PR-30 | CQ-30 | PR-17 |
| CQ-09 | PR-13 | CQ-20 | Phase 5 | CQ-31 | PR-03 |
| CQ-10 | PR-13 | CQ-21 | Phase 5 | CQ-32 | PR-15 |
| CQ-11 | PR-13 | CQ-22 | Phase 5 | CQ-33 | PR-15 |

### SEO / AEO (06)

| ID | Fixed in | ID | Fixed in |
|---|---|---|---|
| SEO-01 | D1, Ops-1, PR-24 | SEO-11 | PR-23 |
| SEO-02 | PR-04 | SEO-12 | PR-30 |
| SEO-03 | PR-07 | SEO-13 | PR-10 |
| SEO-04 | PR-04 (redirect), PR-23 (hub) | AEO-01 | PR-21 (Search Console), PR-24 |
| SEO-05 | PR-22 | AEO-02 | PR-22 |
| SEO-06 | PR-21 | AEO-03 | PR-24 |
| SEO-07 | PR-21 | AEO-04 | PR-24 |
| SEO-08 | PR-21 | AEO-05 | PR-07, PR-21 |
| SEO-09 | PR-21 | AEO-06 | PR-24 (later) |
| SEO-10 | PR-21 | AEO-07 | PR-24 |

### Product (07)

| ID | Fixed in | ID | Fixed in |
|---|---|---|---|
| PROD-01 | D5, PR-05 | PROD-09 | PR-12 |
| PROD-02 | PR-26 | PROD-10 | PR-08 (10a), Phase 5 (10b) |
| PROD-03 | PR-25 | PROD-11 | PR-07 |
| PROD-04 | Phase 5 (D8) | PROD-12 | Phase 5 |
| PROD-05 | PR-11 | PROD-13 | PR-27 (13a), Phase 5 (13b) |
| PROD-06 | PR-27 | PROD-14 | Phase 5 |
| PROD-07 | Phase 5 | PROD-15 | PR-05 |
| PROD-08 | PR-08 (08a), Phase 5 (08b) | PROD-16 | Phase 5 |

### Market (02)

The market report has recommendations rather than numbered findings. Its "Now" trust-debt items are in PR-08, PR-07 and D1; activation is in D5, PR-05 and PR-12; the infrastructure move is D7; the campus pilot, reviewer network, paid-review test and employer pilot are in Phase 5.

---

## Risks and sequencing notes

- **PR-01 before anything public.** The permission holes let anyone with the public anon key forge certificates, send email to all users and (if the grants exist) edit or delete user rows. Nothing else matters until they're closed.
- **PR-11 raises email volume.** Today most reminders never send. Fixing the scheduler can multiply daily sends; do the capacity check first or the provider quota will block signup and password-reset emails, which happened before (ISSUE-23/24).
- **D5 and PR-05 go together.** Turning on the activation flags without events means the change can't be measured.
- **PR-07 before PR-21/22.** Schema and lesson metadata read module names; fix the source first.
- **Domain move (D1/PR-24) touches canonicals, certificate URLs and cookies.** Keep 308 redirects from the subdomain permanently so existing certificate links keep working.
- **Revoking grants (PR-01, PR-06)** assumes every app write uses the service-role client. The security audit found this to be true; the validation script and an end-to-end lesson completion on production confirm it.

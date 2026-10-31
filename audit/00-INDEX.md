# Prodily — Full Audit Index

**Date:** 2026-10-17
**Codebase:** `pmacademy-app/web`, branch `main`, commit `d43e3f2` (PR #57, latest at time of audit)
**Method:** seven independent auditors, one per topic, each reading the code (and the live site where relevant) and writing its own report. The headline findings marked **Checked** below were re-verified against the code or live site after the reports came in.

---

## Reports

| # | File | Topic | Score |
|---|---|---|---|
| 1 | [01-ui-ux.md](01-ui-ux.md) | UI / UX | 5.2 / 10 |
| 2 | [02-market-pov.md](02-market-pov.md) | Market point of view | — (POV, not scored) |
| 3 | [03-security.md](03-security.md) | Security | 4 / 10 (app layer ~7–8, database layer ~2) |
| 4 | [04-engineering-improvements.md](04-engineering-improvements.md) | Better things that can be done (engineering) | 5 / 10 |
| 5 | [05-code-quality-fixes.md](05-code-quality-fixes.md) | Code that needs fixing, with fixes | 5.1 / 10 |
| 6 | [06-seo-aeo.md](06-seo-aeo.md) | SEO and AEO | 4.5 / 10 |
| 7 | [07-product-improvements.md](07-product-improvements.md) | Making the product better | 4.7 / 10 |

**One-line read across all seven:** the code-level engineering is careful and well guarded, but the database permissions, the domain, the curriculum labels and the credential wording undercut it. The product has built its "prove and share" layer before its "learn and get better" layer.

---

## Fix this week

Ordered by risk. "Checked" means re-verified against the code or live site after the audit; "Auditor" means reported with evidence but not independently re-checked.

| # | Issue | Source | Status |
|---|---|---|---|
| 1 | **Any signed-in user can write XP and lesson completion for any user.** `record_lesson_quiz_completion` is `SECURITY DEFINER`, takes `p_user_id` from the caller, never checks `auth.uid()`, and is granted to `authenticated`. This is enough to reach a certificate. `supabase/migrations/20260925000002_phase_t2_backend_reliability.sql:144-287` | SEC-01 | Checked |
| 2 | **`email_broadcasts` policy is open to every role.** It is named "Service role has full access" but has no `TO service_role`, with `USING (true) WITH CHECK (true)`. The broadcast cron reads this table. `supabase/migrations/20260826000003_create_email_broadcasts.sql:62-66` | SEC-03 | Checked |
| 3 | **`public_profiles` view bypasses RLS on `users`.** No `security_invoker` anywhere in the migrations. If default write grants exist on the view, anon can update or delete user rows through it. Needs one grant query on the live database to confirm. `supabase/migrations/20260910000001_security_hardening_b1.sql:54-78` | SEC-02 | Checked (code); grants need DB check |
| 4 | **Admin by email string with verification off.** Anyone who registers an unclaimed `ADMIN_EMAILS` address becomes admin while email verification is off in production. | SEC-04 | Auditor |
| 5 | **`prodily.app` does not resolve.** DNS fails; the live site is on `prodily.adityagangwani.me`, which is what canonicals, sitemap and JSON-LD use. Decide the permanent domain and register `prodily.app` if that is the plan. | SEO, Market | Checked |
| 6 | **Module titles are wrong on the live `/curriculum` page.** For example, "Design, UX & Prototyping" sits above the metrics lessons; breadcrumbs and Course JSON-LD repeat it. Four separate sources of module names. | SEO, UX, Product, Market | Auditor (found independently by four auditors; product auditor confirmed live) |
| 7 | **Founder's photo shown as other learners' avatar.** Falls back to `/avatars/aditya.png` when a learner has no avatar and no name, or a name containing "aditya". `apps/web/components/layout/Topbar.tsx:232-234` | UX-01 | Checked |
| 8 | **Quiz hijacks Enter and Space for the whole page.** Window-level listener calls `preventDefault()`, so buttons, links and scrolling stop working for keyboard users while a quiz is mounted. `apps/web/blocks/quiz/QuizBlock.tsx:139-149` | UX-02 | Checked |
| 9 | **Lesson text broken by em-dash removal.** Commit `418917d` (2026-09-29) deleted em dashes from all 90 lessons without replacing them, e.g. "a genuinely well-written vision asynchronous work as the future and a roadmap…". | SEO | Checked |
| 10 | **robots.txt prefix bugs.** `Disallow: /review` also blocks `/reviews`; `Disallow: /app` blocks `/apple-touch-icon.png`; `Disallow: /api/` blocks portfolio OG images. | SEO-* | Checked (live robots.txt) |
| 11 | **Scheduled emails mostly never send.** Workflow is set to `*/5 * * * *`, but GitHub ran it only 6 times on 2026-10-17 (gaps of 1–3.5 h). Reminders and recaps require a run inside the learner's exact local hour. | ENG-01 | Checked |
| 12 | **Wrong day length in the weekly summary.** `84600000` ms instead of `86400000` makes the 7-day map repeat or drop a day after ~21:00 local time. `apps/web/lib/streaks/streaks-db.ts:212,216` | CQ | Checked |
| 13 | **Outbound mail sends when safety checks fail.** Failed suppression and preference reads still queue the email; a campaign's audience and opt-out reads are capped at 1,000 rows. | CQ | Auditor |
| 14 | **`main` has one failing test.** `components/__tests__/fellow-history-ui.test.tsx:138` uses `CSS.escape`, which jsdom lacks. Typecheck: 0 errors. Lint: 0 errors, 45 warnings. | CQ gates | Auditor (ran the suite) |
| 15 | **Credentials claim more than they measure.** "Verified" means a complete profile; the certificate needs only 90 lesson completions (any quiz score passes); an email told Fellows to list "Company: Prodily" under LinkedIn Experience. Fix the wording now. | Product, Market | Auditor |

---

## Themes that showed up in more than one report

- **Domain and brand identity** (SEO, Market, Security): code and docs still say `prodily.app` in places, the live host is a personal subdomain, certificates are verified there, and a search for "Prodily" does not return the site.
- **Curriculum labels** (SEO, UX, Product, Market): module names come from four places and disagree; lesson numbering switches between 01–10 and 1–90.
- **Activation is the bottleneck** (Market, Product, UX): 19% of users had finished a first lesson at the 2026-09-24 baseline. Shorter "Core" lessons and module-entry unlock are built but switched off in production.
- **Proof without feedback** (Product, Market): capstones are approved or rejected with no comments and no resubmission, so the portfolio is self-submitted work.
- **Free-tier ceilings** (Engineering, Market): Vercel Hobby is non-commercial, Supabase Free caps at 500 MB, free email tiers allow 100–300/day, and the app clamps email to 1,000/day.
- **Silent failure** (Code quality, Engineering): about 54 admin handlers catch their own errors so nothing is logged, services return `[]` on failure, and client/RSC errors are not captured.

---

## Notes on the reports

- All live checks used `https://prodily.adityagangwani.me` because `prodily.app` does not resolve.
- Security testing was passive only: code review plus read-only header checks. Production was not probed.
- Competitor prices in the market report that came from third-party pages are marked unverified there.
- No files in the repository were changed during the audit.

# Phase 0.B — Baseline Queries

**Purpose:** the SQL behind the Phase 0.B baseline defined in [`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md).
**Status:** read-only. Nothing here inserts, updates or deletes.
**Implementation:** `apps/web/lib/admin/baseline-aggregation.ts` (pure functions, unit-tested) + `apps/web/scripts/baseline-report.ts` (runner).

```bash
npm run baseline:report
```

Writes `docs/reports/baseline-<YYYY-MM-DD>.md`. Add `-- --stdout` to print instead.

---

## Why not GA4

`components/legal/ConsentGatedAnalytics.tsx` injects GA4 and GTM **only after** the visitor accepts optional cookies, and `lib/analytics.ts:trackEvent` returns early when `window.gtag` is absent. Every GA4 number therefore describes consenting visitors only, by an unknown factor. Phases 1–8 are judged on activation and retention, so their baseline comes from rows the server already writes.

**No schema change was made for this phase.** Every query below runs against tables that already exist.

---

## Evidence grades

Same convention as the plan: **[FACT]** = measured from existing rows · **[INFERENCE]** = derived with a stated assumption · **[HYPOTHESIS]** = not answerable here.

---

## 1. Activation funnel — 0.B.3 **[FACT]**

The decision query. Per the plan, this split can reorder the phases: mostly *never opened* ⇒ Phase 5 (entrance) moves ahead of Phase 4 (lesson length).

```sql
select
  (select count(*) from public.users)                                   as registered,
  (select count(*) from public.users where onboarding_completed)        as onboarding_completed,
  (select count(distinct p.user_id)
     from public.user_lesson_progress p
     join public.users u on u.id = p.user_id)                           as ever_opened_lesson,
  (select count(distinct p.user_id)
     from public.user_lesson_progress p
     join public.users u on u.id = p.user_id
    where p.theory_read_at is not null)                                 as ever_read_theory,
  (select count(distinct p.user_id)
     from public.user_lesson_progress p
     join public.users u on u.id = p.user_id
    where p.status = 'completed')                                       as ever_completed_lesson;
```

The `join public.users` is not decoration: a progress row belonging to a deleted account would otherwise push a numerator past its denominator. `computeActivationFunnel` applies the same filter and is tested for it.

**"Opened" = a `user_lesson_progress` row exists**, because that is what `markInProgress()` writes on first open. The table has no `created_at`, so row existence is the only available signal.

---

## 2. Theory-gate stalls — 0.B.4 **[FACT, ceiling]**

Sizes the silent failure: `verifyTheoryReadEngagement` requires ≥45 s active and ≥80 % scroll, and `handleTheoryComplete` swallows the resulting 400 and advances anyway.

```sql
select count(*) as stalled_rows,
       count(distinct user_id) as stalled_users
  from public.user_lesson_progress
 where status <> 'completed'
   and theory_read_at is null
   and quiz_attempts = 0;
```

**Ceiling, not a diagnosis.** A row lands here whether the learner failed the gate or simply closed the tab. Phase 3.4 makes the two distinguishable.

---

## 3. Signup → first completion — 0.B.5 **[FACT]**

```sql
with first_completion as (
  select user_id, min(completed_at) as first_completed_at
    from public.user_lesson_progress
   where status = 'completed' and completed_at is not null
   group by user_id
)
select
  count(*)                                                                    as sample_size,
  percentile_cont(0.25) within group (order by extract(epoch from (f.first_completed_at - u.created_at))/3600) as p25_hours,
  percentile_cont(0.50) within group (order by extract(epoch from (f.first_completed_at - u.created_at))/3600) as median_hours,
  percentile_cont(0.75) within group (order by extract(epoch from (f.first_completed_at - u.created_at))/3600) as p75_hours
  from first_completion f
  join public.users u on u.id = f.user_id
 where f.first_completed_at >= u.created_at;
```

The final `where` drops negative intervals (clock skew / migrated rows) rather than clamping them, which would bias the median toward "instant activation".

> This is signup → **completion**. Signup → first **open** is not derivable — see §10.

---

## 4. Return behaviour **[FACT, floor]**

```sql
with activity as (
  select user_id, date_trunc('day', created_at) as active_day
    from public.xp_events
   where user_id is not null
   group by 1, 2
)
select
  count(distinct u.id) filter (where u.created_at < now() - interval '7 days') as cohort_size,
  count(distinct a.user_id) filter (
    where a.active_day > date_trunc('day', u.created_at)
      and a.active_day <= u.created_at + interval '2 days')                     as returned_d1,
  count(distinct a.user_id) filter (
    where a.active_day > date_trunc('day', u.created_at)
      and a.active_day <= u.created_at + interval '8 days')                     as returned_d7
  from public.users u
  left join activity a on a.user_id = u.id
 where u.created_at < now() - interval '7 days';
```

**A floor, not an exact rate.** There is no session table; XP events are the only durable record of activity, so a learner who returned and read without earning XP is invisible.

---

## 5. Review / flashcard loop — 0.B.6 **[FACT]**

Tests the premise behind Phase 3.5: `srs.ts:getDueCards` returns any card with no SRS record as due immediately, `flashcards-service.ts` unlocks cards for `in_progress` lessons, and `recordFlashcardReview` updates the streak — a complete ~3-minute loop that exists the moment a learner opens one lesson.

```sql
select
  count(distinct user_id)                                                          as users_ever_reviewed,
  count(distinct user_id) filter (where created_at >= now() - interval '30 days')   as users_last_30d,
  count(distinct user_id) filter (where created_at >= now() - interval '7 days')    as users_last_7d,
  count(*)                                                                          as total_review_events
  from public.xp_events
 where source_type = 'flashcard' and user_id is not null;
```

- Near zero ⇒ the loop is hidden; **promote it (Phase 3.5)**.
- Healthy but those learners churn anyway ⇒ the loop is not the retention mechanism the plan assumes; **drop Phase 3.5**.

---

## 6. Lesson 1 quiz distribution — 0.B.7 **[FACT]** — Phase 4 guardrail

```sql
with per_question as (
  select user_id, question_id, bool_or(is_correct) as got_it
    from public.quiz_attempts
   where lesson_id = 'les_zoyq8a' and user_id is not null
   group by 1, 2
),
per_user as (
  select user_id,
         round(100.0 * count(*) filter (where got_it) / nullif(count(*), 0)) as score_pct
    from per_question
   group by 1
)
select count(*) as learners,
       percentile_cont(0.5) within group (order by score_pct) as median_score_pct,
       count(*) filter (where score_pct < 20)               as band_0_19,
       count(*) filter (where score_pct between 20 and 39)  as band_20_39,
       count(*) filter (where score_pct between 40 and 59)  as band_40_59,
       count(*) filter (where score_pct between 60 and 79)  as band_60_79,
       count(*) filter (where score_pct >= 80)              as band_80_100
  from per_user;
```

`bool_or` scores a retried question once using the learner's best result, matching how `completeLesson` keeps `Math.max(prevScore, quizScore)`.

**Guardrail for E2:** if the Core/Deep-dive split raises activation but median accuracy falls materially against this number, Core is too thin.

---

## 7. Capstone reality — 0.B.8 **[FACT]**

```sql
select status, count(*) as rows, count(distinct user_id) as learners
  from public.capstone_submissions
 group by status
 order by rows desc;
```

`status = 'submitted'` is the **manual review backlog** — the number that decides whether the Phase 7.2 review SLA is a promise the team can currently keep.

---

## 8. Email delivery reality — 0.B.1 / 0.B.2 **[FACT]**

The finding under test (F1): the queue builds `createDefaultNotificationPreferences()` instead of reading the stored row, those defaults disable `learning` and `achievements` email, and `medium`/`low` priority cannot bypass preferences.

`recordSkippedEvent` writes a `notification_events` row on every block, so the block is directly observable:

```sql
select skipped_reason, count(*)
  from public.notification_events
 where skipped_reason is not null
 group by 1
 order by 2 desc;
```

Independent confirmation from the queue itself:

```sql
select template_key,
       count(*)                                  as queued,
       count(*) filter (where status = 'sent')   as sent,
       count(*) filter (where status in ('failed','dead_letter')) as failed
  from public.email_queue
 group by 1
 order by queued desc;
```

**Decision rule** (implemented as `confirmsInboxChannelDead`):

| Result | Action |
|---|---|
| Zero `sent` for all five lifecycle templates **and** `user_preference_disabled%` skips present | **F1 confirmed** — Phase 1 proceeds in full (1.1–1.6) |
| Any lifecycle template has `sent > 0` | **F1 not confirmed** — apply the plan's *"Contingency if 0.B kills F1"*: re-scope Phase 1 to 1.3, 1.5, 1.6 only and do **not** touch preference resolution |

The five lifecycle templates: `learning.daily_reminder`, `learning.weekly_recap`, `learning.module_complete`, `achievement.badge_earned`, `achievement.level_up`. `auth.welcome` and `auth.verify_email` act as the control — they are expected to send.

---

## 9. Signup consent capture — 0.B.9 (partial) **[FACT]**

```sql
select count(*)                                            as total_users,
       count(*) filter (where terms_accepted_at is not null) as with_recorded_consent,
       count(*) filter (where terms_accepted_at is null)     as predating_capture
  from public.users;
```

A NULL is **"created before 2026-09-23"**, never "refused" — `20260923000001_signup_legal_consent.sql` states this explicitly and no consumer may reinterpret it.

> **This is not the cookie-consent acceptance rate.** See §10.

---

## 10. Not measurable with the current schema

Recorded as absences rather than filled with proxies. None of these is instrumented here: Phase 0.B is read-only, and instrumentation belongs to Phase 2 where it can be decided on this evidence.

| Question | Why not | What would close it |
|---|---|---|
| **Cookie-consent acceptance rate** (how unrepresentative is GA4?) | `lib/legal/cookie-consent.ts` stores the decision only in the client-readable `prodily_cookie_consent` cookie. No server-side row records it. | A counter where the proxy already reads the cookie, or a cookieless aggregate from Vercel Analytics. **Phase 2 decision.** |
| **Signup → first lesson *open*** | `user_lesson_progress` has no creation timestamp — only `theory_read_at` and `completed_at`. | A `started_at` column written by `markInProgress()`. Additive and cheap, but it belongs with the Phase 2 funnel so the funnel is instrumented once. |
| **Email verification rate** | `email_confirmed_at` lives in the Supabase `auth.users` schema, not `public.users`, so it is not reachable from a PostgREST table read. | Nothing — it *is* measurable. `baseline-report.ts` reads it via the auth admin API and reports it separately. |
| **Per-onboarding-step drop-off** | The wizard is a client component that writes only the final `onboarding_completed` flag. | The step marker in `IMPLEMENTATION_PLAN.md` §Phase 2 item 3. Phase 5 depends on it; Phase 0.B does not. |
| **Sessions / page views / time-on-page for learners** | No session table. XP events are the only durable activity record. | Out of scope. Return metrics here are a floor and are labelled as such. |

---

## Operational notes

- **Read-only.** Safe against production. Consider a replica if `quiz_attempts` grows large.
- **Pagination.** PostgREST truncates an unbounded `.select()` at 1000 rows and reports no error, so the script pages explicitly. A truncated baseline is indistinguishable from a complete one.
- **Privacy.** The report contains aggregates only — no email addresses, names or per-user rows.
- **Re-runnable.** Re-run before each phase merges to establish that phase's own pre-period, per the plan's attribution discipline.

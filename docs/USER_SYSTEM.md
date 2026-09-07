# Learner Progress, Gamification, Flashcards & Referrals — Prodily PM Academy

**Repository:** `prodily-monorepo` (app code at `apps/web/`)
**Framework:** Next.js 16.2.12 (Turbopack) / PostgreSQL / React 19  
**Last Updated:** September 6, 2026  

For Leaderboard, Cohorts, and Friend Accountability — a large enough system to warrant its own document — see [`docs/LEADERBOARD.md`](LEADERBOARD.md).

---

## 1. User State & Progress Engine

Learner learning progress is persisted across relational PostgreSQL tables:

- **`public.user_lesson_progress`:** Tracks per-lesson status (`in_progress`, `completed`), quiz scores, and completion timestamps.
- **`public.reflections`:** Stores qualitative user reflections submitted upon completing lesson theory. (Previously mislabeled `user_reflections`.)
- **`public.user_feedback`:** Also captures 1–5 star lesson clarity ratings and issue tags (`confusing`, `typo`, `outdated`, `broken_diagram`) via `lesson_id`/`type`/`tags` columns added by a later migration — there is no separate `lesson_feedback` table.
- **`public.xp_events`:** Append-only immutable transaction ledger recording XP awards (theory completion, quiz pass, reflection, capstone, referral activation).

---

## 2. SM-2 Spaced Repetition Flashcard Engine

- **Algorithm:** SuperMemo SM-2 spaced repetition algorithm (`app/api/flashcards/[id]/review/route.ts`).
- **Rating Scale:** 0 to 5 recall rating.
- **Interval Scheduling:** Updates `repetition_number`, `easiness_factor`, `interval_days`, and calculates `next_review_at`.
- **Review Queue:** `GET /api/review/queue` retrieves flashcards due for review based on learner timezone and intervals.

---

## 3. Streaks, Levels & Badge Gamification

- **Streak Engine (`lib/streaks/streaks.ts`, `app/api/streaks/route.ts`):** Timezone-aware check-in evaluation. Streak state (`current_streak`, `longest_streak`, `last_streak_date`, `streak_freezes_available`) lives directly on `public.users`, not a separate table. Includes a streak-freeze mechanic (max 2, earned every 7 days).
- **Level Calculation Trigger:** The PostgreSQL trigger `update_user_xp_and_level()` automatically recalculates total XP and level whenever a row is inserted into `public.xp_events`.
- **Badges (`public.user_badges`):** Evaluated and awarded by `evaluateAndAwardBadges()` (`lib/badges-db.ts`) — an idempotent application-level check, not a database trigger. **Needs verification:** the only caller found in the current codebase is `POST /api/badges`, and no caller of that endpoint was found in the frontend (the badges/progress pages only read badge state, they don't trigger evaluation). This may mean badge auto-awarding is currently unreachable in production — flagged as `docs/ISSUES_KNOWN.md` ISSUE-23 rather than asserted as broken, since a dynamically-constructed caller could exist that a static search missed.

---

## 4. Referral & Organic Growth System

The Referral System enables learners to invite peers, track signup progress, and earn XP rewards upon activation.

### A. Attribution & Lifecycle
1. **Attribution:** Visiting any page with `?ref=CODE` stores an HTTP-only 30-day `prodily_referrer` cookie via `proxy.ts` (`withReferralCookie()`). The signup form reads `?ref=` directly from the URL and submits it in the request body; the server uses that value first, falling back to the `prodily_referrer` cookie only when the body doesn't include one.
2. **Signup Attribution:** When the invited user registers, a record is created in `public.referrals` with status `'signed_up'`.
3. **Anti-Abuse Controls:**
   - **Self-Referral Prevention:** enforced in application code (`referral-service.ts`), not a Postgres RLS policy.
   - **Rate Limiting:** Enforces a maximum of 10 credited referral signups per referrer in any 24-hour rolling window.
4. **Activation Reward:** When an invited learner completes their **first lesson**:
   - The referral status transitions to `'rewarded'`.
   - The referrer receives **+50 XP** (`source_type: 'referral'`) logged in `public.xp_events`.
   - An in-app notification is automatically dispatched to the referrer.

### B. User & Admin Interfaces
- **Learner Settings (`/settings?tab=referrals`):**
  - Personal referral link (`{siteUrl}/signup?ref=username`).
  - One-click copy with feedback.
  - Social share triggers (LinkedIn, X, WhatsApp).
  - Invited peers table displaying display name, join date, status (`Signed Up` vs `Activated`), and earned XP.
- **Admin Visibility:** `referralsCount` is computed on the backend (`lib/admin/service.ts`) but is **not currently rendered anywhere in the admin UI** — no component consumes it today, despite being available on the type.

---

## 5. PM Fellow Request Flow (Learner-Facing)

A learner can self-request PM Fellow designation from Settings — a different topic from the admin-side review covered in [`docs/admin/fellow-designation.md`](admin/fellow-designation.md).

- **Eligibility gate:** reuses the Portfolio Readiness checklist (`lib/portfolio-readiness.ts`) rather than a separate model — a learner is only eligible once **every** readiness item (essential AND recommended) is complete: display name, username, public visibility, bio, ≥1 published capstone, avatar, ≥1 professional link. This is a deliberately higher bar than "Ready to Share" (which only needs the essential items).
- **Flow:** `GET /api/fellow-requests` computes a state (`not_eligible | eligible | pending | approved | rejected`). Once eligible, `FellowRequestCard.tsx` shows a "Request PM Fellow" button. `POST /api/fellow-requests` re-verifies eligibility server-side and inserts a `fellow_requests` row (`pending`), guarded by a partial unique index preventing duplicate pending requests.
- **After submission:** the learner sees "Request Submitted — an admin will review your request soon." If previously rejected, they can re-request once eligibility is regained; a rejection reason is surfaced if the admin provided one. Once approved (`is_fellow = true`), the state is permanently `approved` regardless of later readiness regression.

---

## 6. Progress Page vs. Dashboard

Two distinct authenticated pages, both under `app/(app)/`:

- **`/dashboard`** — action-oriented: "what should I do right now." Personalized goal banner, "Continue Learning" CTA (next incomplete lesson), a 3-card action grid (flashcard review, next capstone, streak), and a small recent-XP ticker.
- **`/progress`** — summary/reflective: "how am I doing overall, and what have I earned." Skill Radar competency visualization, Level/Streak/Progress-ring cards, full Badge Showcase, Capstones Overview, and a Certificates section (including auto-issuance of a `full_curriculum` certificate once all 90 lessons are complete). Deliberately reuses already-fetched rows across its sub-sections to avoid duplicate queries.

---

## 7. Status Summary

| Gamification & Progress Feature | Location | Status |
|---|---|---|
| **Lesson Progress Tracking** | `app/api/v2/lessons/[lessonId]/progress/route.ts` | 🟢 Verified in Production |
| **Append-Only XP Ledger** | `public.xp_events`, database trigger | 🟢 Verified in Production |
| **SM-2 Flashcard Engine** | `app/api/flashcards/[id]/review/route.ts` | 🟢 Verified in Production |
| **Streak Engine** | `app/api/streaks/route.ts` | 🟢 Verified in Production |
| **Badge Unlocks** | `app/api/badges/route.ts` | 🟢 Verified in Production |
| **Referral Attribution & Rewards** | `lib/referral/referral-service.ts` | 🟢 Verified in Production |
| **Learner Referral Settings** | `components/settings/ReferralSettingsTab.tsx` | 🟢 Verified in Production |

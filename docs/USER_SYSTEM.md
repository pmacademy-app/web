# Learner Progress, Gamification & SM-2 Flashcards — Prodily PM Academy

**Repository:** `pmacademy-app/web`  
**Current Baseline HEAD:** `21cc985`  
**Last Updated:** August 23, 2026  

---

## 1. User State & Progress Engine

Learner progress is tracked across PostgreSQL tables:

- `public.user_lesson_progress`: Tracks status (`in_progress`, `completed`), quiz scores, and completion timestamps.
- `public.user_reflections`: Stores user reflections submitted upon completing lesson theory.
- `public.xp_events`: Immutable transaction ledger recording XP awards (theory read: +10 XP, quiz pass: +25 XP, capstone pass: +100 XP).

---

## 2. SM-2 Spaced Repetition Flashcard Engine

- **Algorithm**: SuperMemo SM-2 algorithm (`app/api/flashcards/[id]/review/route.ts`).
- **Rating Scale**: 0 to 5 quality rating on flashcard recall.
- **Interval Calculation**: Updates `repetition_number`, `easiness_factor`, `interval_days`, and `next_review_at` timestamp.
- **Review Queue**: `GET /api/review/queue` retrieves flashcards due for review.

---

## 3. Streak & Level Gamification

- **Streak Engine (`app/api/streaks/route.ts`)**: Timezone-aware check-in evaluation using `public.user_streaks`.
- **Level Trigger (`update_user_xp_and_level()`)**: Recalculates level automatically whenever a row is inserted into `public.xp_events`.
- **Badges (`public.user_badges`)**: Unlocks badges upon reaching milestones (e.g., 5-day streak, 10 lessons completed, first capstone).

---

## 4. Referral & Organic Growth System (Phase 7)

- **Attribution Cookie**: Visiting any URL with `?ref=CODE` sets a 30-day HTTP-only `prodily_referrer` tracking cookie in `proxy.ts`.
- **Attribution Model**: 1-to-1 unique attribution recorded in `public.referrals` upon learner registration.
- **Anti-Abuse**: Enforces self-referral prevention (`auth.uid() !== referrer_id`) and 24-hour rate limit (maximum 10 credited signups per referrer per 24 hours).
- **Activation Reward**: When an invited learner completes their first lesson, the referral transitions to `rewarded`, awarding the referrer **+50 XP** (`source_type: 'referral'`) and dispatching an in-app notification.
- **Referral Settings**: Learners can view their personal referral link, share to LinkedIn/X/WhatsApp, and track invited peers in `/settings?tab=referrals`.

---

## 5. Status Summary

| Gamification Component | Location | Status |
|---|---|---|
| **Lesson Progress Tracking** | `app/api/v2/lessons/[lessonId]/progress/route.ts` | 🟢 Verified in Production |
| **Append-Only XP Ledger** | `public.xp_events`, trigger | 🟢 Verified in Production |
| **SM-2 Flashcard Engine** | `app/api/flashcards/[id]/review/route.ts` | 🟢 Verified in Production |
| **Streak Engine** | `app/api/streaks/route.ts` | 🟢 Verified in Production |
| **Badge Unlocks** | `app/api/badges/route.ts` | 🟢 Verified in Production |
| **Referral & Organic Growth** | `lib/referral/referral-service.ts`, `/settings?tab=referrals` | 🟢 Verified in Production |


# Learner Progress, Gamification & SM-2 Flashcards — Prodily PM Academy

**Repository:** `pmacademy-app/web`  
**Current Baseline HEAD:** `490fea37ea08813aa582fc5ebbc3896ee4eb070c`  
**Last Updated:** August 10, 2026  

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

## 4. Status Summary

| Gamification Component | Location | Status |
|---|---|---|
| **Lesson Progress Tracking** | `app/api/v2/lessons/[lessonId]/progress/route.ts` | 🟢 Verified in Production |
| **Append-Only XP Ledger** | `public.xp_events`, trigger | 🟢 Verified in Production |
| **SM-2 Flashcard Engine** | `app/api/flashcards/[id]/review/route.ts` | 🟢 Verified in Production |
| **Streak Engine** | `app/api/streaks/route.ts` | 🟢 Verified in Production |
| **Badge Unlocks** | `app/api/badges/route.ts` | 🟢 Verified in Production |

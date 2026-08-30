# Learner Progress, Gamification, Flashcards & Referrals — Prodily PM Academy

**Repository:** `pmacademy-app/web`  
**Framework:** Next.js 16.2.12 (Turbopack) / PostgreSQL / React 19  
**Last Updated:** August 30, 2026  

---

## 1. User State & Progress Engine

Learner learning progress is persisted across relational PostgreSQL tables:

- **`public.user_lesson_progress`:** Tracks per-lesson status (`in_progress`, `completed`), quiz scores, and completion timestamps.
- **`public.user_reflections`:** Stores qualitative user reflections submitted upon completing lesson theory.
- **`public.lesson_feedback`:** Captures 1–5 star clarity ratings and issue tags (`confusing`, `typo`, `outdated`, `broken_diagram`) to power Curriculum Quality metrics.
- **`public.xp_events`:** Append-only immutable transaction ledger recording XP awards (theory completion, quiz pass, reflection, capstone, referral activation).

---

## 2. SM-2 Spaced Repetition Flashcard Engine

- **Algorithm:** SuperMemo SM-2 spaced repetition algorithm (`app/api/flashcards/[id]/review/route.ts`).
- **Rating Scale:** 0 to 5 recall rating.
- **Interval Scheduling:** Updates `repetition_number`, `easiness_factor`, `interval_days`, and calculates `next_review_at`.
- **Review Queue:** `GET /api/review/queue` retrieves flashcards due for review based on learner timezone and intervals.

---

## 3. Streaks, Levels & Badge Gamification

- **Streak Engine (`app/api/streaks/route.ts`):** Timezone-aware check-in evaluation using `public.user_streaks`.
- **Level Calculation Trigger:** The PostgreSQL trigger `update_user_xp_and_level()` automatically recalculates total XP and level whenever a row is inserted into `public.xp_events`.
- **Badges (`public.user_badges`):** Automatically awarded upon milestone triggers (e.g., first lesson, 5-day streak, 10 lessons completed, capstone submission).

---

## 4. Referral & Organic Growth System

The Referral System enables learners to invite peers, track signup progress, and earn XP rewards upon activation.

### A. Attribution & Lifecycle
1. **Attribution Cookie:** Visiting any page with `?ref=CODE` stores an HTTP-only 30-day `prodily_referral` cookie via `proxy.ts`.
2. **Signup Attribution:** When the invited user registers, a record is created in `public.referrals` with status `'signed_up'`.
3. **Anti-Abuse Controls:**
   - **Self-Referral Prevention:** Users cannot refer their own account (`auth.uid() !== referrer_id`).
   - **Rate Limiting:** Enforces a maximum of 10 credited referral signups per referrer in any 24-hour rolling window.
4. **Activation Reward:** When an invited learner completes their **first lesson**:
   - The referral status transitions to `'rewarded'`.
   - The referrer receives **+50 XP** (`source_type: 'referral'`) logged in `public.xp_events`.
   - An in-app notification is automatically dispatched to the referrer.

### B. User & Admin Interfaces
- **Learner Settings (`/settings?tab=referrals`):**
  - Personal referral link (`https://prodily.app/signup?ref=username`).
  - One-click copy with feedback.
  - Social share triggers (LinkedIn, X, WhatsApp).
  - Invited peers table displaying display name, join date, status (`Signed Up` vs `Activated`), and earned XP.
- **Admin Visibility:** The total number of successful referrals (`referralsCount`) is aggregated and displayed in the User Detail Drawer in `/admin/users`.

---

## 5. Status Summary

| Gamification & Progress Feature | Location | Status |
|---|---|---|
| **Lesson Progress Tracking** | `app/api/v2/lessons/[lessonId]/progress/route.ts` | 🟢 Verified in Production |
| **Append-Only XP Ledger** | `public.xp_events`, database trigger | 🟢 Verified in Production |
| **SM-2 Flashcard Engine** | `app/api/flashcards/[id]/review/route.ts` | 🟢 Verified in Production |
| **Streak Engine** | `app/api/streaks/route.ts` | 🟢 Verified in Production |
| **Badge Unlocks** | `app/api/badges/route.ts` | 🟢 Verified in Production |
| **Referral Attribution & Rewards** | `lib/referral/referral-service.ts` | 🟢 Verified in Production |
| **Learner Referral Settings** | `components/settings/ReferralSettingsTab.tsx` | 🟢 Verified in Production |

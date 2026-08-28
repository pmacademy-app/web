# Product Requirements Document (PRD) — Prodily PM Academy

**Repository:** `pmacademy-app/web`  
**Current Baseline HEAD:** `21cc985`  
**Last Updated:** August 23, 2026  

---

## 1. Product Vision & Brand Architecture

**Prodily** is the parent technology brand. **PM Academy** is the flagship product. The full formal name is **Prodily PM Academy**.

- **Mission**: Provide a 100% free, structured, gamified Product Management curriculum empowering aspiring and practicing PMs globally.
- **Brand Positioning**: Sleek, modern, glassmorphic design system (green `#019E75` + navy `#011229`), eliminating corporate bloat and paywalls.
- **Value Proposition**: 90 bite-sized lessons, interactive SM-2 flashcard review, capstone portfolio projects, shareable certificates, and streak tracking.

---

## 2. Target Audience & Core User Journeys

1. **Aspiring PMs**: Complete 9 structured modules (90 lessons), complete capstones, publish public portfolios (`/p/[username]`), and share verified certificates on LinkedIn.
2. **Practicing PMs**: Refresh frameworks (RICE, Kano, North Star, Working Backwards) via search index and SM-2 flashcard spaced repetition.
3. **Platform Administrators**: Manage learners, monitor system errors, review capstones, manage content, and dispatch communications via the Admin Console (`/admin`).

---

## 3. Product Invariants (Non-Negotiables)

The following feature prohibitions are frozen in product policy:

- ❌ **No AI Mentor Feature**: No LLM chat interface or AI mentor features.
- ❌ **No Global Leaderboard**: Competitions are strictly scoped to Cohorts and Friends; no global public competitive ranking.
- ❌ **No Purchasable Streak Mechanics**: Streaks cannot be bought, restored with money, or monetized.
- ❌ **No Paywalled Lessons**: 100% of curriculum content remains completely free and accessible.

---

## 4. Core Feature Matrix & Status

| Feature Area | Description | Implementation Status | Evidence / Location |
|---|---|---|---|
| **90 PM Lessons** | 9 modules, Markdown source compiled to static JSON | 🟢 Verified in Production | `content/modules/`, `content/dist/lessons/` |
| **Interactive Quizzes** | 4-option multiple choice quizzes per lesson | 🟢 Verified in Production | `app/academy/[moduleSlug]/[lessonId]/page.tsx` |
| **SM-2 Flashcards** | Spaced repetition flashcard review system | 🟢 Verified in Production | `app/api/flashcards/[id]/review/route.ts` |
| **XP & Streak Engine** | Daily streak tracking, timezone-aware check-ins | 🟢 Verified in Production | `app/api/streaks/route.ts`, `public.user_streaks` |
| **Certificates v2** | Verified certificate rendering + LinkedIn sharing | 🟢 Verified in Production | `app/verify/[certificateId]/page.tsx` |
| **Public Portfolio** | Shareable learner portfolio URL (`/p/[username]`) | 🟢 Verified in Production | `app/p/[username]/page.tsx` |
| **Admin Console** | Multi-workspace administrative platform | 🟢 Verified in Production | `app/admin/page.tsx`, `components/admin/` |
| **Send Email Hook** | Supabase Auth branded email hook | 🟡 Implemented — Verification Required | `app/api/auth/send-email-hook/route.ts` |
| **GitHub Actions Cron** | Automated email queue & reminder jobs | 🟡 Implemented — Verification Required | `.github/workflows/notification-scheduler.yml` |
| **Referrals & Organic Growth** | 1-to-1 referral attribution, 30d cookie tracking, +50 XP on 1st lesson completion | 🟢 Verified in Production | `lib/referral/`, `app/api/referrals/` |


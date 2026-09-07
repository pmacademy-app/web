# Product Requirements Document (PRD) — Prodily PM Academy

**Repository:** `prodily-monorepo` (app code at `apps/web/`)
**Last Updated:** September 6, 2026  

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
- ❌ **No Purchasable Streak Mechanics**: Streaks cannot be bought, restored with money, or monetized.
- ❌ **No Paywalled Lessons**: 100% of curriculum content remains completely free and accessible.

> **Correction (2026-09-06):** An earlier version of this document listed "No Global Leaderboard" as a non-negotiable invariant. The current implementation (`lib/leaderboard-db.ts`) has three ranking modes — **Global** (all opted-in users), **Cohort**, and **Friends** — see [`docs/LEADERBOARD.md`](LEADERBOARD.md). Per the documentation-authority rule, code is the source of truth: the Global mode exists and is live. Anyone revisiting the "no global ranking" product decision should treat this as a real product question to resolve deliberately, not assume the old invariant still holds.

---

## 4. Core Feature Matrix & Status

| Feature Area | Description | Implementation Status | Evidence / Location |
|---|---|---|---|
| **90 PM Lessons** | 9 modules, flat Markdown source compiled to static JSON | 🟢 Verified in Production | `content/lessons/`, `content/dist/lessons/` |
| **Interactive Quizzes** | 4-option multiple choice quizzes per lesson | 🟢 Verified in Production | `app/academy/[moduleSlug]/[lessonId]/page.tsx` |
| **SM-2 Flashcards** | Spaced repetition flashcard review system | 🟢 Verified in Production | `app/api/flashcards/[id]/review/route.ts` |
| **XP & Streak Engine** | Daily streak tracking, timezone-aware check-ins | 🟢 Verified in Production | `app/api/streaks/route.ts`, streak columns on `public.users` |
| **Certificates v2** | Verified certificate rendering + LinkedIn sharing | 🟢 Verified in Production | `app/verify/[certificateId]/page.tsx` |
| **Public Portfolio** | Shareable learner portfolio URL (`/p/[username]`) | 🟢 Verified in Production | `app/p/[username]/page.tsx` |
| **Admin Console** | Multi-workspace administrative platform | 🟢 Verified in Production | `app/admin/page.tsx`, `components/admin/` |
| **Send Email Hook** | Supabase Auth branded email hook | 🟡 Implemented — Verification Required | `app/api/auth/send-email-hook/route.ts` |
| **GitHub Actions Cron** | Automated email queue & reminder jobs | 🟡 Implemented — Verification Required | `.github/workflows/notification-scheduler.yml` |
| **Referrals & Organic Growth** | 1-to-1 referral attribution via `?ref=` query param at signup (no cookie), +50 XP on 1st lesson completion | 🟢 Verified in Production | `lib/referral/`, `app/api/referrals/` |
| **Leaderboard 2.0** | Global / Cohort / Friends ranking modes, tier badges, 45s cache | 🟢 Verified in Production | `lib/leaderboard-db.ts`, `app/(app)/leaderboard/` |
| **Friend Accountability** | One-way add-by-username connection (no accept/reject step) | 🟢 Verified in Production | `lib/leaderboard-db.ts`, `app/api/friends/` |
| **PM Fellow Designation** | Learner-requested (`fellow_requests` queue) or admin-browsed grant of `is_fellow` | 🟢 Verified in Production | `lib/fellow.ts`, `app/api/fellow-requests/`, `app/api/admin/fellow-requests/` |
| **Automatic Portfolio Verification** | Auto-verifies on avatar + bio + ≥2 of {LinkedIn, GitHub, website}; admin can override | 🟢 Verified in Production | `lib/portfolio-readiness.ts`, `app/api/admin/users/[id]/portfolio-verification/` |


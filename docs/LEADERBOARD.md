# Leaderboard, Cohorts & Friend Accountability — Prodily PM Academy

**Repository:** `prodily-monorepo` (app code at `apps/web/`)
**Last Updated:** September 6, 2026

---

## 1. Overview

"Leaderboard 2.0" ranks learners across three scopes — **Global**, **Cohort**, and **Friends** — sharing one cached weekly dataset and one ranking algorithm. Core logic: `lib/leaderboard-db.ts` (data access) and `lib/leaderboard.ts` (pure ranking/tier functions). UI: `app/(app)/leaderboard/page.tsx`.

> **Note on product policy:** an earlier version of `docs/PRD.md` listed "No Global Leaderboard" as a non-negotiable invariant. The Global mode described below exists and is live in the current codebase — see the correction note in `PRD.md`.

---

## 2. Ranking Algorithm

`calculateRankings()` (`lib/leaderboard.ts`) is **consistency-first**, not XP-first. Sort order:
1. Days studied this week (desc)
2. Lessons completed this week (desc)
3. Weekly XP earned (desc — tie-break)
4. Current streak (desc — final tie-break)

The week boundary is UTC Monday (`calculateWeekStart()`). Tier badges (`Bronze`, `Silver`, `Gold`, `Diamond`, `Fellow`) are derived from level/total XP (`getLeaderboardTier()`) and are purely cosmetic — the "Fellow" tier name is unrelated to the PM Fellow designation (`is_fellow`) despite sharing the word.

---

## 3. The Three Scopes

- **Global** (`getWeeklyLeaderboard()`): every user with `total_xp > 0`, excluding anyone who has opted out (`user_leaderboard_settings.is_opted_in = false`) — except the viewer always sees themselves regardless of their own opt-out state.
- **Cohort** (`getCohortLeaderboard()`): filters the same cached weekly metrics down to `cohort_members` for a given cohort, then **re-ranks locally** — a cohort rank is not a slice of the global rank.
- **Friends** (`getFriendLeaderboard()`): filters to `user_friends` rows involving the viewer, also re-ranked locally.

### Caching
A single in-memory `Map` keyed by week-start, 45-second TTL, shared across all three scopes (`lib/leaderboard-db.ts`). This is **process-local** — on a multi-instance deployment, cache state isn't shared across instances (a scaling caveat, not currently a correctness bug at Prodily's traffic).

---

## 4. Cohorts

`public.cohorts` are small, **self-serve, opt-in interest groups** — not admin-assigned enrollment cohorts and not tied to signup dates. As shipped, exactly two are seeded: `foundations-2026` and `career-switchers`. Learners freely join/leave via `POST /api/cohorts` (`toggleCohortMembership()`). There is currently no admin cohort-management UI — the set of available cohorts is effectively fixed unless a migration adds more.

---

## 5. Friend Accountability

**Important semantics — read before assuming this works like social-network friending:**

- `addFriend()` inserts a `user_friends` row with `status: 'accepted'` **immediately and one-directionally**. The target user is never notified, never asked to approve, and has no way to block or reject the connection.
- The schema comment on `status` documents `'pending' | 'accepted'` as intended values, but no code path currently writes or checks for `'pending'` — there is no accept/reject flow implemented today, despite the schema suggesting one was planned.
- `removeFriend()` deletes the row regardless of which side originally added the other — either party can unilaterally end the connection.
- In practice this behaves like a one-way "follow for comparison," not mutual friending. If you're designing new UI copy around this feature, don't describe it as "friend requests" — describe it as "add for accountability."
- Add-by-username lookup: `addFriend()` accepts either a UUID or a `username` string, resolving via a regex check on which column to query (fixed in this session — see `docs/ISSUES_KNOWN.md` ISSUE-15 for the root cause of the bug this replaced).

**UI:** `FriendAccountabilitySection.tsx` (add by `@username`, remove), `LeaderboardScopeSwitcher.tsx` (Global/Cohort/Friends tabs), `CohortsSection.tsx` (join/leave), `ProfileComparisonModal.tsx`.

---

## 6. Component & Route Map

| Component / Feature | Location |
|---|---|
| **Leaderboard Page** | `app/(app)/leaderboard/page.tsx` |
| **Ranking Data Access** | `lib/leaderboard-db.ts` |
| **Ranking Algorithm & Tiers** | `lib/leaderboard.ts` |
| **Leaderboard API** | `app/api/leaderboard/route.ts` |
| **Cohorts API** | `app/api/cohorts/route.ts` |
| **Friends API** | `app/api/friends/route.ts` |
| **Admin Inspection Console** | `/admin/leaderboard` |

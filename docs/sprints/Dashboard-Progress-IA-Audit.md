# PM Academy — Dashboard & Progress Information Architecture Audit

**Date of Audit:** 2026-08-09  
**Sprint:** Sprint 7.6 — Dashboard & Learning Experience  
**Core Principles (`PRD.md §2`):**  
- **Dashboard (`/dashboard`):** Focuses strictly on **"What should I do next?"** (Action-oriented habit & continuation triggers).
- **Progress (`/progress`):** Focuses strictly on **"How have I performed?"** (Performance-oriented skill competency, history & credentials).

---

## 1. Dashboard (`/dashboard`) Audit Matrix

| Existing Element | Current Classification | Action Required | Justification & Destination |
|---|---|---|---|
| **Continue Learning CTA** | Action-oriented | **RETAIN ON DASHBOARD** | Primary action trigger ("What should I do next?"). Shows next uncompleted lesson in curriculum sequence. |
| **Current / At-Risk Streak Chip** | Action-oriented | **RETAIN ON DASHBOARD (COMPACT)** | Preserves daily learning habit; prompts user to study today if streak is at risk. |
| **Due-Today Flashcards Counter** | Action-oriented | **NEW / ENHANCED ON DASHBOARD** | Direct call to action linking to Spaced Repetition Review Hub (`/review`). |
| **Next Capstone Prompt** | Action-oriented | **NEW / ENHANCED ON DASHBOARD** | Actionable prompt displayed when a module is finished but capstone deliverable remains unsubmitted. |
| **Recent XP Activity Ticker** | Action-oriented | **RETAIN ON DASHBOARD (COMPACT)** | Small, non-dominant feedback ticker showing recent XP gains per `Design.md §3.1`. |
| **Skill Radar Chart** | Performance-oriented | **REMOVE FROM DASHBOARD** | Duplicated! Belongs strictly on `/progress` as the dominant visual. |
| **90-Lesson Progress Ring** | Performance-oriented | **REMOVE FROM DASHBOARD** | Duplicated! Overall completion metric belongs on `/progress`. |
| **Level / Total XP Card** | Performance-oriented | **MOVE TO PROGRESS** | Duplicated! Level & Total XP history belongs on `/progress`. |
| **Weekly Leaderboard Widget** | Performance-oriented | **REMOVE FROM DASHBOARD** | Ranking metric belongs on `/leaderboard` and `/progress`. |

---

## 2. Progress (`/progress`) Audit Matrix

| Existing Element | Current Classification | Action Required | Justification & Destination |
|---|---|---|---|
| **Skill Radar Chart** | Performance-oriented | **RETAIN AS DOMINANT VISUAL** | Single most prominent visual element on `/progress` (`PRD.md §2`). |
| **Level / Total XP Card** | Performance-oriented | **RETAIN ON PROGRESS** | Primary level & lifetime XP mastery metric ("How have I performed?"). |
| **Overall Curriculum Progress Ring**| Performance-oriented | **RETAIN ON PROGRESS** | Overall 90-lesson completion percentage. |
| **Historical Streak Card** | Performance-oriented | **RETAIN ON PROGRESS** | Lifetime streak performance history. |
| **Capstone Deliverables Grid** | Performance-oriented | **RETAIN ON PROGRESS** | 9-module capstone workspace completion status. |
| **Certificates Showcase & Eligibility**| Performance-oriented | **RETAIN ON PROGRESS** | Credentials earned & progress toward full curriculum certificate. |
| **Badge & Achievement Case** | Performance-oriented | **NEW / ENHANCED ON PROGRESS** | Earned badge showcase with link to `/badges`. |
| **Continue Learning CTA** | Action-oriented | **REMOVE FROM PROGRESS** | Duplicated! Action CTA belongs strictly on `/dashboard`. |

---

## 3. Summary of Duplication Removal

1. **Continue Learning CTA (`ContinueLearningCard`):** Removed from `/progress`. Lives exclusively on `/dashboard`.
2. **Skill Radar (`SkillRadarCard`):** Removed from `/dashboard`. Lives exclusively on `/progress` as its dominant visual.
3. **Leaderboard Widget:** Removed from `/dashboard`. Accessible via `/leaderboard`.
4. **Primary Focus:** `/dashboard` cleanly answers "What should I do next?"; `/progress` cleanly answers "How have I performed?".

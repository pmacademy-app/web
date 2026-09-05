# Analytics & Growth Reporting — Operating Guide

**Location:** `/admin/analytics`  
**Workspace:** Insights $\rightarrow$ Analytics  
**Audience:** Platform Administrators, Product Leads & Growth Teams  

---

## 1. Purpose

The Analytics Workspace provides deep intelligence into learner acquisition, retention, curriculum progression drop-offs, quiz performance, XP velocity, and graduation outcomes.

All metrics are computed live from PostgreSQL tables (`xp_events`, `user_lesson_progress`, `users`, `certificates`) with zero synthetic or mock fallbacks.

---

## 2. Access & Global Controls

- **Path:** Navigate to `/admin/analytics` from the sidebar.
- **Permissions:** Admin role required (`is_admin = true` or listed in `ADMIN_EMAILS`).
- **Date Range Selector:** Scope metrics to `Today`, `7D`, `30D`, `90D`, or `Custom`.
- **CSV Data Export:** Click the **[ Export CSV ]** button in the header to download the aggregated dataset for external analysis.

---

## 3. Analytics Tabs & Report Categories

### A. Learners Tab
- **Active User Velocity:** Real-time tracking of Daily Active Users (DAU), Weekly Active Users (WAU), and Monthly Active Users (MAU) with DAU/MAU stickiness ratios.
- **Level & Tier Distribution:** Breakdown of learners across the 9 PM Academy levels (Level 1 "Associate PM Trainee" through Levels 7–9, all titled "Chief Product Officer").
- **Streak Health:** Distribution of current student streaks and streak freeze utilization.

### B. Learning Tab
- **Curriculum Funnel & Drop-Off Hotspots:** Identifies specific lessons and modules where student momentum slows or stops.
- **Quiz Pass Rates:** Measures first-attempt pass rates and average quiz scores across all modules.
- **Module Completion Ratios:** Compares completion velocity across the 9 core modules.

### C. Engagement & XP Tab
- **Daily XP Velocity:** Time-series tracking of total XP awarded per day.
- **XP Source Attribution — currently broken (see `docs/ISSUES_KNOWN.md` ISSUE-20):** intended to break down XP by source type (theory reads, quizzes, reflections, flashcards, capstones, referrals), but the aggregation reads a field name (`event.source`) that doesn't exist on the row (the real column is `source_type`), so every event resolves to "Other" regardless of actual source. The chart is non-functional as currently shipped.
- **Flashcard Retention Habits:** Measures daily spaced repetition review consistency.

### D. Outcomes Tab
- **Certificate Issuance Velocity:** Tracks cumulative and monthly certification awards.
- **Portfolio Adoption:** Percentage of active learners who have configured and published a public recruiter portfolio (`/p/[username]`).

---

## 4. Practical Example

**Investigating a drop-off in module completion:**
1. Open `/admin/analytics` $\rightarrow$ select the **Learning Tab**.
2. Set the date range to **30D**.
3. Review the module drop-off chart. If `technical` has a lower completion rate than `execution`:
   - Inspect the individual lesson pass rates within the Technical PM module.
   - Cross-reference with `/admin/curriculum` to inspect student feedback for the specific lessons causing friction.

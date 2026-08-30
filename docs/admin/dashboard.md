# Admin Operations Dashboard — Operating Guide

**Location:** `/admin`  
**Workspace:** Overview $\rightarrow$ Dashboard  
**Audience:** All Administrators  

---

## 1. Purpose

The Operations Dashboard is the primary home screen for platform administrators. It provides a real-time answer to two essential operational questions:
1. **What needs my immediate attention?** (failed email deliveries, unread contact inquiries, pending testimonials, active system alerts, pending portfolio reviews).
2. **What is happening across the academy right now?** (growth, engagement, curriculum completion, and system health).

---

## 2. Access & Permissions

- **Path:** Navigate to `/admin` from the sidebar or top navigation.
- **Permissions:** Accessible to any authenticated user with `is_admin = true` or listed in `ADMIN_EMAILS`.
- **Keyboard Shortcut:** Press `Cmd+K` (macOS) or `Ctrl+K` (Windows/Linux) from any admin screen to open Global Search.

---

## 3. How to Use the Dashboard

1. **Check the Attention Center:** Look at the top banner. If any badges are highlighted (e.g., amber or red), click the badge to jump directly to the relevant moderation or queue workspace.
2. **Adjust the Date Range:** Use the date range dropdown in the top-right header to scope metrics to `Today`, `7D` (Last 7 Days), `30D` (Last 30 Days), `90D` (Last 90 Days), or `Custom`.
3. **Inspect KPI Trends:** Review the 8 KPI cards for overall volume and period-over-period percentage deltas.
4. **Analyze Learner Velocity:** Switch between chart tabs (Lessons, Quizzes, Capstones) in the Learning Activity bar chart to evaluate daily student engagement.
5. **Review Recent Activity:** Inspect the real-time event feed for recent registrations, certificate issuances, and capstone submissions.

---

## 4. Fields, Sections & Controls

### A. Attention Center (`AdminAttentionCenter`)
Displays actionable alerts when items require human intervention:
- **Failed Emails:** Number of failed items in `email_queue` $\rightarrow$ links to `/admin/communications?tab=queue`.
- **New Contact Messages:** Unread student inquiries $\rightarrow$ links to `/admin/communications?tab=contact`.
- **Pending Testimonials:** Reviews awaiting approval $\rightarrow$ links to `/admin/moderation?tab=testimonials`.
- **Pending Portfolio Reviews:** Unverified public portfolios $\rightarrow$ links to `/admin/moderation?tab=portfolios`.
- **System Alerts:** Active warnings or errors $\rightarrow$ links to `/admin/system?tab=alerts`.
*Note: When all counts are zero, the section displays a green "Everything looks good" confirmation badge.*

### B. KPI Cards Grid (8 Metrics)
| Metric | Definition | Data Source |
|---|---|---|
| **Total Users** | All registered accounts in `public.users` | `users` count |
| **Active Learners** | Users with $\ge 1$ XP event in the selected time window | `xp_events` distinct user count |
| **New Users** | Signups within the selected time window | `users.created_at` |
| **Verified Users** | Accounts with email confirmation complete | `auth.users.email_confirmed_at` |
| **Lessons Completed** | Lesson completions within the time window | `user_lesson_progress` completions |
| **Course Completion %** | % of registered learners holding the CPO completion badge | `user_badges` where `badge_id = 'cpo_completion'` |
| **XP Earned** | Total XP awarded in the selected time window | `xp_events.amount` sum |
| **Certificates Issued** | Verified certificates issued in the window | `certificates` count |

### C. Visualizations & Funnels
- **Learner Activity (Area Chart):** Time-series breakdown of new signups vs. active learners.
- **Learning Activity (Bar Chart):** Daily volume of completed lessons, passed quizzes, and submitted capstones.
- **Learning Journey Funnel (`AdminFunnelChart`):** Cumulative conversion stages:
  `Registered` $\rightarrow$ `Onboarding Completed` $\rightarrow$ `First Lesson` $\rightarrow$ `First Quiz` $\rightarrow$ `Module Completed` $\rightarrow$ `Course Completed` $\rightarrow$ `Certificate Issued`.
- **System Snapshot:** Real-time ping status for Database, Authentication, Email Queue, Notifications, and Cron Schedulers.

---

## 5. Effects & Operational Notes

- **Read-Only Surface:** The dashboard is an operational monitoring tool and does not mutate database records.
- **Instant Refresh:** Clicking the **[ Refresh ]** button in the header triggers a cache-bypassing re-fetch of all dashboard metrics.
- **Funnel Calculation:** The Learning Funnel is an all-time cumulative conversion metric and is intentionally unaffected by date range filters.

---

## 6. Practical Example

**Daily Morning Standup Procedure:**
1. Open `/admin`.
2. Inspect the **Attention Center**. If there are 3 failed emails, click the badge to jump to `/admin/communications?tab=queue` and click **Retry All**.
3. If there are 2 pending portfolio reviews, click the badge to jump to `/admin/moderation?tab=portfolios` and review the student case studies.
4. Set the date filter to **7D** to review weekly learner acquisition and lesson completion trends.

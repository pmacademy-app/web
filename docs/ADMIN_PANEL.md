# Admin Panel Architecture & Technical Reference — Prodily PM Academy

**Status:** 🟢 Production Ready  
**Scope:** Admin Console Workspaces, APIs, Navigation, RBAC, Services, and State Architecture  
**Last Updated:** August 30, 2026  

---

## 1. Admin Panel Overview

The Admin Panel (`/admin`) is the centralized operational control center for Prodily PM Academy administrators.

It is structured around three core operational pillars:
1. **Attention & Action:** Immediate visibility into items requiring human intervention — failed email deliveries, new learner contact inquiries, pending testimonials, active system alerts, and unverified public portfolios.
2. **Operations & Management:** Granular control over learners, curriculum content, achievement credentials, multi-channel communications, feature flags, and global product settings.
3. **Intelligence & Health:** Live analytics across learner growth, curriculum drop-off funnels, engagement velocity, and deep platform health diagnostics.

### Access Control & Authorization
- **Proxy Middleware Check (`apps/web/proxy.ts`):** Edge-level route protection requiring an authenticated session and admin status.
- **Server-Side Authorization Guard (`lib/admin/authorization.ts`):** `requireAdminUser(request)` is enforced on 100% of `/api/admin/**` endpoints. A user is authorized if:
  - Their email is in the `ADMIN_EMAILS` environment variable, **or**
  - Their database record has `users.is_admin === true`.
- **Immutable Audit Logging:** Mutations trigger `logAdminAction()`, persisting structured event logs into `public.admin_audit_logs`.

---

## 2. Admin Workspace Navigation Architecture

### Sidebar Navigation Layout (Final IA)

```
PRODILY ADMIN
│
├── Overview
│   └── Dashboard               /admin
│
├── Operations
│   ├── Users                   /admin/users
│   ├── Communications          /admin/communications  (tabs: Overview, Queue, Broadcasts, Automations, Templates, Notifications, Contact)
│   └── Moderation              /admin/moderation      (tabs: Testimonials, Feedback, Capstones, Portfolio Verification)
│
├── Learning
│   ├── Curriculum              /admin/curriculum      (9 Modules, 90 Lessons, Quality Ratings & Feedback)
│   └── Achievements            /admin/achievements    (Certificates Registry & Badges Directory)
│
├── Insights
│   └── Analytics               /admin/analytics       (Learners, Learning Funnel, Engagement/XP, Outcomes)
│
├── System
│   └── System                  /admin/system          (Health Diagnostics, Severity Alerts, Error Logs, Audit Trails)
│
└── Settings
    └── Settings                /admin/settings        (Product, Learning, Email, Notifications, Feature Flags, Onboarding)
```

### Route Aliases & Backward-Compatible Redirects

| Legacy Route | Modern Canonical Route |
|---|---|
| `/admin/portfolios` | `/admin/moderation?tab=portfolios` (Portfolio Verification Queue) |
| `/admin/content` | `/admin/curriculum` |
| `/admin/emails` | `/admin/communications?tab=queue` |
| `/admin/feature-flags` | `/admin/settings?section=feature-flags` |
| `/admin/feedback` | `/admin/moderation?tab=testimonials` |
| `/admin/notifications` | `/admin/communications?tab=notifications` |
| `/admin/templates` | `/admin/communications?tab=templates` |
| `/admin/certificates` | `/admin/achievements/certificates` |

---

## 3. Workspaces & Functional Specifications

### 3.1 Dashboard (`/admin`)
- **Header & Filters:** Dynamic time-based greeting, date range selector (`Today`, `7D`, `30D`, `90D`, `Custom`), and instant data refresh.
- **Attention Center (`AdminAttentionCenter`):** Live badge counts for failed emails, new contact messages, pending testimonials, active system alerts, and pending portfolio reviews.
- **KPI Metrics (8 Cards):** Total Registered Users, Active Learners, New Signups, Verified Users, Lessons Completed, Overall Completion %, Total XP Earned, and Certificates Issued — with period-over-period trend deltas.
- **Visualizations:** Learner Activity Area Chart (new vs. active learners), Learning Activity Bar Chart (lessons, quizzes, capstones), and All-Time Learner Journey Funnel (`AdminFunnelChart`).
- **Live System Snapshot:** Real-time operational status across Database, Auth, Email Queue, Notifications, and Scheduler.

### 3.2 Users Workspace (`/admin/users`)
- **Directory & Filters:** Search by name, email, or `@username`. Filter by Admin status, Verification status, Activity level, Progress, and XP tier.
- **User Detail Drawer (`UserDetailDrawer`):** Full-height sliding panel on desktop (`/admin/users?userId=[id]`) or standalone route on mobile (`/admin/users/[id]`).
  - **Overview Tab:** Goal, course progress bar, recent activity timeline, latest badge, latest certificate, portfolio link.
  - **Learning Tab:** Course progress, lesson counts, quiz average score, SRS review count, and per-module breakdown with **Reset Module Progress** action.
  - **Activity Tab:** Complete chronological activity timeline with event type icons.
  - **Achievements Tab:** Earned badges list, issued certificates, and submitted capstones with public status.
  - **Communications Tab:** History of sent emails, in-app notifications, contact inquiries, and **[ Send Production Email ]** modal button.
  - **Account Tab:** Email, verification status, signup date, last active date, auth provider, timezone, and internal UUID.
  - **Administrative Controls:**
    - `UserRoleToggle`: Promote/demote Admin role (`is_admin`).
    - `UserFellowToggle`: Grant/revoke Product Management Fellow designation (`is_fellow`).
    - `DeveloperActionsSection`: Generate test certificates for verification pipeline QA (`/api/admin/dev/generate-test-certificate`).
    - Destructive actions with confirmation dialogs: **Reset All Progress** and **Delete User Account**.

### 3.3 Communications Workspace (`/admin/communications`)
- **Overview Tab:** Delivery health KPIs, active email provider status, and broadcast campaign summaries.
- **Email Queue Tab:** Real-time queue inspection (`pending`, `processing`, `delivered`, `failed`), dead-letter error logs, individual message retry, and bulk retry (`/api/admin/emails/queue/retry-all`).
- **Broadcasts Tab:** Multi-channel broadcast builder (`/api/admin/emails/broadcasts`): audience targeting, recipient estimation & sampling, scheduling, execution, and cancelation.
- **Automations Tab:** Cron schedule inspector for daily reminders and weekly recaps with **[ Run Now ]** trigger.
- **Templates Tab:** Transactional template registry with code editor, live HTML preview, variable substitution, and direct test-send to admin email (`/api/admin/emails/test-send`).
- **Notifications Tab:** In-app broadcast management and in-app template testing (`/api/admin/notifications/in-app`).
- **Contact Tab:** Inbound inquiry inbox with status categorization (`new`, `in_progress`, `resolved`, `archived`).

### 3.4 Moderation Workspace (`/admin/moderation`)
- **Testimonials Tab:** Review learner reviews with ratings, approve for publishing, or reject.
- **Product Feedback Tab:** In-depth learner feedback submitted after lessons or via feedback widgets.
- **Capstones Tab:** Evaluate module capstone submissions, toggle public portfolio visibility, and publish/archive case studies.
- **Portfolio Verification Queue (`PortfoliosView.tsx`):**
  - Dedicated queue for public learner portfolios.
  - KPI Cards: **Pending Verification**, **Verified Fellows**, and **Total Public Portfolios**.
  - Filter tabs: **Pending Review**, **Verified Fellows**, and **All Public**.
  - In-line **`[ Verify ]`** action granting `is_fellow = true` with live loading and toast feedback.
  - In-line **`[ Unverify ]`** action with confirmation dialog.
  - **Server-Side Invariant:** Direct API calls to verify private portfolios (`is_portfolio_public: false`) are rejected with HTTP 400 Bad Request.

### 3.5 Curriculum Workspace (`/admin/curriculum`)
- **Curriculum Browser:** 9 modules, 90 lessons, with prerequisite mapping.
- **Content Quality Metrics:** Average clarity rating (1–5 stars) and clarity satisfaction percentage per lesson.
- **Needs Review Filter:** Highlights lessons with clarity ratings below 3.5/5.0.
- **Learner Feedback Drawer:** Inspect student feedback comments and issue tags (`confusing`, `typo`, `outdated`, `broken_diagram`).
- **Lesson Detail & Preview:** Metadata inspector, live learner-facing preview, and publish/unpublish toggles.

### 3.6 Achievements Workspace (`/admin/achievements`)
- **Certificates Registry (`/admin/achievements/certificates`):** Table of issued credentials, recipient lookups, template versioning, and verification drawer with live QR verification preview.
- **Badges Directory (`/admin/achievements/badges`):** Visual catalog of all platform badges with unlock criteria and recipient counts.

### 3.7 Analytics Workspace (`/admin/analytics`)
- **Learners:** Acquisition velocity, DAU/WAU/MAU ratios, level distribution, and streak health.
- **Learning:** Lesson completion funnel, drop-off hotspots, and quiz first-pass rates.
- **Engagement & XP:** Daily XP velocity, XP source attribution, and SM-2 flashcard retention habits.
- **Outcomes:** Certificate issuance velocity and public portfolio adoption rates.
- **Export:** One-click CSV export of analytics datasets.

### 3.8 System Workspace (`/admin/system`)
- **Health Tab:** Real-time database latency, auth service health, email provider connection, queue health, and cron status.
- **Alerts Tab:** Active system alerts grouped by severity (`critical`, `warning`, `info`).
- **Errors Tab:** System error logs aggregated by fingerprint with 15-minute deduplication, occurrence count, and stack trace inspector.
- **Audit Log Tab:** Searchable and filterable log of all admin mutations recorded in `public.admin_audit_logs`.
- **Manual Trigger:** Header action button to trigger instant email queue processing (`POST /api/cron/process-email-queue`).

### 3.9 Settings Workspace (`/admin/settings`)
- **Product Settings:** Platform name, contact email, Maintenance Mode toggle, Allow Signups toggle, Require Email Verification toggle, session timeout.
- **Learning Settings:** Runtime XP awards (lesson completion, quiz pass, flashcard review, reflection), streak freeze cost, pass thresholds.
- **Email Settings:** Sender name/email, daily/hourly send limits, retry policies, and API key status.
- **Notification Settings:** Daily reminder defaults, weekly recap schedule, default delivery channels.
- **Feature Flags:** Dynamic boolean/percentage feature flags stored in `system_settings`.
- **Onboarding Settings:** Structured goal options, recommended starting modules, and badge assignments.

---

## 4. Security Architecture & RBAC

| Security Layer | Implementation Detail |
|---|---|
| **Edge Proxy** | `apps/web/proxy.ts` blocks unauthorized access to `/admin` and protected APIs |
| **API Authorization** | `requireAdminUser(request)` in `lib/admin/authorization.ts` validates session & role |
| **Audit Trail** | `logAdminAction()` records admin email, IP/user agent, action name, and JSON payload |
| **Service Role Client** | Server-only Supabase service-role client initialized strictly inside protected Route Handlers |
| **Secret Sanitization** | `sanitizeErrorDetails()` strips API keys, tokens, and authorization headers before logging |
| **Search Engine Directives** | Admin routes emit `robots: { index: false, follow: false }` |

---

## 5. Verification & Quality Metrics

- **Vitest Unit & Integration Tests:** 84 test suites (887 tests passing with 0 failures).
- **TypeScript Typecheck:** 0 errors (`tsc --noEmit`).
- **ESLint:** 0 errors, 0 warnings.
- **Next.js Production Build:** 219 static and dynamic routes compiled successfully under Next.js 16.2.12 Turbopack.

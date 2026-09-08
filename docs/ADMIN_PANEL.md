# Admin Panel Architecture & Technical Reference — Prodily PM Academy

**Status:** 🟢 Production Ready  
**Scope:** Admin Console Workspaces, APIs, Navigation, RBAC, Services, and State Architecture  
**Last Updated:** September 6, 2026  

---

## 1. Admin Panel Overview

The Admin Panel (`/admin`) is the centralized operational control center for Prodily PM Academy administrators.

It is structured around three core operational pillars:
1. **Attention & Action:** Immediate visibility into items requiring human intervention — the Attention Center currently surfaces exactly 4 items: failed email deliveries, new contact messages, pending testimonials, and active system alerts. (There is no portfolio/Fellow-request attention item today, despite earlier versions of this doc claiming one.)
2. **Operations & Management:** Granular control over learners, curriculum content, achievement credentials, multi-channel communications, feature flags, and global product settings.
3. **Intelligence & Health:** Live analytics across learner growth, curriculum drop-off funnels, engagement velocity, and deep platform health diagnostics.

### Access Control & Authorization
- **Proxy Middleware Check (`apps/web/proxy.ts`):** Edge-level route protection requiring an authenticated session and admin status (with a fast-path JWT `app_metadata.is_admin` claim check before falling back to the DB).
- **Server-Side Authorization Guard (`lib/admin/guard.ts`):** `requireAdminUser(request)` and `logAdminAction()` are enforced on every `/api/admin/**` endpoint, with per-request result caching. (`lib/admin/authorization.ts` holds the small `isAdminEmail()`/`isAdminUser()` helpers `guard.ts` imports — it is not itself the enforcement layer.) A user is authorized if:
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
│   ├── Communications          /admin/communications  (11 tabs: overview, broadcasts, announcements,
│   │                                                    in-app, email, automations, templates, queue,
│   │                                                    contact, testimonials→moderation, feedback→moderation)
│   └── Moderation              /admin/moderation      (5 tabs: testimonials, feedback, capstones,
│                                                         portfolios [= Fellow legacy queue], fellow-requests)
│
├── Learning
│   ├── Curriculum              /admin/curriculum      (9 Modules, 90 Lessons, Quality Ratings & Feedback)
│   └── Achievements            /admin/achievements    (Certificates Registry & Badges Directory)
│
├── Growth
│   └── Leaderboard             /admin/leaderboard     (Ranking inspection, anomaly detection, privacy toggles)
│
├── Insights
│   └── Analytics               /admin/analytics       (Learners, Learning Funnel, Engagement/XP, Outcomes)
│
├── System
│   └── System                  /admin/system          (Health, Auth Telemetry, Storage Cleanup, Alerts, Errors, Audit Trails)
│
└── Settings
    └── Settings                /admin/settings        (Product, Learning, Email, Notifications, Feature Flags, Onboarding)
```

Note: `is_fellow` (Fellow designation) is granted via **either** the `portfolios` tab (legacy, browse-all) **or** the `fellow-requests` tab (learner-initiated) — see [`docs/admin/fellow-designation.md`](admin/fellow-designation.md). Portfolio Verification (`portfolio_verification_override`) is an unrelated, automatic system with no moderation queue at all — see [`docs/admin/portfolio-verification.md`](admin/portfolio-verification.md).

### Route Aliases & Backward-Compatible Redirects

| Legacy Route | Modern Canonical Route |
|---|---|
| `/admin/portfolios` | `/admin/moderation?tab=portfolios` (legacy Fellow-designation queue) |
| `/admin/content` | `/admin/curriculum` |
| `/admin/emails` | `/admin/communications?tab=queue` |
| `/admin/feature-flags` | `/admin/settings?section=feature-flags` |
| `/admin/feedback` | `/admin/moderation?tab=testimonials` |
| `/admin/notifications` | `/admin/communications?tab=in-app` (internally remapped) |
| `/admin/announcements` | `/admin/communications?tab=announcements` |
| `/admin/templates` | `/admin/communications?tab=templates` |
| `/admin/certificates` | `/admin/achievements/certificates` |

---

## 3. Workspaces & Functional Specifications

### 3.1 Dashboard (`/admin`)
- **Header & Filters:** Dynamic time-based greeting, date range selector (`Today`, `7D`, `30D`, `90D`, `Custom`), and instant data refresh.
- **Attention Center (`AdminAttentionCenter`):** Exactly 4 items — failed emails, new contact messages, pending testimonials, active system alerts. (No portfolio/Fellow-request item exists in the current builder.)
- **KPI Metrics (8 Cards):** Total Registered Users, Active Learners, New Signups, Verified Users, Lessons Completed, Overall Completion %, Total XP Earned, and Certificates Issued — with period-over-period trend deltas.
- **Visualizations:** Learner Activity Area Chart (new vs. active learners), Learning Activity Bar Chart (lessons, quizzes, capstones), and All-Time Learner Journey Funnel (`AdminFunnelChart`).
- **Live System Snapshot:** 6 rows — Database, Auth, Email, Queue, Notifications, and Scheduler.

### 3.2 Users Workspace (`/admin/users`)
- **Directory & Filters:** Search by name, email, or `@username`. Filter by Admin status, Verification status, Activity level, Progress, and XP tier.
- **User Detail Drawer (`UserDetailDrawer`):** Full-height sliding panel on desktop (`/admin/users?userId=[id]`) or standalone route on mobile (`/admin/users/[id]`).
  - **Overview Tab:** Goal, course progress bar, recent activity timeline, latest badge, latest certificate, portfolio link.
  - **Learning Tab:** Course progress, lesson counts, quiz average score, SRS review count, and per-module breakdown with **Reset Module Progress** action.
  - **Activity Tab:** Complete chronological activity timeline with event type icons.
  - **Achievements Tab:** Earned badges list, issued certificates, and submitted capstones with public status.
  - **Communications Tab:** History of sent emails, in-app notifications, contact inquiries, and **[ Send Production Email ]** modal button.
  - **Account Tab:** Email, verification status, signup date, last active date, auth provider, timezone, and internal UUID.
  - **Administrative Controls** (rendered above the tabs, always visible):
    - `UserRoleToggle`: Promote/demote Admin role (`is_admin`).
    - `UserFellowToggle`: Grant/revoke PM Fellow designation (`is_fellow`) — one of two paths to this flag, see [`docs/admin/fellow-designation.md`](admin/fellow-designation.md).
    - `UserPortfolioVerificationToggle`: Verify / Reject / Reset-to-Auto override for the separate, automatic Portfolio Verification system — see [`docs/admin/portfolio-verification.md`](admin/portfolio-verification.md).
    - `DeveloperActionsSection`: Generate test certificates for verification pipeline QA (`/api/admin/dev/generate-test-certificate`).
    - Destructive actions with confirmation dialogs: **Reset All Progress** and **Delete User Account**.

### 3.3 Communications Workspace (`/admin/communications`)
11 tabs total — see [`docs/admin/communications.md`](admin/communications.md) for the complete current list. Highlights:
- **Overview Tab:** Delivery health KPIs, active email provider status, and broadcast campaign summaries.
- **Email / Email Queue Tabs:** Email history & volume (`?tab=email`) is distinct from live queue inspection (`?tab=queue`: `pending`, `processing`, `delivered`, `retrying`, `dead_letter`, `suppressed`, `skipped`), with individual and bulk retry.
- **Broadcasts Tab:** Multi-channel broadcast builder (`/api/admin/emails/broadcasts`): audience targeting, recipient estimation & sampling, scheduling, execution, and cancelation.
- **Announcements Tab:** Platform banner announcements (merged in from the formerly-standalone `/admin/announcements`).
- **Automations Tab:** Cron schedule inspector for daily reminders and weekly recaps with **[ Run Now ]** trigger.
- **Templates Tab:** Plain-HTML template editor (no WYSIWYG) with a shared variable catalog, click-to-insert, unknown-variable validation, sandboxed live preview, draft/publish versioning, and direct test-send.
- **In-App Tab:** In-app broadcast management (`/api/admin/notifications/in-app`).
- **Contact Tab:** Inbound inquiry inbox (`public.contact_messages`) with status categorization (`new`, `in_progress`, `resolved`, `archived`).
- **Testimonials / Feedback Tabs:** cross-links into the Moderation workspace.

### 3.4 Moderation Workspace (`/admin/moderation`)
- **Testimonials Tab:** Review learner reviews with ratings, approve for publishing, or reject.
- **Product Feedback Tab:** Read-only in the current phase — no approve/reject actions (would require a backend status column).
- **Capstones Tab:** Evaluate module capstone submissions, toggle public portfolio visibility, and publish/archive case studies.
- **Portfolio Verification Queue** (`PortfoliosView.tsx`, `?tab=portfolios`) — despite the name, this grants/revokes **PM Fellow** (`is_fellow`), not the separate automatic Portfolio Verification feature:
  - KPI Cards: **Pending Verification**, **Verified Fellows**, and **Total Public Portfolios**.
  - Filter tabs: **Pending Review**, **Verified Fellows**, and **All Public**.
  - In-line **`[ Verify ]`** / **`[ Unverify ]`** actions with confirmation dialogs.
  - **Server-Side Invariant:** Direct API calls to grant Fellow on private portfolios (`is_portfolio_public: false`) are rejected with HTTP 400.
- **Fellow Requests Queue** (`?tab=fellow-requests`) — the newer, learner-initiated path to the same `is_fellow` flag; see [`docs/admin/fellow-designation.md`](admin/fellow-designation.md).

### 3.5 Curriculum Workspace (`/admin/curriculum`)
- **Curriculum Browser:** 9 modules (`foundations, discovery, design, execution, growth, leadership, technical, strategy, capstone`), 90 flat lesson files (`content/lessons/lesson-001.md` … `lesson-090.md`, no frontmatter).
- **Content Quality Metrics:** Average clarity rating (1–5 stars) and clarity satisfaction percentage per lesson.
- **Needs Review Filter:** Highlights lessons with clarity ratings below 3.5/5.0.
- **Learner Feedback Drawer:** Inspect student feedback comments and issue tags (`confusing`, `typo`, `outdated`, `broken_diagram`).
- **Lesson Detail & Preview:** Metadata inspector and live learner-facing preview. There is **no publish/unpublish control** — every lesson's status is a static "Published" display field with no backend toggle.

### 3.6 Achievements Workspace (`/admin/achievements`)
- **Certificates Registry (`/admin/achievements/certificates`):** Table of issued credentials, recipient lookups, and a verification drawer with live QR verification preview. There is **no template versioning and no credential-hash field** — every certificate uses one layout; the "code" shown (e.g. `PMA-2026-XXXXXXXX`) is the certificate identifier, not a separate hash.
- **Badges Directory (`/admin/achievements/badges`):** Visual catalog of all platform badges with unlock criteria and recipient counts.

### 3.7 Analytics Workspace (`/admin/analytics`)
- **Learners:** Acquisition velocity, DAU/WAU/MAU ratios, level distribution (9 levels, "Chief Product Officer" reached at Level 7), and streak health.
- **Learning:** Lesson completion funnel, drop-off hotspots, and quiz first-pass rates.
- **Engagement & XP:** Daily XP velocity and SM-2 flashcard retention habits. **XP Source Attribution is currently broken** — it selects `source_type` but reads `event.source`, so every event resolves to "Other" (tracked in `docs/ISSUES_KNOWN.md` ISSUE-20).
- **Outcomes:** Certificate issuance velocity and public portfolio adoption rates.
- **Export:** One-click CSV export of analytics datasets.

### 3.8 System Workspace (`/admin/system`)
- **Health Tab:** Real-time database latency, auth service health, email provider connection, queue health, and cron status.
- **Auth Health:** 24h/7d auth failure telemetry with provider-vs-network failure buckets and spike detection (≥5 critical/error failures in 15 min) — not previously documented here.
- **Storage Cleanup:** Triggers `AvatarService.cleanupOrphanedAvatars()` (dry-run or live) — not previously documented here.
- **Alerts Tab:** Active system alerts by severity — `critical`, `error` or `warning` only (there is no `info` severity), with severity derived from the failure `kind`. Facets on kind, retryability and provider are applied client-side over the loaded window. Each alert shows its occurrence count, first-seen time, operator next action, and a context row (template, queue, user, masked recipient, provider status). A failed query renders an error state, never the empty "no alerts" state.
- **Errors Tab:** System error logs deduplicated by fingerprint (`domain:kind:operation:stabilizedSummary`) inside a 15-minute window, incrementing the stored `occurrence_count` column.
- **Audit Log Tab:** Searchable and filterable log of all admin mutations recorded in `public.admin_audit_logs`.
- **Manual Trigger:** Header action button to trigger instant email queue processing (`POST /api/cron/process-email-queue`).

### 3.9 Settings Workspace (`/admin/settings`)
- **Product Settings:** Platform name, contact email, Maintenance Mode toggle, Allow Signups toggle, Require Email Verification toggle, session timeout.
- **Learning Settings:** Runtime XP awards (lesson completion, quiz pass, flashcard review, reflection), streak freeze cost, pass thresholds.
- **Email Settings:** Daily send limit and retry backoff (both enforced by the queue), plus read-only sender identity and API-key status. The hourly limit, max-retry and editable sender fields were removed in September 2026 because nothing read them — see [`admin/platform-settings.md`](admin/platform-settings.md) §3.G.
- **Notification Settings:** Daily reminder defaults, weekly recap schedule, default delivery channels.
- **Feature Flags:** Dynamic boolean/percentage feature flags stored in `system_settings`.
- **Onboarding Settings:** Structured goal options, recommended starting modules, and badge assignments.

---

## 4. Security Architecture & RBAC

| Security Layer | Implementation Detail |
|---|---|
| **Edge Proxy** | `apps/web/proxy.ts` blocks unauthorized access to `/admin` and protected APIs (with a JWT `app_metadata.is_admin` fast path) |
| **API Authorization** | `requireAdminUser(request)` in `lib/admin/guard.ts` validates session & role (imports helpers from `lib/admin/authorization.ts`) |
| **Audit Trail** | `logAdminAction()` records admin email, IP/user agent, action name, and JSON payload |
| **Service Role Client** | Server-only Supabase service-role client initialized strictly inside protected Route Handlers |
| **Secret Sanitization** | `lib/monitoring/redaction.ts` redacts messages **and** `details` recursively, by value shape and by key name, before anything is persisted. Covers provider keys, webhook secrets, JWTs, database credentials, session tokens and one-time auth tokens; emails are masked. See [ADR-005](decisions/ADR-005-sensitive-data-redaction.md) |
| **Search Engine Directives** | Admin routes emit `robots: { index: false, follow: false }` |

---

## 5. Verification & Quality Metrics

- **Vitest Unit & Integration Tests:** 100 test suites, 1029 tests passing.
- **TypeScript Typecheck:** 0 errors (`tsc --noEmit`).
- **ESLint:** 0 errors, 0 warnings.
- **Next.js Production Build:** compiles successfully under Next.js 16.2.12 Turbopack.

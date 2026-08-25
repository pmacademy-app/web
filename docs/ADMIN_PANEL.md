# Admin Panel — Prodily PM Academy

**Status:** 🟢 Production Ready
**Scope:** Admin Console Workspaces, APIs, Navigation, RBAC & Capabilities

---

## 1. Admin Panel Overview

The Admin Panel (`/admin`) is the operational control center for Prodily PM Academy administrators.

It is designed around three questions:
1. **What needs my attention?** — failed emails, new contact messages, pending testimonials, system alerts
2. **What can I manage?** — users, learning content, certificates, communications, feature flags, product settings
3. **What is happening across Prodily?** — learner growth, learning activity, course completion, engagement, certificates

**Access control**: Proxy middleware (`apps/web/proxy.ts`) and RBAC checks (`lib/admin/authorization.ts`) enforce access. A user is authorized if their `email` matches `ADMIN_EMAILS` environment variable **or** `users.is_admin === true` in PostgreSQL.

**Service layer**: All data operations use `AdminConsoleService` and workspace-specific services in `lib/admin/`.

---

## 2. Current Admin Panel Structure

### Navigation (Sidebar — Final IA)

```
PRODILY ADMIN
│
├── Overview
│   └── Dashboard               /admin
│
├── Operations
│   ├── Users                   /admin/users
│   ├── Communications          /admin/communications
│   └── Moderation              /admin/moderation
│
├── Learning
│   ├── Curriculum              /admin/curriculum
│   └── Achievements            /admin/achievements
│
├── Insights
│   └── Analytics               /admin/analytics
│
├── System
│   └── System                  /admin/system  (tabs: Health, Alerts, Errors, Audit Log)
│
└── Settings
    └── Settings                /admin/settings  (tabs: Product, Learning, Email, Notifications, Feature Flags)
```

### Legacy Routes (Preserved as Redirects)

| Legacy Route | Redirects To |
|---|---|
| `/admin/content` | `/admin/curriculum` |
| `/admin/emails` | `/admin/communications?tab=queue` |
| `/admin/feature-flags` | `/admin/settings?section=feature-flags` |
| `/admin/feedback` | `/admin/moderation?tab=testimonials` |
| `/admin/notifications` | `/admin/communications?tab=notifications` |
| `/admin/portfolios` | `/admin/users` |
| `/admin/templates` | `/admin/communications?tab=templates` |
| `/admin/certificates` | `/admin/achievements/certificates` |

---

## 3. Workspace Details

### 3.1 Dashboard (`/admin`)

**Purpose**: Operational home — "What is happening and what needs my attention?"

**Sections:**
- **Page header**: Time-based greeting + date-range selector (Today/7D/30D/90D/Custom via `?range=`); Refresh button
- **Attention Center** (`AdminAttentionCenter`): Failed emails, new contact messages, pending testimonials, active alerts. Collapses to "Everything looks good" when all counts are zero.
- **KPI grid** (8 cards): Total Users, Active Learners, New Users, Verified Users, Lessons Completed, Course Completion %, XP Earned, Certificates Issued — each with prior-period trend deltas
- **Charts**: Learner Activity (AreaChart: new/active/returning per day) + Learning Activity (BarChart: lessons/quizzes/capstones per day, with metric switching)
- **Learning Funnel** (`AdminFunnelChart`): Registered → Onboarding → First Lesson → First Quiz → Module Completion → Course Completion → Certificate (all-time cumulative)
- **Recent Activity** (`AdminRecentActivityList`): Union of certificates, registrations, lesson completions, capstone submissions (sorted desc, capped at 12)
- **System Snapshot** (`AdminSystemSnapshot`): Live-derived service status (Database, Auth, Email, Queue, Notifications, Scheduler)

**Key decisions:**
- Active learner = distinct user with ≥1 `xp_events` row in the selected window
- Funnel is all-time (not range-scoped); date range affects KPIs/charts only
- Course completion = users holding the `cpo_completion` badge (or all 90 lessons)

---

### 3.2 Users Workspace (`/admin/users`)

**Purpose**: Search, inspect and manage all learners.

**Filters**: Verification status, Account status, Admin status, Activity level, Progress, Level, Signup date, Last active

**User table columns**: User, Status, Progress, Level, XP, Streak, Last Active, Joined

**User Detail Drawer** (`UserDetailDrawer`): Full-height right drawer on desktop; full-screen page on mobile (`/admin/users/[id]`).

**Drawer tabs**: Overview, Learning, Activity, Achievements, Communications, Account

**User actions**: Resend verification, Role toggle, View portfolio, Reset progress (confirmation), Delete account (confirmation)

---

### 3.3 Communications Workspace (`/admin/communications`)

**Purpose**: Unified management of all communication channels.

**Tabs**: Overview, Email, Automations, Templates, Queue, Notifications, Contact, [Testimonials → Moderation], [Feedback → Moderation]

**Template Editor** (`/admin/communications/templates/[templateKey]`): Subject field, email body editor (Code mode), live HTML preview, variable reference, Save and Send Test actions.

**Schema limitations:**
- Template "Last Updated" not available (source-controlled components; no `updated_at` in registry)
- Contact Read/Unread maps to `status = 'new'` (no `read_at` column)
- Notification management actions absent (platform dispatches automatically from learning events)

---

### 3.4 Moderation Workspace (`/admin/moderation`)

**Purpose**: Review-oriented workspace for all learner-submitted content requiring human review.

**Tabs**: Testimonials (approve/reject/publish), Product Feedback (read-only), Capstones (publish/keep private), Portfolios (view)

**Schema limitations (documented in code):**
- Product Feedback: no `status` column → read-only with explanatory note
- Testimonials "Featured" = Published (no `featured` column)
- Moderation "In Review" status: absent from DB → not shown
- Capstone "Rejected" = `reviewed` + `is_public: false` → shown as "archived"

---

### 3.5 Curriculum Workspace (`/admin/curriculum`)

**Purpose**: Inspect and manage the learning structure.

**Views:**
- Overview: KPI cards + module grid
- Module Detail (`/admin/curriculum/[moduleSlug]`): metadata + lesson table
- Lesson Detail (`/admin/curriculum/[moduleSlug]/[lessonId]`): metadata + live learner-facing preview

**Frontend controls**: Publish/unpublish, enable/disable, visibility toggle (all with confirmation dialogs)

---

### 3.6 Achievements Workspace (`/admin/achievements`)

**Purpose**: Learner outcome overview and navigation.

**Pages:**
- Overview: KPI cards + nav tiles to Badges, Certificates, Capstones (→ Moderation), Portfolios (→ Moderation)
- Certificates (`/admin/achievements/certificates`): table + detail drawer with preview and verification link
- Badges (`/admin/achievements/badges`): visual grid + badge detail drawer

**Schema limitations:**
- "Recently Verified" KPI: no verification tracking → replaced by "Credential Types"
- Portfolios "Submitted" column: no `portfolios` table → column labeled "Joined" (account creation date)

---

### 3.7 Analytics Workspace (`/admin/analytics`)

**Purpose**: Deep analytics on learner behavior, learning, engagement, and outcomes.

**Tabs**: Overview, Learners (DAU/WAU/MAU, acquisition, levels, streaks), Learning (curriculum drop-offs, completion funnel, quiz performance), Engagement & XP (daily XP velocity, source breakdown, SRS habits), Outcomes (certificate velocity, capstone status, portfolio adoption)

**Global controls**: Date range selector, Export CSV button

**Data**: All live Supabase data; no mock fallbacks. Session duration not logged → correctly omitted.

---

### 3.8 System Workspace (`/admin/system`)

**Purpose**: Operational visibility into platform health.

**Tabs**: Health (service cards + feature flags diagnostic), Alerts (severity-grouped), Errors (groups table + detail drawer), Audit Log (searchable/filterable + detail drawer)

**Header action**: Process Email Queue button

---

### 3.9 Settings Workspace (`/admin/settings`)

**Purpose**: Grouped configuration for product, learning, email, notifications, and feature flags.

**Sections**: Product, Learning, Email, Notifications, Feature Flags

**UX**: Dirty-state tracking, unsaved-changes warning on tab switch, Save/Reset per section, `beforeunload` guard.

**Persistence**: `PATCH /api/admin/settings?section=<section>` → `system_settings` table. Requires production verification.

---

## 4. Shared Components & Design System

### Design Tokens
All admin styles use CSS custom properties prefixed `admin-*`:
- Surfaces: `admin-bg`, `admin-surface`, `admin-surface-raised`
- Text: `admin-fg`, `admin-fg-muted`, `admin-fg-subtle`
- Borders: `admin-border`, `admin-border-strong`
- Accent: `admin-accent`, `admin-accent-soft`
- Semantic: `admin-success`, `admin-warning`, `admin-danger`, `admin-info` + `-soft` variants

### Key Shared Components
| Component | Purpose |
|---|---|
| `AdminConsoleShell` | Root shell: sidebar + header wiring |
| `AdminSidebar` | Collapsible sidebar with group nav and attention badges |
| `AdminHeader` | Sticky header: breadcrumbs, system status, bell, sign-out |
| `AdminPageShell` | Standard page container (header, KPIs, children) |
| `AdminPageHeader` | Page title, description, icon, actions bar |
| `AdminDataTable` | Sortable table with empty/loading/error states |
| `AdminPagination` | Page navigation with keyboard focus |
| `AdminKpiCard` | KPI card with title, value, subtitle, icon, trend |
| `AdminStatusBadge` | Semantic status badges |
| `AdminModal` | Accessible modal with focus trap |
| `AdminDrawer` | Right-panel detail drawer |
| `AdminConfirmDialog` | Confirmation dialog for destructive actions |
| `AdminSearchInput` | Debounced search input |
| `AdminRangeSelector` | Date range preset selector |
| `AdminEmptyState` | Empty state with icon, title, description |
| `AdminErrorState` | Error state with retry |
| `AdminLoadWarning` | Non-blocking data load warning banner |
| `admin-toast` | Toast notification system |

---

---

## 5. Current Feature Status & Capabilities

### ✅ Fully Implemented & Backed by Real Database Services
- **Dashboard (`/admin`)**: Real-time KPI cards, daily learner/learning charts, journey funnel, recent activity feed, system snapshot, and date range filters (`Today`, `7D`, `30D`, `90D`, `Custom`).
- **Global Search & Attention**:
  - `Cmd+K` / `Ctrl+K` global search modal (`/api/admin/search`) searching across Users, Curriculum, Certificates, and Inquiries with server-side RBAC.
  - Actionable Attention Bell popover panel in header displaying live breakdown counts and direct links to active queues.
- **Users (`/admin/users`)**: Directory with SQL-side pagination, search, role filters, user detail drawers, admin role toggle, progress reset, account deletion, and custom individual production email dispatching (`/api/admin/emails/production-send`).
- **Communications (`/admin/communications`)**: Email queue monitoring, dead-letter retry/inspect, transactional template viewer & test send, system announcements broadcast, and contact message inbox.
- **Moderation (`/admin/moderation`)**: Review and publish/reject learner testimonials, capstone project deliverables, and product feedback.
- **Curriculum (`/admin/curriculum`)**: 9-module & 90-lesson browser, lesson metadata inspection, publish/unpublish toggles, and live previews.
- **Achievements (`/admin/achievements`)**: Issued certificate registry with live verification previews, badge catalog, and credential issuance logs.
- **Analytics (`/admin/analytics`)**: Active learner metrics (DAU/WAU/MAU), lesson completion drop-off funnels, quiz pass rates, XP velocity, and SRS retention habits.
- **System (`/admin/system`)**: Operational health diagnostics, database latency metrics, error group logs with stack traces, severity-based alerts, and searchable `admin_audit_logs`.
- **Settings (`/admin/settings`)**: Product configuration, runtime XP values, email provider controls, notification defaults, feature flag toggles, and dynamic onboarding goal option management.

---

## 6. Security Architecture & RBAC

| Layer | Implementation |
|---|---|
| **Middleware RBAC** | `apps/web/proxy.ts` — first checkpoint, blocks unauthenticated & non-admin users |
| **Layout Authorization** | `app/admin/(console)/layout.tsx` — server-side session authorization guard via `isAdminUser()` |
| **Centralized Route Guard** | `requireAdminUser()` in `lib/admin/authorization.ts` — enforced on 100% of `/api/admin/**` handlers (33 files, 47 endpoints) |
| **Audit Logging** | `logAdminAction()` in `lib/admin/authorization.ts` — automatically persists structured metadata for all mutations to `admin_audit_logs` |
| **Service Role Isolation** | Service-role Supabase client is server-only and invoked strictly after admin authorization |
| **Search Engine Robots** | `/admin` excluded from indexing (`index: false, follow: false`) |

---

## 7. Quality & Verification Metrics

- **Unit & Integration Tests**: 54 test files (439 tests passing with 0 failures in Vitest).
- **TypeScript Typecheck**: 0 errors (`tsc --noEmit`).
- **ESLint**: 0 errors, 0 warnings.
- **Production Build**: 199/199 routes compiled successfully under Next.js 16.2.12 (Turbopack).
- **Email Safety**: Outbound email mock fail-safe active during automated tests (0 live emails sent to test recipients).



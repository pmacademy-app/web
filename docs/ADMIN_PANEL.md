# Admin Panel — Prodily PM Academy

**Status:** Current · Post-Phase 10 (all 10 frontend phases complete)
**Last Updated:** August 23, 2026
**Replaces:** Legacy `ADMIN_PANEL.md` (pre-redesign 12-tab spec) and the deleted planning documents (`admin-panel-ui-ux-spec.md`, `admin-panel-implementation-plan.md`)

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

## 5. Current Feature Status

### ✅ Fully Implemented (Frontend + Real Data)
- Dashboard (all sections), Users (all tabs + actions), Communications (all tabs + template editor), Moderation (testimonials + capstones + portfolios), Curriculum (overview + module + lesson detail), Achievements (overview + certificates + badges), Analytics (all 5 tabs, range-driven), System (all 4 tabs), Settings (all 5 sections + UI persistence), Shell (sidebar + header + loading/error states)

### ⚠️ Frontend Implemented, Backend Persistence Unverified
- Settings save/reset (requires production verification of `/api/admin/settings` against `system_settings`)
- Feature flag toggle (requires production verification of `setFeatureFlag()`)
- Template editor Save (requires verification that template content changes persist)

### ❌ Frontend Read-Only (Missing Backend Support)
- Product Feedback moderation: no `status` column on `user_feedback`
- Notification management (Create/Schedule/Send): no notification-management API
- Template "Last Updated": templates are source-controlled; no `updated_at` in registry
- Session duration / dwell time: not logged in Supabase

---

## 6. Remaining Admin Panel Work

### Backend / API
- Verify settings persistence end-to-end in production
- Implement Reset Progress action backend route
- Implement Delete Account backend route
- Implement failed email retry endpoint
- Build `/api/admin/search` for global search functionality

### Database / Schema
- Add `status` column to `user_feedback` for feedback moderation
- Design notification management schema (if admin-created notifications needed)
- Verify `system_settings` covers all new settings sections with correct key-value structure

### Integration
- Wire header bell icon to open an alerts panel (currently shows count only)
- Verify curriculum visibility controls (publish/unpublish/enable/disable) write through correctly

### Performance / Scalability
- Move all-time funnel stage counts and returning-learner set to SQL-side aggregation before >10k rows
- Add `first_active_at` column on `users` for efficient returning-learner queries
- Paginate `auth.admin.listUsers()` if auth pool grows past 1,000

---

## 7. Future / Out-of-Scope Features

Explicitly deferred. Do not implement without a new specification:

- Data Export workspace
- Multi-admin access management / advanced RBAC
- Full Curriculum CMS (create/edit/version lessons)
- Visual Email Builder (drag-and-drop)
- Advanced Analytics (retention cohorts, segmentation, churn)
- Advanced Reporting (scheduled exports)
- Advanced System Monitoring (custom alert rules)
- Advanced Moderation (suspension, restrictions, abuse workflows)
- Command Menu (`⌘K` palette)
- Global Alerts Center Panel (full panel from bell icon)

---

## 8. Production Readiness

### Frontend: Complete ✅
- 0 TypeScript errors · 0 ESLint errors (admin codebase)
- 35+ test suites passing
- Production build clean (186/186 Next.js pages, Turbopack)
- Real Supabase data throughout — no mock fallbacks
- No `any`, `@ts-ignore`, or `eslint-disable` shortcuts

### Admin Panel Safe to Use Today
Dashboard, Users, Communications, Moderation, Curriculum, Achievements, Analytics, System Health — all backed by real data.

### Prevents Full Production Readiness
1. Settings persistence — requires end-to-end production verification
2. User actions (reset progress, delete account) — no backend routes
3. Global search — UI only; no backend endpoint
4. Header bell — attention count displayed, no panel on click
5. Schema gaps — Feedback moderation, notification management, template persistence

---

## 9. Security Architecture

| Layer | Implementation |
|---|---|
| **Middleware RBAC** | `apps/web/proxy.ts` — first checkpoint, blocks non-admin users |
| **Layout authorization** | `app/admin/(console)/layout.tsx` — server-side re-check (defense in depth) |
| **Authorization function** | `lib/admin/authorization.ts` — checks `ADMIN_EMAILS` AND `users.is_admin` |
| **Service layer** | All admin services use service-role Supabase client |
| **Robots** | `/admin` excluded from indexing (`index: false, follow: false`) |



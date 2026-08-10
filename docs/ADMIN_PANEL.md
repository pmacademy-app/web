# Admin Console Specification & Audit — Prodily PM Academy

**Repository:** `pmacademy-app/web`  
**Current Baseline HEAD:** `490fea37ea08813aa582fc5ebbc3896ee4eb070c`  
**Last Updated:** August 10, 2026  

---

## 1. Overview & Security Architecture

The Admin Console (`/admin`) is a centralized management platform for administrators.

- **Access Control**: Scoped by Proxy Middleware (`apps/web/proxy.ts`) and RBAC checks (`lib/admin/rbac.ts`).
- **Authorization Rule**: Access is granted if `user.email` matches `ADMIN_EMAILS` environment variable OR `users.is_admin === true` in PostgreSQL.
- **Service Layer**: All operations execute via `AdminConsoleService` (`lib/admin/service.ts`) using service-role authorization.

---

## 2. Tab-by-Tab Specification

| Tab Name | UI Component / View | Main Actions & API Handlers | DB Dependencies | Status |
|---|---|---|---|---|
| **1. Overview** | `AdminDashboardView` | Platform metrics summary, active learners, lessons completed | `public.users`, `public.user_lesson_progress` | 🟢 Verified in Production |
| **2. Content** | `AdminContentView` | Lesson compilation stats, search index stats | `content/dist/lessons/`, FlexSearch index | 🟢 Verified in Production |
| **3. Users** | `UserManagementView`, `UserDetailDrawer` | User list, verified/unverified badges, search, detail view | `auth.users`, `public.users` | 🟢 Verified in Production |
| **4. Portfolios** | `AdminPortfoliosView` | Public portfolio toggle & showcase audit | `public.users`, `public.capstone_submissions` | 🟢 Verified in Production |
| **5. Notifications** | `AdminNotificationsView` | Dispatch broadcast notifications, view delivery logs | `public.notifications`, `public.notification_delivery_events` | 🟢 Verified in Production |
| **6. Emails** | `AdminEmailsView`, `ProductionSendModal`, `TestSendModal` | Send Production Email, Send Test Email, Queue Overview | `public.email_queue`, Resend API | 🟢 Verified in Production |
| **7. Feature Flags** | `AdminFeatureFlagsView` | Runtime toggle of feature flags (`email_automations_enabled`, etc.) | `public.system_settings` | 🟢 Verified in Production |
| **8. Feedback** | `AdminFeedbackView` | View learner feedback & ratings | `public.user_feedback` | 🟢 Verified in Production |
| **9. Certificates** | `AdminCertificatesView` | Manual certificate generation & verification audit | `public.certificates` | 🟢 Verified in Production |
| **10. Communications**| `AdminContactQueriesView` | Review contact form submissions | `public.contact_queries` | 🟢 Verified in Production |
| **11. Templates** | `AdminTemplatesView` | Preview email templates with sample variables | `emails/index.ts` | 🟢 Verified in Production |
| **12. System** | `AdminSystemAlertsView` | System Health, System Errors (`public.system_errors`), Audit Logs | `public.system_errors`, `public.admin_audit_logs` | 🟢 Verified in Production |

---

## 3. Important Administrative Operations

### A. Unverified User Discovery & Display
- **Implementation**: `AdminConsoleService.getUsersOverview()` calls `supabase.auth.admin.listUsers()` and merges auth rows with `public.users`.
- **UI Display**: Users table displays **Verified** (emerald) vs **Unverified** (amber) badges.
- **Drawer Actions**: `UserDetailDrawer` displays **Email Verification Status** and provides an **Admin Resend Verification Email** button.

### B. Send Production Email vs. Send Test Email
1. **Send Test Email (`/api/admin/emails/test-send`)**: Directly dispatches a sample template to the logged-in Admin's email via Resend API. Bypasses `email_queue`.
2. **Send Production Email (`/api/admin/emails/production-send`)**:
   - For `auth.verify_email`: Calls `supabase.auth.admin.generateLink({ type: 'magiclink' })`, embeds `action_link` as `verificationUrl`, enqueues into `email_queue`, and executes `processEmailQueue(50)`.
   - For all other templates: Enqueues into `email_queue` and executes `processEmailQueue(50)`.
   - Records an entry in `public.admin_audit_logs` and `public.notification_delivery_events`.

### C. System Alerts & Error Audit Logs
- **Implementation**: `/admin/system` displays real-time system errors logged via `logSystemError()`.
- **Sanitization**: Secret tokens (`Bearer`, `whsec_`, `sk_`) are sanitized before insertion into `public.system_errors`.
- **Deduplication**: Identical errors within 15 minutes match fingerprint signatures and increment `occurrence_count` instead of creating duplicate rows.

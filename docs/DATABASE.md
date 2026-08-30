# Database Schema & Migration Specification — Prodily PM Academy

**Repository:** `pmacademy-app/web`  
**Database:** PostgreSQL (Supabase)  
**Migrations:** 39 Versioned SQL DDL Files in `supabase/migrations/`  
**Last Updated:** August 30, 2026  

---

## 1. Overview & Schema Architecture

All database schema definitions are managed through versioned SQL DDL migration files in `supabase/migrations/`.

- **Total Versioned Migrations:** 39 SQL files.
- **Row Level Security (RLS):** Enabled across 100% of user-owned tables.
- **Service-Role Isolation:** Admin and background API routes use `createServiceRoleClient()` to interact with system tables with elevated permissions.
- **TypeScript Type Safety:** Auto-generated TypeScript definitions live in `apps/web/types/database.ts` and are re-exported by `apps/web/lib/supabase.ts`.

---

## 2. Complete PostgreSQL Migration History (39 Files)

| Timestamp Migration File | Target Schema / Modification | Status |
|---|---|---|
| `20260728000001_create_waitlist.sql` | `public.waitlist` pre-launch table | 🟢 Applied |
| `20260728000002_create_user_state.sql` | `public.users`, `user_lesson_progress`, `user_reflections`, `xp_events` | 🟢 Applied |
| `20260728000003_alter_waitlist_column.sql` | Waitlist column adjustments | 🟢 Applied |
| `20260728000004_db_security_fixes.sql` | RLS security policies on user state tables | 🟢 Applied |
| `20260728164000_supabase_security_hardening.sql` | Search path security hardening | 🟢 Applied |
| `20260802000001_lesson_id_migration.sql` | Stable `lessonId` column migration | 🟢 Applied |
| `20260805000001_update_xp_level_trigger.sql` | `update_user_xp_and_level()` trigger | 🟢 Applied |
| `20260805000002_add_streak_columns.sql` | `user_streaks` table and columns | 🟢 Applied |
| `20260805000003_add_portfolio_columns.sql` | `is_portfolio_public` & `bio` columns on `users` | 🟢 Applied |
| `20260805000004_create_certificates.sql` | `public.certificates` credential registry | 🟢 Applied |
| `20260805000005_seed_badges.sql` | Initial badge definitions | 🟢 Applied |
| `20260805000006_create_leaderboards_and_cohorts.sql` | `cohorts`, `cohort_members`, `friendships` | 🟢 Applied |
| `20260806000001_notification_platform_foundation.sql` | `notifications`, `email_queue`, `notification_delivery_events` | 🟢 Applied |
| `20260809000000_create_testimonials_table.sql` | `public.testimonials` | 🟢 Applied |
| `20260809000001_security_hardening_rls.sql` | Notification table RLS policies | 🟢 Applied |
| `20260810000001_create_user_feedback_tables.sql` | `public.user_feedback` | 🟢 Applied |
| `20260810000002_create_contact_messages_table.sql` | `public.contact_queries` | 🟢 Applied |
| `20260810000003_update_testimonials_schema.sql` | Testimonials schema update | 🟢 Applied |
| `20260810000004_create_admin_audit_logs.sql` | `public.admin_audit_logs` | 🟢 Applied |
| `20260810000005_performance_optimization_indexes.sql` | B-tree performance indexes | 🟢 Applied |
| `20260810000006_add_author_name_to_testimonials.sql` | Author attribution on testimonials | 🟢 Applied |
| `20260810000007_supabase_advisor_security_hardening.sql` | Database security advisor hardening | 🟢 Applied |
| `20260810000008_email_automations_and_limits.sql` | `system_settings`, `increment_daily_email_quota()` | 🟢 Applied |
| `20260810000009_create_system_errors_and_rate_limits.sql` | `public.system_errors`, `public.rate_limits` | 🟢 Applied |
| `20260811000001_add_curriculum_access_override.sql` | `curriculum_access_override` flag on `users` | 🟢 Applied |
| `20260813000001_lesson_id_backfill.sql` | Progress row lesson ID backfill | 🟢 Applied |
| `20260813000002_service_role_comments.sql` | Service role documentation comments | 🟢 Applied |
| `20260819000001_phase3_onboarding_storage.sql` | Structured onboarding fields on `users` | 🟢 Applied |
| `20260822000001_system_announcements_and_perf.sql` | `public.system_announcements` + performance indexes | 🟢 Applied |
| `20260823000001_notification_idempotency_and_avatar_cleanup.sql` | Idempotency keys on notifications | 🟢 Applied |
| `20260824000001_phase9_perf_indexes.sql` | Performance indexes for XP, badges, and portfolios | 🟢 Applied |
| `20260826000001_populate_onboarding_settings.sql` | Seeds default goal options in `system_settings` | 🟢 Applied |
| `20260826000002_onboarding_structured_columns.sql` | Structured onboarding preferences | 🟢 Applied |
| `20260826000003_create_email_broadcasts.sql` | `public.email_broadcasts` broadcast campaigns table | 🟢 Applied |
| `20260826000004_create_in_app_broadcasts.sql` | `public.in_app_broadcasts` in-app campaigns table | 🟢 Applied |
| `20260827000001_phase5_portfolio_evolution.sql` | `portfolio_layout`, `featured_capstone_id`, view counter | 🟢 Applied |
| `20260828000001_phase6_lesson_feedback.sql` | `public.lesson_feedback` clarity rating table | 🟢 Applied |
| `20260828000002_phase7_referrals.sql` | `public.referrals` table for attribution & rewards | 🟢 Applied |
| `20260830000001_add_is_fellow_column.sql` | `is_fellow` boolean column on `public.users` | 🟢 Applied |

---

## 3. Database Table Categories & Schema Summary

### Core User & Learning Tables
- **`public.users`:** Main profile entity (`id`, `name`, `username`, `email`, `avatar_url`, `bio`, `total_xp`, `level`, `is_admin`, `is_fellow`, `is_portfolio_public`, `portfolio_layout`, `featured_capstone_id`, `portfolio_view_count`, `curriculum_access_override`).
- **`public.xp_events`:** Append-only XP ledger (`id`, `user_id`, `amount`, `source_type`, `description`, `created_at`).
- **`public.user_lesson_progress`:** Lesson completion records (`user_id`, `lesson_id`, `status`, `completed_at`, `quiz_score`).
- **`public.user_reflections`:** Qualitative student reflections on lesson theory.
- **`public.user_streaks`:** Current and maximum streak tracking per user.
- **`public.lesson_feedback`:** 1–5 star clarity ratings and issue tags.

### Referrals & Growth
- **`public.referrals`:** Referral attributions (`id`, `referrer_id`, `referred_user_id`, `status`, `created_at`, `rewarded_at`).

### Communication & Broadcasts
- **`public.email_queue`:** Asynchronous transactional email queue.
- **`public.email_broadcasts`:** Targeted email campaigns (`id`, `title`, `audience_filter`, `status`, `sent_count`).
- **`public.in_app_broadcasts`:** Targeted in-app notification campaigns.
- **`public.notifications`:** In-app notification inbox.
- **`public.notification_preferences`:** Per-user notification channel preferences.
- **`public.notification_delivery_events`:** Multi-channel delivery audit logs.
- **`public.system_announcements`:** Platform-wide banner announcements.

### Moderation & Achievement Tables
- **`public.certificates`:** Issued credential records (`id`, `user_id`, `credential_hash`, `title`, `issued_at`).
- **`public.user_badges`:** Badge awards per user.
- **`public.capstone_submissions`:** Module capstones with moderation review status.
- **`public.testimonials`:** Reviews with approval/rejection state.
- **`public.user_feedback`:** Private platform feedback submissions.
- **`public.contact_queries`:** Inbound contact form inquiries.

### Platform & Observability Tables
- **`public.system_settings`:** JSONB platform configuration (product, learning, email, notifications, feature flags, onboarding).
- **`public.system_errors`:** Aggregated error logs with fingerprint dedup and occurrence counts.
- **`public.admin_audit_logs`:** Immutable record of admin operations.
- **`public.rate_limits`:** Persistent rate limiting records.

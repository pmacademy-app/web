# Database Schema & Migration Specification — Prodily PM Academy

**Repository:** `pmacademy-app/web`  
**Current Baseline HEAD:** `490fea37ea08813aa582fc5ebbc3896ee4eb070c`  
**Last Updated:** August 10, 2026  

---

## 1. Overview & Schema Architecture

Database persistence is powered by PostgreSQL hosted on Supabase. Schema changes are managed exclusively through versioned SQL DDL migration files in `supabase/migrations/`.

- **Migration Total**: 24 SQL files.
- **RLS Policy**: Row Level Security (RLS) is enabled on 100% of user-owned tables.
- **Service Role Bypass**: Server-side admin routes use `createAdminSupabaseClient()` to access system tables with service-role permissions.

---

## 2. PostgreSQL Migration History (24 Versioned Files)

| Timestamp Migration File | Target Schema / Tables Created or Modified | Status |
|---|---|---|
| `20260728000001_create_waitlist.sql` | `public.waitlist` | 🟢 Verified in Production |
| `20260728000002_create_user_state.sql` | `public.users`, `user_lesson_progress`, `user_reflections`, `xp_events` | 🟢 Verified in Production |
| `20260728000003_alter_waitlist_column.sql` | Updates `waitlist` table columns | 🟢 Verified in Production |
| `20260728000004_db_security_fixes.sql` | RLS security policies on user state | 🟢 Verified in Production |
| `20260728164000_supabase_security_hardening.sql` | Search path security hardening | 🟢 Verified in Production |
| `20260802000001_lesson_id_migration.sql` | Stable `lessonId` column migration | 🟢 Verified in Production |
| `20260805000001_update_xp_level_trigger.sql` | `update_user_xp_and_level()` trigger | 🟢 Verified in Production |
| `20260805000002_add_streak_columns.sql` | `user_streaks` table & columns | 🟢 Verified in Production |
| `20260805000003_add_portfolio_columns.sql` | `is_portfolio_public` & `bio` columns | 🟢 Verified in Production |
| `20260805000004_create_certificates.sql` | `public.certificates` | 🟢 Verified in Production |
| `20260805000005_seed_badges.sql` | Initial badge seeding | 🟢 Verified in Production |
| `20260805000006_create_leaderboards_and_cohorts.sql` | `cohorts`, `cohort_members`, `friendships` | 🟢 Verified in Production |
| `20260806000001_notification_platform_foundation.sql` | `notifications`, `email_queue`, `notification_delivery_events` | 🟢 Verified in Production |
| `20260809000000_create_testimonials_table.sql` | `public.testimonials` | 🟢 Verified in Production |
| `20260809000001_security_hardening_rls.sql` | RLS policies on notification tables | 🟢 Verified in Production |
| `20260810000001_create_user_feedback_tables.sql` | `public.user_feedback` | 🟢 Verified in Production |
| `20260810000002_create_contact_messages_table.sql` | `public.contact_queries` | 🟢 Verified in Production |
| `20260810000003_update_testimonials_schema.sql` | Testimonials schema update | 🟢 Verified in Production |
| `20260810000004_create_admin_audit_logs.sql` | `public.admin_audit_logs` | 🟢 Verified in Production |
| `20260810000005_performance_optimization_indexes.sql` | B-tree performance indexes | 🟢 Verified in Production |
| `20260810000006_add_author_name_to_testimonials.sql` | Testimonials author name column | 🟢 Verified in Production |
| `20260810000007_supabase_advisor_security_hardening.sql` | RLS policies on security tables | 🟢 Verified in Production |
| `20260810000008_email_automations_and_limits.sql` | `system_settings`, `increment_daily_email_quota()` | 🟢 Verified in Production |
| `20260810000009_create_system_errors_and_rate_limits.sql` | `public.system_errors`, `public.rate_limits` | 🟢 Verified in Production |

---

## 3. Database Table Definitions & RLS Summary

### Core User Tables
- `public.users`: Primary profile state (`id` references `auth.users.id`, `name`, `username`, `total_xp`, `level`, `current_streak`, `is_admin`, `is_portfolio_public`).
- `public.xp_events`: Immutable XP transaction ledger (`id`, `user_id`, `amount`, `source`, `created_at`).
- `public.user_lesson_progress`: Lesson status (`user_id`, `lesson_id`, `status`, `completed_at`).

### System & Infrastructure Tables
- `public.email_queue`: Transactional email queue (`id`, `user_id`, `to_email`, `template_key`, `status`, `resend_id`).
- `public.system_errors`: Application error log (`id`, `severity`, `category`, `message`, `fingerprint`, `occurrence_count`).
- `public.rate_limits`: Persistent rate limit records (`key`, `hit_count`, `window_start`).
- `public.system_settings`: Key-value configuration store (`email_automations_enabled`, `daily_email_quota_count`, `email_global_pause`).

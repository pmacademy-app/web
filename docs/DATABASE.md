# Database Schema & Migration Specification — Prodily PM Academy

**Repository:** `pmacademy-app/web`
**Last Updated:** August 23, 2026

---

## 1. Overview & Schema Architecture

Database persistence is powered by PostgreSQL hosted on Supabase. Schema changes are managed exclusively through versioned SQL DDL migration files in `supabase/migrations/`.

- **Migration Total**: 31 SQL files.
- **RLS Policy**: Row Level Security (RLS) is enabled on 100% of user-owned tables.
- **Service Role Bypass**: Server-side admin routes use `createAdminSupabaseClient()` to access system tables with service-role permissions.
- **Type Safety**: Complete TypeScript schema generated from Supabase and maintained in `apps/web/types/database.ts`. All table interactions are fully typed via `lib/supabase.ts`, which re-exports from `types/database`.

---

## 2. PostgreSQL Migration History (31 Versioned Files)

| Timestamp Migration File | Target Schema / Tables Created or Modified | Status |
|---|---|---|
| `20260728000001_create_waitlist.sql` | `public.waitlist` | 🟢 Applied |
| `20260728000002_create_user_state.sql` | `public.users`, `user_lesson_progress`, `user_reflections`, `xp_events` | 🟢 Applied |
| `20260728000003_alter_waitlist_column.sql` | Updates `waitlist` table columns | 🟢 Applied |
| `20260728000004_db_security_fixes.sql` | RLS security policies on user state | 🟢 Applied |
| `20260728164000_supabase_security_hardening.sql` | Search path security hardening | 🟢 Applied |
| `20260802000001_lesson_id_migration.sql` | Stable `lessonId` column migration | 🟢 Applied |
| `20260805000001_update_xp_level_trigger.sql` | `update_user_xp_and_level()` trigger | 🟢 Applied |
| `20260805000002_add_streak_columns.sql` | `user_streaks` table & columns | 🟢 Applied |
| `20260805000003_add_portfolio_columns.sql` | `is_portfolio_public` & `bio` columns | 🟢 Applied |
| `20260805000004_create_certificates.sql` | `public.certificates` | 🟢 Applied |
| `20260805000005_seed_badges.sql` | Initial badge seeding | 🟢 Applied |
| `20260805000006_create_leaderboards_and_cohorts.sql` | `cohorts`, `cohort_members`, `friendships` | 🟢 Applied |
| `20260806000001_notification_platform_foundation.sql` | `notifications`, `email_queue`, `notification_delivery_events` | 🟢 Applied |
| `20260809000000_create_testimonials_table.sql` | `public.testimonials` | 🟢 Applied |
| `20260809000001_security_hardening_rls.sql` | RLS policies on notification tables | 🟢 Applied |
| `20260810000001_create_user_feedback_tables.sql` | `public.user_feedback` | 🟢 Applied |
| `20260810000002_create_contact_messages_table.sql` | `public.contact_queries` | 🟢 Applied |
| `20260810000003_update_testimonials_schema.sql` | Testimonials schema update | 🟢 Applied |
| `20260810000004_create_admin_audit_logs.sql` | `public.admin_audit_logs` | 🟢 Applied |
| `20260810000005_performance_optimization_indexes.sql` | B-tree performance indexes | 🟢 Applied |
| `20260810000006_add_author_name_to_testimonials.sql` | Testimonials author name column | 🟢 Applied |
| `20260810000007_supabase_advisor_security_hardening.sql` | RLS policies on security tables | 🟢 Applied |
| `20260810000008_email_automations_and_limits.sql` | `system_settings`, `increment_daily_email_quota()` | 🟢 Applied |
| `20260810000009_create_system_errors_and_rate_limits.sql` | `public.system_errors`, `public.rate_limits` | 🟢 Applied |
| `20260811000001_add_curriculum_access_override.sql` | Curriculum access override flag on users | 🟢 Applied |
| `20260813000001_lesson_id_backfill.sql` | Lesson ID backfill for existing progress rows | 🟢 Applied |
| `20260813000002_service_role_comments.sql` | Service role comments / documentation | 🟢 Applied |
| `20260819000001_phase3_onboarding_storage.sql` | Onboarding storage additions | 🟢 Applied |
| `20260822000001_system_announcements_and_perf.sql` | System announcements table + performance indexes | 🟢 Applied |
| `20260823000001_notification_idempotency_and_avatar_cleanup.sql` | Notification idempotency keys + avatar cleanup | 🟢 Applied |
| `20260824000001_phase9_perf_indexes.sql` | XP idempotency, badge lookup & public portfolio indexes | 🟢 Ready to Apply |

---

## 3. Database Table Definitions & RLS Summary

### Core User Tables
- `public.users`: Primary profile state (`id` references `auth.users.id`, `name`, `username`, `total_xp`, `level`, `current_streak`, `is_admin`, `is_portfolio_public`, `curriculum_access_override`).
- `public.xp_events`: Immutable XP transaction ledger (`id`, `user_id`, `amount`, `source`, `created_at`).
- `public.user_lesson_progress`: Lesson status (`user_id`, `lesson_id`, `status`, `completed_at`).
- `public.user_reflections`: User reflections submitted on lesson completion.
- `public.user_streaks`: Streak state per user.

### Social & Competitive Tables
- `public.cohorts`, `public.cohort_members`: Cohort group management.
- `public.friendships`: Friend relationships for leaderboard scoping.
- `public.testimonials`: Learner reviews (moderation status).
- `public.user_feedback`: Private learner feedback.

### Communication & Infrastructure Tables
- `public.email_queue`: Transactional email queue (`id`, `user_id`, `to_email`, `template_key`, `status`, `resend_id`).
- `public.notification_delivery_events`: Delivery attempt audit log.
- `public.system_settings`: Key-value configuration store (`email_automations_enabled`, `daily_email_quota_count`, `email_global_pause`).
- `public.system_errors`: Application error log (`id`, `severity`, `category`, `message`, `fingerprint`, `occurrence_count`).
- `public.rate_limits`: Persistent rate limit records (`key`, `hit_count`, `window_start`).
- `public.admin_audit_logs`: Immutable record of admin actions.
- `public.contact_queries`: Contact form submissions.
- `public.waitlist`: Pre-launch waitlist signups.

### Achievement Tables
- `public.certificates`: Issued certificates (`id`, `user_id`, `template_version`, `title`, `issued_at`, `credential_hash`).
- `public.user_badges`, badge definitions: Unlocked achievement badges.
- `public.capstone_submissions`: Learner capstone project submissions.

---

## 4. TypeScript Type Safety

Complete TypeScript definitions live in `apps/web/types/database.ts`, generated from the live Supabase schema. `apps/web/lib/supabase.ts` re-exports the `Database` type and helper generics (`Tables<T>`, `TablesInsert<T>`, `TablesUpdate<T>`).

All table access via Supabase client is fully typed with no `as any` casts on query chains.

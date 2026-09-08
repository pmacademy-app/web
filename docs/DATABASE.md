# Database Schema & Migration Specification — Prodily PM Academy

**Repository:** `prodily-monorepo` (app code at `apps/web/`)
**Database:** PostgreSQL (Supabase)
**Migrations:** 41 Versioned SQL DDL Files in `supabase/migrations/`
**Last Updated:** September 6, 2026

---

## 1. Overview & Schema Architecture

All database schema definitions are managed through versioned SQL DDL migration files in `supabase/migrations/`.

- **Total Versioned Migrations:** 41 SQL files (`20260728000001` → `20260906000001`).
- **Row Level Security (RLS):** Enabled on every user-owned table (spot-checked across the initial schema, security-hardening, leaderboard/cohort, referral, and fellow-request migrations — not independently re-verified table-by-table for all 42 tables).
- **Service-Role Isolation:** Admin and background API routes use `createServiceRoleClient()` to interact with system tables with elevated permissions.
- **TypeScript Type Safety:** Auto-generated TypeScript definitions live in `apps/web/types/database.ts` (the authoritative current schema reference) and are re-exported by `apps/web/lib/supabase.ts`.

---

## 2. Complete PostgreSQL Migration History (41 Files)

| Timestamp Migration File | Target Schema / Modification |
|---|---|
| `20260728000001_create_waitlist.sql` | `public.waitlist` pre-launch table |
| `20260728000002_create_user_state.sql` | `public.users`, `user_lesson_progress`, `reflections`, `xp_events`, `badges`, `user_badges`, `bookmarks`, `quiz_attempts`, `capstone_submissions`, `cohorts`, `cohort_members` |
| `20260728000003_alter_waitlist_column.sql` | Waitlist column adjustments |
| `20260728000004_db_security_fixes.sql` | RLS policies on tables the initial migration missed (`badges`, `cohorts`) |
| `20260728164000_supabase_security_hardening.sql` | Search path security hardening |
| `20260802000001_lesson_id_migration.sql` | Stable `lessonId` column migration |
| `20260805000001_update_xp_level_trigger.sql` | `update_user_xp_and_level()` trigger |
| `20260805000002_add_streak_columns.sql` | Streak columns (`current_streak`, `longest_streak`, `last_streak_date`, `streak_freezes_available`) added directly to `public.users` — **not** a separate `user_streaks` table |
| `20260805000003_add_portfolio_columns.sql` | `is_portfolio_public` & `bio` columns on `users` |
| `20260805000004_create_certificates.sql` | `public.certificates` credential registry |
| `20260805000005_seed_badges.sql` | Initial badge definitions |
| `20260805000006_create_leaderboards_and_cohorts.sql` | `user_leaderboard_settings`, `weekly_leaderboard_snapshots`, `user_friends` (seeds `cohorts`: `foundations-2026`, `career-switchers`) |
| `20260806000001_notification_platform_foundation.sql` | `in_app_notifications`, `email_queue`, and notification delivery/audit tables |
| `20260809000000_create_testimonials_table.sql` | `public.testimonials` |
| `20260809000001_security_hardening_rls.sql` | Notification table RLS policies |
| `20260810000001_create_user_feedback_tables.sql` | `public.user_feedback`, `user_feedback_prompts` |
| `20260810000002_create_contact_messages_table.sql` | `public.contact_messages` |
| `20260810000003_update_testimonials_schema.sql` | Testimonials schema update |
| `20260810000004_create_admin_audit_logs.sql` | `public.admin_audit_logs` |
| `20260810000005_performance_optimization_indexes.sql` | B-tree performance indexes |
| `20260810000006_add_author_name_to_testimonials.sql` | Author attribution on testimonials |
| `20260810000007_supabase_advisor_security_hardening.sql` | Database security advisor hardening |
| `20260810000008_email_automations_and_limits.sql` | `system_settings`, `increment_daily_email_quota()` |
| `20260810000009_create_system_errors_and_rate_limits.sql` | `public.system_errors` (severity: `critical`/`error`/`warning` only), `public.rate_limits` |
| `20260811000001_add_curriculum_access_override.sql` | `curriculum_access_override` flag on `users` |
| `20260813000001_lesson_id_backfill.sql` | Progress row lesson ID backfill |
| `20260813000002_service_role_comments.sql` | Service role documentation comments |
| `20260819000001_phase3_onboarding_storage.sql` | Structured onboarding fields on `users` |
| `20260822000001_system_announcements_and_perf.sql` | `public.system_announcements`, `user_announcement_dismissals` + performance indexes |
| `20260823000001_notification_idempotency_and_avatar_cleanup.sql` | Idempotency keys on notifications |
| `20260824000001_phase9_perf_indexes.sql` | Performance indexes for XP, badges, and portfolios |
| `20260826000001_populate_onboarding_settings.sql` | Seeds default goal options in `system_settings` |
| `20260826000002_onboarding_structured_columns.sql` | Structured onboarding preferences |
| `20260826000003_create_email_broadcasts.sql` | `public.email_broadcasts` broadcast campaigns table |
| `20260826000004_create_in_app_broadcasts.sql` | `public.in_app_broadcasts` in-app campaigns table |
| `20260827000001_phase5_portfolio_evolution.sql` | `portfolio_layout`, `featured_capstone_id`, view counter on `users` |
| `20260828000001_phase6_lesson_feedback.sql` | Adds `lesson_id`, `type`, `tags` columns to **existing** `public.user_feedback` — does **not** create a separate `lesson_feedback` table |
| `20260828000002_phase7_referrals.sql` | `public.referrals` table for attribution & rewards |
| `20260830000001_add_is_fellow_column.sql` | `is_fellow` boolean column on `public.users` (PM Fellow designation) |
| `20260905000001_create_fellow_requests.sql` | `public.fellow_requests` — pending/approved/rejected state machine for the learner-initiated Fellow request flow (one-pending-per-user unique index) |
| `20260906000001_add_portfolio_verification_override.sql` | `portfolio_verification_override text CHECK (IN ('verified','rejected'))` on `public.users` — admin override for Automatic Portfolio Verification |
| `20260907000001_email_provider_failover.sql` | `email_queue.provider`, `email_queue.provider_attempts` — provider failover tracking |
| `20260908000001_error_taxonomy.sql` | `system_errors` taxonomy columns (`domain`, `kind`, `retryability`, `next_action`, `occurrence_count`, `first_seen_at`); widens the `category` CHECK to accept `brevo` and domain values |

---

## 3. Database Table Categories & Schema Summary

This section reflects the current `public` schema as generated in `apps/web/types/database.ts` (42 tables + 2 functions). Where an earlier version of this document used a different table name, the correction is noted.

### Core User & Learning Tables
- **`public.users`** — Main profile entity: `id`, `name`, `username`, `email`, `avatar_url`, `bio`, `total_xp`, `level`, `is_admin`, `is_fellow`, `is_portfolio_public`, `portfolio_layout`, `featured_capstone_id`, `portfolio_view_count`, `curriculum_access_override`, streak columns (`current_streak`, `longest_streak`, `last_streak_date`, `streak_freezes_available`), `portfolio_verification_override`.
- **`public.xp_events`** — Append-only XP ledger (`id`, `user_id`, `amount`, `source_type`, `description`, `created_at`).
- **`public.user_lesson_progress`** — Lesson completion records (`user_id`, `lesson_id`, `status`, `completed_at`, `quiz_score`).
- **`public.reflections`** — Qualitative learner reflections on lesson theory. (Previously mislabeled `user_reflections` in this doc.)
- **`public.quiz_attempts`** — Individual quiz attempt records.
- **`public.user_flashcard_srs`** — SM-2 spaced-repetition state per learner/flashcard.
- **`public.bookmarks`** — Learner-saved lesson/framework bookmarks.
- **`public.badges`** — Badge catalog/definitions. **`public.user_badges`** — Per-user badge award rows.
- **`public.capstone_submissions`** — Module capstone deliverables with moderation review status and per-submission `is_public` opt-out.

### Leaderboard, Cohorts & Social
- **`public.cohorts`** — Small set of self-serve, opt-in interest groups (currently seeded with exactly two: `foundations-2026`, `career-switchers`) — not admin-assigned enrollment cohorts.
- **`public.cohort_members`** — Learner ↔ cohort join table (users freely join/leave).
- **`public.user_friends`** — One-way "add for accountability" connections. (Previously mislabeled `friendships`.) See [`LEADERBOARD.md`](LEADERBOARD.md) for the exact semantics — there is currently no request/accept/reject step.
- **`public.user_leaderboard_settings`** — Per-user opt-in/opt-out of leaderboard visibility.
- **`public.weekly_leaderboard_snapshots`** — Cached/historical weekly ranking snapshots.

### PM Fellow & Portfolio Verification
- **`public.fellow_requests`** — Learner-submitted PM Fellow requests (`pending` / `approved` / `rejected`), reviewed by admins. See [`docs/admin/fellow-designation.md`](admin/fellow-designation.md).
- `users.is_fellow` — the actual designation flag, set by admin approval of either the request flow or the legacy portfolio-browse flow.
- `users.portfolio_verification_override` — nullable admin override (`'verified' | 'rejected' | null`) for the unrelated **Automatic Portfolio Verification** feature. See [`docs/admin/portfolio-verification.md`](admin/portfolio-verification.md).

### Referrals & Growth
- **`public.referrals`** — Referral attributions (`id`, `referrer_id`, `referred_user_id`, `status`, `created_at`, `rewarded_at`).

### Communication & Broadcasts
- **`public.email_queue`** — Asynchronous transactional email queue. Carries `provider` (which provider produced the outcome) and `provider_attempts` (every attempt with status code and error, at most two — primary plus one failover), added by `20260907000001_email_provider_failover.sql`.
- **`public.email_broadcasts`** — Targeted email campaigns (`id`, `title`, `audience_filter`, `status`, `sent_count`).
- **`public.email_dead_letter`** — Permanently-failed email records after exhausting retries. Retains `user_id`, `template_key` and template variables so an operator can tell who was affected; the variables are redacted before storage, so a dead-lettered auth email cannot be replayed with its original one-time token.
- **`public.email_suppressions`** — Addresses excluded from future sends. Written on `email.complained` (`spam_complaint`) and on `email.bounced` (`hard_bounce`); the bounce case is what stops admin retry actions from re-sending to an address that already hard-bounced.
- **`public.email_delivery_events`** / **`public.notification_events`** — Delivery/audit event logs (not a single `notification_delivery_events` table as previously documented — these are two distinct tables).
- **`public.in_app_broadcasts`** — Targeted in-app notification campaigns.
- **`public.in_app_notifications`** — In-app notification inbox. (Previously mislabeled `notifications`.)
- **`public.user_notification_preferences`** — Per-user notification channel preferences. (Previously mislabeled `notification_preferences`.)
- **`public.user_notification_timeline`** — Per-user notification history/timeline.
- **`public.notification_templates`** / **`public.notification_template_versions`** — Draft/publish versioned email template content (each save creates a new version row; publishing archives the prior version). Not previously documented.
- **`public.notification_feature_flags`** — Per-automation enable/pause flags.
- **`public.system_announcements`** — Platform-wide banner announcements. **`public.user_announcement_dismissals`** — per-user dismissal state.

### Moderation & Achievement Tables
- **`public.certificates`** — Issued credential records: `id`, `user_id`, `certificate_code`, `type`, `module_slug`, `learner_name`, `level`, `career_title`, `total_xp`, `lessons_completed`, `modules_completed`, `issued_at`. There is **no** `credential_hash` or `template_version` column — every certificate uses one layout (see [`docs/PORTFOLIO.md`](PORTFOLIO.md)).
- **`public.testimonials`** — Reviews with approval/rejection state.
- **`public.user_feedback`** — Private platform feedback submissions (also carries lesson clarity ratings via `lesson_id`/`type`/`tags` columns — see migration note above).
- **`public.user_feedback_prompts`** — Scheduled/triggered feedback prompt state.
- **`public.contact_messages`** — Inbound contact form inquiries. (Previously mislabeled `contact_queries`.)

### Platform & Observability Tables
- **`public.system_settings`** — JSONB platform configuration (product, learning, email, notifications, feature flags, onboarding).
- **`public.system_errors`** — Operational failure log. Classified by `domain` / `kind` / `retryability` with `severity` **derived from `kind`** (`critical` / `error` / `warning`; there is no `info` level). Deduplicated by `fingerprint` (`domain:kind:operation:stabilizedSummary`) inside a 15-minute window, incrementing the stored **`occurrence_count`**; `first_seen_at` records the first occurrence. `next_action` carries operator guidance. Added by `20260908000001_error_taxonomy.sql`, which also widens the `category` CHECK to accept `brevo` and the domain values — the previous constraint silently rejected every Brevo failure. See [`docs/ERROR_MONITORING.md`](ERROR_MONITORING.md).
- **`public.admin_audit_logs`** — Immutable record of admin operations.
- **`public.rate_limits`** — Persistent rate limiting records.

### Misc
- **`public.waitlist`** — Pre-launch signup records.

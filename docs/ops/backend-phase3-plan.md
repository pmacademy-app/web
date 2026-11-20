# Backend Phase 3 plan: learner data under RLS, then `@supabase/ssr`

Written 2026-11-21 from a read-only review of every top-level migration and every learner data path. Done so far in Phase 3: domain folders in `apps/web/lib` (68de7a0) and the timezone sync (badf7e8).

## Why

Learner pages and API routes read and write with the service-role client (`createServiceRoleClient`), so Row Level Security never applies to learner traffic. Keeping one learner's data away from another depends on every query filtering by `user_id`. The notification-settings cross-user write fixed in 6b22e4b was this failure mode.

## Plan A: learner data access under RLS (do first)

### Step 0: apply the held users lockdown
`supabase/migrations/pending-approval/20261027000002_lock_public_users.sql` (ISSUE-34). The README marks it ready. It revokes learner writes to `public.users` and validates itself.

### Step 1: switch reads to the learner's own token, no SQL
These tables already have own-row select policies:
- `users` (own row)
- `user_lesson_progress`
- `xp_events`
- `user_badges` and `badges`
- `certificates`
- `capstone_submissions` (own)
- `reflections` (own)
- `user_flashcard_srs`
- `in_app_notifications`
- `user_notification_preferences`
- `user_feedback`

Start with the `(app)` pages, 12 of which import `createServiceRoleClient`. `getCurrentUserProfile` (`lib/auth.ts`) already reads with the learner token.

How to handle tokens:
- Read the token with a single helper.
- Treat a PostgREST 401 (expired token during a render) as "re-authenticate", never as "no data".

### Step 2: switch these writes, no SQL
- `in_app_notifications`: read state only. Column grants already limit this to `is_read` and `read_at`.
- `user_announcement_dismissals`
- `user_feedback` and `user_feedback_prompts`
- `user_notification_preferences`

### Step 3: held migration
Do this before moving the matching writes:
- `reflections`: replace the FOR ALL policy with separate select, insert and update policies. Restrict updated columns to the content columns. Which columns are content is still to be decided.
- `user_notification_preferences`: add `WITH CHECK (auth.uid() = user_id)` to the update policy.

### Stays service-role by design
- XP ledger and `users.total_xp`
- streak columns
- badges, certificates
- capstone writes
- lesson completion RPC
- referrals
- fellow requests
- cohorts, friends and leaderboard (these read other users' rows)
- announcements
- account reset and delete
- every write to `users`

## Plan B: move sessions to `@supabase/ssr` (later)

No security gain on its own. It replaces the custom `sb-access-token` / `sb-refresh-token` cookies. Each step ships separately, and nobody is signed out:

1. Teach `lib/auth/client-type.ts` and `lib/security/origin-check.ts` the new cookie names. No behaviour change.
2. Add one `readSessionTokens()` helper that accepts the old and new formats, and route every direct cookie read through it. This step is also needed by Plan A.
3. `setSessionCookies` writes the new format and clears both formats.
4. `proxy.ts` moves to `createServerClient`. When a request carries only the old pair, refresh once, write the new format, and expire the old pair.
5. Move the one-off clients onto the shared factory: refresh, session, callback, oauth-pkce, revoke-session, reset-password and onboarding.
6. After 30 days (the refresh cookie's max age), drop the old names and update `e2e/support/env.ts` and the privacy page.

Constraints:
- 33 test files mention the old cookie names.
- Server component instances must never refresh. Refreshing there brings back the CQ-10 rotation hazard.
- The native Bearer path (`lib/auth.ts` checks `Authorization: Bearer` first, and `resolveActor` delegates to it) is unchanged.

## Open questions
- Does Next 16 merge cookies set in the proxy into `cookies()` for the same request? This is not verified.
- Which `reflections` columns should a learner be allowed to write?
- Which held migrations has production already had applied by hand, beyond what the pending-approval README records?

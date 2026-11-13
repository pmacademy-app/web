# AG-12: Password rules, signup gate in the database, re-auth for destructive actions

- **IDs closed:** plan PR-18 part 1 (SEC-15 code, SEC-09, SEC-12 delete-account and resets part)
- **Milestone:** M1 Platform safety
- **Depends on:** AG-17 (both edit `components/settings/*`; run AG-17 first)
- **Size:** M
- **Parallel-safe:** yes with AG-13; no with AG-17 or AG-19 (shared settings and form components)
- **Needs owner action:** Supabase dashboard settings after merge (listed below). Leaked-password protection is a paid feature and is dropped (zero budget).

## Why
Passwords can be 6 characters. A direct GoTrue signup skips the app's `allowSignups` switch. Deleting an account or wiping progress needs only a live session, so a stolen session can destroy data.

## Current state (verified 2026-11-12)
- Six-character minimum in: `apps/web/app/api/auth/signup/route.ts:29`, `apps/web/app/api/auth/update-password/route.ts:190-191`, `apps/web/app/api/settings/security/route.ts:139-141`, `apps/web/app/(auth)/signup/SignupForm.tsx:40`, `apps/web/app/(auth)/reset-password/page.tsx:34` and `:228`, `apps/web/lib/auth/errors.ts:243`. `apps/web/app/(auth)/login/LoginForm.tsx:32` also says 6.
- `supabase/config.toml:184` `minimum_password_length = 6`; `:230` `secure_password_change = false`; `:301` the `before_user_created` hook block is commented out.
- `allowSignups` is checked only in the app route: `apps/web/app/api/auth/signup/route.ts:136`. Default in `apps/web/lib/admin/settings-service.ts:48`.
- `apps/web/app/api/settings/delete-account/route.ts:14-38` deletes data and the auth user with no password or confirmation check.
- Data resets with no re-auth: `apps/web/app/api/settings/reset/{flashcards,progress,skill-radar,streak,xp}/route.ts`.
- The security route already verifies a current password with `signInWithPassword` (`app/api/settings/security/route.ts:118-166`). Reuse that pattern.
- Google sign-in exists behind a flag (`lib/auth/google-auth.ts`); Google-only accounts have no password (`app_metadata.password_set`, see `update-password/route.ts:49`).

## Files in scope
- The password-length files listed above (not `LoginForm.tsx`: login must keep accepting existing 6 to 9 character passwords)
- A shared constant, for example `apps/web/lib/auth/password-policy.ts` (new) with `MIN_PASSWORD_LENGTH = 10`
- `supabase/config.toml` (local settings only; production is a dashboard step)
- `apps/web/app/api/settings/delete-account/route.ts` and the five reset routes, plus their UI in `apps/web/components/settings/`
- `supabase/migrations/pending-approval/20261113000002_before_user_created_allow_signups.sql` with `rollback/`, `validation/` and a README section
- Tests: `apps/web/lib/__tests__/sec15-password-policy.test.ts`, `sec12-destructive-reauth.test.ts` (new); existing `npm run test:auth`, `test:update-password`, `test:settings`

## Out of scope
- Email verification (stays OFF by owner decision).
- Origin checks and the email hook (AG-13).
- Leaked-password protection (paid).

## Steps
1. Add `MIN_PASSWORD_LENGTH = 10` and use it in every new-password check and message. Leave login validation alone.
2. `config.toml`: `minimum_password_length = 10`, `secure_password_change = true`. Note in the PR that production needs the dashboard change.
3. Re-auth for destructive actions: require `currentPassword` in the body for delete-account and each reset route, verified like the security route. For accounts without a password (`app_metadata.password_set !== true` and provider Google), require a typed confirmation phrase plus a sign-in within the last 10 minutes (check `last_sign_in_at`), and say so in the UI. Rate-limit the verify step.
4. Signup gate: a held migration adding `public.hook_before_user_created(event jsonb)` that rejects when `system_settings` `product_settings.allowSignups` is `false`. Follow the current Supabase docs for the hook signature and grants (`supabase_auth_admin` execute only; revoke from everyone else). Validation checks grants and that the function returns an error object when signups are off.
5. Tests first for: 9-character password rejected at signup, update-password and security routes; login still accepts a 6-character password; delete-account and each reset reject without a correct current password; Google-only path requires the phrase.

## Owner steps (write them into your report)
- Supabase > Auth > Providers > Email: minimum length 10; Secure password change ON. Keep Confirm email OFF.
- After applying the held hook migration: Auth > Hooks > Before User Created: select the function. First check the hook is available on the free plan; if not, mark SEC-09 hook part as dropped.

## Acceptance checks (from `apps/web`)
- `npx vitest run lib/__tests__/sec15-password-policy.test.ts lib/__tests__/sec12-destructive-reauth.test.ts` passes.
- `npm run test:auth`, `npm run test:update-password`, `npm run test:settings` pass.
- `git grep -n -e 'at least 6' -- app lib components ':!*__tests__*'` shows only the login form (or nothing).
- `npm run typecheck` and `npm run lint` pass.

## Safety
- Never run `git push`, any `supabase` command, or anything against production. The user owns the branch and the pull request.
- Every top-level `.sql` in `supabase/migrations/` auto-applies to production on merge. The hook migration goes in `pending-approval/` only.
- Do not edit `audit/`, `08-IMPLEMENTATION-PLAN.md`, `content/` or `backups/`. Never read `.env*` files.
- Do not start a dev server. Do not run the full `npm test` or `npm run build`.
- No dark mode. No em-dashes in comments, copy or docs.
- Before writing Next.js code, read the matching guide in `apps/web/node_modules/next/dist/docs/`.

Start by producing an Implementation Plan artifact for review. Do not edit files until it is approved.

# AG-13: Trust only signed inputs: email hook signatures, app_metadata, same-origin writes

- **IDs closed:** plan PR-18 part 2 (SEC-16, SEC-21, SEC-12 Origin part)
- **Milestone:** M1 Platform safety
- **Depends on:** AG-09 (both may edit `lib/api/with-route.ts`) and AG-03 (both edit `docs/SECURITY.md`)
- **Size:** M
- **Parallel-safe:** no with AG-16 (`proxy.ts`); with AG-12, merge AG-12 first (both may add to `pending-approval/README.md`)

## Why
The auth email hook accepts several weaker secrets besides the signed webhook and never checks the timestamp, so a captured request can be replayed. The proxy and app layout read `user_metadata`, which the user can edit. Cookie-authenticated `POST`/`PATCH`/`DELETE` calls do not check where they came from.

## Current state (verified 2026-11-12; `proxy.ts` line numbers may shift slightly, re-grep)
- `apps/web/app/api/auth/send-email-hook/route.ts:61` `verifyHookSecret()` accepts a Bearer token (`:76-83`), custom headers `x-supabase-auth-secret`, `x-hook-secret`, `x-secret` (`:85-93`), then a Standard Webhooks signature (`:96` onward). No timestamp age check (`git grep -n -e Date.now -- app/api/auth/send-email-hook/route.ts` prints nothing). Production uses the `v1,whsec_` form (comment at `:96-98`).
- `apps/web/proxy.ts:423` reads `user.user_metadata?.curriculum_access_override`; `:616` reads `user.user_metadata?.onboarding_complete`.
- `apps/web/app/(app)/layout.tsx:57` reads `authUser.user_metadata?.onboarding_complete`.
- Writer: `apps/web/app/onboarding/actions.ts:317-327` sets `user_metadata.onboarding_complete` with the service role; `:290` sets DB column `onboarding_completed`.
- The proxy's profile read `apps/web/proxy.ts:391` selects only `is_admin, curriculum_access_override, auth_provider, terms_accepted_at` (no `onboarding_completed`, no `goal`). The layout rule at `app/(app)/layout.tsx:56-58` is: metadata flag OR `profile.goal` OR `profile.curriculum_access_override`.
- No Origin check: `git grep -n -i -e 'get(.origin' -e sec-fetch-site -- proxy.ts lib/api/with-route.ts` prints nothing.
- Proxy matcher `apps/web/proxy.ts:685-693` excludes `api/auth/callback`, `api/cron`, `api/health`, `api/og`, `api/email/webhooks`, `api/email/unsubscribe`. `api/auth/send-email-hook` is not excluded.

## Files in scope
- `apps/web/app/api/auth/send-email-hook/route.ts`
- `apps/web/proxy.ts`, `apps/web/app/(app)/layout.tsx`, `apps/web/app/onboarding/actions.ts`
- `apps/web/lib/api/with-route.ts` (if the Origin check lives there)
- Tests: new `lib/__tests__/sec16-email-hook-signature.test.ts`, `sec21-trusted-claims.test.ts`, `sec12-origin-check.test.ts`; existing `lib/__tests__/b7d-hook-secret-hardening.test.ts`, `npm run test:send-email-hook`, `test:middleware-auth`, `test:auth`
- Conditional: `supabase/migrations/pending-approval/20261113000003_backfill_onboarding_completed.sql` plus companions (step 2)
- `docs/AUTHENTICATION.md`, `docs/SECURITY.md` (short notes). Run `lib/__tests__/complete-consent-page.test.ts`, it reads both.

## Out of scope
- Cron GET aliases (AG-14, AG-15). `getClaims` and matcher narrowing (AG-16).
- Changing who is admin (already flag-based in `lib/admin/guard.ts:69-72`).

## Steps
1. Email hook: accept only the Standard Webhooks signature over `${webhook-id}.${webhook-timestamp}.${body}` with the `whsec_` secret. Reject timestamps more than 5 minutes from now in either direction. Remove the Bearer and custom-header paths. Keep constant-time comparison and the existing fail-closed behaviour when the secret is missing in production. Check current Supabase docs for the exact headers.
2. Trusted claims: write `onboarding_complete` (and `curriculum_access_override` if set anywhere) into `app_metadata` with the service role. Add `onboarding_completed, goal` to the select at `proxy.ts:391`. In the proxy and layout, onboarding is complete when `app_metadata.onboarding_complete` OR `users.onboarding_completed` OR `users.goal IS NOT NULL` OR `users.curriculum_access_override`. Stop reading `user_metadata` for any access decision.
   Before relying on the DB fallback, give the owner this read-only count to run in the SQL editor and paste back: users whose `auth.users.raw_user_meta_data->>'onboarding_complete' = 'true'` but `public.users.onboarding_completed` is not true, `goal` is null and `curriculum_access_override` is not true. If the count is non-zero, add a held backfill `supabase/migrations/pending-approval/20261113000003_backfill_onboarding_completed.sql` (with `rollback/` and `validation/` companions and a README section) that sets `onboarding_completed = true` for exactly those rows, and say in the README that it must be applied before this code deploys.
3. Origin check: for non-GET, non-HEAD requests to `/api/*` that carry a session cookie, require `Origin` (or `Sec-Fetch-Site: same-origin`) to match the site origin from `lib/brand.ts` or the request host. Exempt server-to-server routes: `api/auth/send-email-hook`, `api/email/webhooks`, `api/email/unsubscribe` (one-click unsubscribe posts have no Origin), `api/cron/*`. Return 403 with the standard error envelope. Decide in your plan whether this lives in the proxy or in `withRoute`, given which routes the proxy matcher skips.
4. Tests first: replayed hook (timestamp 6 minutes old) rejected; Bearer-only request rejected; valid signature accepted; a user with `user_metadata.onboarding_complete = true` but DB `false` is sent to onboarding; cross-origin POST rejected; same-origin POST accepted; exempt routes unaffected.

## Acceptance checks (from `apps/web`)
- `npx vitest run lib/__tests__/sec16-email-hook-signature.test.ts lib/__tests__/sec21-trusted-claims.test.ts lib/__tests__/sec12-origin-check.test.ts lib/__tests__/b7d-hook-secret-hardening.test.ts` passes.
- `npm run test:send-email-hook`, `npm run test:middleware-auth`, `npm run test:auth` pass.
- `npx vitest run lib/__tests__/complete-consent-page.test.ts` passes.
- `git grep -n -e user_metadata -- proxy.ts 'app/(app)/layout.tsx'` shows no access decision reads (type declarations are fine).
- `npm run typecheck` and `npm run lint` pass.
- Owner check after deploy: a real signup and password-reset email still arrive (the hook still verifies).

## Safety
- Never run `git push`, any `supabase` command, or anything against production. The user owns the branch and the pull request.
- Do not edit `audit/`, `08-IMPLEMENTATION-PLAN.md`, `content/` or `backups/`. Never read `.env*` files.
- Do not start a dev server. Do not run the full `npm test` or `npm run build`.
- No dark mode. No em-dashes in comments, copy or docs.
- Before writing Next.js code, read the matching guide in `apps/web/node_modules/next/dist/docs/` (proxy and route handlers).

Start by producing an Implementation Plan artifact for review. Do not edit files until it is approved.

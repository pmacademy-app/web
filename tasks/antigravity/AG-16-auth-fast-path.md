# AG-16: Verify sessions locally with getClaims and narrow the proxy

- **IDs closed:** plan PR-19 (ENG-03, ENG-04). The outbox table bullet is deferred (see ROADMAP).
- **Milestone:** M1 Platform safety
- **Depends on:** AG-13 (both edit `proxy.ts`). Owner switches the project to asymmetric JWT signing keys first (free; confirm in the dashboard).
- **Size:** M
- **Parallel-safe:** no with AG-13 (both edit `proxy.ts`)
- **Needs owner action:** yes (dashboard JWT signing keys, before merge)

## Why
Every request calls GoTrue over the network, often twice (proxy, then the route). With asymmetric signing keys, `getClaims()` verifies the JWT locally, so verifying in both places becomes cheap. The proxy also runs on routes that do not need a session.

## Current state (verified 2026-11-13; `proxy.ts` lines may shift, re-grep)
- `@supabase/supabase-js` is `^2.110.8` (`apps/web/package.json:73`); `getClaims()` is available (`node_modules/@supabase/auth-js/dist/module/GoTrueClient.d.ts`, see the notice near line 1408).
- Network verification: `apps/web/proxy.ts:265` and `:335` `supabase.auth.getUser(accessToken)`; `apps/web/lib/auth.ts:136` `getAuthenticatedUser()`, `:268` `verifyAccessToken()`, and `:287` `getAuthenticatedUserFromRequest()`.
- Routes resolve the actor themselves: `apps/web/lib/api/actor.ts:133` and `apps/web/lib/admin/guard.ts:32` call `getAuthenticatedUserFromRequest(request)`.
- Proxy matcher `apps/web/proxy.ts:685-693` skips `api/cron`, `api/health`, `api/og`, `api/email/webhooks`, `api/email/unsubscribe`, `api/auth/callback`. `lib/__tests__/vopt1-usage-optimization.test.ts:20-35` pins those exclusions.
- `after()` is already used in signup, capstone submit and daily-reminder (9 call sites under `app/api`).

## Files in scope
- `apps/web/proxy.ts`, `apps/web/lib/auth.ts`
- Callers of the auth helpers only if a signature changes
- Tests: new `lib/__tests__/eng03-get-claims.test.ts`; existing `lib/__tests__/middleware-auth.test.ts`, `vopt1-usage-optimization.test.ts`, `vopt3-proxy-curriculum-decoupling.test.ts`, `b13a-single-session-owner.test.ts`, `b9b-request-correlation.test.ts`; `npm run test:perf`, `npm run test:auth`
- `docs/AUTHENTICATION.md` (short section; run `lib/__tests__/complete-consent-page.test.ts`)

## Out of scope
- Any header or other hand-off from the proxy that routes trust as identity. Routes the matcher skips never strip incoming headers, so a forged identity header would reach `getAuthenticatedUserFromRequest` and the admin actor. Each place verifies the JWT itself.
- An outbox table (deferred).
- Admin authorization logic (keep `lib/admin/guard.ts` behaviour). Cookie names and refresh behaviour.

## Steps
1. Read the Supabase docs on `getClaims()` and signing keys, and the Next 16 proxy docs in `node_modules/next/dist/docs/`. In your plan, state what `getClaims()` does while the project still uses the legacy symmetric secret (it falls back to a network call), so the change is safe before and after the owner switch.
2. Replace `getUser()` with `getClaims()` where only the user id, role and `app_metadata` are needed, in both the proxy and `lib/auth.ts`. Keep `getUser()` where the fresh user record is required (for example settings that show the email). List each call site and your choice in the plan.
3. Narrow the matcher: skip public marketing pages and assets that need no session. Keep `/admin`, the app routes, onboarding, the `/lessons` lock check (read the existing branch first) and `api/*` routes that need a session. Keep every exclusion pinned in `vopt1`. Add cases to a test that lists sample paths and asserts which ones the matcher includes.
4. Tests: a forged, unsigned or wrongly signed JWT is rejected by the new path; an expired token is rejected; the proxy and a route each verify independently (no trust in request headers for identity).

## Owner steps (write them into your report)
- Supabase > Project Settings > JWT Keys: migrate to asymmetric signing keys, following the dashboard steps. Do this before merging so local verification is used; the code is safe either way.

## Acceptance checks (from `apps/web`)
- `npx vitest run lib/__tests__/eng03-get-claims.test.ts lib/__tests__/middleware-auth.test.ts lib/__tests__/vopt1-usage-optimization.test.ts lib/__tests__/vopt3-proxy-curriculum-decoupling.test.ts lib/__tests__/b13a-single-session-owner.test.ts lib/__tests__/b9b-request-correlation.test.ts` passes.
- `npm run test:auth`, `npm run test:perf` pass; `npx vitest run lib/__tests__/complete-consent-page.test.ts` passes.
- `git grep -n -F -e 'auth.getUser(' -- proxy.ts lib/auth.ts` shows only the call sites your plan kept, each with a reason comment.
- `npm run typecheck` and `npm run lint` pass.
- E2E auth flows run in CI on this PR (the e2e job triggers on `proxy.ts` changes).

## Safety
- Never run `git push`, any `supabase` command, or anything against production. The user owns the branch and the pull request.
- Do not edit `audit/`, `08-IMPLEMENTATION-PLAN.md`, `content/` or `backups/`. Never read `.env*` files.
- Do not start a dev server. Do not run the full `npm test` or `npm run build`.
- No dark mode. No em-dashes in comments, copy or docs.
- Before writing Next.js code, read the matching guide in `apps/web/node_modules/next/dist/docs/`.

Start by producing an Implementation Plan artifact for review. Do not edit files until it is approved.

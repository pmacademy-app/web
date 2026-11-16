# AG-11: One error envelope, typed API client everywhere, structured failure logs

- **IDs closed:** plan PR-17 part 3 (CQ-30, CQ-13 remainder)
- **Milestone:** M1 Platform safety
- **Depends on:** AG-10 (first PR merged)
- **Size:** M
- **Parallel-safe:** no with AG-18, AG-19, AG-20, AG-30 (same components); may touch the capstone review route, so merge AG-26 first if both run in the same wave

## Why
Client code calls `fetch('/api/...')` by hand in many places, each parsing errors its own way. Failures show as silent no-ops or raw messages. Server failure paths still use `console.error`, which never reaches `system_errors`.

## Current state (verified 2026-11-12)
- Typed client exists: `apps/web/lib/api/client.ts:164` `apiRequest`, `:283-289` `apiGet`, `apiPost`, `apiPatch`; error type `ApiRequestError` at `:84`.
- Server envelope helper: `apps/web/lib/errors/api-response.ts:57` `apiError()`.
- About 38 raw `fetch('/api` or ``fetch(`/api`` calls outside tests. Most in `components/notifications/NotificationCenterDrawer.tsx` (4), `components/review/ReviewHub.tsx` (3), `components/leaderboard/FriendAccountabilitySection.tsx` (3), `components/feedback/ContextualFeedbackModal.tsx` (3), `hooks/useUsageTimeTracker.ts` (2), `components/search/SearchOverlay.tsx` (2), `components/profile/AvatarUpload.tsx` (2), `components/layout/SystemAnnouncementBanner.tsx` (2).
- 185 `console.error` calls in `app`, `lib`, `components` outside tests. Example: `apps/web/app/api/settings/delete-account/route.ts:30`.
- Custom ESLint rules live in `apps/web/eslint-rules/` (`no-raw-button.mjs`, `require-with-route.mjs`), registered in `apps/web/eslint.config.mjs`.

## Files in scope
- The client files with raw `fetch('/api` calls (list them in your plan from `git grep -n -e 'fetch(./api' -- app components hooks lib ':!*__tests__*'`)
- `apps/web/eslint-rules/no-raw-api-fetch.mjs` (new) and `apps/web/eslint.config.mjs`
- `apps/web/app/api/**/route.ts` only to replace `console.error` on failure paths with `logSystemError`
- Tests: `apps/web/lib/__tests__/cq30-api-client.test.ts` (new), plus a rule test next to the existing rule tests (find them: `git grep -l -e no-raw-button -- lib/__tests__`)

## Out of scope
- `console.error` in client components (keep; they are browser-only) and in scripts.
- Changing any route's success response.
- Other logic in `hooks/useUsageTimeTracker.ts` beyond the fetch call.

## Steps
1. Confirm every route error response uses `apiError()` (search with `git grep -n -F -e 'NextResponse.json({ error:' -- app/api`). Migrate stragglers so all errors share one shape. Update `docs/API_CONTRACT.md` if the shape description changes, and run `lib/__tests__/b13b-pagination-contract.test.ts`.
2. Migrate each raw fetch to `apiGet`/`apiPost`/`apiPatch`. Show a user-facing message on failure (existing toast or inline error), never a silent catch.
3. Add `no-raw-api-fetch`: flags `fetch()` whose first argument is a string or template starting with `/api` in `app`, `components`, `hooks`, `lib` (exclude `lib/api/client.ts` and tests). Set it to `error` once the migration is complete.
4. Replace `console.error` on server failure paths in `app/api` with `logSystemError` (or `after(() => logSystemError(...))` where the response should not wait). Keep `console.warn` for expected, noisy cases.
5. Tests: the client maps a non-2xx envelope to `ApiRequestError` with code and message; the lint rule reports a raw call and accepts the client.

## Acceptance checks (from `apps/web`)
- `git grep -n -e 'fetch(./api' -- app components hooks lib ':!*__tests__*' ':!lib/api/client.ts'` prints nothing.
- `git grep -n -F -e console.error -- app/api` prints nothing, or each remaining line has a reason comment.
- `npx vitest run lib/__tests__/cq30-api-client.test.ts lib/__tests__/b13b-pagination-contract.test.ts` passes, plus the rule test.
- `npm run typecheck` and `npm run lint` pass.

## Safety
- Never run `git push`, any `supabase` command, or anything against production. The user owns the branch and the pull request.
- Do not edit `audit/`, `08-IMPLEMENTATION-PLAN.md`, `content/` or `backups/`. Never read `.env*` files.
- Do not start a dev server. Do not run the full `npm test` or `npm run build`.
- No dark mode. No em-dashes in comments, copy or docs.
- Before writing Next.js code, read the matching guide in `apps/web/node_modules/next/dist/docs/`.

Start by producing an Implementation Plan artifact for review. Do not edit files until it is approved.

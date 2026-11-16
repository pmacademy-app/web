# AG-06: Shared Supabase test fake, honest dashboard test, remove the quiz fallback

- **IDs closed:** plan PR-15 part 3 (CQ-32, CQ-33 part, last bullet "remove the non-atomic fallback")
- **Milestone:** M1 Platform safety
- **Depends on:** AG-05 (the quiz RPC is proven in pgTAP before the JS fallback goes)
- **Size:** M
- **Parallel-safe:** yes (test helpers plus one lib file)

## Why
Hand-rolled chain mocks make the code under test throw `... is not a function`, and tests still pass because they only check shapes. The quiz path still has a non-atomic JS fallback that exists for unit mocks.

## Current state (verified 2026-11-12)
- `apps/web/lib/__tests__/dashboard.test.ts:286` "getDashboardData returns full KPI and series structure" never asserts `failed` (`git grep -n -e failed -- lib/__tests__/dashboard.test.ts` prints nothing). The service exposes `failed` per slice in `apps/web/lib/admin/dashboard-service.ts`.
- Audit CQ-32 (`audit/05-code-quality-fixes.md:622-625`) counts 27 `... is not a function` errors across 12 suites. It names five: `phase-1-lifecycle-reactivation.test.ts`, `analytics-growth.test.ts`, `admin-console.test.ts`, `moderation-pagination.test.ts`, `settings-change-password.test.ts` (check each still exists). The guard in step 3 finds the rest.
- CQ-33 behaviour tests already exist for the streak DB layer (`lib/__tests__/cq01-streaks-db.test.ts`) and capstone autosave (`lib/__tests__/cq08-capstone-autosave.test.ts`). The campaign runner directory `lib/campaigns/` is gone (pruned in PR #79), so no runner test is needed.
- CQ-33 test-only helpers still have no production caller (each appears only in its defining file outside tests): `getXpAmountForSource`, `isUserInReminderWindow`, `isUserInRecapWindow`, `isUserEligibleForWeeklyRecap`, `recordBatchFlashcardReviews`, `isValidQueueStatusTransition`, `upsertUserLessonProgress`. `calculateQuizXp` has one caller besides its definition.
- No shared helper folder: `apps/web/lib/__tests__/helpers/` does not exist.
- `apps/web/lib/academy/lessons-db.ts:248` `MISSING_RPC_ERROR_CODES`; `:436-466` falls back to a non-atomic path when `record_lesson_quiz_completion` is missing (`console.warn` at `:466`).

## Files in scope
- `apps/web/lib/__tests__/helpers/supabase-fake.ts` (new)
- `apps/web/lib/__tests__/helpers/supabase-fake.test.ts` (new)
- `apps/web/lib/__tests__/dashboard.test.ts` and the five suites named above
- `apps/web/vitest.setup.ts` (console guard), `apps/web/lib/__tests__/helpers/console-guard-allowlist.ts` and its test (new)
- `apps/web/lib/academy/lessons-db.ts` (remove fallback)
- Tests that cover the fallback: `git grep -l -e non-atomic -e MISSING_RPC -e PGRST202 -- lib/__tests__`

## Out of scope
- Rewriting the 266 source-text assertions (later, AG-34).
- Any other suite. Keep the PR reviewable.

## Steps
1. Build `supabase-fake.ts`: an in-memory, chainable fake of the query builder used in this repo (`from`, `select`, `eq`, `neq`, `in`, `gte`, `lte`, `lt`, `gt`, `is`, `like`, `ilike`, `order`, `range`, `limit`, `maybeSingle`, `single`, `insert`, `update`, `upsert`, `delete`, `rpc`, and `{ count: 'exact', head: true }`). Seed tables per test; allow forcing an error per table or RPC. Test the fake itself.
2. Move `dashboard.test.ts` and the five suites to the fake. Add `expect(data.kpis.failed).toBe(false)` and the same for `series` and other slices.
3. In `vitest.setup.ts`, spy on `console.error` and `console.warn`; in `afterEach`, fail the test if any call contains `is not a function`. Suites that still trip it go on a dated, shrink-only allowlist in `lib/__tests__/helpers/console-guard-allowlist.ts` (file name plus a "fix by" date and a one-line reason). Detect growth with a pinned maximum: the allowlist file exports `MAX_ENTRIES` (set to the count you start with), and a test fails if the list is longer than `MAX_ENTRIES`, if any entry's "fix by" date has passed, or if a listed suite no longer trips the guard (so it must be removed). Lowering `MAX_ENTRIES` is the only allowed edit to it. Tests that expect degradation opt out explicitly (for example an `allowConsoleErrors()` helper). Expect the six suites in scope to leave the list in this PR; the others stay listed for AG-34 item 1.
4. Remove the non-atomic fallback in `lessons-db.ts`: a missing RPC now throws a clear error (the function exists in every environment that replays migrations, proven by AG-05). Update tests that relied on the fallback to use the fake's `rpc`.
5. Check whether `calculateQuizXp` is still used after step 4. For each test-only helper listed above, report in the plan whether to wire it up (where the cron or route re-implements it inline) or delete it with its tests. Do not change them in this task; AG-34 item 1 does.

## Acceptance checks (from `apps/web`)
- `npx vitest run lib/__tests__/helpers/supabase-fake.test.ts lib/__tests__/dashboard.test.ts` passes, with no `is not a function` in the output.
- `npx vitest run` on each of the five migrated suites passes.
- `npm run test:admin`, `npm run test:dashboard`, `npm run test:xp`, `npm run test:settings` pass.
- `git grep -n -e non-atomic -- lib/academy/lessons-db.ts` prints nothing.
- `npm run typecheck` and `npm run lint` pass.
- CI runs the full suite on the PR. Every suite that trips the guard is either fixed or on the dated allowlist; the allowlist test passes. Report the final list.

## Safety
- Never run `git push`, any `supabase` command, or anything against production. The user owns the branch and the pull request.
- Do not edit `audit/`, `08-IMPLEMENTATION-PLAN.md`, `content/` or `backups/`. Never read `.env*` files.
- Do not start a dev server. Do not run the full `npm test` or `npm run build`.
- Never weaken an assertion to make a test pass.
- No em-dashes in comments or docs.

Start by producing an Implementation Plan artifact for review. Do not edit files until it is approved.

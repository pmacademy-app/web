# AG-14: Make every cron caller use POST

- **IDs closed:** plan PR-18 part 3 (SEC-12 preparation)
- **Milestone:** M1 Platform safety
- **Depends on:** none
- **Size:** S
- **Parallel-safe:** yes, but AG-01, AG-02 and AG-14 all edit `supabase/migrations/pending-approval/README.md`: merge them one at a time

## Why
Mutating cron routes answer `GET`, which link prefetchers, crawlers and logs can trigger. Before the `GET` aliases can go (AG-15), every caller must use `POST`. Two callers still use `GET`.

## Current state (verified 2026-11-13)
- `GET` aliases: `apps/web/app/api/cron/cleanup/route.ts:115`, `daily-reminder/route.ts:308`, `lifecycle/route.ts:87`, `process-email-queue/route.ts:80`, `retry-failed/route.ts:57`, `weekly-recap/route.ts:313` (`export const GET = POST`).
- `apps/web/app/api/cron/process-broadcasts/route.ts:23` exports only `GET` (comment at `:22`).
- `.github/workflows/notification-scheduler.yml:63` calls process-broadcasts with `curl -X GET`.
- `supabase/migrations/pending-approval/20261024000003_schedule_cron_jobs_pg_cron.sql` names `GET` for process-broadcasts in three places: the header job table (`:31`), the `cron.schedule` call (`:176`), and the self-check `VALUES` row (`:197`). The self-check compares the schedule against that row, so all three must change together or the owner's re-run raises.
- `pending-approval/validation/20261024000003_schedule_cron_jobs_pg_cron_validation.sql:21` expects the `'GET'` command text.
- `apps/web/lib/__tests__/b7c-cron-route-migration.test.ts:47` imports `GET` from process-broadcasts.

## Files in scope
- `apps/web/app/api/cron/process-broadcasts/route.ts`
- `.github/workflows/notification-scheduler.yml` (line 63 only)
- `supabase/migrations/pending-approval/20261024000003_schedule_cron_jobs_pg_cron.sql` lines 31, 176 and 197 only
- `supabase/migrations/pending-approval/validation/20261024000003_schedule_cron_jobs_pg_cron_validation.sql` line 21
- `supabase/migrations/pending-approval/README.md` (one line under the 20261024000003 section)
- `apps/web/lib/__tests__/b7c-cron-route-migration.test.ts`
- `docs/CRON_AND_SCHEDULING.md` (method column)

## Out of scope
- Removing any `GET` export (AG-15). The GitHub `schedule:` block (AG-15).

## Steps
1. In process-broadcasts, export `POST` with the same `withRoute` config and handler, and keep `export const GET = POST` for now so nothing breaks during rollout.
2. Change `notification-scheduler.yml:63` to `-X POST`.
3. In the held pg_cron SQL change `GET` to `POST` for process-broadcasts at lines 31, 176 and 197, and update validation line 21. The file is idempotent (unschedule then schedule), so the owner can re-run it. Add to its README section: "If applied before AG-14, re-run it once so process-broadcasts uses POST."
4. Update `b7c-cron-route-migration.test.ts` to call `POST`, and assert both `GET` and `POST` exist for process-broadcasts (AG-15 flips it).
5. Update the method in `docs/CRON_AND_SCHEDULING.md`.

## Acceptance checks
- From the repo root: `git grep -n -F -e '-X GET' -- .github/workflows/notification-scheduler.yml` prints nothing.
- `git grep -n -e process-broadcasts -- supabase/migrations/pending-approval/20261024000003_schedule_cron_jobs_pg_cron.sql supabase/migrations/pending-approval/validation/20261024000003_schedule_cron_jobs_pg_cron_validation.sql` shows no `GET`.
- From `apps/web`: `npx vitest run lib/__tests__/b7c-cron-route-migration.test.ts lib/__tests__/eng01-cron-heartbeat.test.ts lib/__tests__/integrity-verification.test.ts lib/__tests__/vopt1-usage-optimization.test.ts` passes.
- `npm run typecheck` and `npm run lint` pass.

## Owner step (write it into your report)
- If `20261024000003` was already applied in production, re-run it in the SQL editor after this merges, then run validation query 1.

## Safety
- Never run `git push`, any `supabase` command, or anything against production. The user owns the branch and the pull request.
- Edit the held SQL file in place only; never move it to the top level.
- Do not edit `audit/`, `08-IMPLEMENTATION-PLAN.md`, `content/` or `backups/`. Never read `.env*` files.
- Do not start a dev server. Do not run the full `npm test` or `npm run build`.
- No em-dashes in comments or docs.
- Before writing Next.js code, read the matching guide in `apps/web/node_modules/next/dist/docs/`.

Start by producing an Implementation Plan artifact for review. Do not edit files until it is approved.

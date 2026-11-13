# AG-31: Leaderboard in SQL, retention that can actually delete, and a free-tier size alert

- **IDs closed:** plan PR-29 (ENG-08, ENG-09, ENG-10)
- **Milestone:** M2 Growth foundations
- **Depends on:** AG-04 and AG-05 (local database job and pgTAP)
- **Size:** M
- **Parallel-safe:** yes with frontend tasks after AG-18 (admin System page); with AG-26, AG-28 and AG-29, merge one at a time (shared README, held list, types)
- **Needs owner action:** apply the held migrations; review retention dry-run counts before setting `RETENTION_DELETE_ENABLED=true` in Vercel

## Why
The weekly leaderboard reloads every user's progress and XP rows into each server instance and ranks them in JavaScript. That cost grows with every learner. The Supabase free plan caps the database at 500 MB, and nothing warns before it fills. Retention can never delete anything today, even with the env flag set.

## Current state (verified 2026-11-13)
- `apps/web/lib/leaderboard-db.ts:254-272` loads lesson progress and all of this week's XP events (`db.selectWeeklyXpEvents` at `:264`, defined in `apps/web/lib/db/leaderboard.ts:82`) and groups them in memory (`:274` onward). Ranking helpers live in `apps/web/lib/leaderboard.ts`.
- Retention rules: `apps/web/lib/retention/policy.ts`. `/api/cron/cleanup` deletes only when `RETENTION_DELETE_ENABLED === 'true'` (`apps/web/app/api/cron/cleanup/route.ts:43`) AND the request body says `dryRun: false`; `readRequestedDryRun` at `:46-50` defaults to `true`.
- Neither scheduler sends that body: the held pg_cron helper posts `'{}'::jsonb` for every job (`supabase/migrations/pending-approval/20261024000003_schedule_cron_jobs_pg_cron.sql:131`), and `.github/workflows/notification-scheduler.yml:157` posts no body. So setting the env var alone deletes nothing.
- No database size check in `apps/web/lib/admin/system-service.ts` (`git grep -n -e pg_database_size -- lib/admin/system-service.ts` prints nothing).
- 74 `CREATE INDEX` statements across migrations; duplicates are not tracked.
- Zero budget: stay on the free plan.

## Files in scope
- `supabase/migrations/pending-approval/20261113000007_leaderboard_weekly_rpc.sql` (a `SECURITY DEFINER` function, service-role execute only, returning the ranked weekly board for a limit and offset; plus any covering index), with `rollback/`, `validation/`, README section
- `supabase/migrations/pending-approval/20261113000008_drop_duplicate_indexes.sql` (only indexes proven duplicate by a query you include), with companions
- `supabase/tests/held-migrations.txt` (add both files so the `db-local` job from AG-04 applies them after reset)
- `apps/web/types/database.ts` (add the RPC signature to match reset plus listed held migrations)
- `apps/web/lib/leaderboard-db.ts`, `apps/web/lib/db/leaderboard.ts`, `apps/web/lib/leaderboard.ts`
- `apps/web/app/api/cron/cleanup/route.ts` (retention default for the cron actor)
- `apps/web/lib/admin/system-service.ts` and the admin System page (size tile; alert at 70 percent of 500 MB through the existing out-of-band webhook)
- `supabase/tests/leaderboard_rpc.test.sql` (pgTAP)
- Tests: `npm run test:leaderboard`, `npm run test:monitoring`, `lib/__tests__/b9d-retention.test.ts`, new `lib/__tests__/eng09-retention-cron-default.test.ts`

## Out of scope
- Paid plan upgrades. Changing XP rules or leaderboard tiers.
- Flipping `RETENTION_DELETE_ENABLED` (owner).

## Steps
1. Write the RPC in SQL with the same ranking rules as today (read the JS and list them in the plan: tie-breaks, lesson-day counts, excluded users). pgTAP compares SQL output to a seeded expectation.
2. Switch `leaderboard-db.ts` to call the RPC when it exists, keep the JS path as a fallback only until the owner applies the migration, and log which path ran.
3. Retention default: when the actor is `cron` and `RETENTION_DELETE_ENABLED === 'true'`, treat a body with no `dryRun` as `dryRun: false`. An admin call with no body stays a dry run. An explicit `dryRun` always wins. This needs no SQL or workflow change. Tests cover all four combinations of actor and flag, plus an explicit `dryRun: true` from cron.
4. Size alert: a read-only `pg_database_size(current_database())` through an existing admin RPC or a new function inside the 20261113000007 file; show MB used and percent of 500 MB on the System page; alert at most once a day above 70 percent.
5. Duplicate indexes: include the detection query in the migration header, drop only exact duplicates.
6. Write the owner checklist into your report: call cleanup as admin (dry run), read counts per rule, then set the env var and watch the next cron run.

## Acceptance checks (from `apps/web`)
- `npx vitest run lib/__tests__/eng09-retention-cron-default.test.ts lib/__tests__/b9d-retention.test.ts` passes.
- `npm run test:leaderboard` and `npm run test:monitoring` pass, plus new tests for the RPC path and the size threshold.
- CI `db-local` applies both held files and runs the new pgTAP file green; its types-drift check passes.
- Held migrations have both companions.
- `npm run typecheck` and `npm run lint` pass.

## Safety
- Never run `git push`, any `supabase` command, or anything against production. The user owns the branch and the pull request.
- Every top-level `.sql` in `supabase/migrations/` auto-applies to production on merge. Migrations go in `pending-approval/` only.
- Do not edit `audit/`, `08-IMPLEMENTATION-PLAN.md`, `content/` or `backups/`. Never read `.env*` files.
- Do not start a dev server. Do not run the full `npm test` or `npm run build`.
- No dark mode. No em-dashes in comments or docs.
- Before writing Next.js code, read the matching guide in `apps/web/node_modules/next/dist/docs/`.

Start by producing an Implementation Plan artifact for review. Do not edit files until it is approved.

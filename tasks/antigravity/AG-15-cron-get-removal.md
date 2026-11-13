# AG-15: Remove cron GET aliases and the GitHub schedule

- **IDs closed:** plan PR-18 part 4 (SEC-12 cron part); Phase 2 runbook step (b)6 (ENG-01 follow-up)
- **Milestone:** M1 Platform safety
- **Depends on:** AG-14 merged and deployed; owner has applied (or re-run) `20261024000003` with POST and watched heartbeats for 24 hours
- **Size:** S
- **Parallel-safe:** yes

## Why
Once pg_cron calls every job with POST, the `GET` aliases only add risk, and the GitHub schedule double-fires every job.

## Current state (verified 2026-11-13)
- `export const GET = POST` in `apps/web/app/api/cron/{cleanup,daily-reminder,lifecycle,process-email-queue,retry-failed,weekly-recap}/route.ts` (lines 115, 308, 87, 80, 57, 313).
- `process-broadcasts` will have both after AG-14.
- `.github/workflows/notification-scheduler.yml:3-16` has a `schedule:` block plus `workflow_dispatch` at `:17-22`.
- `docs/ops/phase2-owner-runbook.md` step (b)6 says to remove the `schedule:` block after a 24-hour watch.
- Proxy matcher excludes `api/cron` (`apps/web/proxy.ts:692`); the routes authenticate through `withRoute` actor `cron`.

## Files in scope
- The seven cron route files
- `.github/workflows/notification-scheduler.yml`
- `apps/web/lib/__tests__/b7c-cron-route-migration.test.ts` and any test importing a cron `GET` (`git grep -n -e 'api/cron' --and -e GET -- lib/__tests__`)
- `docs/CRON_AND_SCHEDULING.md`

## Out of scope
- Any change to job logic or heartbeat intervals.

## Steps
1. Ask the user to paste the output of `SELECT jobname, command FROM cron.job;` from the Supabase SQL editor, plus confirmation that heartbeats were fresh for 24 hours. Proceed only if no command contains `'GET'`.
2. Delete each `export const GET = POST` and the `GET` export in process-broadcasts.
3. Remove the `schedule:` block from `notification-scheduler.yml`; keep `workflow_dispatch` and every job. Simplify each job's `if:` to the dispatch condition. Every curl uses `-X POST`.
4. Tests: each cron route module exports `POST` and no `GET`.
5. Update `docs/CRON_AND_SCHEDULING.md`: pg_cron is the scheduler; the GitHub workflow is manual only. Note that with GitHub gone, the in-database dead-man check (AG-01) is no longer out-of-band: if pg_cron or the database stops, nothing alerts. Point to the optional free external uptime monitor in `docs/ROADMAP.md` section 2.5.

## Acceptance checks
- From `apps/web`: `git grep -n -F -e 'export const GET' -- app/api/cron` prints nothing.
- From the repo root: `git grep -n -e 'schedule:' -- .github/workflows/notification-scheduler.yml` prints nothing.
- From `apps/web`: `npx vitest run lib/__tests__/b7c-cron-route-migration.test.ts lib/__tests__/eng01-cron-heartbeat.test.ts lib/__tests__/integrity-verification.test.ts lib/__tests__/vopt1-usage-optimization.test.ts` passes.
- `npm run typecheck` and `npm run lint` pass.

## Safety
- Never run `git push`, any `supabase` command, or anything against production. The user owns the branch and the pull request.
- Do not edit `audit/`, `08-IMPLEMENTATION-PLAN.md`, `content/` or `backups/`. Never read `.env*` files.
- Do not start a dev server. Do not run the full `npm test` or `npm run build`.
- No em-dashes in comments or docs.
- Before writing Next.js code, read the matching guide in `apps/web/node_modules/next/dist/docs/`.

Start by producing an Implementation Plan artifact for review. Do not edit files until it is approved.

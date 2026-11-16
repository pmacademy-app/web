# AG-29: Learner weekly goal and an outcome-based weekly recap

- **IDs closed:** plan PR-27 (PROD-06, PROD-13a)
- **Milestone:** M2 Growth foundations
- **Depends on:** AG-04 (held-migrations list) and AG-19 (settings and onboarding forms). AG-15 is not required.
- **Size:** M
- **Parallel-safe:** no with AG-20 (settings components); with AG-28 and AG-31, merge one at a time (shared README, held list, types)
- **Needs owner sign-off:** yes on the "goal at risk" nudge. Zero budget keeps the app quota at 100 emails a day; a new nudge competes with reminders. Recommended: in-app nudge only, no new email.

## Why
Streaks reward opening the app, not progress. A goal the learner sets ("3 lessons a week, 20-minute sessions") and a recap that reports against it gives a reason to come back that matches learning.

## Current state (verified 2026-11-12)
- No weekly goal anywhere (`git grep -l -e weekly_goal -e weeklyGoal -- lib app components` prints nothing).
- Weekly recap: `apps/web/app/api/cron/weekly-recap/route.ts:36` (`POST`), template `apps/web/emails/templates/learning/WeeklyRecap.tsx`, evaluator tested by `npm run test:recap`.
- Notification preferences and settings UI: `apps/web/components/settings/` (`SettingsTabs.tsx`, `ProfileSettingsTab.tsx`).
- Onboarding writes learner preferences in `apps/web/app/onboarding/actions.ts` (around `:290`).
- Email capacity rules: `docs/EMAIL_SYSTEM.md` section 9 and `docs/ops/phase2-owner-runbook.md` step (d).

## Files in scope
- `supabase/migrations/pending-approval/20261113000006_weekly_goal.sql` (columns `weekly_goal_lessons smallint`, `session_minutes smallint` on `public.users` or a preferences table; check constraints; service-role writes only; rollback, validation, README section)
- `apps/web/types/database.ts` (hand-add columns) and `supabase/tests/held-migrations.txt` (add the file so the `db-local` types-drift check and any pgTAP test see it)
- A settings section and an onboarding step to set the goal
- `apps/web/app/api/settings/...` route for the goal (wrapped in `withRoute`, zod, rate-limited)
- Weekly recap evaluator and `WeeklyRecap.tsx` (progress against goal, portfolio views if already tracked)
- Dashboard widget for goal progress and an in-app "goal at risk" nudge
- Tests: `npm run test:recap`, `npm run test:settings`, `npm run test:in-app`, new `lib/__tests__/prod06-weekly-goal.test.ts`

## Out of scope
- New email sends beyond changing the recap content (unless the owner approves a nudge email).
- Cohorts and study pairs (Phase 5).

## Steps
1. Plan: data model, default (no goal set means the recap stays as today), allowed values (1 to 7 lessons; 10, 20, 30 minutes).
2. Held migration with companions. App code feature-detects the columns until the owner applies it.
3. Settings and onboarding controls with clear labels; save through the new route.
4. Recap: "You finished 2 of your 3 lessons this week" plus next lesson link; no streak language when a goal exists.
5. Nudge: in-app only, Thursday local time if under half the goal, at most once a week, idempotent key per user and week.
6. Tests: goal validation; recap copy for met, partly met and no goal; nudge fires once.

## Acceptance checks (from `apps/web`)
- `npx vitest run lib/__tests__/prod06-weekly-goal.test.ts` passes.
- `npm run test:recap`, `npm run test:settings`, `npm run test:in-app`, `npm run test:email` pass.
- Held migration has both companions.
- `npm run typecheck` and `npm run lint` pass.

## Safety
- Never run `git push`, any `supabase` command, or anything against production. Never send a real email.
- Every top-level `.sql` in `supabase/migrations/` auto-applies to production on merge. Migrations go in `pending-approval/` only.
- Do not edit `audit/`, `08-IMPLEMENTATION-PLAN.md`, `content/` or `backups/`. Never read `.env*` files.
- Do not start a dev server. Do not run the full `npm test` or `npm run build`.
- No dark mode. No em-dashes in copy, comments or docs.
- Before writing Next.js code, read the matching guide in `apps/web/node_modules/next/dist/docs/`.

Start by producing an Implementation Plan artifact for review. Do not edit files until it is approved.

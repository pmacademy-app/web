# AG-28: "Completed" means the learner passed: mastery at 70 percent

- **IDs closed:** plan PR-26 (PROD-02)
- **Milestone:** M2 Growth foundations
- **Depends on:** AG-06 (honest tests around `lessons-db.ts`) and AG-04 (held-migrations list); owner sign-off before work starts
- **Size:** M (state and UI; the quiz-item rewrite is a separate content task)
- **Parallel-safe:** no with AG-27 and AG-30 (lesson UI); with AG-29 and AG-31, merge one at a time (`pending-approval/README.md`, `supabase/tests/held-migrations.txt`, `types/database.ts`)
- **Needs owner sign-off:** yes. This changes what counts toward module completion, certificates (90 lessons) and PM Fellow. Decide: threshold (70 percent), whether existing completions are grandfathered (recommended: yes), and whether the certificate requires mastery.

## Why
Any quiz attempt marks a lesson completed, whatever the score. Certificates and module badges therefore say a learner covered material they may have failed, which is the trust gap the market report calls out.

## Current state (verified 2026-11-12)
- `apps/web/lib/academy/lessons-db.ts:624-625` (comment): "every attempt upserts status 'completed'". Completion is set regardless of score.
- `lessons-db.ts:276` keeps `completed` once set; `:606` counts completed lessons from `status === 'completed'`.
- Module completion notifications use those completed ids (`lessons-db.ts:626-632`).
- Quiz route: `apps/web/app/api/v2/lessons/[lessonId]/quiz/route.ts`; the RPC `record_lesson_quiz_completion` writes progress in the database.
- Flashcards: `apps/web/app/api/flashcards/` and `apps/web/lib/srs*`.

## Files in scope
- `apps/web/lib/academy/lessons-db.ts`, the quiz route, and the progress readers that show status in the UI (`git grep -n -e 'status === .completed.' -- lib components app`)
- `supabase/migrations/pending-approval/20261113000005_lesson_mastery.sql` (new RPC version or a `best_score` column; rollback, validation, README section)
- `supabase/tests/held-migrations.txt` (add the file so the `db-local` job applies it) and `apps/web/types/database.ts` (hand-add the new columns or RPC signature so the types-drift check passes)
- Flashcard queue code, to add wrong-answer cards
- Tests: `npm run test:xp`, `npm run test:certificates`, `npm run test:srs`, new `lib/__tests__/prod02-mastery.test.ts`

## Out of scope
- Rewriting quiz items (content task for the owner, Modules 6 to 9 first).
- Graded inline concept checks (later).
- XP amounts.

## Steps
1. After sign-off, write the decision into the plan: threshold, grandfathering, certificate rule.
2. Add an `attempted` state (or keep `in_progress`) for scores below the threshold and store `best_score`. A lesson becomes `completed` only when the best score reaches the threshold. Existing `completed` rows stay completed.
3. Update the RPC through a held migration if the status is decided in SQL. Keep the old RPC signature working until the code is deployed (release order in the README section).
4. UI: show "Attempted, 55 percent. Retake to complete" with a retake action; module progress counts only completed lessons.
5. Wrong answers create flashcards for that question's concept (idempotent per user and question).
6. Tests: 69 percent does not complete; 70 percent does; a later lower score never downgrades; existing completed rows unaffected; certificate eligibility follows the decided rule.

## Acceptance checks (from `apps/web`)
- `npx vitest run lib/__tests__/prod02-mastery.test.ts` passes.
- `npm run test:xp`, `npm run test:certificates`, `npm run test:srs`, `npm run test:rls` pass.
- Held migration has both companions.
- `npm run typecheck` and `npm run lint` pass.

## Safety
- Never run `git push`, any `supabase` command, or anything against production. The user owns the branch and the pull request.
- Every top-level `.sql` in `supabase/migrations/` auto-applies to production on merge. Migrations go in `pending-approval/` only.
- Do not edit `audit/`, `08-IMPLEMENTATION-PLAN.md`, `content/` or `backups/`. Never read `.env*` files.
- Do not start a dev server. Do not run the full `npm test` or `npm run build`.
- No dark mode. No em-dashes in copy, comments or docs.
- Before writing Next.js code, read the matching guide in `apps/web/node_modules/next/dist/docs/`.

Start by producing an Implementation Plan artifact for review. Do not edit files until it is approved.

# AG-26: Capstone rubric scores, written feedback and resubmission (data and API)

- **IDs closed:** plan PR-25 part 1 (PROD-03)
- **Milestone:** M2 Growth foundations
- **Depends on:** AG-04 (held-migrations list and types-drift check); AG-05 recommended
- **Size:** M
- **Parallel-safe:** yes with UI tasks; with AG-28, AG-29 and AG-31, merge one at a time (shared `pending-approval/README.md`, held list, types). If AG-11 runs in the same wave, merge AG-26 first.
- **Needs owner action:** apply the held migration after review

## Why
A capstone is the product's best moment, yet review is a bare approve or reject. Learners get no score, no feedback and cannot fix and resubmit. The market report's kill criterion (about 50 reviewed capstones a month) depends on this loop.

## Current state (verified 2026-11-12)
- `apps/web/app/api/admin/capstones/[id]/review/route.ts:21-35` accepts only `{ action: 'approve' | 'reject' }`, no zod schema, no feedback.
- `apps/web/lib/admin/moderation-service.ts:429` `reviewCapstone(adminUserId, adminEmail, submissionId, action)`.
- `apps/web/lib/capstones.ts:171-176` refuses `submitted` when the current status is `reviewed`: "Cannot resubmit an already reviewed capstone."
- `apps/web/config/capstones.ts:31` `requirements: CapstoneRequirement[]` with `{ id, label, description }` per capstone (example `:35-39`). This is the rubric source.
- `capstone_submissions` has `reviewed_at`, `reviewed_by` (`supabase/migrations/20261001000001_phase8_capstone_review_loop.sql`) and is SELECT-only for clients (`20261024000002_lock_users_and_capstone_client_writes.sql`). No score or feedback columns.

## Files in scope
- `supabase/migrations/pending-approval/20261113000004_capstone_review_feedback.sql` plus `rollback/`, `validation/`, README section
- `supabase/tests/held-migrations.txt` (add the file so AG-04's `db-local` job applies it after reset) and `supabase/tests/capstone_review.test.sql` (pgTAP: learners cannot write the new columns)
- `apps/web/types/database.ts` (hand-add the new columns; the `db-local` types-drift check compares against top-level plus listed held migrations)
- `apps/web/app/api/admin/capstones/[id]/review/route.ts`
- `apps/web/lib/admin/moderation-service.ts`, `apps/web/lib/capstones.ts`
- A rubric helper, for example `apps/web/lib/capstones/rubric.ts` (new)
- Tests: `npm run test:capstones`, new `lib/__tests__/prod03-capstone-review.test.ts`

## Out of scope
- Admin and learner UI and the notification email (AG-27).
- AI grading (dropped by owner decision).
- The capstone threshold experiment (stays off).

## Steps
1. Migration (held): add nullable `review_scores jsonb` (map of requirement id to score 0 to 3), `review_feedback text` (max length check, for example 4000), `revision_count int not null default 0`, and a `review_history jsonb` array or a separate `capstone_reviews` table (choose in the plan; a table is easier to query for turnaround). Service-role writes only; learners can read their own feedback through existing select policies (check them). Validation proves `anon`/`authenticated` cannot write.
2. Route: zod schema `{ action: 'approve' | 'reject' | 'request_changes', scores: Record<requirementId, 0..3>, feedback: string }`. Validate requirement ids against `config/capstones.ts` for that module. Feedback required when rejecting or requesting changes.
3. Service: write scores, feedback, `reviewed_at`, `reviewed_by`, append to history. Use `withRoute` errors, not boolean returns (match AG-10's direction).
4. Resubmission: allow `reviewed` with `request_changes` or `reject` back to `submitted`, increment `revision_count`, keep history. Approved stays final.
5. Keep the app working before the migration is applied: feature-detect the columns or gate behind a flag that defaults ON once applied (owner decision: shipped features ON). State the release order in the README section: apply migration, then deploy.

## Acceptance checks (from `apps/web`)
- `npx vitest run lib/__tests__/prod03-capstone-review.test.ts` passes (unknown requirement id rejected; reject without feedback rejected; resubmit after request_changes allowed; resubmit after approve refused).
- `npm run test:capstones` and `npm run test:rls` pass.
- `git -C ../.. status --short -- supabase/migrations/pending-approval supabase/tests` lists the migration, both companions and the held-migrations change.
- `npm run typecheck` and `npm run lint` pass.

## Safety
- Never run `git push`, any `supabase` command, or anything against production. The user owns the branch and the pull request.
- Every top-level `.sql` in `supabase/migrations/` auto-applies to production on merge. The migration goes in `pending-approval/` only.
- Do not edit `audit/`, `08-IMPLEMENTATION-PLAN.md`, `content/` or `backups/`. Never read `.env*` files.
- Do not start a dev server. Do not run the full `npm test` or `npm run build`.
- No dark mode. No em-dashes in comments, copy or docs.
- Before writing Next.js code, read the matching guide in `apps/web/node_modules/next/dist/docs/`.

Start by producing an Implementation Plan artifact for review. Do not edit files until it is approved.

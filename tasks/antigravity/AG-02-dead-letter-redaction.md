# AG-02: Stop keeping one-time auth links in dead-lettered queue rows

- **IDs closed:** ADR-005 gap (documented 2026-11-12); SEC-17 (data minimisation, queue part)
- **Milestone:** M1 Platform safety
- **Depends on:** none
- **Size:** S
- **Parallel-safe:** yes, but AG-01, AG-02 and AG-14 all edit `supabase/migrations/pending-approval/README.md`: merge them one at a time

## Why
When an email dead-letters, its `email_queue` row keeps the unredacted `template_variables`. For `auth.verify_email` and `auth.password_reset` that includes the one-time link with a live token. Admins can read these rows, and in practice nothing deletes them: the 90-day retention rule only runs in report mode today (see below).

## Current state (verified 2026-11-12)
- `apps/web/lib/notifications/queue/processor.ts:1012` `handlePermanentFailure()` sets `status: 'dead_letter'` (`:1028`) and leaves `template_variables` untouched.
- A second path dead-letters stale leases without that function: `processor.ts:385-401` (`error_message: 'Processing lease expired: max attempts reached'`).
- Critical auth templates are already named in the file: `processor.ts:106`, `:641`, `:719` (`auth.verify_email`, `auth.password_reset`). The full governed list is in `apps/web/lib/email-governance.ts:59-60` and nearby.
- Retention: `apps/web/lib/retention/policy.ts:84-92` keeps dead letters 90 days. `apps/web/app/api/cron/cleanup/route.ts:43` needs `RETENTION_DELETE_ENABLED === 'true'` AND a request body with `dryRun: false` (`:46-50` defaults to dry run). Neither scheduler sends that body, so no row is deleted today. AG-31 fixes this.
- `docs/decisions/ADR-005-sensitive-data-redaction.md:32` documents the gap.
- Admin retry moves `dead_letter` back to `pending` (`apps/web/lib/notifications/queue/helpers.ts:13`). Three admin routes do it, and each already special-cases auth templates: `apps/web/app/api/admin/emails/queue/retry-all/route.ts:81`, `retry-selected/route.ts:70`, `[id]/retry/route.ts:61`. A retried auth email with scrubbed variables would render a broken link, and the original link has expired anyway.
- Only `apps/web/lib/notifications/events/connectors.ts:95` enqueues `auth.password_reset` through the queue.

## Files in scope
- `apps/web/lib/notifications/queue/processor.ts`
- `apps/web/lib/notifications/queue/helpers.ts` (only if a guard for retrying scrubbed auth rows belongs there)
- The three admin retry routes above, only to block retry of scrubbed `auth.*` rows with a clear message
- `apps/web/lib/__tests__/adr005-dead-letter-redaction.test.ts` (new)
- Existing tests that assert dead-letter writes: `lib/__tests__/email-queue-provider-failover.test.ts`, `lib/__tests__/queue-scheduler-reliability.test.ts`, `lib/__tests__/admin-queue-recovery.test.ts`, `lib/__tests__/sensitive-data-redaction.test.ts`
- `supabase/migrations/pending-approval/20261113000001_scrub_dead_letter_auth_links.sql` plus `rollback/` and `validation/` companions and a README section (one-off owner-run scrub of rows already dead-lettered)

## Out of scope
- Retention windows and `RETENTION_DELETE_ENABLED`.
- Non-auth templates beyond the optional step 4.
- `docs/decisions/ADR-005-*.md` (another change owns it; mention the fix in your report instead).

## Steps
1. Add a small pure helper, for example `scrubTemplateVariablesForDeadLetter(templateKey, vars)`, that returns `{}` plus a marker such as `{ _scrubbed: 'dead_letter' }` for any `auth.*` template key. Keep non-auth variables unchanged.
2. In `handlePermanentFailure()` include `template_variables: scrub(...)` in the same update that sets `status: 'dead_letter'`. Do the same in the stale-lease path at `:385-401` (it has `template_key` on the row or must select it).
3. Make admin retry of a scrubbed `auth.*` row fail with a clear message ("This sign-in email expired. Ask the learner to request a new one.") instead of sending a broken link.
4. Optional, if small: also scrub `auth.*` variables when the row reaches a completed status. Report what you chose.
5. Write the held one-off SQL that nulls `template_variables` for existing rows where `status IN ('dead_letter','failed')` and `template_key LIKE 'auth.%'`. Rollback cannot restore values: say so in the header and make the down file a documented no-op. Validation counts remaining rows with a non-empty `template_variables` for those filters (expect 0).
6. Tests first: a failing test that a dead-lettered `auth.password_reset` row is written without `resetUrl`, and an `auth.verify_email` row without `verificationUrl`; a non-auth template keeps its variables; the stale-lease path scrubs too; retry of a scrubbed auth row is refused.

## Acceptance checks (from `apps/web`)
- `npx vitest run lib/__tests__/adr005-dead-letter-redaction.test.ts lib/__tests__/email-queue-provider-failover.test.ts lib/__tests__/queue-scheduler-reliability.test.ts lib/__tests__/admin-queue-recovery.test.ts lib/__tests__/sensitive-data-redaction.test.ts` passes.
- `npm run test:email` passes.
- `npm run typecheck` and `npm run lint` pass.
- `git grep -n -e template_variables -- lib/notifications/queue/processor.ts` shows the scrub in both dead-letter updates.

## Safety
- Never run `git push`, any `supabase` command, or anything against production. The user owns the branch and the pull request.
- Every top-level `.sql` in `supabase/migrations/` auto-applies to production on merge. The scrub SQL goes in `pending-approval/` only.
- Do not edit `audit/`, `08-IMPLEMENTATION-PLAN.md`, `content/` or `backups/`. Never read `.env*` files.
- Do not start a dev server. Do not run the full `npm test` or `npm run build`.
- No dark mode. No em-dashes in comments, copy or docs.
- Before writing Next.js code, read the matching guide in `apps/web/node_modules/next/dist/docs/`.

Start by producing an Implementation Plan artifact for review. Do not edit files until it is approved.

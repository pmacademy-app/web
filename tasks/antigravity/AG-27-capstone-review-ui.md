# AG-27: Capstone review UI, learner feedback view and notification

- **IDs closed:** plan PR-25 part 2 (PROD-03)
- **Milestone:** M2 Growth foundations
- **Depends on:** AG-26 merged and its migration applied by the owner; AG-20 merged (dialogs)
- **Size:** M
- **Parallel-safe:** no with AG-28 and AG-30 (shared components)

## Why
AG-26 stores scores and feedback. Admins need a form to give them, learners need to see them and resubmit, and the learner must be told a review happened.

## Current state (verified 2026-11-12)
- Admin moderation pages live under `apps/web/app/admin/(console)/moderation/`.
- Learner capstone page: `apps/web/app/(app)/capstones/[module]/page.tsx` (uses `alert(msg)` at `:184`). Components in `apps/web/components/capstones/` (`CapstoneCard.tsx`, `RichEditor.tsx`, `SubmitConfirmationModal.tsx`, `CapstoneReflection.tsx`).
- Notifications: email templates in `apps/web/emails/templates/`, queued through `apps/web/lib/notifications/queue/processor.ts`; in-app notifications through `lib/admin/in-app-manager-service.ts` and the notification services.
- Rubric lines come from `apps/web/config/capstones.ts` `requirements`.

## Files in scope
- Admin review UI under `apps/web/app/admin/(console)/moderation/` and `apps/web/components/admin/` (the review panel only)
- `apps/web/app/(app)/capstones/[module]/page.tsx` and `apps/web/components/capstones/*`
- One new email template, for example `apps/web/emails/templates/learning/CapstoneReviewed.tsx`, and its registration
- One in-app notification type for "capstone reviewed"
- Tests: `npm run test:capstones`, `npm run test:email`, `npm run test:in-app`, new `components/__tests__/prod03-capstone-review-ui.test.tsx`

## Out of scope
- API and schema (AG-26). Turnaround dashboards (exists in `lib/admin/capstone-review-aging.ts`; leave).

## Steps
1. Admin panel: one row per rubric line with a 0 to 3 score control (labelled radio group), a feedback textarea with a character counter, and three actions: Approve, Request changes, Reject. Disable submit until required fields are filled. Use the base-ui Dialog if the panel is a modal.
2. Learner view: show status, per-line scores with the line label and description, and the feedback text. On "changes requested" or "rejected", show an "Edit and resubmit" action that reuses the editor and keeps the draft. Replace `alert(msg)` at `:184` with the existing toast or an inline message.
3. Notification: queue one email (respect preferences, suppressions and the 100 per day quota; it is transactional and low volume) and one in-app notification when a review is saved. Copy: plain, specific, no em-dashes, link to the capstone page.
4. Tests: admin form validation; learner sees feedback; resubmit button only when allowed; one queued email per review with an idempotency key.

## Acceptance checks (from `apps/web`)
- `npx vitest run components/__tests__/prod03-capstone-review-ui.test.tsx` passes.
- `npm run test:capstones`, `npm run test:email`, `npm run test:in-app`, `npm run test:a11y` pass.
- `git grep -n -F -e 'alert(' -- ':(literal)app/(app)/capstones/[module]/page.tsx'` prints nothing.
- `npm run typecheck` and `npm run lint` pass.

## Safety
- Never run `git push`, any `supabase` command, or anything against production. Never send a real email.
- Do not edit `audit/`, `08-IMPLEMENTATION-PLAN.md`, `content/` or `backups/`. Never read `.env*` files.
- Do not start a dev server. Do not run the full `npm test` or `npm run build`.
- No dark mode. No em-dashes in copy, comments or docs.
- Before writing Next.js code, read the matching guide in `apps/web/node_modules/next/dist/docs/`.

Start by producing an Implementation Plan artifact for review. Do not edit files until it is approved.

# AG-10: Admin handlers and services throw, so withRoute records incidents

- **IDs closed:** plan PR-17 part 2 (CQ-06)
- **Milestone:** M1 Platform safety
- **Depends on:** AG-09 (timing and incident logging in `withRoute`)
- **Size:** M (one area per PR; start with emails and broadcasts, then repeat the brief for the next area)
- **Parallel-safe:** yes with tasks outside `app/api/admin`, `lib/admin` and `components/admin`; merge before AG-18 starts

## Why
Admin routes catch their own errors and return generic 500s, and admin services return `[]` or zeroed objects on a failed read. `withRoute` never sees the failure, so no incident is logged, and admins see "no data" instead of an error.

## Current state (verified 2026-11-12)
- 58 route files under `apps/web/app/api/admin` contain `try {` (`git grep -l -F -e 'try {' -- 'app/api/admin/*route.ts'`, count the files). Some are legitimate (JSON parse of the body); most wrap the whole handler.
- Example: `apps/web/app/api/admin/capstones/[id]/review/route.ts:16-52` wraps the handler in `try` and returns its own 500 at `:45` and `:52`.
- Email area: `app/api/admin/emails/*` (automations, broadcasts, preview, production-send, queue, test-send and children).
- `withRoute` in `apps/web/lib/api/with-route.ts:220` already turns thrown errors into a logged incident and a standard error response; `RouteError` at `:41` carries a status for expected failures.

## Files in scope (first PR)
- `apps/web/app/api/admin/emails/**/route.ts`
- `apps/web/lib/admin/communications-service.ts`, `apps/web/lib/admin/broadcast-service.ts`
- Tests that cover them: `git grep -l -e communications-service -e broadcast-service -e api/admin/emails -- lib/__tests__`
- New: `apps/web/lib/__tests__/cq06-admin-errors-email.test.ts`

Later PRs (same brief, new branch each): `app/api/admin/users`, `capstones`, `system`, `settings`, `feature-flags`, then the rest. Name the area in the branch (`ag/10b-admin-errors-users`).

## Out of scope
- Learner routes. The error envelope and client migration (AG-11).
- Changing response shapes on success.

## Steps
1. List every `try` in the area and classify it: (a) body JSON parse, keep but use `RouteError(400, ...)`; (b) whole-handler catch, remove; (c) best-effort side effect, keep and log with `logSystemError`, add a comment saying why.
2. In the services, replace "log and return `[]`" with a thrown error, except where a caller genuinely wants partial data. For those, return `{ data, failed: true }` the way `dashboard-service.ts` does, and make the UI show the failure.
3. Update the admin UI components that read these endpoints so a 500 shows an error state, not an empty list (find them with `git grep -n -e /api/admin/emails -- components app`).
4. Tests first for two routes: a failed Supabase read produces a 500 from `withRoute` and one `logErrorReport` call, not an empty 200.

## Acceptance checks (from `apps/web`)
- `npx vitest run lib/__tests__/cq06-admin-errors-email.test.ts` passes.
- `npm run test:admin`, `npm run test:admin-email`, `npm run test:automations` pass.
- `git grep -c -F -e 'try {' -- 'app/api/admin/emails/*route.ts'` totals fewer than before (record the before count in the plan), and each remaining `try` has a reason comment.
- `npm run typecheck` and `npm run lint` pass.

## Safety
- Never run `git push`, any `supabase` command, or anything against production. The user owns the branch and the pull request.
- Do not edit `audit/`, `08-IMPLEMENTATION-PLAN.md`, `content/` or `backups/`. Never read `.env*` files.
- Do not start a dev server. Do not run the full `npm test` or `npm run build`.
- No dark mode. No em-dashes in comments, copy or docs.
- Before writing Next.js code, read the matching guide in `apps/web/node_modules/next/dist/docs/`.

Start by producing an Implementation Plan artifact for review. Do not edit files until it is approved.

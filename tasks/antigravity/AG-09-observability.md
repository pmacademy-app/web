# AG-09: Request error hook, client error beacon and route timing

- **IDs closed:** plan PR-17 part 1 (ENG-11)
- **Milestone:** M1 Platform safety
- **Depends on:** none
- **Size:** M
- **Parallel-safe:** yes, but merge AG-09 before starting AG-10 or AG-13 (they touch `withRoute` and the logger paths)

## Why
Server errors outside `withRoute` and every client-side crash are invisible today. Nothing records how long routes take, so slow paths cannot be found.

## Current state (verified 2026-11-12)
- `apps/web/instrumentation.ts` does not exist.
- Error boundaries only log to the browser console: `apps/web/app/error.tsx:21-22`, `apps/web/app/global-error.tsx:26-27`, `apps/web/app/(app)/error.tsx:14-16`.
- `apps/web/lib/api/with-route.ts:220` `withRoute()` has no duration measurement (`git grep -n -e performance.now -e duration -- lib/api/with-route.ts` finds only an unrelated comment).
- Server logging helpers: `logSystemError` and `logErrorReport` in `apps/web/lib/monitoring/logger.ts`. A public telemetry route pattern exists at `apps/web/app/api/auth/telemetry/route.ts`.
- `/api/health` exists (`apps/web/app/api/health/route.ts`).

## Files in scope
- `apps/web/instrumentation.ts` (new)
- `apps/web/app/api/client-errors/route.ts` (new, wrapped in `withRoute`, rate-limited, no auth required)
- `apps/web/lib/monitoring/client-error-beacon.ts` (new)
- `apps/web/app/error.tsx`, `apps/web/app/global-error.tsx`, `apps/web/app/(app)/error.tsx`, `apps/web/app/admin/(console)/error.tsx` if present
- `apps/web/lib/api/with-route.ts`
- `apps/web/proxy.ts` only if the new route needs an exemption (check the matcher)
- Tests: `apps/web/lib/__tests__/eng11-observability.test.ts` (new); existing `lib/__tests__/b7b-with-route.test.ts`
- `docs/OBSERVABILITY.md` (short section)

## Out of scope
- Removing try/catch in admin handlers (AG-10) or the error envelope (AG-11).
- Paid monitoring services (Sentry paid plans and similar). Free uptime monitors are an owner choice, listed in ROADMAP.

## Steps
1. Read `apps/web/node_modules/next/dist/docs/` for `instrumentation.ts` and `onRequestError` in Next 16.4.3. Quote the signature in your plan.
2. `instrumentation.ts`: export `register()` (no-op unless needed) and `onRequestError(err, request, context)` that calls `logErrorReport` with route path, method, `context.routeType`, and the request id header if present. Redact with the existing redaction (ADR-005). Never log bodies, cookies or auth headers.
3. Client beacon: a small function that posts `{ message, digest, path, boundary }` with `navigator.sendBeacon` (fallback `fetch` with `keepalive`). Truncate message length. Call it from each error boundary in `useEffect`, keep the existing UI.
4. `/api/client-errors`: `withRoute` with `actor: { allow: ['anonymous', 'learner', 'admin'] }` (use the real actor names from `lib/api/actor.ts`), a strict per-IP rate limit, zod schema, logs with `logSystemError` at `warn`. Return 204.
5. In `withRoute`, measure duration and emit one structured log line per request (operation, status, ms). Keep it cheap. Do not log at all for `/api/health` if that is noisy.
6. Document what is logged and where to see it in `docs/OBSERVABILITY.md`.

## Acceptance checks (from `apps/web`)
- `npx vitest run lib/__tests__/eng11-observability.test.ts lib/__tests__/b7b-with-route.test.ts` passes. New tests cover: `onRequestError` calls the logger with redacted fields; the beacon payload is truncated; the route rejects bodies over the limit and is rate-limited; `withRoute` logs a duration.
- `npm run test:monitoring` passes.
- `npm run typecheck` and `npm run lint` pass (the `require-with-route` rule must accept the new route without adding it to `WRAPPER_EXEMPT_ROUTES`).
- `git grep -n --untracked -e onRequestError -- instrumentation.ts` shows the export.

## Safety
- Never run `git push`, any `supabase` command, or anything against production. The user owns the branch and the pull request.
- Do not edit `audit/`, `08-IMPLEMENTATION-PLAN.md`, `content/` or `backups/`. Never read `.env*` files.
- Do not start a dev server. Do not run the full `npm test` or `npm run build`.
- No dark mode. No em-dashes in comments, copy or docs.
- Before writing Next.js code, read the matching guide in `apps/web/node_modules/next/dist/docs/`.

Start by producing an Implementation Plan artifact for review. Do not edit files until it is approved.

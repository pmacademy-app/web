---
trigger: model_decision
description: "Apply when running, writing, or updating tests, or when deleting, moving or renaming files, routes, docs or migrations that tests may reference."
---

# Testing rules

## Run focused checks, from `apps/web`
1. `npx vitest run <path/to/test-file>` for each test that covers what you changed. Many areas also have an `npm run test:<area>` script (see `package.json`: `test:rls`, `test:auth`, `test:admin`, `test:email`, `test:a11y`, `test:seo` and others).
2. `npm run typecheck`
3. `npm run lint`

Do not run the full `npm test` or `npm run build` locally. They time out on this machine. CI runs both on every pull request.

Never report a check as passing without its real output. Quote the summary line (for example `Tests 12 passed (12)`).

## Find the tests that cover a file
- `git grep -l -e <file name or export> -- lib/__tests__ components/__tests__ e2e` (works in PowerShell; add `--untracked` to include new files)
- Run every test file that mentions the file, route, flag or doc you touched.

## Tests that pin paths or text (update them in the same change)
- `lib/__tests__/b11c-raw-button-rule.test.ts`: `EXEMPT_COMPONENTS` list. Each entry must exist on disk. Keep it sorted.
- `lib/__tests__/b12b-marketing-server-components.test.ts` and `lib/__tests__/marketing-homepage-phase0c.test.ts`: pinned marketing section files.
- `lib/__tests__/rls.test.ts`: reads migration SQL in `supabase/migrations/`.
- `lib/__tests__/sec07-users-writes-session-free.test.ts`: reads `supabase/migrations/pending-approval/` files.
- `lib/__tests__/b13b-pagination-contract.test.ts`: reads `docs/API_CONTRACT.md`.
- `lib/__tests__/complete-consent-page.test.ts`: reads `docs/DEPLOYMENT.md`, `docs/SECURITY.md`, `docs/AUTHENTICATION.md`.
- `lib/__tests__/b7c-cron-route-migration.test.ts` and `lib/__tests__/eng01-cron-heartbeat.test.ts`: cron routes, methods and heartbeat intervals.
- `lib/__tests__/vopt1-usage-optimization.test.ts`: the proxy matcher exclusions (`api/cron`, `api/health`, `api/og`, `api/email/*`).
- `eslint.config.mjs`: `WRAPPER_EXEMPT_ROUTES` for the `require-with-route` rule.

If you delete or rename anything, search for it with `git grep` in `lib/__tests__`, `components/__tests__`, `e2e`, `eslint.config.mjs` and `docs/` first.

## Writing tests
- Vitest only collects `lib/__tests__/**/*.test.ts` and `components/__tests__/**/*.test.tsx` (`apps/web/vitest.config.mts`). A `.tsx` test anywhere else never runs. Put component tests in `components/__tests__/` and start them with a `/** @vitest-environment jsdom */` docblock, like the existing files there; the default environment is `node`.
- Put new unit tests in `apps/web/lib/__tests__/<id>-<topic>.test.ts`, named after the finding ID when there is one (for example `sec16-email-hook-signature.test.ts`).
- Test behavior, not implementation. For a bug fix, write the failing test first.
- Mock Supabase with the patterns already used in nearby tests. Do not hit a real database or network.
- Pin clocks with `vi.useFakeTimers()` and `vi.setSystemTime()` when time matters.
- E2E specs live in `apps/web/e2e/`. Write-heavy flows must self-skip unless `E2E_ALLOW_WRITES` and staging credentials exist. `e2e/support/env.ts` refuses the production host. Keep it that way.

## Never
- Never weaken or delete an assertion just to make a test pass. If a test is wrong, say why in your report.
- Never add `.skip` or `.only` to committed tests.
- Never start a dev server for tests unless the user asks in that message.

# AG-21: Playwright and axe against real pages

- **IDs closed:** plan PR-20 part 5 (the "real pages" a11y gate; supports UX-03, UX-04, UX-12, UX-13, UX-14)
- **Milestone:** M1 Platform safety
- **Depends on:** AG-18, AG-19, AG-20 (so the gate starts green)
- **Size:** M
- **Parallel-safe:** yes (new spec files and one dev dependency; no workflow change)

## Why
The current a11y gate runs axe on components in JSDOM, mostly primitives. It cannot see real layouts, colour contrast or focus order. Regressions in the pages learners use would pass CI.

## Current state (verified 2026-11-12)
- `apps/web/lib/__tests__/b11c-accessibility-gate.test.ts` runs axe-core in JSDOM (`npm run test:a11y`).
- `axe-core` is a dependency; `@axe-core/playwright` is not.
- Playwright config `apps/web/playwright.config.ts` (`testDir: './e2e'`, a `webServer` block). Specs: `e2e/auth/{login,password-reset,protected-routes}.spec.ts`, `e2e/flows/{session-lifecycle,signup-to-xp}.spec.ts`, `e2e/prod09-lesson-signup.spec.ts`. `e2e/support/env.ts` refuses the production host.
- CI `e2e` job (`.github/workflows/ci.yml:128-222`) runs on `main` and on PRs touching auth paths; its filter at `:173` already matches `apps/web/e2e/`, so new specs trigger it with no workflow change. Account-dependent specs self-skip without staging secrets.

## Files in scope
- `apps/web/e2e/a11y/public-pages.spec.ts` (new)
- `apps/web/e2e/a11y/app-pages.spec.ts` (new, self-skips without staging credentials, like the write flows)
- `apps/web/package.json` and `package-lock.json` (add `@axe-core/playwright` as a dev dependency, exact version)
- `docs/TESTING.md` (short section)

## Out of scope
- Fixing issues found on pages outside AG-18 to AG-20 scope: record them in your report as follow-ups for AG-30 instead of fixing here, and mark those rules as known in the spec with a dated comment.
- Any staging setup (owner decision).

## Steps
1. Ask the user before installing the package (state name, version, size). Use an exact version.
2. Public spec: visit `/`, `/curriculum`, `/frameworks`, `/faq`, `/about`, `/reviews`, one public lesson (`/lessons/<first slug from content/dist/curriculum.json>`), `/login`, `/signup`. Run `AxeBuilder` with `wcag2a`, `wcag2aa`, `wcag21aa` tags. Fail on `serious` and `critical`.
3. Keyboard checks on `/` and `/login`: first Tab focuses the skip link; activating it moves focus to `main` (AG-19 adds the skip link to the auth layout).
4. App spec (skips without `E2E_USER_EMAIL`/`E2E_USER_PASSWORD` and a non-production `PLAYWRIGHT_TEST_BASE_URL`): log in, visit `/dashboard`, `/academy`, one lesson, `/progress`, `/settings`, open one modal; same axe rules.
5. No CI change: the existing filter covers `apps/web/e2e/`, and the job runs on every `main` push.

## Acceptance checks (from `apps/web`)
- `npm run lint` and `npm run typecheck` pass.
- `npx playwright test e2e/a11y/public-pages.spec.ts --list` lists the tests (does not start a server).
- Running the specs needs a built app and a server: do not do that locally. CI runs them on `main`; the user may trigger `workflow_dispatch`.

## Safety
- Never run `git push`, any `supabase` command, or anything against production. Never point Playwright at `prodily.app`.
- Do not edit `audit/`, `08-IMPLEMENTATION-PLAN.md`, `content/` or `backups/`. Never read `.env*` files.
- Do not start a dev server or `next start`. Do not run the full `npm test` or `npm run build`.
- No dark mode. No em-dashes in comments or docs.
- Before writing Next.js code, read the matching guide in `apps/web/node_modules/next/dist/docs/`.

Start by producing an Implementation Plan artifact for review. Do not edit files until it is approved.

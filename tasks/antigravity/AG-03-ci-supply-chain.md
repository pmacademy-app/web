# AG-03: CI supply-chain hardening

- **IDs closed:** plan PR-14 (SEC-10, SEC-20)
- **Milestone:** M1 Platform safety
- **Depends on:** none
- **Size:** S
- **Parallel-safe:** no (edits `.github/workflows/ci.yml`; run before AG-04, AG-07, AG-08, AG-32)

## Why
Every step in the build and E2E jobs can read production secrets, including third-party install scripts. The Supabase CLI is fetched unpinned with `npx` in the job that writes to production. Dependabot can propose a release minutes after it is published.

## Current state (verified 2026-11-12)
- `.github/workflows/ci.yml:23-29`: job-level `env` in `build-and-validate` exposes `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `CRON_SECRET`, `SEND_EMAIL_HOOK_SECRET` to every step.
- `ci.yml:133-139`: same secrets at job level in `e2e`.
- `ci.yml:54` and `:192`: plain `npm ci` (install scripts run). Packages with install scripts include `esbuild` (`postinstall`), `sharp` (`install`), `unrs-resolver` (`postinstall`).
- `ci.yml:325`, `:332`, `:337`, `:342`, `:350`: `npx supabase ...` with no version pin.
- `.github/dependabot.yml`: no `cooldown` on any ecosystem.
- `scripts/ci/npm-audit-allowlist.json`: `"advisories": []`. The braces advisory review is done.

## Files in scope
- `.github/workflows/ci.yml`
- `.github/dependabot.yml`
- `docs/SECURITY.md` (CI section only, a short note of what changed). Check `lib/__tests__/complete-consent-page.test.ts` still passes, it reads this file.

## Out of scope
- `notification-scheduler.yml` and `dependabot-auto-merge.yml`.
- Staging projects or new secrets (owner).
- Branch protection settings (owner, see ROADMAP owner actions).

## Steps
1. Move the four sensitive secrets from job-level `env` to the step-level `env` of only the steps that need them. Check what each step needs: unit tests are mocked and should need none; `next build` may need the public Supabase URL and anon key; decide per step and explain in the plan. Keep the Turnstile dummy keys where the build needs them.
2. Change installs to `npm ci --ignore-scripts`, then explicitly rebuild only what needs it, for example `npm rebuild esbuild sharp unrs-resolver` (confirm the list by reading each package's `scripts`). The audit job already installs nothing; leave it.
3. Replace `npx supabase` in `deploy-supabase` with `supabase/setup-cli@v1` and a pinned `version:`. Use the CLI version currently in `apps/web/package-lock.json` if present, otherwise the latest stable one you can confirm from the action's docs. Then call `supabase ...` directly.
4. Add `cooldown: { default-days: 3 }` to each `updates` entry in `.github/dependabot.yml` (check the current Dependabot docs for the exact key names before writing).
5. Add a short "CI secrets" note to `docs/SECURITY.md`.

## Acceptance checks
- From the repo root: `git grep -n -e SUPABASE_SERVICE_ROLE_KEY -e RESEND_API_KEY -e CRON_SECRET -e SEND_EMAIL_HOOK_SECRET -- .github/workflows/ci.yml` shows them only under step-level `env:` blocks (read each hit).
- `git grep -n -F -e 'npm ci' -- .github/workflows/ci.yml` shows `--ignore-scripts` on every install.
- `git grep -n -F -e 'npx supabase' -- .github/workflows/ci.yml` prints nothing; `git grep -n -e setup-cli -- .github/workflows/ci.yml` shows a pinned version.
- `git grep -n -e cooldown -- .github/dependabot.yml` shows one entry per ecosystem.
- YAML parses. Do not install a new tool for this; ask the user to approve any `npx` download. Paste the changed blocks into your report for review.
- From `apps/web`: `npx vitest run lib/__tests__/complete-consent-page.test.ts` passes.
- Real proof is the CI run on the pull request: the user opens it and checks `build-and-validate` and `e2e` are green.

## Safety
- Never run `git push`, any `supabase` command, or anything against production. The user owns the branch and the pull request.
- Do not change what `deploy-supabase` applies or when it runs.
- Do not edit `audit/`, `08-IMPLEMENTATION-PLAN.md`, `content/` or `backups/`. Never read `.env*` files.
- Do not start a dev server. Do not run the full `npm test` or `npm run build`.
- No em-dashes in comments or docs.

Start by producing an Implementation Plan artifact for review. Do not edit files until it is approved.

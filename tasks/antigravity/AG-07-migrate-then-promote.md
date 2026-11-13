# AG-07: Apply migrations before production goes live

- **IDs closed:** plan PR-16 part 1 (ENG-06)
- **Milestone:** M1 Platform safety
- **Depends on:** AG-03 and AG-05 (all edit `ci.yml`; run in that order). Owner must add three GitHub secrets before merge (below).
- **Size:** M
- **Parallel-safe:** no (edits `ci.yml` and `apps/web/vercel.json`)
- **Needs owner action:** yes (free Vercel token and secrets). No paid plan.

## Why
Vercel builds and promotes `main` on its own, while `deploy-supabase` applies migrations in GitHub Actions. New code can go live before the schema it needs, or a failed migration can leave new code running on an old schema.

## Current state (verified 2026-11-12)
- `.github/workflows/ci.yml:283-285`: `deploy-supabase` runs after `build-and-validate` on push to `main`. Nothing waits for it.
- `apps/web/vercel.json` has only `framework` and `regions: ["bom1"]`. No `git.deploymentEnabled` setting, so the Vercel Git integration deploys every push to `main` to production.
- No workflow calls the Vercel CLI.

## Files in scope
- `.github/workflows/ci.yml` (new job `deploy-vercel`, `needs: deploy-supabase`)
- `apps/web/vercel.json`
- `docs/DEPLOYMENT.md` (release order section)

## Out of scope
- Preview deployments for pull requests (keep the Git integration for previews).
- Staging databases (owner decision, see ROADMAP).
- Any change to which migrations apply.

## Steps
1. Read the current Vercel docs for `vercel.json` `git.deploymentEnabled` and for deploying with the Vercel CLI from GitHub Actions (`vercel pull`, `vercel build --prod`, `vercel deploy --prebuilt --prod`). Confirm each works on the Hobby (free) plan and say so in your plan with the doc link.
2. In `apps/web/vercel.json`, disable Git-triggered deployments for `main` only, so pull request previews still build.
3. Add job `deploy-vercel` with `needs: [deploy-supabase]`, same `if:` as `deploy-supabase`, `permissions: contents: read`. Pin the Vercel CLI version (`npx vercel@<exact version>` or install a pinned version). Secrets as step-level env only: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`.
4. Fail loudly if any of the three secrets is missing (copy the pattern in `ci.yml:309-320`).
5. After deploy, curl `https://prodily.app/api/health` and fail if it is not 200.
6. Document the release order and the owner steps in `docs/DEPLOYMENT.md`: create a Vercel token scoped to the project, add the three secrets, then merge. Include how to roll back (promote the previous deployment in the Vercel dashboard).

## Owner steps (write them into your report)
- Vercel > Account Settings > Tokens: create a token. Copy org and project ids from `.vercel/project.json` after `vercel link`, or from Project Settings.
- GitHub > Settings > Secrets: add `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`.
- Merge only after the secrets exist, or the first `main` push will not deploy.

## Acceptance checks
- `git grep -n -A3 -e deploy-vercel -- .github/workflows/ci.yml` shows `needs: [deploy-supabase]` (or `needs: deploy-supabase`).
- `git grep -n -e deploymentEnabled -- apps/web/vercel.json` shows `main: false`.
- `git grep -n -e VERCEL_TOKEN -- .github/workflows/ci.yml` hits are under step-level `env:` only.
- From `apps/web`: `npx vitest run lib/__tests__/complete-consent-page.test.ts` passes (it reads `docs/DEPLOYMENT.md`).
- Real proof: after the owner merges, the Actions run shows `deploy-supabase` then `deploy-vercel` green, and Vercel shows the production deployment created by the CLI.

## Safety
- Never run `git push`, any `supabase` command, `vercel deploy`, or anything against production yourself.
- Do not edit `audit/`, `08-IMPLEMENTATION-PLAN.md`, `content/` or `backups/`. Never read `.env*` files.
- Do not start a dev server. Do not run the full `npm test` or `npm run build`.
- No em-dashes in comments or docs.

Start by producing an Implementation Plan artifact for review. Do not edit files until it is approved.

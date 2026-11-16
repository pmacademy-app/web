---
name: verify
description: "Run the focused verification sequence for a Prodily change before handing it back: changed-file tests, typecheck, lint, the guard script, and a short report. Use at the end of every task and before the user opens a pull request."
---

# Verify a change

Run these steps in order from `apps/web`. Stop and report if a step fails. Do not start a dev server. Do not run the full `npm test` or `npm run build`: they time out locally and CI runs them. Never run any `supabase` or `vercel` command.

On this Windows machine the agent terminal is PowerShell 5.1: there is no `grep`, `sed` or `bash` on the PATH. Every command below works in PowerShell as written (`git`, `npm`, `npx`, `node`).

## 1. See what changed
```
git status --short
git diff --stat
```
List the changed and new files. Every file must be inside the task's "Files in scope". Flag anything outside it.

## 2. Run the tests that cover the change
- For each changed source file, find the tests that mention it:
  `git grep -l -e <file name or main export> -- lib/__tests__ components/__tests__`
  (add `--untracked` to include test files you just created)
- Run them, plus any new test files: `npx vitest run <test files>`
- New `.tsx` tests must live in `components/__tests__/` (vitest only collects `lib/__tests__/**/*.test.ts` and `components/__tests__/**/*.test.tsx`).
- Run the matching `npm run test:<area>` script if one exists (for example `test:rls`, `test:auth`, `test:email`, `test:a11y`, `test:seo`).
- If a migration, doc or pinned path changed, also run the pinned tests listed in `.agents/rules/testing.md`.

## 3. Types and lint
```
npm run typecheck
npm run lint
```

## 4. Guard script
```
node ../../scripts/agent/check-guards.mjs
```
It must print `guards: OK`. It fails, with the file and line, on:
- a new, edited, renamed, deleted or staged top-level `supabase/migrations/*.sql` (new SQL belongs in `pending-approval/`);
- an em-dash in any added line or untracked text file;
- a new Tailwind `dark:` class in `apps/web` (`.ts`, `.tsx`, `.css`);
- any path under `backups/` or any `.env*` file other than `apps/web/.env.example`, tracked or untracked.

Then check by eye that each new held migration has both companions:
```
git -C ../.. status --short -- supabase/migrations/pending-approval
```

## 5. Report
- What changed, one bullet per file group.
- Each command you ran and its real result line (for example `Tests 14 passed (14)`, `typecheck: 0 errors`, `guards: OK`).
- Acceptance checks from the task brief: pass or fail, each with evidence.
- Anything left for the owner (dashboard steps, held migrations to run, secrets to add).
- Never claim a check passed if you did not run it.

Do not run `git push` or open the pull request. The user does that.

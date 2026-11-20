# Prodily agent guide

Always-on project guide for any coding agent (Antigravity, Claude Code, others).

## Stack and layout
- App: `apps/web` (Next 16.4.6, React 19, Supabase, zod 4, vitest 4, Playwright, ESLint 10 with rules in `apps/web/eslint-rules/`). The root `package.json` only proxies scripts.
- Next 16 differs from your training data. Read the guide in `apps/web/node_modules/next/dist/docs/` before writing Next code.
- Database: `supabase/migrations/` plus `rollback/`, `validation/`, `pending-approval/`.
- Content: `content/` (lessons, glossary) compiled by `scripts/compiler`.

## Where to read
- `docs/ROADMAP.md`: what is left and in what order.
- `tasks/antigravity/`: one brief per task. Do only what your brief says.
- `docs/INDEX.md`: map of all docs. `08-IMPLEMENTATION-PLAN.md` and `audit/`: finding IDs (read only).

## Verify (run from `apps/web`)
- The agent terminal on Windows is PowerShell 5.1: no `grep` or `bash`. Use `git grep`, `npm`, `npx`, `node`.
- `npx vitest run <test file>` for the files you touched.
- `npm run typecheck` and `npm run lint`.
- `node ../../scripts/agent/check-guards.mjs` must print `guards: OK`.
- Full `npm test` and `npm run build` time out locally. CI runs them.

## Hard guardrails
- Never run `git push`, `git clean`, `git reset --hard` or `git checkout --`.
- Never run any `supabase` command: the local CLI is linked to production. The owner runs local stacks.
- Never delete directories (`rm -rf`, `rd`, `rmdir`, `Remove-Item -Recurse`).
- Every top-level `.sql` in `supabase/migrations/` is applied to production on merge to `main`. New migrations go in `supabase/migrations/pending-approval/` with `pending-approval/rollback/<name>.down.sql` and `pending-approval/validation/<name>_validation.sql`.
- Never read, copy or commit `backups/` or any `.env*` file.
- Never start a dev server unless the user asks in that message.
- Some tests pin file paths or doc text. If you move or delete something, run the tests that mention it (`.agents/rules/testing.md`).

## Owner decisions (binding)
- Email verification stays OFF. Shipped features have flags ON by default.
- Zero budget: free tiers only. No paid plans, tools or services.
- No AI grader. No dark mode.
- No em-dashes anywhere you write: copy, comments, docs, commit text. Use a comma, colon or full stop.
- The capstone threshold experiment stays off until product signs off.

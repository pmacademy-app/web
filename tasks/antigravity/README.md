# Antigravity task briefs

Each `AG-XX-<slug>.md` file in this folder is one self-contained task for one Antigravity Agent conversation and one pull request. The order, dependencies and owner steps are in [`docs/ROADMAP.md`](../../docs/ROADMAP.md).

## One-time setup

1. Open `D:\Prodily` as the workspace (the repository root, so `AGENTS.md` and `.agents/` load).
2. **Know the shell.** On this Windows machine Antigravity's agent terminal is PowerShell 5.1. There is no `grep`, `sed` or `bash` on the PATH. Every check in the briefs is written to work there: `git grep`, `git status`, `npm`, `npx`, `node`, and the guard script `node ../../scripts/agent/check-guards.mjs` (run from `apps/web`). Note: `git grep` only searches tracked files. When a check must cover files the task created, add `--untracked` to the command or run `git add -N <new files>` first.
3. **Primary safety: review every command.** Settings > Agent:
   - Mode for new conversations: **Planning**.
   - Plan Review Policy: **Request review** (the agent stops for your approval before editing).
   - Terminal command policy: **Request review**, so the agent asks before every command. Never Turbo, never Auto. Read each command before you approve it. There are documented cases of agents wiping a Windows drive with `rmdir /s /q`.
4. **Secondary safety: a best-effort deny list.** Add these terminal deny rules. They are anchored to the start of the command so they do not block the briefs' own checks (for example `git grep -e supabase` or a path containing `vercel`). Two limits: a chained command (`cd ..; npx supabase db push`) can slip past them, and how Antigravity matches these patterns is not confirmed in its docs. That is why step 3 is the real control.
   - `command(regex:^\s*(npx\s+(--?\S+\s+)*)?supabase(\s|$))`
   - `command(regex:^\s*(npx\s+(--?\S+\s+)*)?vercel(\s|$))`
   - `command(regex:^\s*git\s+push\b)`
   - `command(regex:^\s*git\s+clean\b)`
   - `command(regex:^\s*git\s+reset\s+--hard\b)`
   - `command(regex:^\s*git\s+checkout\s+--(\s|$))`
   - `command(regex:^\s*(rd|rmdir)\s)`
   - `command(regex:^\s*Remove-Item\b.*-Recurse)`
   - `command(regex:^\s*del\s+/s)`
   - `command(regex:^\s*(npm\s+run\s+dev|npx\s+next\s+(dev|start))\b)`
   - File writes: `write_file(.git/)`, `write_file(regex:(^|/)\.env(\..*)?$)`, `write_file(backups/)`
   `supabase/.temp/linked-project.json` exists, so the local Supabase CLI is linked to production: no agent ever runs `supabase`. If you want a local database, run `npx supabase start` and `npx supabase test db` yourself.
5. Start a new conversation and ask: "List every rule, skill and AGENTS.md file you have loaded for this workspace." You should see `AGENTS.md`, `.agents/rules/db-migrations.md`, `.agents/rules/testing.md`, `.agents/rules/copy-style.md` and the `verify` skill. If one is missing, restart the agent manager and ask again.

## How to run one task

1. Pick the next task from the waves below. Check its "Depends on" line and any owner step first.
2. Create the branch yourself:
   ```
   git switch main
   git pull
   git switch -c ag/<id>-<slug>
   ```
   For example `git switch -c ag/03-ci-supply-chain`.
3. New Agent conversation in Planning mode. Paste: "Do the task in `tasks/antigravity/AG-XX-<slug>.md`. Read `AGENTS.md` first." (or attach the file with `@`).
4. Review the Implementation Plan artifact. Check the file list matches "Files in scope". Push back on anything that touches production, adds or edits a top-level migration, or adds a paid service.
5. Approve terminal commands one by one. Reject anything outside `apps/web` tests, typecheck, lint, `git grep`, `git status` and the guard script unless the brief asks for it.
6. When the agent says it is done, run `/verify` in the same conversation. Every acceptance check needs real output, and the guard script must print `guards: OK`.
7. Review the diff yourself (`git diff main`), commit with a Conventional Commit message, push, and open the pull request. CI runs the full test suite and the build.
8. Do any owner steps the brief lists, then merge.

One task per conversation. Start a fresh conversation for the next task.

## Order of execution

A wave starts when the waves before it are merged. Inside a wave, tasks can run in parallel branches unless the note says otherwise.

| Wave | Tasks | Notes |
|---|---|---|
| 1 | AG-01, AG-02, AG-03, AG-09, AG-14, AG-17 | AG-01, AG-02 and AG-14 all edit `pending-approval/README.md`: merge one at a time and rebase the next. |
| 2 | AG-04, AG-10, AG-12, AG-13 | AG-12 and AG-13 may both add to `pending-approval/README.md`: merge AG-12 first. |
| 3 | AG-05, AG-11, AG-16, AG-22, AG-26 | AG-11 may touch the capstone review route that AG-26 changes: merge AG-26 first, then rebase AG-11. |
| 4 | AG-06, AG-07, AG-18, AG-23, AG-24 | AG-07 after AG-05 (both edit `ci.yml`). If AG-24 adds lesson auto-links, merge AG-23 first. |
| 5 | AG-08, AG-19, AG-25, AG-31 | AG-08 needs owner sign-off on storage. |
| 6 | AG-20, AG-28, AG-29, AG-32 | AG-28 needs product sign-off. AG-28 and AG-29 share the README, held list and types: merge one at a time. Merge AG-20 before AG-29 (settings components). |
| 7 | AG-21, AG-27 | AG-27 also needs the owner to have applied the AG-26 migration. |
| 8 | AG-30 | Last UI task: needs AG-27 and AG-28. |
| Any time after its owner step | AG-15 | Only after the owner re-runs pg_cron with POST and confirms 24 hours of fresh heartbeats. |
| Later | AG-33, AG-34 | Optional backlogs, one item per PR. |

## Files that make tasks conflict

The waves above already keep these apart. If you change the order, never run two tasks from the same line at once.

- `.github/workflows/ci.yml`: AG-03, AG-04, AG-05, AG-07, AG-32.
- `apps/web/proxy.ts`: AG-13, AG-16. `apps/web/lib/api/with-route.ts`: AG-09, AG-13.
- `docs/SECURITY.md`: AG-03, AG-13.
- `apps/web/app/globals.css`: AG-17, AG-18, AG-19.
- `apps/web/components/admin/*`: AG-10, AG-18, AG-20, AG-31.
- `apps/web/components/settings/*` and onboarding forms: AG-12, AG-17, AG-18, AG-19, AG-20, AG-29.
- Fetch-calling components: AG-11, AG-18, AG-19, AG-20.
- Logged-in lesson and capstone UI: AG-27, AG-28, AG-30.
- Public lesson page and compiler: AG-22, AG-23, AG-24 (auto-links only), AG-25, AG-32.
- `supabase/migrations/pending-approval/README.md`: AG-01, AG-02, AG-12, AG-13, AG-14, AG-26, AG-28, AG-29, AG-31, AG-33.
- `supabase/tests/held-migrations.txt` and `apps/web/types/database.ts`: AG-04, AG-26, AG-28, AG-29, AG-31.

Held migration file names are fixed in each brief so they never collide: `20261113000001` (AG-02), `...02` (AG-12), `...03` (AG-13, only if needed), `...04` (AG-26), `...05` (AG-28), `...06` (AG-29), `...07` and `...08` (AG-31), `...10` (AG-33).

## If something goes wrong

- The agent wants to run something you do not understand: say no and ask what it needs.
- The agent edits files outside scope: reject the change and point it at the brief.
- A focused test fails for reasons outside the task: ask the agent to report it, not fix it, and note it in the PR.
- CI fails on the full suite: give the agent the failure output in the same conversation.

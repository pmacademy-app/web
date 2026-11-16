# AG-33: Security backlog (optional, M3)

- **IDs closed:** plan Phase 5 security (SEC-11, SEC-13, SEC-14, SEC-17, SEC-18 code part)
- **Milestone:** M3 Scale and strategy (later, optional)
- **Depends on:** M1 complete
- **Size:** M per item. Do one item per conversation and PR; pick the item when you start.
- **Parallel-safe:** yes, item by item

## Why
Lower-priority hardening from the security audit. None is an open hole today; each narrows what a future bug could expose.

## Current state (verified 2026-11-12)
- CSP is a static header in `apps/web/next.config.ts:61`, not nonce-based.
- `isomorphic-dompurify` is used only for admin email HTML (`apps/web/lib/admin/sanitize-email-html.ts:1-17`), not for `components/capstones/RichEditor.tsx` or `components/ui/MarkdownRenderer.tsx` output.
- Profile writes accept `avatar_url` (`apps/web/app/api/settings/profile/route.ts:20`) with no host allow-list.
- `.gitignore:17-21` ignores several `.env*` names but not every variant.

## Items (one PR each)
1. **SEC-14 sanitize rendered HTML:** DOMPurify on `RichEditor` output before save and on `MarkdownRenderer` output before render; escape the code-fence language. Tests with script, `onerror` and `javascript:` payloads.
2. **SEC-13 avatar allow-list:** accept only URLs on the project's Supabase Storage avatars bucket host and path. Reject others with a clear message. Tests.
3. **SEC-17 data minimisation:** remove user `id` from public payloads (portfolio, leaderboard, search), make public portfolios opt-in for new accounts (check `is_portfolio_public` default), gate the snapshot and cohort reads to the owning learner or admins (find them: `git grep -n -E -e 'snapshot|cohort' -- 'app/api/*route.ts'`), and tighten `contact_messages` and `user_friends` policies through the held migration `supabase/migrations/pending-approval/20261113000010_tighten_contact_friends_policies.sql` with companions.
4. **SEC-11 nonce CSP:** read the Next 16 CSP guide in `node_modules/next/dist/docs/`, add a nonce in the proxy, ship `Content-Security-Policy-Report-Only` first with a free reporting endpoint (reuse AG-09's client-errors route), then switch to enforcing after a clean week (owner decides).
5. **SEC-18 local credentials:** `.gitignore` ignores `.env*` except `.env.example`; docs explain using a local Supabase (`supabase start`) instead of production keys for development. The owner moves their own machine off production keys.

## Files in scope
Only the files named in the chosen item, plus its tests. List them in the plan.

## Acceptance checks (from `apps/web`)
- New focused tests for the item pass; related `npm run test:*` scripts pass (`test:portfolio`, `test:avatar`, `test:contact`, `test:rls` as relevant).
- `npm run typecheck` and `npm run lint` pass.

## Safety
- Never run `git push`, any `supabase` command, or anything against production. The user owns the branch and the pull request.
- Migrations go in `supabase/migrations/pending-approval/` with rollback and validation.
- Do not edit `audit/`, `08-IMPLEMENTATION-PLAN.md`, `content/` or `backups/`. Never read `.env*` files.
- Do not start a dev server. Do not run the full `npm test` or `npm run build`.
- No dark mode. No em-dashes in comments, copy or docs.

Start by producing an Implementation Plan artifact for review. Do not edit files until it is approved.

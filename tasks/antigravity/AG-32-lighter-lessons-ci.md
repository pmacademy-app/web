# AG-32: Lighter public lesson pages, fewer client boundaries, faster CI

- **IDs closed:** plan PR-30 (ENG-12, SEO-12, ENG-14, CQ-19)
- **Milestone:** M2 Growth foundations
- **Depends on:** AG-23 (same lesson page), AG-04 and AG-07 (both edit `ci.yml`)
- **Size:** M (if the client-boundary cleanup grows, ship it as a second PR)
- **Parallel-safe:** no with AG-23 or any task editing `ci.yml`

## Why
Public lesson HTML carries the lesson twice: once as HTML and once as the client component payload (50 to 62 percent of each page). That slows the first view and wastes crawl budget. CI builds the app twice on `main`.

## Current state (verified 2026-11-12)
- `apps/web/renderer/block-tree-renderer.tsx:1` is `'use client'`, so every block it renders ships as client payload.
- Mermaid already renders from a prebuilt SVG (`apps/web/blocks/mermaid/MermaidBlock.tsx:4-5` reads `block.svg`/`block.staticSvg`). Keep it.
- Search index is served by `apps/web/app/api/search-index/route.ts` from compiler JSON.
- About 205 `.tsx` files under `app`, `components`, `blocks`, `renderer` start with `'use client'` (the count moves as other work lands; record your own baseline with the command in the acceptance checks before you change anything).
- CI builds in `build-and-validate` (`.github/workflows/ci.yml:110-111`) and again in `e2e` when no external base URL is set (`:206-209`).

## Files in scope
- `apps/web/renderer/block-tree-renderer.tsx` and a new server renderer for public lessons (for example `renderer/block-tree-server.tsx`)
- Blocks that need no state (text, callouts, tables, images, mermaid): make them server components; keep interactive ones (quiz, flashcards) client-only and lazy
- `apps/web/app/(marketing)/lessons/[slug]/page.tsx`
- Up to about 20 components whose `'use client'` is unnecessary (list each with the reason in the plan)
- `apps/web/app/api/search-index/route.ts` (serve as a static, cacheable asset if the docs allow)
- `.github/workflows/ci.yml` (reuse the build between jobs with `actions/upload-artifact` and `download-artifact`, or make `e2e` depend on `build-and-validate`)
- Tests: `npm run test:perf`, `lib/__tests__/b12b-marketing-server-components.test.ts`, `npm run test:seo`, new `lib/__tests__/eng12-lesson-payload.test.ts`

## Out of scope
- The logged-in lesson page in `app/(app)/academy` (later).
- Removing marketing sections pinned by tests (AG-34).

## Steps
1. Read the Next 16 docs on server and client components and on caching in `node_modules/next/dist/docs/`.
2. Measure first: write a test or script that renders one public lesson and reports HTML size and the share that is RSC payload. Put the baseline number in the plan.
3. Build the server renderer and use it on the public lesson page. Interactive blocks stay client components, loaded only where present.
4. Remove unnecessary `'use client'` (components with no hooks, no event handlers, no browser APIs). Check each against `b12b-marketing-server-components.test.ts`.
5. CI: build once and reuse it for E2E. Keep `deploy-supabase` `needs:` unchanged.
6. Re-measure and report before and after.

## Acceptance checks (from `apps/web`)
- `npx vitest run lib/__tests__/eng12-lesson-payload.test.ts lib/__tests__/b12b-marketing-server-components.test.ts` passes; payload share drops (state the numbers).
- `npm run test:perf`, `npm run test:seo` pass.
- `git grep -l -e '^.use client.' -- 'app/*.tsx' 'components/*.tsx' 'blocks/*.tsx' 'renderer/*.tsx'` lists fewer files than the baseline you recorded at the start (count the lines).
- `git grep -n -F -e 'npm run build' -- ../../.github/workflows/ci.yml` shows one build per workflow run on `main`.
- `npm run typecheck` and `npm run lint` pass.

## Safety
- Never run `git push`, any `supabase` command, or anything against production. The user owns the branch and the pull request.
- Do not edit `audit/`, `08-IMPLEMENTATION-PLAN.md`, `content/` or `backups/`. Never read `.env*` files.
- Do not start a dev server. Do not run the full `npm test` or `npm run build`.
- No dark mode. No em-dashes in comments, copy or docs.
- Before writing Next.js code, read the matching guide in `apps/web/node_modules/next/dist/docs/`.

Start by producing an Implementation Plan artifact for review. Do not edit files until it is approved.

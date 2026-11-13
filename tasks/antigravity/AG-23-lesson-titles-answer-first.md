# AG-23: Search-shaped lesson titles and an "In short" answer on public lessons

- **IDs closed:** plan PR-22 (SEO-05, AEO-02); PR-23 last bullet (prerequisite and "builds toward" blocks)
- **Milestone:** M2 Growth foundations
- **Depends on:** AG-22
- **Size:** M (code plus the first 20 lessons; the other 70 follow as content-only PRs)
- **Parallel-safe:** no with AG-22, AG-24, AG-32 (lesson page and compiler)
- **Needs owner sign-off:** yes, on every new title, description and answer (content voice and accuracy)

## Why
Public lesson titles read "Lesson 29: ..." and descriptions repeat the title. Searchers and AI answer engines look for answers to questions like "What is a PRD?" or "RICE vs MoSCoW". A short, direct answer at the top of each public lesson is what gets quoted.

## Current state (verified 2026-11-12)
- `apps/web/app/(marketing)/lessons/[slug]/page.tsx:45` builds `pageTitle = \`Lesson ${globalOrder}: ${lesson.title}\``; `:46` description is "Read Lesson N of ... (Module: ...)".
- 90 lesson sources in `content/lessons/lesson-001.md` to `lesson-090.md`. Each starts with a `# Lesson N: Title` heading and a "Learning Path" table; no front matter for SEO title, description or a short answer.
- `content/dist/curriculum.json` lessons carry `title` but no SEO fields.
- The compiler lives in `scripts/compiler/` (`npm run test:compiler`, `npm run content:build`).

## Files in scope
- `scripts/compiler/*` (parse optional `seoTitle`, `seoDescription`, `inShort` fields; validate lengths)
- `apps/web/app/(marketing)/lessons/[slug]/page.tsx` and the component that renders the public lesson
- `content/lessons/lesson-001.md` to the 20 lessons the owner picks (this task may edit `content/` for those fields only)
- Tests: `npm run test:compiler`, `npm run test:seo`, new `apps/web/lib/__tests__/seo05-lesson-titles.test.ts`

## Out of scope
- Rewriting lesson bodies. Quizzes, flashcards and capstones stay behind sign-in.
- The other 70 lessons (follow-up content PRs with the same mechanism).

## Steps
1. Ask the owner which 20 lessons to do first; suggest the ones with clear search demand (PRD, RICE, MoSCoW, North Star metric, user stories, A/B testing, roadmap, PM vs project manager and similar) and list them in the plan.
2. Compiler: accept the three optional fields (front matter or a fenced block, whichever the compiler already supports; read it first). Enforce `seoTitle` up to 60 characters, `seoDescription` 120 to 160, `inShort` 40 to 80 words. Fail the build on a field outside its limit; allow missing fields.
3. Page: title is `seoTitle` or `lesson.title` (no "Lesson N:" prefix); keep the lesson number visible in the breadcrumb and URL only. Description is `seoDescription` or the first sentence of the lesson. Render an "In short" box at the top with `inShort` when present. Show key terms, the cheat sheet and interview questions publicly if they are already in the compiled lesson; keep interactive parts gated.
4. Draft the 20 sets of fields in plain, short sentences, no em-dashes, no claims the lesson does not support. Present them in the plan table for owner approval before writing them.
5. Prerequisites: on the public lesson, show "Before this" links from the compiled `prerequisites` field and "Builds toward" links from a reverse lookup over all lessons. Server-rendered, no new data.
6. Tests: titles have no "Lesson N:" prefix; limits enforced; "In short" renders server-side; prerequisite and builds-toward links match `content/dist/curriculum.json`.

## Acceptance checks (from `apps/web`)
- `npm run test:compiler` and `npm run test:seo` pass; `npx vitest run lib/__tests__/seo05-lesson-titles.test.ts` passes.
- `npm run content:build` succeeds.
- `git grep -n -F -e 'Lesson ${globalOrder}:' -- ':(literal)app/(marketing)/lessons/[slug]/page.tsx'` prints nothing.
- `node ../../scripts/agent/check-guards.mjs` prints `guards: OK` (no em-dash in any added line, including `content/lessons/`).
- `npm run typecheck` and `npm run lint` pass.

## Safety
- Never run `git push`, any `supabase` command, or anything against production. The user owns the branch and the pull request.
- Edit only the approved fields in the approved `content/lessons/` files. Do not edit `audit/`, `08-IMPLEMENTATION-PLAN.md` or `backups/`. Never read `.env*` files.
- Do not start a dev server. Do not run the full `npm test` or `npm run build`.
- No dark mode. No em-dashes in copy, comments or docs.
- Before writing Next.js code, read the matching guide in `apps/web/node_modules/next/dist/docs/`.

Start by producing an Implementation Plan artifact for review. Do not edit files until it is approved.

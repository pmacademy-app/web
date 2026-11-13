# AG-30: App UX second pass: reading column, clear locks, one "Up next", visible failures

- **IDs closed:** plan PR-28 (UX-08, UX-09, UX-11, UX-15)
- **Milestone:** M2 Growth foundations
- **Depends on:** AG-18, AG-19, AG-20, AG-27 and AG-28 merged (AG-27 removes the capstone `alert(` this task checks; AG-28 changes the lesson UI)
- **Size:** M (if the diff passes about 25 files, split lesson page and dashboard into two PRs)
- **Parallel-safe:** no; run it last among the UI tasks

## Why
Lesson text runs too wide and mixes sizes and callout styles. Lock messages use internal language. The dashboard has several competing calls to action. Failures show `alert()` boxes or nothing at all.

## Current state (verified 2026-11-12)
- Lesson body: `apps/web/app/(app)/academy/[moduleSlug]/[lessonId]/lesson-content.tsx` (about 830 lines). No `68ch`/`max-w-prose` on the reading column; widths found are `max-w-md`/`max-w-lg` for small blocks (`:410`, `:729`, `:810`).
- Theory gate copy: `lesson-content.tsx:396` "Theory section completed. Quiz is now unlocked!"; comment at `:132` on flashcard unlock.
- Dashboard: `apps/web/app/(app)/dashboard/page.tsx:159` computes the next lesson; `:276-277` renders `ContinueLearningCard`, followed by other CTAs. No `h1` in the page file (AG-19 adds one).
- `alert()` in learner UI: `lesson-content.tsx:796` and `apps/web/app/(app)/capstones/[module]/page.tsx:184` (AG-27 removes the second).
- Only admin has a toast component (`components/admin/admin-toast.tsx`). Learner routes share one `apps/web/app/(app)/loading.tsx`.
- The onboarding resolver that decides the first lesson lives in the onboarding and academy code (find it: `git grep -n -e resolve -- lib/academy 'lib/onboarding*'`).

## Files in scope
- `lesson-content.tsx` and the block renderers it uses for body text and callouts (`apps/web/blocks/`, `apps/web/renderer/`)
- Lock and gate messages in the academy pages and `components/academy/`
- `apps/web/app/(app)/dashboard/page.tsx` and `apps/web/components/dashboard/*`
- A learner toast (reuse `admin-toast.tsx` logic or the existing base-ui primitives) in `apps/web/components/ui/`
- Route-shaped `loading.tsx` for `dashboard`, `academy`, `progress`
- Tests: `npm run test:dashboard`, `npm run test:a11y`, `lib/__tests__/b11c-raw-button-rule.test.ts`, new `components/__tests__/ux-second-pass.test.tsx`

## Out of scope
- Mastery states (AG-28) and weekly goal (AG-29).
- New colours or dark mode.

## Steps
1. Reading column: max width `68ch` for lesson prose, one body size, line height about 1.6. Exactly three callout styles (note, tip, warning) mapped to tokens; list the current variants and the mapping in the plan.
2. Lock copy: plain sentences that say what unlocks it ("Read the lesson to unlock the quiz."), shown on the locked tab and in a hint, never internal terms.
3. Dashboard: one primary "Up next" card driven by the same resolver onboarding uses; secondary actions become plain links below it.
4. Replace both `alert()` calls in scope with the toast; add toasts on silent failures you find in these files (catch blocks that only `console.error`).
5. Skeletons: `loading.tsx` per route that mirrors the page layout.
6. Copy follows `.agents/rules/copy-style.md`. Show every changed string in a before and after table in the plan.

## Acceptance checks (from `apps/web`)
- `npx vitest run components/__tests__/ux-second-pass.test.tsx` passes (one primary CTA; lock hint text; no `alert(`).
- `npm run test:dashboard`, `npm run test:a11y`, `npx vitest run lib/__tests__/b11c-raw-button-rule.test.ts` pass.
- `git grep -n -F -e 'alert(' -- 'app/*.tsx' 'components/*.tsx' ':!*__tests__*'` prints nothing.
- `npm run typecheck` and `npm run lint` pass.

## Safety
- Never run `git push`, any `supabase` command, or anything against production. The user owns the branch and the pull request.
- Do not edit `audit/`, `08-IMPLEMENTATION-PLAN.md`, `content/` or `backups/`. Never read `.env*` files.
- Do not start a dev server. Do not run the full `npm test` or `npm run build`.
- No dark mode. No em-dashes in copy, comments or docs.
- Before writing Next.js code, read the matching guide in `apps/web/node_modules/next/dist/docs/`.

Start by producing an Implementation Plan artifact for review. Do not edit files until it is approved.

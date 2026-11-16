# AG-17: Remove the unused dark mode

- **IDs closed:** plan PR-20 part 1 (UX-20, owner decision D9: remove)
- **Milestone:** M1 Platform safety
- **Depends on:** none
- **Size:** M (mostly mechanical)
- **Parallel-safe:** no with AG-18 (same files); run AG-17 first

## Why
Dark mode was never switched on: there is no theme provider and nothing adds the `dark` class. The `.dark` tokens and about 150 `dark:` classes are dead weight that confuse every colour change and inflate the colour audit in AG-18.

## Current state (verified 2026-11-12)
- `apps/web/app/globals.css:8-9` header says dark tokens are "defined but NOT activated"; `:17` `@custom-variant dark (&:is(.dark *));`.
- `.dark` token block: `globals.css:124-197` (comment at `:124-127` says "Do not delete"; that instruction is superseded by D9).
- Second `.dark` block for shadows: `globals.css:670-678`.
- `&:where(.dark *)` overrides inside utilities: `globals.css:755` (`glare`) and `:879` (`band-deep`, comment at `:864-866`).
- `apps/web/theme/tokens.ts:21-31` `TOKENS.colors.dark` palette. No code reads `colors.dark` (`git grep -n -e colors.dark` finds no use outside the file).
- 150 `dark:` class occurrences in 60 `.tsx` files under `app`, `components`, `blocks`, `renderer` (`git grep -c -e 'dark:' -- 'app/*.tsx' 'components/*.tsx' 'blocks/*.tsx' 'renderer/*.tsx'` gives per-file line counts). Example: `apps/web/app/(app)/academy/page.tsx:449` `text-emerald-600 dark:text-emerald-400`.
- `next-themes` is not a dependency. No test references `.dark` or `dark:` (`git grep -l -e 'dark:' -- lib/__tests__` prints nothing).
- The admin console has its own dark-looking palette, scoped to `.admin-console` (`globals.css` `--admin-*` variables around `:224`, `TOKENS.colors.admin` in `theme/tokens.ts`). That is the admin UI design, not dark mode. Keep it.
- `docs/DESIGN_SYSTEM.md:19` documents `TOKENS.colors.dark`.

## Files in scope
- `apps/web/app/globals.css`
- `apps/web/theme/tokens.ts`
- The 60 `.tsx` files with `dark:` classes (list them in your plan)
- `docs/DESIGN_SYSTEM.md` (remove the dark palette section, say dark mode is not supported)
- New test `apps/web/lib/__tests__/ux20-no-dark-mode.test.ts`

## Out of scope
- Replacing raw palette colours with tokens (AG-18). Only delete `dark:` variants here; leave the light class beside it untouched.
- The `.admin-console` palette and `--admin-*` variables.

## Steps
1. Write the guard test first: fails if `globals.css` contains `.dark` or `@custom-variant dark`, if `theme/tokens.ts` has a `dark:` key in `colors`, or if any `.tsx` under `app`, `components`, `blocks`, `renderer` contains a `dark:` class.
2. Remove the `.dark` blocks, the custom variant, the two `&:where(.dark *)` overrides, and the header and section comments that promise a dark sprint. Keep the light values exactly as they are.
3. Remove `TOKENS.colors.dark`.
4. Remove every `dark:` class with a script you show in the plan (regex on class strings only). Review the diff by hand for template literals and `cn()` calls where removal could leave double spaces or empty strings.
5. Update `docs/DESIGN_SYSTEM.md`.

## Acceptance checks (from `apps/web`)
- `npx vitest run lib/__tests__/ux20-no-dark-mode.test.ts` passes.
- `git grep -n -e 'dark:' -- 'app/*.tsx' 'components/*.tsx' 'blocks/*.tsx' 'renderer/*.tsx'` prints nothing.
- `git grep -n -e '\.dark' -e 'custom-variant dark' -- app/globals.css` prints nothing.
- `npm run test:a11y` passes.
- `npm run typecheck` and `npm run lint` pass.
- The CI "Brand hardening check" stays green (no new hex values outside `theme/tokens.ts`).

## Safety
- Never run `git push`, any `supabase` command, or anything against production. The user owns the branch and the pull request.
- Do not edit `audit/`, `08-IMPLEMENTATION-PLAN.md`, `content/` or `backups/`. Never read `.env*` files.
- Do not start a dev server. Do not run the full `npm test` or `npm run build`.
- No em-dashes in comments, copy or docs.
- Before writing Next.js code, read the matching guide in `apps/web/node_modules/next/dist/docs/`.

Start by producing an Implementation Plan artifact for review. Do not edit files until it is approved.

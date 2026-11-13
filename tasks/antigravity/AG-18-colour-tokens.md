# AG-18: Colour tokens instead of raw palette classes, with a lint rule

- **IDs closed:** plan PR-20 part 2 (UX-04, UX-03)
- **Milestone:** M1 Platform safety
- **Depends on:** AG-17, plus AG-10, AG-11 and AG-12 merged (they edit admin, settings and fetch-calling components this task recolours)
- **Size:** M (scripted codemod plus review; if the diff passes about 60 files, split learner app and admin into two PRs)
- **Parallel-safe:** no with AG-10, AG-11, AG-12, AG-17, AG-19, AG-20, AG-29, AG-30, AG-31

## Why
Raw `emerald/amber/blue/purple-400/500` text fails 4.5:1 contrast on the cream background. shadcn variables still use stock greys, and amber sits in the `accent` slot, so neutral buttons glow orange. Nothing stops new raw colours.

## Current state (verified 2026-11-12, before AG-17)
- 253 matches of `text-(emerald|amber|blue|purple)-(4|5)00` in 85 `.tsx` files (some are `dark:` variants that AG-17 removes). Biggest groups: `components/dashboard` (11 files), `components/admin` (10), `components/settings` (8), `components/portfolio` (6), `app/(app)` (6), `components/capstones` (5).
- 9 uses of `text-locked` in `.tsx` files.
- Semantic tokens exist in `apps/web/app/globals.css:44-53`: `--color-success`, `--color-warning`, `--color-info`, `--color-ai` and their `-bg` pairs.
- shadcn variables (`--sidebar-*`, `--accent` and others) use `oklch` greys around `globals.css:100-123`.
- No lint rule for raw colours. Custom rules live in `apps/web/eslint-rules/` and are registered in `apps/web/eslint.config.mjs`.

## Files in scope
- `.tsx` files under `app`, `components`, `blocks`, `renderer` that use the raw text colours or `text-locked`
- `apps/web/app/globals.css` (shadcn variable remap, `--color-destructive-foreground` if missing)
- `apps/web/eslint-rules/no-raw-palette-text.mjs` (new), `apps/web/eslint.config.mjs`
- Tests: a rule test next to the existing rule tests (`git grep -l -e no-raw-button -- lib/__tests__`), `npm run test:a11y`
- `docs/DESIGN_SYSTEM.md` (token usage table)

## Out of scope
- Backgrounds and borders (`bg-emerald-500/10` and similar) unless the same element's text changes and contrast needs it. Note them for AG-34.
- `.admin-console` scoped variables.
- Dialogs, focus, landmarks (AG-19, AG-20).

## Steps
1. Map each raw class to a token: emerald to `text-success`, amber to `text-warning`, blue to `text-info`, purple to `text-ai` (confirm the Tailwind v4 utility names that `@theme` generates in `globals.css`). `text-locked` used for body text becomes `text-ink-muted`.
2. Run the codemod as a script you show in the plan. Then review the diff file by file: icons inside coloured chips may need the token too; decorative uses may stay if they are not text.
3. Remap shadcn variables to brand tokens and give `--accent` a neutral value; keep amber as its own `--color-warning`. List every variable changed with old and new values.
4. Add `no-raw-palette-text`: flags `text-{emerald,amber,blue,purple,green,red,yellow}-{300..600}` in class strings in `app`, `components`, `blocks`, `renderer`. Allowlist with a reason only where unavoidable.
5. Contrast: compute the ratio for each token on `--color-background` and `--color-surface`; all body-text tokens at least 4.5:1. Put the numbers in your report and in `docs/DESIGN_SYSTEM.md`.

## Acceptance checks (from `apps/web`)
- `git grep -n -E -e 'text-(emerald|amber|blue|purple)-(4|5)00' -- 'app/*.tsx' 'components/*.tsx' 'blocks/*.tsx' 'renderer/*.tsx'` prints nothing (or only allowlisted lines).
- `git grep -n -e text-locked -- 'app/*.tsx' 'components/*.tsx' 'blocks/*.tsx'` shows no body-text use.
- `npm run lint` passes with the new rule at `error`.
- `npm run test:a11y` and the rule test pass.
- `npm run typecheck` passes. CI brand hex check stays green.

## Safety
- Never run `git push`, any `supabase` command, or anything against production. The user owns the branch and the pull request.
- Do not edit `audit/`, `08-IMPLEMENTATION-PLAN.md`, `content/` or `backups/`. Never read `.env*` files.
- Do not start a dev server. Do not run the full `npm test` or `npm run build`.
- No dark mode. No em-dashes in comments, copy or docs.
- Before writing Next.js code, read the matching guide in `apps/web/node_modules/next/dist/docs/`.

Start by producing an Implementation Plan artifact for review. Do not edit files until it is approved.

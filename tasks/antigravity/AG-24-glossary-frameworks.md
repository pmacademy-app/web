# AG-24: Glossary hub and the first framework pages

- **IDs closed:** plan PR-23 (SEO-04 hub part, SEO-11)
- **Milestone:** M2 Growth foundations
- **Depends on:** AG-22
- **Size:** M (glossary hub plus 10 framework pages; auto-linking is optional and can be a follow-up)
- **Parallel-safe:** no with AG-23 (lesson page) if you do auto-linking; otherwise yes
- **Needs owner sign-off:** yes, on the 10 frameworks and their attribution text

## Why
479 glossary terms exist but no page exposes them, so `/glossary` only redirects. Definition pages and framework pages are what people search for and what AI answers cite.

## Current state (verified 2026-11-12)
- `apps/web/app/(marketing)/glossary/page.tsx` calls `permanentRedirect('/frameworks')`. `apps/web/lib/__tests__/seo-glossary-redirect.test.ts` pins that redirect.
- `content/master_glossary.json` has 479 entries shaped `{ term, definition, ... }`. Some terms are long labels such as `"Acceptance Criteria Written After the Fact" (Failure Pattern)`.
- `apps/web/app/(marketing)/frameworks/page.tsx` is one page; it already credits sources (for example `:47` IDEO for desirability, feasibility, viability). There are no `/frameworks/[slug]` pages.
- Sitemap: `apps/web/app/sitemap.ts` lists `/frameworks` and no glossary URL.

## Files in scope
- `apps/web/app/(marketing)/glossary/page.tsx` (becomes the hub)
- `apps/web/app/(marketing)/frameworks/[slug]/page.tsx` (new) and a small data file for the 10 frameworks, for example `apps/web/config/frameworks.ts`
- `apps/web/lib/schema.ts` (`DefinedTermSet`, `DefinedTerm`)
- `apps/web/app/sitemap.ts`
- Tests: replace `lib/__tests__/seo-glossary-redirect.test.ts` with `seo04-glossary-hub.test.ts`; new `seo11-framework-pages.test.ts`; `npm run test:seo`

## Out of scope
- Editing `content/master_glossary.json` (read only). Report bad entries instead.
- Per-term pages (later; the hub uses anchors).
- Lesson auto-linking unless the plan shows it fits; then keep it to "Lesson N" mentions only.

## Steps
1. Glossary hub: server-rendered A to Z index with a letter nav, each term an anchor (`#slug`), definition text, and a link to the lesson that teaches it if the data has one. Strip the "(Failure Pattern)" style suffix into a small label. `DefinedTermSet` JSON-LD with all terms.
2. Remove the redirect, add `/glossary` to the sitemap, and link it from the footer and `/frameworks`.
3. Framework pages: propose 10 (for example RICE, MoSCoW, Kano, Jobs to Be Done, North Star metric, HEART, AARRR, Opportunity Solution Tree, Desirability/Feasibility/Viability, OKRs) with one-paragraph summaries, when to use, a worked mini example, the source credit, and links to the lessons that cover it. Owner approves the list and text in the plan.
4. `generateStaticParams` for the 10 slugs; metadata with real titles; `Article` or `LearningResource` JSON-LD with `citation` for the source.
5. Tests: hub renders 479 terms, unique anchors, valid JSON-LD; each framework page has a source credit and is in the sitemap.

## Acceptance checks (from `apps/web`)
- `npx vitest run lib/__tests__/seo04-glossary-hub.test.ts lib/__tests__/seo11-framework-pages.test.ts` passes.
- `npm run test:seo` passes.
- `git grep -n -e permanentRedirect -- 'app/(marketing)/glossary/page.tsx'` prints nothing.
- `git grep -n -e glossary -e frameworks/ -- app/sitemap.ts` shows the new URLs.
- `npm run typecheck` and `npm run lint` pass.

## Safety
- Never run `git push`, any `supabase` command, or anything against production. The user owns the branch and the pull request.
- Do not edit `audit/`, `08-IMPLEMENTATION-PLAN.md`, `content/` or `backups/`. Never read `.env*` files.
- Do not start a dev server. Do not run the full `npm test` or `npm run build`.
- No dark mode. No em-dashes in copy, comments or docs. Never call a third-party framework proprietary.
- Before writing Next.js code, read the matching guide in `apps/web/node_modules/next/dist/docs/`.

Start by producing an Implementation Plan artifact for review. Do not edit files until it is approved.

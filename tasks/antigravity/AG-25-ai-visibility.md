# AG-25: Authority and AI visibility

- **IDs closed:** plan PR-24 (AEO-03, AEO-04, AEO-07; SEO-01 check; AEO-06 stays later)
- **Milestone:** M2 Growth foundations
- **Depends on:** AG-22 and AG-23 (both edit the public lesson page)
- **Size:** M
- **Parallel-safe:** no with AG-23 or AG-32 (lesson page); yes otherwise
- **Needs owner action:** `/about` founder text approval; IndexNow key file is free; monthly AI-answer check is an owner routine

## Why
AI answer engines and search reward pages with a named author, an update date, and a clear crawler policy. Prodily has none of these on lessons, no `llms.txt`, and no way to tell AI referrals apart in analytics.

## Current state (verified 2026-11-12)
- `apps/web/app/robots.ts:8-37` has one rule for `userAgent: '*'`; no named AI crawlers, no stated policy.
- No `llms.txt` route (there is no `apps/web/app/llms.txt/` folder).
- Public lesson page `apps/web/app/(marketing)/lessons/[slug]/page.tsx` shows no author or "updated" date.
- Person schema exists with `@id` `${siteUrl}/#person-aditya` (`apps/web/lib/schema.ts:28`).
- Domain: `apps/web/lib/brand.ts:10` uses `prodily.app`. Plan D1 asked to move from `prodily.adityagangwani.me`; the move looks done in code. Redirects from the old host are a Vercel domain setting (owner).
- Lesson `updatedAt` comes from AG-22.

## Files in scope
- `apps/web/app/robots.ts`
- `apps/web/app/llms.txt/route.ts` (new; check the Next 16 docs for route handlers that serve text at a dotted path)
- `apps/web/app/(marketing)/lessons/[slug]/page.tsx` (byline and updated date) and `apps/web/lib/schema.ts` (`author`, `dateModified`)
- `apps/web/app/(marketing)/about/page.tsx` (founder credentials and editorial process; owner approves the text)
- `scripts/compiler/*` or a small `scripts/indexnow.ts` (optional IndexNow ping, runs only in CI on `main`, never locally)
- `apps/web/lib/analytics.ts` (tag AI referrers such as chat.openai.com, perplexity.ai, gemini.google.com, copilot.microsoft.com, claude.ai as `ai_referral`)
- Tests: `npm run test:seo`, new `lib/__tests__/aeo03-ai-visibility.test.ts`

## Out of scope
- A domain move (code already uses `prodily.app`).
- An original-data report (AEO-06, later).
- Any paid tool for tracking AI answers.

## Steps
1. Robots: keep the current rules and add explicit `allow` entries for named AI crawlers the owner accepts (list them in the plan with each vendor's documented user agent). Do not open any path that is disallowed today.
2. `llms.txt`: plain text, generated from compiled data: what Prodily is, the module list with links, the glossary and frameworks hubs, and how to cite. Cache it like other static marketing data.
3. Lessons: visible "Written by Aditya Gangwani" (confirm the exact name and link with the owner) and "Updated <date>" from `updatedAt`; schema `author` points to the Person `@id`.
4. `/about`: draft founder credentials and a short editorial process (how lessons are written, reviewed and updated). Plain sentences. Owner approves.
5. Analytics: classify AI referrers. Do not store full referrer URLs with query strings.
6. Optional IndexNow: only if the plan shows a free, key-file based ping from CI after deploy. Otherwise list it for later.
7. Owner check for your report: in Vercel > Project > Settings > Firewall (Bot protection and any AI bot rules), confirm the AI crawlers allowed in robots are not blocked or challenged. robots.txt does nothing if the edge blocks them.
8. Write the owner routine into your report: a fixed list of 10 prompts to check monthly in free AI assistants and record whether Prodily is cited.

## Acceptance checks (from `apps/web`)
- `npx vitest run lib/__tests__/aeo03-ai-visibility.test.ts` passes (robots has the new agents and keeps every disallow; `llms.txt` returns text with module links; lesson schema has `author` and `dateModified`; AI referrer classification).
- `npm run test:seo` passes.
- `npm run typecheck` and `npm run lint` pass.

## Safety
- Never run `git push`, any `supabase` command, or anything against production. Do not ping IndexNow or any external service yourself.
- Do not edit `audit/`, `08-IMPLEMENTATION-PLAN.md`, `content/` or `backups/`. Never read `.env*` files.
- Do not start a dev server. Do not run the full `npm test` or `npm run build`.
- No dark mode. No em-dashes in copy, comments or docs.
- Before writing Next.js code, read the matching guide in `apps/web/node_modules/next/dist/docs/`.

Start by producing an Implementation Plan artifact for review. Do not edit files until it is approved.

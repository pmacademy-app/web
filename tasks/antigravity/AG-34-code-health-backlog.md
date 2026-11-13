# AG-34: Code health and UX polish backlog (optional, M3)

- **IDs closed:** plan Phase 5 engineering, UX and code quality (ENG-13, ENG-15, ENG-16, `use cache` migration, UX-16, UX-17, UX-19, UX-21, UX-22, CQ-14 to CQ-18, CQ-20 to CQ-23, CQ-25 to CQ-29, CQ-33 source-text assertions and test-only helpers, the code part of the "What to cut" list in `audit/07-product-improvements.md`)
- **Milestone:** M3 Scale and strategy (later, optional)
- **Depends on:** M1 complete; item 1 after AG-06
- **Size:** S to M per item. One item per conversation and PR.
- **Parallel-safe:** yes, item by item

## Why
None of these is urgent. Together they make the codebase cheaper to change and the app calmer to use. Do them when M1 and the M2 work you choose are done.

## Current state (verified 2026-11-12)
- 26 files use `unstable_cache` (`git grep -l -e unstable_cache -- lib app`).
- `apps/web/hooks/useUsageTimeTracker.ts` is the only copy left (the `lib/hooks/` duplicate from CQ-09 is gone).
- Unused marketing sections pinned by tests: `components/marketing/sections/{experience,journey,journey-timeline}.tsx`, pinned in `lib/__tests__/marketing-homepage-phase0c.test.ts` (around `:106-122`) and `lib/__tests__/b12b-marketing-server-components.test.ts`.
- No `knip` config. Root README quickstart runs `npm install` at the root, which installs nothing (ENG-16).

## Items (one PR each)
1. **CQ-32 / CQ-33 tests:** shrink the console-guard allowlist from AG-06 suite by suite; convert the worst source-text assertions to behaviour tests or ESLint rules; wire up or delete the test-only helpers AG-06 listed (`getXpAmountForSource`, `isUserInReminderWindow`, `isUserInRecapWindow`, `isUserEligibleForWeeklyRecap`, `recordBatchFlashcardReviews`, `isValidQueueStatusTransition`, `upsertUserLessonProgress`).
2. **Dead code with knip:** add `knip` as a dev dependency (ask first), a config that understands Next routes, and a CI step in report mode; delete what it proves unused, including the pinned marketing sections (update the pinned tests in the same PR).
3. **`use cache`:** read the Next 16 caching docs, migrate `unstable_cache` call sites module by module.
4. **CQ-23 / CQ-26 helpers:** one `getSiteUrl`, one `formatDateTime`, one `escapeHtml`, one `fetchAllRows`; delete the copies.
5. **CQ-25 split large files:** `lib/admin/service.ts`, `components/admin/AdminCreateBroadcastModal.tsx`, `app/(app)/academy/[moduleSlug]/[lessonId]/lesson-content.tsx`.
6. **CQ-14 / CQ-15 types:** shrink `as unknown as` and `DBChain` with an ESLint allow-list that only gets shorter.
7. **CQ-16 / CQ-17:** server-load the capstone page; deterministic date formatting in SSR.
8. **UX-16 / UX-17:** mobile settings list, 12px text floor, 44px touch targets; `MotionConfig reducedMotion="user"`, no endless spinners; sidebar collapsed state stored in a cookie so the server renders it correctly (no flash).
9. **UX-19 / UX-21:** voice pass on app copy (remove jargon such as "AST Verified"); regenerate `docs/DESIGN_SYSTEM.md` from tokens.
10. **ENG-13:** `server-only` imports and user-scoped Supabase clients in repositories so RLS is a real second line of defence (design doc first).
11. **CQ-18, CQ-20, CQ-21, CQ-22, CQ-27, CQ-28, CQ-29 and lint warnings:** effect-driven state resets (CQ-18), redundant route-segment config (CQ-20), hooks and React imports in `lib/` (CQ-21), `AdminSystemAlertsView` memo deps (CQ-22), magic numbers duplicating config (CQ-27), remaining dead code (CQ-28), raw control bytes in a source file (CQ-29), and the non-test lint warnings until `npm run lint` prints none. See `audit/05-code-quality-fixes.md:458-590`.
12. **ENG-15 / ENG-16:** zod env schema validated at boot; fix the README quickstart; consider npm workspaces with the compiler as its own package (design doc first).

## Files in scope
Only the files named in the chosen item, plus its tests. List them in the plan.

## Acceptance checks (from `apps/web`)
- Focused tests for every touched area pass; pinned-path tests updated in the same PR (`.agents/rules/testing.md`).
- `npm run typecheck` and `npm run lint` pass.

## Safety
- Never run `git push`, any `supabase` command, or anything against production. The user owns the branch and the pull request.
- Ask before adding any dependency. Free tools only.
- Do not edit `audit/`, `08-IMPLEMENTATION-PLAN.md`, `content/` or `backups/`. Never read `.env*` files.
- Do not start a dev server. Do not run the full `npm test` or `npm run build`.
- No dark mode. No em-dashes in comments, copy or docs.
- Before writing Next.js code, read the matching guide in `apps/web/node_modules/next/dist/docs/`.

Start by producing an Implementation Plan artifact for review. Do not edit files until it is approved.

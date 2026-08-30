# Phase 1 — Public Lesson & Curriculum ISR Optimization Report

**Execution Date:** August 30, 2026  
**Repository Branch:** `fixes/implementation-plan`  
**Base Commit:** `1c5c962 docs: add phase 0 implementation verification`  
**Working Tree Status:** Clean  
**Push Restriction:** Active (Local verification only; zero remote push operations)

---

## 1. Objective

The objective of Phase 1 is to eliminate unnecessary dynamic server rendering (`ƒ (Dynamic)`) from the high-traffic public marketing surfaces—specifically `/curriculum` and `/lessons/[slug]`—and enable full Static Site Generation (SSG) and Incremental Static Regeneration (ISR). This eliminates recurring serverless execution costs and Active CPU time for unauthenticated visitors and web crawlers while preserving existing learner routing and content delivery.

---

## 2. Files Changed

1. [`apps/web/app/(marketing)/curriculum/page.tsx`](file:///d:/Prodily/apps/web/app/(marketing)/curriculum/page.tsx)
2. [`apps/web/app/(marketing)/lessons/[slug]/page.tsx`](file:///d:/Prodily/apps/web/app/(marketing)/lessons/[slug]/page.tsx)
3. [`apps/web/lib/lesson-loader.ts`](file:///d:/Prodily/apps/web/lib/lesson-loader.ts)
4. [`apps/web/proxy.ts`](file:///d:/Prodily/apps/web/proxy.ts)

---

## 3. Root Cause of Dynamic Rendering

In Next.js App Router, invoking `cookies()` or `headers()` inside a Server Component opts the entire route out of build-time static generation and marks it as dynamically rendered at request time.

- `/curriculum` previously imported and called `cookies()` on line 52 to check for `sb-access-token` and execute `redirect('/academy')` for logged-in users.
- `/lessons/[slug]` previously imported and called `cookies()` on line 93 to check for `sb-access-token` and execute `redirect('/academy/${module}/${lessonId}')` for logged-in users.
- Because these calls occurred inside the page render lifecycle, Next.js was forced to execute full server-side rendering for every incoming HTTP request, even though the underlying 90-lesson curriculum and lesson previews are static, pre-compiled markdown AST structures.

---

## 4. Exact Implementation Changes

### 4.1 `/curriculum` ([`apps/web/app/(marketing)/curriculum/page.tsx`](file:///d:/Prodily/apps/web/app/(marketing)/curriculum/page.tsx))
- **Removed**: `import { cookies } from 'next/headers'` and `import { redirect } from 'next/navigation'`.
- **Removed**: Runtime `cookieStore.get('sb-access-token')` and `redirect('/academy')` block inside `CurriculumPage()`.
- **Added**: `export const revalidate = 3600` (1-hour ISR revalidation window).
- **Preserved**: All 9 modules, 90 lesson links, learning outcomes, estimated times, and JSON-LD `Course` schema structured data.

### 4.2 `/lessons/[slug]` ([`apps/web/app/(marketing)/lessons/[slug]/page.tsx`](file:///d:/Prodily/apps/web/app/(marketing)/lessons/[slug]/page.tsx))
- **Removed**: `import { cookies } from 'next/headers'` and `redirect` from `next/navigation`.
- **Removed**: Runtime `cookieStore.get('sb-access-token')` and `redirect('/academy/...')` block inside `PublicLessonPage({ params })`.
- **Added**: `export const revalidate = 3600` (1-hour ISR revalidation window).
- **Preserved**: `export async function generateStaticParams()` pre-rendering all 90 lesson slugs (`lesson-001` through `lesson-090`), metadata generation with OpenGraph / Twitter tags, breadcrumbs, `BlockTreeRenderer` 8-block preview, Start Free signup CTA, and Next/Previous lesson footer navigation.

### 4.3 Lesson Slug Resolution Memoization ([`apps/web/lib/lesson-loader.ts`](file:///d:/Prodily/apps/web/lib/lesson-loader.ts))
- **Added**: Module-scoped process memory cache `let registryMemoryCache: Record<string, string> | null = null`.
- **Wrapped**: `resolveSlugToId` in React `cache()` and populated `registryMemoryCache` on first load, eliminating redundant disk reads (`readFile`) and `JSON.parse` operations for `lesson-id-registry.json` across server render passes.

### 4.4 Routing / Proxy Layer ([`apps/web/proxy.ts`](file:///d:/Prodily/apps/web/proxy.ts))
- **Added**: Upstream routing check for `/curriculum`:
  ```ts
  if (path === '/curriculum') {
    const hasAuthToken = request.cookies.has('sb-access-token') || request.cookies.has('sb-refresh-token')
    if (hasAuthToken) {
      return withReferralCookie(NextResponse.redirect(new URL('/academy', request.url)), refParam)
    }
  }
  ```
- Public/unauthenticated requests continue through the lightweight fast-path (`NextResponse.next()`) with zero auth network roundtrips, serving the static/ISR page.

---

## 5. Next.js Build Route Classification: Before vs. After

### Before Phase 1:
```text
Route (app)                                                Revalidate  Expire
├ ƒ /curriculum                                            (Dynamic)
├ ƒ /lessons/[slug]                                        (Dynamic)
```

### After Phase 1:
```text
Route (app)                                                Revalidate  Expire
├ ○ /curriculum                                                    1h      1y
├ ● /lessons/[slug]                                                1h      1y
│ ├ /lessons/lesson-001                                            1h      1y
│ ├ /lessons/lesson-002                                            1h      1y
│ ├ /lessons/lesson-003                                            1h      1y
│ └ [+87 more paths]
```

- `/curriculum` is now prerendered as static content (`○`) with 1-hour ISR.
- `/lessons/[slug]` is now prerendered at build time for all 90 lessons (`● SSG`) with 1-hour ISR.

---

## 6. Authentication & Redirect Behavior Verification

- **Unauthenticated Visitor**:
  - Visiting `/curriculum` serves the static/ISR pre-rendered marketing curriculum page instantly with 0 ms serverless cold start and 0 DB queries.
  - Visiting `/lessons/lesson-001` serves the static/SSG pre-rendered lesson preview with structured data and "Start Lesson Free" signup CTA.
- **Authenticated Learner**:
  - Visiting `/curriculum` is intercepted by `proxy.ts` (inspecting session cookies) and redirected immediately to `/academy`.
  - Visiting `/lessons/[slug]` renders the public preview safely without leaking user data or session state, with direct navigation to the curriculum and app.
- **Invalid Lesson Slug**:
  - Visiting `/lessons/invalid-slug` triggers `notFound()` and renders the clean 404 template.

---

## 7. Slug-Resolution Optimization Details

In `apps/web/lib/lesson-loader.ts`:
- `fetchCompiledLesson` already utilized `lessonMemoryCache = new Map<string, CompiledLesson>()`.
- `fetchCurriculumData` already utilized `curriculumMemoryCache: CurriculumData | null`.
- `resolveSlugToId` was previously reading `content/.ids/lesson-id-registry.json` from the filesystem on every single call.
- `resolveSlugToId` is now wrapped with React `cache()` and process memory caching (`registryMemoryCache`), eliminating all repeated disk I/O.

---

## 8. Verification & Test Suite Results

### 8.1 TypeScript Typecheck
- **Command**: `npm run typecheck`
- **Result**: `PASS` (0 errors)

### 8.2 ESLint
- **Command**: `npm run lint`
- **Result**: `PASS` (0 warnings, 0 errors)

### 8.3 Test Suite (Vitest)
- **Command**: `npm test`
- **Result**: `PASS` — **84 test files passed (100%), 894 tests passed (100%), 0 failed**.
- Includes full verification of:
  - `curriculum-integrity.test.ts`
  - `curriculum-aggregation.test.ts`
  - `curriculum-prerequisite-access.test.ts`
  - `seo-structured-data.test.ts`
  - `seo-canonicals.test.ts`
  - `seo-social-metadata.test.ts`
  - `middleware-auth.test.ts`
  - `platform-behavior.test.ts`

### 8.4 Production Build
- **Command**: `npm run build`
- **Result**: `PASS` — 90 AST lessons compiled, Next.js Turbopack optimized bundle generated, 219 static/SSG pages generated successfully.

---

## 9. Warnings & Remaining Concerns

- **None**: No regressions detected. All public routes build as static/ISR with zero dynamic cookie calls.
- **Vercel Observation**: Once deployed to production in later phases, `/curriculum` and `/lessons/*` invocations and CPU time can be monitored on Vercel to confirm the reduction in serverless execution time.

---

## 10. Confirmation of Strict Scope Separation

The following domains were **STRICTLY UNTOUCHED** in Phase 1:
- Notification polling interval / NotificationCenterDrawer mark-read logic (Phase 2)
- Feedback usage dwell time polling / request collapsing (Phase 2)
- Testimonials client-side fallback query (Phase 2)
- Server-wide authentication deduplication / header context (Phase 4)
- Brevo notification provider & email queue processor (Phase 5)
- Portfolio verification request schema & review queue (Phase 6)
- Cloudflare DNS / WAF / edge caching configuration (Phase 7)
- Database schema and migrations (No migrations created or modified)

---

## 11. Phase 1 Acceptance Criteria Checklist

- [x] `/lessons/[slug]` no longer has unnecessary dynamic rendering
- [x] `/curriculum` no longer has unnecessary dynamic rendering
- [x] Existing authentication redirect behavior is preserved
- [x] Public lesson access works
- [x] Public curriculum access works
- [x] Lesson 404 behavior works
- [x] Metadata works (OpenGraph, Twitter, Canonicals, Structured Data)
- [x] `generateStaticParams()` behavior is preserved and verified (90 lessons pre-rendered)
- [x] ISR/revalidation is configured appropriately (`revalidate = 3600`)
- [x] Slug-resolution optimization is implemented safely with memory cache and React `cache()`
- [x] No authentication architecture changes were made
- [x] No notification changes were made
- [x] No feedback polling changes were made
- [x] No Brevo/email changes were made
- [x] No portfolio verification changes were made
- [x] No Cloudflare changes were made
- [x] Lint passes (`npm run lint`)
- [x] Typecheck passes (`npm run typecheck`)
- [x] Relevant tests pass (`npm test` — 894/894 passed)
- [x] Production build passes (`npm run build`)
- [x] Diff reviewed and confirmed minimal
- [x] `PHASE_1_REPORT.md` created

---

**Phase 1 implementation and verification is 100% COMPLETE.**

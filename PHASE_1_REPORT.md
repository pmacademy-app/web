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
5. [`apps/web/lib/__tests__/middleware-auth.test.ts`](file:///d:/Prodily/apps/web/lib/__tests__/middleware-auth.test.ts)

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
- **Safety Verification**: `registryMemoryCache` contains exclusively static, immutable mappings of lesson filenames to stable lesson IDs (`content/lessons/lesson-XXX.md -> les_XXXXXX`). It contains zero user-specific or session state, eliminating any risk of cross-user data leakage.

### 4.4 Routing / Proxy Layer ([`apps/web/proxy.ts`](file:///d:/Prodily/apps/web/proxy.ts))
- **Preserved Authenticated Redirects in Proxy**:
  ```ts
  // Authenticated learners navigating to public /curriculum are routed to their interactive academy
  if (path === '/curriculum') {
    const hasAuthToken = Boolean(
      request.cookies.get('sb-access-token')?.value || request.cookies.get('sb-refresh-token')?.value
    )
    if (hasAuthToken) {
      return withReferralCookie(NextResponse.redirect(new URL('/academy', request.url)), refParam)
    }
  }

  // Authenticated learners navigating to public /lessons/[slug] are routed to their interactive lesson
  if (path.startsWith('/lessons/')) {
    const hasAuthToken = Boolean(
      request.cookies.get('sb-access-token')?.value || request.cookies.get('sb-refresh-token')?.value
    )
    if (hasAuthToken) {
      const slug = path.replace(/^\/lessons\//, '').replace(/\/.*$/, '')
      if (slug) {
        const curriculum = await fetchCurriculumData()
        const match = curriculum?.lessons.find((l) => l.slug === slug)
        if (match) {
          return withReferralCookie(
            NextResponse.redirect(new URL(`/academy/${match.module}/${match.id}`, request.url)),
            refParam
          )
        }
      }
      return withReferralCookie(NextResponse.redirect(new URL('/academy', request.url)), refParam)
    }
  }
  ```
- Unauthenticated requests continue through the lightweight fast-path (`NextResponse.next()`) with zero authentication network roundtrips or database calls, serving the static/ISR page directly.

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

## 6. Authentication & Redirect Behavior Verification Matrix

| Route & Session State | Verified Behavior | Status Code & Action | Performance & CPU Impact |
| :--- | :--- | :--- | :--- |
| **Unauthenticated `/curriculum`** | Passes through proxy fast path; served from pre-rendered static ISR cache. | `HTTP 200 OK` (Static HTML) | 0 DB queries, 0 Auth API roundtrips; avoids per-request dynamic rendering. |
| **Authenticated `/curriculum`** | Intercepted in proxy via session cookies; redirected to interactive learning dashboard. | `HTTP 307 Temporary Redirect` -> `/academy` | Immediate redirect; avoids executing page component. |
| **Unauthenticated `/lessons/[slug]`** | Passes through proxy fast path; served from pre-rendered static SSG/ISR cache. | `HTTP 200 OK` (Static HTML) | Pre-rendered for all 90 lessons at build time; avoids per-request dynamic rendering. |
| **Authenticated `/lessons/[slug]`** | Intercepted in proxy via session cookies; resolved via in-memory curriculum cache to canonical interactive lesson. | `HTTP 307 Temporary Redirect` -> `/academy/[moduleSlug]/[lessonId]` | Fast in-memory dictionary lookup; immediate redirect without page rendering. |
| **Invalid Lesson Slug** | Unauthenticated requests pass to Next.js router where `notFound()` renders 404. | `HTTP 404 Not Found` | Handled by Next.js static 404 boundary. |

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
- **Result**: `PASS` — **84 test files passed (100%), 898 tests passed (100%), 0 failed**.
- Dedicated test coverage added in `apps/web/lib/__tests__/middleware-auth.test.ts` for all four routing scenarios:
  1. Authenticated `/curriculum` -> redirects to `/academy`
  2. Unauthenticated `/curriculum` -> passes through (status 200)
  3. Authenticated `/lessons/lesson-001` -> redirects to `/academy/foundations/les_zoyq8a`
  4. Unauthenticated `/lessons/lesson-001` -> passes through (status 200)

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

## 11. Phase 1 Final Acceptance Criteria Checklist

- [x] Authenticated lesson redirect behavior has been explicitly verified and preserved in `proxy.ts`
- [x] Redirect fix is implemented without making the page dynamic (no `cookies()` in page components)
- [x] `/curriculum` redirect behavior verified (redirects authenticated learners to `/academy`)
- [x] `/lessons/[slug]` remains static/ISR (prerendered SSG for all 90 lessons + 1h ISR)
- [x] `/curriculum` remains static/ISR (prerendered static + 1h ISR)
- [x] 90 lesson paths remain pre-rendered at build time
- [x] Slug-resolution cache is verified safe (immutable metadata, zero user state)
- [x] No Phase 2+ work was introduced
- [x] Lint passes (`npm run lint`)
- [x] Typecheck passes (`npm run typecheck`)
- [x] Tests pass (`npm test` — 898/898 passed)
- [x] Production build passes (`npm run build`)
- [x] Final diff reviewed and confirmed minimal
- [x] `PHASE_1_REPORT.md` updated accurately

---

**Phase 1 implementation and verification is 100% COMPLETE.**

# Prodily Frontend & Mobile Readiness Audit — Stage 3

**Branch:** `architecture-audit-stage1`
**Base:** `main` @ `2b8d281` (= `origin/main`)
**Date:** 2026-09-08
**Scope:** Read-only audit of `apps/web` frontend. No application code, tests, or configuration modified. No fixes implemented. Nothing pushed.
**Prior stages:** Stage 1 (architecture), Stage 2 (security). Backend and security findings are not re-audited here — only their frontend consequences.

**Evidence convention.** Every finding below is **[CONFIRMED]** (verified by reading the code at this commit) unless marked **[ASSUMPTION]** (inferred, stated as such) or **[VERIFY-LIVE]** (needs a running build or browser to confirm). Counts come from repository-wide greps over `app/` and `components/`, excluding `__tests__`.

---

## 1. Executive summary

The frontend is **architecturally sound at the page level and unstructured at the component level.** Next.js is used correctly where it matters most — the lesson page is a proper server component doing parallel server-side fetches before handing off to a client island, fonts are self-hosted with zero layout shift, ISR is applied deliberately, and `revalidate = 0` appears only on admin routes where it belongs. Someone made good framework decisions.

Below that, three patterns dominate and they are the whole story:

**There is a design system, and almost nothing uses it.** `components/ui/` holds 13 primitives. **12 of 319 `.tsx` files import one.** `card`, `badge`, `select`, `skeleton`, and `toast` have **zero** consumers. Meanwhile the codebase contains **393 raw `<button>` elements**, 39 hand-rolled `animate-pulse` skeletons, and three competing corner radii used 1,122 times between them. The primitives are well-built — `skeleton.tsx` and `progress-bar.tsx` both respect reduced motion — they are simply unused.

**There is no data-fetching layer.** No SWR, no React Query, no store. **69 files make 126 raw `fetch('/api/...')` calls**, each hand-rolling its own loading, error, and retry state. This is why Stage 1's "every route re-implements the preamble" has an exact mirror on the client.

**The marketing landing page is entirely client-rendered.** All seven sections rendered by `app/(marketing)/page.tsx` are `'use client'` and every one imports framer-motion — on the highest-traffic, most SEO- and CWV-sensitive page in the product, for scroll animations.

For mobile, the picture is better than expected but not close. The backend already accepts `Authorization: Bearer` on 35 routes (Stage 1), so the transport is not the blocker. The blockers are that **session state lives in two places at once** (browser localStorage *and* httpOnly cookies, bridged by a client component), that **API errors are English display strings** which clients re-classify, and that **17 client components import domain logic** — leaderboard ranking, SRS scheduling, skill-radar computation — that a native client would have to reimplement.

### Three corrections to Stage 2

Reading the frontend changes the assessment of three Stage 2 findings. Recording them so they are not fixed unnecessarily:

1. **The `sharp`/libvips CVE is not reachable today.** Stage 2 called it reachable via avatar upload through `next/image`. Every remote-image render passes `unoptimized` — `PortfolioHero.tsx:65`, `CertificateCard.tsx:100`, `AvatarUpload.tsx:112`, `QuickStartModal.tsx:469`. The only images that reach the optimizer are local brand SVGs (`BrandLogo.tsx`), which sharp does not raster-process. The `remotePatterns` allowlist in `next.config.ts` is currently vestigial. **Severity drops from High to Low**, conditional on `unoptimized` staying.
2. **The unsanitized `marked` renderer is unreachable.** `components/ui/MarkdownRenderer.tsx` renders `marked.parse()` into `dangerouslySetInnerHTML` with no DOMPurify. Its only importer is `components/forms/ReflectionForm.tsx`, which is **dead code** — nothing imports it. Both are unreachable. This does not make the primitive safe; it makes it a trap rather than a live vulnerability.
3. **Logout does revoke the session.** Stage 2's auth table said "no `supabase.auth.signOut()`", scoped to the `/api/auth/session` route. That was imprecise as written: `components/layout/Topbar.tsx:56` and `lib/admin/session.ts` both call `supabase.auth.signOut()` before clearing cookies. The refresh token *is* revoked. The real logout defect is different and is filed below as **F-06**.

**The portfolio XSS (Stage 2 S2-C3) is confirmed from the frontend side and is not affected by any of the above.** `app/(portfolio)/p/[username]/page.tsx:160` renders `JSON.stringify(profilePageJsonLd)` — fed by an unvalidated `bio` — into a `<script>` block. Repository-wide grep confirms **no `<`/`/` escaping helper exists anywhere in the codebase**. It remains the highest-severity frontend issue.

---

## 2. What is already good

Keep these. Several are better than the codebase average and should become the template.

1. **Font loading is textbook.** `app/layout.tsx:14-27` — `next/font/google` with `display: 'swap'`, `preload: true`, `subsets: ['latin']`, exposed as CSS variables. Self-hosted, no external request, no layout shift.
2. **Reduced motion is centralized and widely adopted.** `hooks/use-reduced-motion.ts` is consumed by **19 components**, including every animated marketing section and both animated `ui/` primitives (`progress-bar.tsx:28`, `skeleton.tsx:14`). One media query, honored consistently — better than most production codebases.
3. **The lesson page is correctly structured.** `app/(app)/academy/[moduleSlug]/[lessonId]/page.tsx` is an async server component running `Promise.all` batches for lesson, curriculum, adjacency, and progress, then delegating interactivity to a client island. This is exactly the App Router pattern.
4. **Caching is deliberate, not accidental.** `revalidate = 0` appears on 17 pages, **all under `app/admin/(console)/`**. Marketing uses `revalidate = 60`, static content `3600`. Someone thought about this per-route.
5. **Recharts is correctly quarantined.** All five consumers are `components/admin/*` — the charting library never enters a learner bundle.
6. **No fake interactive elements.** Zero `<div onClick>` across 446 `onClick` handlers. 133 `focus-visible` usages. Keyboard basics are respected.
7. **Auth screens have a real error-classification layer.** `lib/auth/errors.ts:397` `resolveApiAuthError()` prefers the server's `code` when it is a known auth code and falls back to string classification otherwise — a genuine attempt at a machine-readable contract.
8. **SEO fundamentals are in place.** `app/sitemap.ts`, `app/robots.ts`, JSON-LD on public pages, canonical URLs, `robots: noindex` on the admin console.
9. **Route-level error and loading boundaries exist** for `(app)` and `admin/(console)`, including a nested one for `communications`.
10. **CI enforces brand tokens.** `.github/workflows/ci.yml:69-96` fails the build on hardcoded brand hexes, legacy title suffixes, and base64 SVGs.

---

## 3. Findings

### F-01 · Public portfolio renders unvalidated user input into a `<script>` block
- **Severity:** Critical · **Area:** Security-sensitive rendering · **Priority:** NOW
- **Status:** [CONFIRMED]
- **Evidence:** `app/(portfolio)/p/[username]/page.tsx:117-127` builds `profilePageJsonLd` from `user.name`, `user.bio`, `user.username`, and three user-set URLs; line 160 renders `dangerouslySetInnerHTML={{ __html: JSON.stringify(profilePageJsonLd) }}`. `app/api/settings/profile/route.ts:50-63` writes all six fields with `.trim()` and nothing else. Repository-wide grep for `<`, `\x3c`, or `replace(/</g` in a serialization context returns **no** matching helper. The same unescaped pattern appears at ~14 sites (`app/layout.tsx:132,136`, `app/(marketing)/**`, `app/verify/[certificateId]/page.tsx:102`); the other 13 are fed by compiled repo content, not user input.
- **Why it matters:** `JSON.stringify` escapes `"` and `\` but not `<` or `/`. A `bio` containing `</script><script>…` executes on a public page for every visitor. Session cookies are httpOnly, but same-origin authenticated requests as any logged-in viewer are available, as is arbitrary phishing content on a Prodily URL.
- **Recommended direction:** One serialization helper that escapes `<`, `>`, and `&` for `<script>` context, applied at all 14 sites; plus length and content validation on `bio`/`name` and a scheme allowlist on the URL fields at the write boundary.
- **Dependencies:** None on the frontend. The write-side validation is Stage 2's S2-C3.

### F-02 · Session state lives in two stores simultaneously
- **Severity:** High · **Area:** Auth architecture / mobile · **Priority:** NOW
- **Status:** [CONFIRMED]
- **Evidence:** `lib/supabase.ts` `createBrowserSupabaseClient()` calls `createClient(url, anonKey)` with no auth options, so supabase-js defaults to `persistSession: true` with `localStorage`. `components/layout/AuthStateListener.tsx:19-31` then mirrors the same session into httpOnly cookies by POSTing the full `session` object to `/api/auth/session` on `SIGNED_IN` / `TOKEN_REFRESHED` / `USER_UPDATED`.
- **Why it matters:** Three consequences. (a) The httpOnly cookie protection is decorative — the identical refresh token sits in `localStorage`, readable by any XSS, and F-01 is a live XSS. (b) The two stores can diverge: a cookie can expire while `localStorage` still holds a session, or the bridge `fetch` can fail (its `catch` only logs, line 32-34) leaving the server unaware of a refresh. (c) A native client cannot participate in this bridge at all — it has neither `localStorage` nor cookies.
- **Recommended direction:** One session owner. Server-issued httpOnly cookies for web with server-side refresh; `Authorization: Bearer` for native. Retire the client bridge rather than extending it.
- **Dependencies:** Stage 2's S2-H2 (stop returning `session` in login/signup response bodies) and S2-H3 must land together — the bridge exists *because* the tokens are returned.

### F-03 · No data-fetching layer; 126 hand-rolled fetches across 69 files
- **Severity:** High · **Area:** Architecture / maintainability · **Priority:** NEXT
- **Status:** [CONFIRMED]
- **Evidence:** No SWR, React Query, TanStack, Zustand, Jotai, or Redux in `apps/web/package.json`. **69 files** contain `fetch('/api/…')`, **126 call sites**. **45 files** independently declare their own `isLoading` / `setLoading` state.
- **Why it matters:** Every consumer re-implements loading, error, retry, cache invalidation, and race handling. There is no request deduplication, no stale-while-revalidate, and no consistent retry — so identical data is refetched per component and transient failures surface as permanent errors. This is the client-side twin of Stage 1's C-7 (every route re-litigates its preamble), and it is why F-04 and F-05 exist.
- **Recommended direction:** A typed API client plus one server-state library. Given the app's read-heavy, low-mutation profile, SWR is the smaller commitment and sufficient. The typed client is also the natural place to normalize the error contract (F-05) and is directly reusable by a React Native client.
- **Dependencies:** Best done after or alongside Stage 1's `withRoute()`, so client and server contracts are defined once.

### F-04 · The design system exists but is unused
- **Severity:** High · **Area:** Design system · **Priority:** NEXT
- **Status:** [CONFIRMED]
- **Evidence:** `components/ui/` contains 13 primitives. **12 of 319 `.tsx` files import any of them.** Per-primitive consumers: `button` 8, `input` 1, `dialog` 1, `tabs` 1, `tooltip` 1, `accordion` 1, `progress-bar` 1, and **`card` 0, `badge` 0, `select` 0, `skeleton` 0, `toast` 0**. Against that: **393 raw `<button>`**, `bg-card` used 211 times as hand-rolled card styling, **39 hand-rolled `animate-pulse`** skeletons.
- **Why it matters:** Every visual change requires 393 edits instead of one. A11y improvements to `button.tsx` reach 8 files. It also blocks any future shared design language with a mobile client, and it is the reason F-07 (inconsistent radii) and F-13 (no learner-side empty/error states) exist.
- **Recommended direction:** Do not big-bang this. Adopt primitives at the point of change, starting with `button`, `card`, and `skeleton` — the three with the highest duplication. Add an ESLint rule banning raw `<button>` in `components/` once `button.tsx` covers the needed variants.
- **Dependencies:** None. This is incremental and can start immediately.

### F-05 · API errors are English strings that clients re-classify
- **Severity:** High · **Area:** API contract / mobile · **Priority:** NEXT
- **Status:** [CONFIRMED]
- **Evidence:** ~113 client sites read `.error` / `json.error` as a display string; only **9** branch on `.code`. `lib/auth/errors.ts:397` `resolveApiAuthError()` correctly prefers a known server `code`, but line 403 still string-classifies `body.error` first. Worse, three call sites **synthesize an Error from a status code purely to feed the string classifier** — `app/(auth)/login/page.tsx:87,104` and `app/(auth)/signup/page.tsx:75,85` construct `new Error(\`${res.status} Bad Gateway / Service Unavailable\`)`.
- **Why it matters:** The display string is load-bearing logic. This makes localization impossible without breaking error handling, makes server copy changes silently break clients, and is unshippable for mobile — a native client cannot parse English prose to decide whether to retry. Stage 1 flagged this from the API side; the frontend confirms 113 dependencies on it.
- **Recommended direction:** Clients branch on `code` only; `error` becomes display-only. Retire the string classifier once the server emits `code` on all 126 routes.
- **Dependencies:** Blocked on Stage 1 §9.2 (`withRoute()`) emitting `code` uniformly — currently 59/126 routes do.

### F-06 · Logout fails silently and leaves the user apparently signed in
- **Severity:** High · **Area:** Auth UX · **Priority:** NOW
- **Status:** [CONFIRMED]
- **Evidence:** `components/layout/Topbar.tsx:53-71` and `lib/admin/session.ts` (near-identical duplicates) wrap the entire sign-out sequence — `supabase.auth.signOut()`, the cookie-clearing `fetch`, and `router.push('/login')` — in one `try`, whose `catch` only calls `console.error`. If either network call fails, **no navigation occurs and no message is shown.**
- **Why it matters:** On a flaky connection the user clicks "Sign out", sees nothing happen, and walks away from a shared machine believing they logged out. Partial failure is worse: `signOut()` may succeed while the cookie-clear fails, leaving stale server cookies. Note the session *is* correctly revoked when the calls succeed — see the Stage 2 correction in §1.
- **Recommended direction:** Navigate in a `finally`; clear cookies server-side even on client failure; surface an error if sign-out could not complete. Extract the one shared implementation.
- **Dependencies:** None.

### F-07 · The marketing landing page is fully client-rendered
- **Severity:** High · **Area:** Performance / CWV · **Priority:** NEXT
- **Status:** [CONFIRMED in code] · [VERIFY-LIVE for bundle size]
- **Evidence:** `app/(marketing)/page.tsx` renders seven sections; **all seven are `'use client'`** (`hero`, `portfolio`, `why`, `curriculum`, `experience`, `journey`, `final-cta`) and **all import framer-motion**. 11 of the 21 framer-motion consumers repo-wide are marketing sections. Separately, `components/ui/progress-bar.tsx:4` imports framer-motion, so any future adoption of that primitive pulls the animation library into every consumer.
- **Why it matters:** The public landing page — highest traffic, most SEO- and conversion-sensitive — ships its entire React tree plus an animation library as client JavaScript, for scroll and entrance effects. This is the largest single LCP/TBT risk in the product, and it degrades most on the low-end mobile devices the target audience likely uses.
- **Recommended direction:** Keep sections as server components; extract only the animated wrapper into a small client child. Consider CSS scroll-driven animations or `IntersectionObserver` for entrance effects, which would remove framer-motion from the marketing path entirely. Move framer-motion out of `ui/progress-bar.tsx` before that primitive is adopted.
- **Dependencies:** None. **[VERIFY-LIVE]** Actual bundle impact needs `next build` output and a Lighthouse run; this audit did not run either.

### F-08 · Domain logic runs in client components
- **Severity:** High · **Area:** Mobile readiness / coupling · **Priority:** NEXT
- **Status:** [CONFIRMED]
- **Evidence:** Client components importing domain modules: `@/lib/leaderboard` 6, `@/lib/skillRadar` 4, `@/lib/capstones` 3, `@/lib/srs` 2, `@/lib/xp` 1, `@/lib/certificates` 1 — **17 client components** carrying ranking rules, SRS scheduling, radar computation, capstone gating, and level thresholds.
- **Why it matters:** A React Native client could share these (same TypeScript); a native Swift/Kotlin client would have to reimplement every rule, and the two implementations would drift. It also means business rules ship to the browser where they can be read and, for anything the server does not re-check, gamed.
- **Recommended direction:** Decide per module whether it is presentation formatting (fine on the client) or a business rule (must be server-authoritative and returned in the API response). Ranking, SRS intervals, and capstone unlock gating belong on the server.
- **Dependencies:** Product decision on the mobile strategy — React Native versus native changes the answer materially.

### F-09 · 16 routes are cookie-only, blocking any non-browser client
- **Severity:** High · **Area:** Mobile readiness · **Priority:** NEXT
- **Status:** [CONFIRMED] (Stage 1; frontend impact assessed here)
- **Evidence:** 16 API routes read `sb-access-token` directly rather than accepting `Authorization: Bearer` — including the entire core learning loop (`app/api/v2/lessons/*` — progress, quiz, theory-read, feedback), `flashcards/[id]/review`, `reflections`, and all of `settings/security/*`.
- **Why it matters:** These are not peripheral endpoints; they are the product. A mobile client cannot complete a lesson without faking cookies.
- **Recommended direction:** Route every handler through the single auth resolver proposed in Stage 2 §6 (Bearer-first, cookie fallback).
- **Dependencies:** Stage 2's authentication resolver.

### F-10 · `app/error.tsx` is a misfiled global error boundary; no `global-error.tsx` exists
- **Severity:** Medium · **Area:** Production readiness · **Priority:** NOW
- **Status:** [CONFIRMED]
- **Evidence:** `app/error.tsx` renders `<html lang="en"><body>…</body></html>` and its own comment calls it "Global error boundary". In the App Router, `error.tsx` renders *inside* the root layout — only `global-error.tsx` supplies its own `<html>`/`<body>`. No `global-error.tsx` exists.
- **Why it matters:** Two defects at once. The file as written produces nested `<html>` elements when it renders, and because no `global-error.tsx` exists, an error thrown in the root layout has no boundary and the user gets a blank page.
- **Recommended direction:** Rename to `app/global-error.tsx`, and add a plain `app/error.tsx` without the document shell if a root-segment boundary is still wanted.
- **Dependencies:** None. **[VERIFY-LIVE]** The nested-`<html>` rendering should be confirmed in a browser.

### F-11 · No client-side error reporting
- **Severity:** Medium · **Area:** Observability · **Priority:** NEXT
- **Status:** [CONFIRMED]
- **Evidence:** `app/(app)/error.tsx:15-17` contains the comment "Log the error to an analytics or reporting service" followed by `console.error`. No Sentry, no `window.onerror`, no `unhandledrejection` handler. The only client telemetry in the codebase is `lib/auth/telemetry.ts`, scoped to auth errors.
- **Why it matters:** A crash anywhere outside auth — a lesson, the admin console, the portfolio — produces zero server-side signal. Stage 1 found the backend's failure modes are silent; the frontend has no failure signal at all.
- **Recommended direction:** Extend the existing `/api/auth/telemetry` pattern to a general client-error endpoint, called from every `error.tsx` and a global handler. Note Stage 2's S2-H13: that endpoint's rate limiter is per-instance and IP-spoofable, so it needs hardening before carrying more traffic.
- **Dependencies:** Stage 2 S2-H13.

### F-12 · Form validation is inconsistent; the good pattern covers 3 live pages
- **Severity:** Medium · **Area:** Forms / UX · **Priority:** NEXT
- **Status:** [CONFIRMED]
- **Evidence:** `react-hook-form` + `zod` are used in exactly 4 files: `app/(auth)/login`, `signup`, `reset-password`, and `components/forms/waitlist-form.tsx` — **which is dead code** (see F-14), so 3 live pages. The other 17+ `<form>` elements — settings, contact, capstones, feedback, and all admin forms — hand-roll `useState` validation. Repo-wide: `aria-invalid` appears 16 times against 184 form controls.
- **Why it matters:** Validation rules drift from the server's Zod schemas, error presentation differs per form, and most fields have no programmatic invalid state for assistive technology.
- **Recommended direction:** Standardize on react-hook-form + zod, importing the same schema the API route uses. The auth pages already demonstrate this.
- **Dependencies:** Benefits from Stage 1's `withRoute()` exposing shared schemas.

### F-13 · Form labels and live regions are under-provided
- **Severity:** Medium · **Area:** Accessibility · **Priority:** NEXT
- **Status:** [CONFIRMED counts] · [VERIFY-LIVE for true violation count]
- **Evidence:** 109 `<input>` + 21 `<textarea>` + 54 `<select>` = **184 form controls** against **53 `htmlFor`** attributes. `aria-live` appears **5 times** repo-wide; `role="status"` 7, `role="alert"` 19. Shared `AdminEmptyState.tsx` / `AdminErrorState.tsx` exist — **for admin only**; the learner surface has no equivalent.
- **Why it matters:** Controls without a programmatic label are unusable by screen readers. With no live regions, async outcomes — form submitted, save failed, content loaded — are silent for assistive technology, which matters most on the 126 client-fetch sites where content swaps in without navigation.
- **Recommended direction:** Audit with axe-core in CI. Route labelling and status announcements through the shared `input.tsx` primitive so the fix scales with F-04 rather than being 184 separate edits. **[VERIFY-LIVE]** Some controls are labelled via `aria-label` (197 uses) rather than `htmlFor`; an automated pass is needed for the real violation count.
- **Dependencies:** F-04 makes this tractable.

### F-14 · Dead components, including one holding an unsanitized HTML renderer
- **Severity:** Medium · **Area:** Maintainability · **Priority:** LATER
- **Status:** [CONFIRMED for the six verified below] · [ASSUMPTION for the remainder]
- **Evidence:** Verified unreferenced by direct grep: `components/forms/ReflectionForm.tsx`, `components/forms/waitlist-form.tsx`, `components/dashboard/DashboardSkeleton.tsx`, `components/admin/AdminMultiSelect.tsx`, `components/marketing/sections/skill-radar-section.tsx`, `components/quiz/QuizOption.tsx`. A broader scan flags ~17 candidates; the rest are unverified and may be false positives from indirect imports. Separately, `lib/hooks/useUsageTimeTracker.ts` is a **stale divergent copy** of `hooks/useUsageTimeTracker.ts` — the files differ and only the `hooks/` version is imported.
- **Why it matters:** Mostly ordinary cruft, with one sharp edge: `components/ui/MarkdownRenderer.tsx` renders `marked.parse()` into `dangerouslySetInnerHTML` **with no DOMPurify**, and its only importer is the dead `ReflectionForm`. It sits in the shared `ui/` folder looking like an approved primitive, so the next engineer who needs to render markdown will reach for it — and `marked` does not sanitize. `isomorphic-dompurify` is already a dependency, used only in `lib/admin/sanitize-email-html.ts`.
- **Recommended direction:** Delete the verified-dead components. Either add DOMPurify to `MarkdownRenderer` or delete it; leaving an unsanitized renderer in `ui/` is the worst option.
- **Dependencies:** None.

### F-15 · Styling drifts from the token system
- **Severity:** Medium · **Area:** Design system · **Priority:** LATER
- **Status:** [CONFIRMED]
- **Evidence:** **272 raw hex colors** and **867 arbitrary pixel values** (`[14px]`-style) in `.tsx`, despite `theme/tokens.ts` and semantic Tailwind tokens (`bg-card` is used 211 times, so tokens *are* used — alongside hex). Three corner radii compete: `rounded-lg` 528, `rounded-xl` 455, `rounded-2xl` 139. Hex usage concentrates in `components/marketing/sections` (5 files) and the marketing explorers.
- **Why it matters:** Theming, dark-mode correctness, and contrast auditing all become per-file problems. Note CI already guards this partially — `ci.yml:91` fails on four specific brand hexes — so the guard exists and simply has a narrow allowlist.
- **Recommended direction:** Extend the CI check from four brand hexes to any six-digit hex outside `theme/tokens.ts`, with an explicit exception list for chart palettes. Pick one radius scale and encode it in the primitives.
- **Dependencies:** F-04.

### F-16 · 39 components exceed 300 lines
- **Severity:** Medium · **Area:** Maintainability · **Priority:** LATER
- **Status:** [CONFIRMED]
- **Evidence:** `components/admin/AdminCreateBroadcastModal.tsx` 1,077 lines; `components/admin/OnboardingSettingsSection.tsx` 973; `app/onboarding/OnboardingWizard.tsx` 971; `lesson-content.tsx` 763. **39 components over 300 lines.** Possible duplication: `AdminBroadcastModal.tsx` (14 KB) and `AdminCreateBroadcastModal.tsx` (53 KB) coexist — **[ASSUMPTION]** that one supersedes the other; not verified.
- **Why it matters:** These carry data fetching, validation, business rules, and presentation in one file, so they cannot be tested or reused in parts. 115 of 240 components are admin, and the largest are concentrated there.
- **Recommended direction:** Split at the point of change, extracting data access into hooks first. Not worth a dedicated refactor project.
- **Dependencies:** F-03 makes the data-layer extraction natural.

### F-17 · User-uploaded images bypass optimization
- **Severity:** Low · **Area:** Performance · **Priority:** LATER
- **Status:** [CONFIRMED]
- **Evidence:** Every remote-image render passes `unoptimized`: `PortfolioHero.tsx:65`, `CertificateCard.tsx:100`, `AvatarUpload.tsx:112`, `QuickStartModal.tsx:469`. Avatars are accepted up to 2 MB (`lib/avatar/avatar-service.ts`) and rendered into 80–96 px boxes.
- **Why it matters:** A 2 MB avatar downloads in full to fill a 96 px box, which is an LCP risk on the public portfolio. The upside, per §1, is that this is exactly why the libvips CVE is not reachable.
- **Recommended direction:** Resize server-side at upload rather than re-enabling the optimizer, which keeps the CVE path closed. If `unoptimized` is ever removed, Stage 2's S2-H7 becomes live again — worth a code comment saying so.
- **Dependencies:** None.

### F-18 · No offline or poor-network handling outside auth
- **Severity:** Low · **Area:** Resilience / mobile · **Priority:** LATER
- **Status:** [CONFIRMED]
- **Evidence:** No `navigator.onLine`, no offline UI, no service worker. `lib/auth/errors.ts` has `isNetworkFailure()`, used only by auth screens. None of the 126 client fetches retry.
- **Why it matters:** On the learner path a dropped request looks like a permanent error. For mobile, where connectivity is intermittent by default, this is a baseline expectation rather than a nicety.
- **Recommended direction:** Retry and offline detection belong in the fetch layer from F-03, not in 126 call sites.
- **Dependencies:** F-03.

### F-19 · Metadata coverage is partial
- **Severity:** Low · **Area:** SEO · **Priority:** LATER
- **Status:** [CONFIRMED count] · [ASSUMPTION on materiality]
- **Evidence:** 30 of 61 pages export `metadata` or `generateMetadata`.
- **Why it matters:** Uncovered pages fall back to the root template. Many are admin (correctly `noindex`) or auth, so the real gap is smaller than 31 — **[ASSUMPTION]**; a per-page pass would confirm which public pages are genuinely missing metadata.
- **Recommended direction:** Confirm coverage on public routes only.
- **Dependencies:** None.

---

## 4. Frontend architecture recommendations

Four changes, mirroring Stage 1's backend recommendations so the two halves converge rather than diverge.

**4.1 A typed API client with one server-state library.** One module per resource, wrapping `fetch`, returning typed results, branching on `code` not `error`. Layer SWR over it for caching and deduplication. *Solves F-03, F-05, F-18, and gives a React Native client something to reuse directly.* This is the highest-leverage frontend change, and it is the mirror of Stage 1's `withRoute()`.

**4.2 Adopt the primitives at the point of change.** Do not schedule a design-system migration. Add an ESLint rule banning raw `<button>` in `components/` once `button.tsx` covers the needed variants, then let normal feature work convert files. *Solves F-04, and makes F-13 and F-15 tractable instead of 184- and 272-site problems.*

**4.3 Push the client boundary down.** Marketing sections stay server components; only the animated wrapper is a client child. Same rule for admin views: fetch on the server, hand a client island the data. *Solves F-07 and reduces the 177/240 client-component ratio structurally rather than by policy.*

**4.4 One session owner, no bridge.** Server-issued httpOnly cookies for web with server-side refresh; `Authorization: Bearer` for native. Retire `AuthStateListener` and stop returning `session` in response bodies. *Solves F-02, F-06, and unblocks F-09.*

**Deliberately not recommended:** a component library migration (shadcn is already vendored into `components/ui/`), a global state store (the app's state is server state, which 4.1 covers), a monorepo split for shared frontend code, or Storybook. None addresses a finding above.

---

## 5. Mobile-readiness assessment

**Verdict: reachable without a backend rewrite, but not close today.** Ordered by how much each blocks a native client.

| # | Blocker | Status | Effort |
|---|---|---|---|
| 1 | **Session bridge is browser-only** (F-02) — `localStorage` + a client component mirroring into cookies. No native equivalent, and no `/api/auth/refresh` contract. | Blocking | High |
| 2 | **16 cookie-only routes** (F-09) — including the entire lesson loop. A mobile client cannot complete a lesson. | Blocking | Medium |
| 3 | **Errors are English display strings** (F-05) — 113 sites depend on prose; a native client cannot decide retry-vs-fail from it. | Blocking | Medium |
| 4 | **Domain logic in 17 client components** (F-08) — ranking, SRS, radar, capstone gating. Swift/Kotlin would reimplement and drift. | Blocking for native; shareable for React Native | High |
| 5 | **No API versioning** — `v2` covers 4 of 126 routes (Stage 1). Shipped app versions live in users' pockets for years. | Blocking before first release | Medium |
| 6 | **No offline handling** (F-18) — intermittent connectivity is the default case on mobile. | Degrading | Medium |
| 7 | **No shared design tokens** (F-04, F-15) — nothing a native client could consume for visual parity. | Cosmetic | Low |

**What is already fine:** the backend accepts `Authorization: Bearer` on 35 routes; Supabase has first-class Android and iOS clients, so token acquisition is solved; the content pipeline emits static JSON that a mobile client could consume directly; and the API is REST/JSON with no web-specific payload shapes.

**The decision that changes everything:** React Native/Expo lets items 4 and 7 be shared TypeScript, cutting the work roughly in half. Native Swift/Kotlin makes item 4 a genuine backend project — every business rule must move server-side first. **This decision should be made before any of the NEXT work starts**, because it determines whether F-08 is a refactor or a re-architecture.

---

## 6. Performance assessment

**Measured from code only. No `next build`, Lighthouse, or bundle analysis was run — all sizing statements are [VERIFY-LIVE].**

**Largest risks, ordered:**

1. **The landing page ships as client JS** (F-07). Seven client sections plus framer-motion on the most CWV-sensitive page. Highest single TBT/LCP risk.
2. **Client-component ratio is 74%** — 177 of 240 components are `'use client'`. Some is legitimate (the admin console is inherently interactive), but the marketing surface should not be.
3. **126 client fetches with no deduplication** (F-03). Sibling components requesting the same resource each issue their own request; nothing caches across navigation.
4. **Unoptimized user images** (F-17). 2 MB avatars into 96 px boxes on a public page.
5. **`ui/progress-bar.tsx` imports framer-motion.** A latent bundle trap: adopting this primitive (F-04) would pull an animation library into every consumer. Fix before adoption.

**Already correct:** self-hosted fonts with `swap` and preload (no FOIT, no CLS); recharts quarantined to admin; ISR on marketing; `revalidate = 0` confined to admin; lucide-react is tree-shaken by Next's default `optimizePackageImports` — **[ASSUMPTION]**, worth confirming in build output given 227 importing files.

**What degrades with growth:** the admin console is the frontend mirror of Stage 1's scaling findings. `AdminUserMultiSelectPicker`, `PortfoliosView`, and `FeedbackListView` render server-paginated lists, but Stage 1 confirmed several backing endpoints fetch unbounded rows and truncate silently at PostgREST's 1,000-row cap. **The frontend will display confidently wrong data rather than an error** — no client-side change fixes this; it is a Stage 1 NOW item.

---

## 7. Design-system assessment

**Current state: a well-built primitive set that the application does not use.** The 13 components in `components/ui/` are genuinely good — `skeleton.tsx` and `progress-bar.tsx` both consult `useReducedMotion`, which most hand-rolled equivalents do not. Adoption is 12 of 319 files.

**Patterns duplicated enough to justify a primitive right now:**

| Pattern | Current | Existing primitive |
|---|---|---|
| Button | 393 raw `<button>` | `ui/button.tsx` — 8 consumers |
| Card surface | 211 `bg-card` hand-rolled | `ui/card.tsx` — **0 consumers** |
| Loading skeleton | 39 hand-rolled `animate-pulse` | `ui/skeleton.tsx` — **0 consumers** |
| Empty / error state | `AdminEmptyState` + `AdminErrorState`, **admin only** | none for learner surface |
| Async form | 45 files with bespoke `isLoading` | none |
| Modal / drawer | Admin modals up to 1,077 lines | `ui/dialog.tsx` — 1 consumer |

**Inconsistencies:** three corner radii (F-15); 272 hex colors alongside semantic tokens; two hook naming conventions in `hooks/` (`use-analytics.ts` vs `useCapstoneAutosave.ts`); a duplicated, diverged `useUsageTimeTracker` in both `hooks/` and `lib/hooks/`.

**Can it scale?** Not as-is. The primitives can — they are sound. But with 96% of the UI bypassing them, each new feature adds another hand-rolled variant, and the cost of any cross-cutting change (a11y, dark mode, a brand refresh, a mobile design language) grows linearly with file count. The fix is adoption pressure, not more primitives.

---

## 8. Prioritized frontend roadmap

### NOW — correctness and safety, small and independent
1. **F-01** — escape `<`/`/` in all 14 JSON-LD `<script>` serializations; validate `bio`/`name`/URLs on write.
2. **F-10** — rename `app/error.tsx` → `app/global-error.tsx`.
3. **F-06** — navigate in `finally` on logout; surface failures; de-duplicate the two implementations.
4. **F-14 (partial)** — delete the six verified-dead components; either sanitize or delete `MarkdownRenderer` so it is not adopted by mistake.
5. **F-02 (decision only)** — decide the single session owner. Implementation pairs with Stage 2's S2-H2/H3.

### NEXT — the structural pass, sequenced
6. **F-03** — typed API client + SWR. *Prerequisite for 7, 12, and 18.*
7. **F-05** — clients branch on `code`. *Blocked on Stage 1 `withRoute()` emitting `code` everywhere.*
8. **F-02 / F-09** — one auth resolver, Bearer-first; migrate the 16 cookie-only routes. *Blocked on Stage 2 §6.*
9. **F-07** — push the client boundary down on marketing; remove framer-motion from `ui/progress-bar.tsx`.
10. **F-04** — primitive adoption at point of change + the ESLint rule.
11. **F-11** — general client error reporting. *Depends on Stage 2 S2-H13 hardening the telemetry endpoint.*
12. **F-12 / F-13** — standardize forms on RHF + zod; add axe-core to CI.

### LATER — with triggers
13. **F-08** — move domain rules server-side. *Trigger: the React Native vs native decision.*
14. **F-15** — extend the CI hex guard beyond the four brand colors; settle one radius scale. *Trigger: F-04 underway.*
15. **F-16** — split oversized components at point of change.
16. **F-17** — resize avatars at upload.
17. **F-18** — retry and offline detection in the fetch layer. *Trigger: mobile work begins.*
18. **F-19** — confirm metadata coverage on public routes.

---

## 9. Questions and unknowns requiring a decision

**Product decisions**
1. **React Native/Expo or native Swift/Kotlin?** This is the highest-leverage open question in the audit. It determines whether F-08 is a shared-code refactor or a backend re-architecture, and whether F-04 should produce cross-platform tokens.
2. **Is there a mobile timeline at all?** If mobile is 18+ months out, items 8, 13, and 17 drop below the design-system work. If it is next quarter, they move ahead of everything except NOW.
3. **Is localization planned?** F-05 is a correctness issue either way, but i18n makes it blocking rather than merely awkward.
4. **What accessibility standard is being committed to?** WCAG 2.1 AA is assumed throughout this report. If there is a contractual or regulatory obligation, F-13 moves to NOW and needs an audited baseline, not a grep.

**Architectural decisions**
5. **SWR, TanStack Query, or Next-native caching?** SWR is the recommendation on footprint, but if Server Actions are the intended mutation path, the shape of F-03 changes.
6. **Should the marketing site stay in this app?** It has different performance, caching, and deploy characteristics from the product. Splitting it would resolve F-07 structurally, at the cost of a second surface to maintain. Not recommended now — noted as a real option.
7. **Who owns visual consistency once primitives are adopted?** F-04 will regress without either CI enforcement or an owner.

**Needs live verification — not answerable from the repository**
8. **Actual bundle sizes and Core Web Vitals.** Every performance statement in §6 is code-derived. `next build` output plus a Lighthouse run on the landing page would confirm or reduce F-07.
9. **Real accessibility violation count.** 197 `aria-label` uses versus 53 `htmlFor` means an unknown share of the 184 controls are labelled the other way. axe-core would give the true number.
10. **Does `app/error.tsx` actually emit nested `<html>`?** Confirmed by reading; should be confirmed in a browser before the fix.
11. **Is `AdminBroadcastModal.tsx` dead?** Marked **[ASSUMPTION]** — it coexists with a much larger `AdminCreateBroadcastModal.tsx` and was not verified.

---

## Top 10 issues and recommended order

| # | ID | Issue | Severity | Why this position |
|---|---|---|---|---|
| 1 | **F-01** | Public portfolio XSS via JSON-LD `<script>` breakout | Critical | Live vulnerability on a public page. Small, self-contained fix. |
| 2 | **F-10** | `app/error.tsx` misfiled; no `global-error.tsx` | Medium | A one-line rename removes a blank-page failure mode. Cheapest win here. |
| 3 | **F-06** | Logout fails silently, no navigation | High | Users believe they signed out when they did not. Small fix, real safety impact. |
| 4 | **F-02** | Session state in `localStorage` *and* cookies | High | Makes httpOnly protection decorative, and blocks mobile. Decide now, implement with Stage 2 S2-H2/H3. |
| 5 | **F-03** | No data layer — 126 hand-rolled fetches | High | Prerequisite for F-05, F-11, F-18. Everything downstream is cheaper after this. |
| 6 | **F-05** | API errors are English strings, 113 dependents | High | Blocks mobile and i18n. Follows F-03 and Stage 1's `withRoute()`. |
| 7 | **F-09** | 16 cookie-only routes incl. the whole lesson loop | High | Hard mobile blocker. Pairs with the F-02 auth resolver. |
| 8 | **F-07** | Marketing landing page fully client-rendered | High | Largest CWV risk, but it degrades experience rather than breaking anything. Verify with a real build first. |
| 9 | **F-04** | Design system unused — 12 of 319 files | High | Compounding maintenance cost, and the prerequisite that makes F-13 and F-15 tractable. Incremental, so it can run alongside the rest. |
| 10 | **F-08** | Domain logic in 17 client components | High | Highest effort, and its scope depends on the React Native vs native decision. Sequence it last. |

**Ordering rationale:** items 1–4 are small, independent, and fix live defects. Items 5–7 are one sequenced project — the data layer enables the error contract, which the auth resolver depends on — and together they unblock mobile. Item 8 needs measurement before effort. Items 9–10 are the long tail: F-04 runs continuously in the background of feature work, and F-08 waits on a product decision.

---

*End of Stage 3. Read-only audit. No application code, tests, or configuration modified. No fixes implemented. No mobile support implemented. No UI redesigned. No Stage 1/2 recommendations implemented. Nothing pushed.*

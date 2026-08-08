# PM Academy — Current Status

> **Live Status & Active Focus.** This document represents the current, real-time status of the repository. It is updated at the end of every implementation session to serve as the source of truth for current focus, active bugs, and immediate tasks.
> **Documentation entry point:** See [`docs/INDEX.md`](./INDEX.md) for the full doc map.

---

## 1. Repository Metadata

- **Current Branch:** `main`
- **Current Version:** `1.0.0-rc1` (Release Candidate 1 complete)
- **Last Successful Build:** 2026-08-08 (Next.js 16 App Router production build — clean, exit 0, 90 lessons compiled)
- **Current Implementation Phase:** **PM Academy v1.0.0-rc1 RELEASE CANDIDATE COMPLETE**

---

## 2. Project Stage & Milestones

For phase definitions, see [`docs/Phases.md`](./product/Phases.md) and [`docs/memory/roadmap.md`](./memory/roadmap.md).

- **Phase 1 Foundation & Learning Loop:** ✅ Complete
- **Phase 2 Gamification & Retention Layer:** ✅ Complete (`v0.2.0-stable`)
- **Phase 3 – Sprint 1 (Capstone Workspace):** ✅ Complete
- **Phase 3 – Sprint 2 (Public Portfolio `/p/[username]`):** ✅ Complete
- **Phase 3 – Sprint 3 (Certificates & PDF Export `/verify/[certificateId]`):** ✅ Complete
- **Phase 3 – Sprint 4 (Badge & Achievement System `/badges`):** ✅ Complete
- **Phase 3 – Sprint 5 (Friends & Cohort Leaderboard `/leaderboard`):** ✅ Complete
- **Phase 3 – Stabilization Sprint (Priority 1 + 2 + 3):** ✅ Complete
- **Phase 3 – Sprint 6.1 (Notification Platform Foundation):** ✅ Complete (`apps/web/lib/notifications/`)
- **Phase 3 – Sprint 6.2 (Email Engine & Delivery Infrastructure):** ✅ Complete (`apps/web/emails/`, `app/api/cron/`)
- **Phase 3 – Architecture Refactor Sprint:** ✅ Complete (`apps/web/lib/` domain organization)
- **Phase 3 – Sprint 6.3 (In-App Notification Center & Preferences):** ✅ Complete (`NotificationBell`, `NotificationCenterDrawer`, `/api/notifications/`)
- **Phase 3 – Notification Platform Alignment:** ✅ Complete (In-App primary, Email restricted, GitHub Actions scheduler)
- **Phase 3 – Sprint 6.4 (Admin Console & Dev Tools):** ✅ Complete (`/admin`, RBAC middleware, Dev Certificate Tools)
- **Phase 3 – Sprint 6.4.2 (Admin UI/UX Polish & Design System Alignment):** ✅ Complete (Standardized `AdminDataTable`, `AdminKpiCard`, `AdminPageHeader`, `AdminStatusBadge`)
- **Phase 3 – Sprint 6.4.3 (Admin Operational Functionality & Live Actions):** ✅ Complete (Interactive user role toggles, user profile inspection `/admin/users/[id]`, manual queue trigger, live feature flag toggles, test email sender)
- **Phase 3 – Sprint 6.4.4 (Admin Authentication, RBAC & Access Security):** ✅ Complete (`/admin/login`, `/admin/access-denied`, `ADMIN_EMAILS` env support, proxy middleware & API guard audit logging)
- **Sprint 6.5 (Release Candidate & Production Readiness Audit):** ✅ Complete (`v1.0.0-rc1` ready for production tagging)
- **Sprint 7.1 (Global Branding & Documentation):** ✅ Complete & Audited (`lib/brand.ts`, `BrandLogo` system, static brand assets, full rebrand pass, build-time Mermaid→SVG static compilation stage, 0 runtime Mermaid overhead)
- **Sprint 7.2 (Settings 2.0):** ✅ Complete & Audited (Unified 5-tab Settings IA, `ConfirmDestructiveAction` typed confirmation dialogs, ledger-respecting XP reset, account deletion cascade, `lib/settings/settings-service.ts`, 8 new API routes under `/api/settings/`, and automated regression test suite)
- **Sprint 7.3 (Certificate System 2.0):** ✅ Complete & Audited (Clean single production certificate renderer, pure `lib/certificates/linkedin-url.ts` builder, direct `/verify/[certificateId]` QR code embedding, `test:certificates` test suite, zero internal V1/V2 terminology exposed)
- **Sprint 7.4 (Admin Console Polish):** ✅ Complete & Audited (Exact 7-section IA: Overview, Content, Users drawer, Communications, Certificates, Feedback, System; User inspection slide-over drawer with URL deep-link support; Testimonials & Feedback moderation pipeline with `logAdminAction()` audit logs; `testimonials` migration with RLS policies).
- **Current Focus:** Ready for **Sprint 7.5 (Security & Performance Audit)**.

---

## 3. What's Next

Sprint 7.4 complete. Next step:

1. **[Sprint 7.5 — Next] Security & Performance Audit:** Threat Model document (`Security-Threat-Model.md`) and Performance Budget Checklist (`Performance-Budget-Checklist.md`).
2. **[Sprint 8.1] Marketing Website v2:** Consumes live `GET /api/testimonials` from Feedback moderation pipeline.

---

## 4. Active Issues, Blockers & Bugs

None. All root-cause bugs resolved.

### Resolved This Session (Production Debugging & Root Cause Pass)

- **Supabase Auth Permanent User Deletion (Resolved):** Updated `/api/settings/delete-account` to call `supabase.auth.admin.deleteUser(userId)` via the service-role client after deleting database application rows. The Auth user is now permanently deleted from Supabase Authentication.
- **Certificate Verification URL & QR Code Domain (Resolved):** Replaced hardcoded `https://pmacademy.com` fallback and legacy `NEXT_PUBLIC_APP_URL` references with `NEXT_PUBLIC_SITE_URL` across `lib/brand.ts`, certificate generators, notification event connectors, and email wrappers. Updated `.env.example`.
- **Mermaid Diagram Collapsed Height (Resolved):** Fixed JSDOM `getBBox` polyfill in `scripts/compiler/mermaid-svg.ts` to inspect HTML label text within `foreignObject` and `<g>` containers. All 90 compiled lessons now compute accurate viewBox dimensions instead of collapsing to 52px height.
- **SVG Post-Processing Attribute Duplication (Resolved):** Cleaned raw SVG tag post-processing in `compileMermaidToSvg` to strip existing `class`, `role`, and `viewBox` attributes before inserting PM Academy styles, preventing duplicate `class` attribute conflicts in browsers. Bumped compiler cache version to `'7'`.

**Sprint 7.1 — Universal Mermaid System Rebuild:**
- 🎨 **Real Engine Layout & Green/White Styling:** Replaced custom mock parser with official `mermaid` v11 engine executing at build time (`content:compile`) in Node.js via JSDOM (`scripts/compiler/mermaid-svg.ts`). Restored 2D Dagre layout, decision diamonds, horizontal branching, curved/orthogonal arrows, sequence diagrams, and subgraphs with PM Academy green/white design tokens (`theme/tokens.ts`) and embedded `.dark` CSS overrides.
- 📐 **Fluid Responsive Sizing & 100% Zoom:** Post-processed SVG output with fluid `viewBox`, `preserveAspectRatio="xMidYMid meet"`, and `style="width: 100%; max-width: ${naturalWidth}px; height: auto;"` inside `w-full max-w-full flex justify-center` flex containers in `MermaidBlock.tsx`. Resolved issue where diagrams forced browser zoom down to ~33%.
- 🚀 **Zero Runtime Overhead:** Compiled all 90 lessons and 203/203 Mermaid diagrams with 0 errors / 0 warnings (`npm run content:compile`, `npm run content:validate`, `npm run test:compiler`, `npm run build`). Zero client-side Mermaid JS runtime shipped to browser.

**Priority 1 — Critical Functional Fixes:**
- 🔒 **Lesson Rendering:** Empty section components (`InterviewPerspectiveSection`, etc.) returned `null` when data arrays and children were both empty. Added `hasRenderableChildren` guard to all 13 section types in `SectionBlock.tsx`.
- 🔒 **Review Hub Progress:** `stats` counts (`dueTodayCount`, `completedTodayCount`) were not updated in real-time during a session. Fixed `handleRatingSelect` to progressively update local state on each card submission and call `router.refresh()` on session completion.
- 🔒 **Portfolio Settings API 401:** `getAuthenticatedUserFromRequest` was destructured incorrectly in `/api/settings/portfolio/route.ts`. Fixed to correct direct assignment.
- 🔒 **Lesson Navigation Display:** Dashboard displayed "Lesson 1: User Research" (module-scoped order) for Lesson 11. Fixed `dashboard/page.tsx` to use `activeNextIndex + 1` (global 1-indexed order).

**Priority 2 — Product Experience Fixes:**
- 🏆 **Module Completion Celebration:** Added dedicated Module Completion view when `globalOrder % 10 === 0` (every 10th lesson) with Trophy badge, Capstone unlock CTA, Continue to Next Module button, Flashcard review link, and Share Achievement.
- 🗺️ **Continue Learning Flow:** Updated `/academy` curriculum page to point module action buttons to the learner's first uncompleted lesson in each module (not always Lesson 1).
- 📊 **Progress Page:** Replaced scaffold placeholder with full competency dashboard — level, streak, skill radar, 9-capstone status grid, and certificate eligibility/discovery.
- 📜 **Certificate Visibility:** Certificates now prominently shown on `/progress`, `/dashboard`, `/settings`, and `/p/[username]`. Eligibility progress bar shown for learners who haven't earned a certificate yet.
- ⚙️ **Capstone Page Auth:** Replaced `supabase.auth.getUser()` direct call with `getServerUser()` in `capstones/page.tsx`.

**Priority 3 — Navigation & Performance:**
- 🧭 **Curriculum Navigation Bug Fixed (Root Cause):** The locked lesson screen displayed "Lesson 2" (module-scoped `order`) when user tried to skip to Lesson 12. Root cause: `lesson.order` is module-scoped (1-10), not global. Fixed `page.tsx` to compute `globalOrder = curriculumIndex + 1` from the global lesson array and pass it to `LessonPageContent` as a prop. The locked screen now correctly reads "Complete Lesson 11: User Research" with the correct button link.
- 🧭 **Module Completion Detection:** `isModuleComplete = lesson.order % 10 === 0` used module-scoped order (always triggered on Lesson 10 of each module but incorrectly on lesson 1 of a new module). Fixed to `globalOrder % 10 === 0`.
- 🧭 **Breadcrumbs:** Lesson breadcrumbs displayed module-scoped order. Fixed to use `globalOrder` from server component prop.
- 🧭 **Metadata Title:** Lesson page `<title>` used `lesson.order` (module-scoped). Fixed to `globalOrder`.

### Resolved This Session (2026-08-08 — Lesson Rendering Hotfix)

- 🧭 **Connections Content Dropped from All Lesson Pages:** The theory-tab block filter in `apps/web/app/(app)/academy/[moduleSlug]/[lessonId]/lesson-content.tsx` excluded the compiled `connections` block, and no other tab rendered it — so the authored `## Connections` table (Previous/Current/Next + "Future Concepts Unlocked") never appeared on any lesson page, even though `ConnectionsBlock` is registered. Removed `'connections'` from the exclusion set; the block now renders at the end of the theory tab. Verified against `les_04ix6b` (full-featured lesson: all 24 authored blocks render, zero orphaned content) and a clean production build.
- 🔢 **Lesson Header Number:** The lesson page header showed `Lesson {lesson.order}` (module-scoped 1–10), so lessons 11–90 displayed the wrong lesson number. Now renders `Lesson {globalOrder}` (1–90), consistent with the breadcrumbs/title/locked-screen fixes from the stabilization sprint.

### Resolved This Session (2026-08-08 — Sprint 7.1 Wrap-up Hotfixes)

- 📐 **Mermaid Diagram Rendering Quality:** Static-SVG compiler (`scripts/compiler/mermaid-svg.ts`) produced inconsistent label fonts (11.12px/10.5px/9.14px vs 14px from a design-width downscale), oversized boxes (`minW = 128*scale`), and forced horizontal overflow (`min-width` ≥720px, up to 1423px natural width on LR diagrams; short unbroken tokens clipped). Fixes: removed the downscale, `minW` 128→48, added char-level label wrapping, and switched emitted style to `width:{vw}px;max-width:100%;height:auto` (proportional scaling, no horizontal scroll). Bumped compiler `CACHE_VERSION` to `4` so stale `content/dist` SVGs (old format) are never served from cache. Added 4 rendering-quality unit tests (14/14 compiler tests pass). Audit of all 203 diagrams: 14px font everywhere, zero `min-width`, zero viewBox clips, zero real text overflow.
- 🔔 **`notification-scheduler.yml` Silent Failure:** Workflow referenced the undocumented `secrets.APP_URL` (unset → malformed cron URL) and plain `curl` swallowed HTTP errors (401 from `CRON_SECRET` check exited 0), so every scheduled job silently no-opped. Fixes: job-level `CRON_ORIGIN = ${{ secrets.APP_URL || 'https://pmacademy.com' }}` fallback and `curl --fail-with-body` on all four cron steps; `APP_URL`/`CRON_SECRET` GitHub secrets documented in `Notification-Architecture.md` §17.
- 🚀 **`ci.yml` Automatic Triggers:** Confirmed the workflow always had automatic triggers (push/PR to `main` since `0e9d0c9`, `workflow_dispatch` since `9afc064`) — the real regression was `6fb9800` removing the Sprint 7.1 brand-hardening check, which has been restored verbatim (passes against the current tree).

---

## 5. Definition of Done for Phase 3 Stabilization (All Complete ✅)

- [x] Lesson rendering: empty sections do not render visible empty cards.
- [x] Review Hub: Due Today count updates in real-time during a session.
- [x] Portfolio Settings: saves persist across refresh and re-login.
- [x] Lesson Navigation: Continue Learning shows correct global lesson number.
- [x] Module Completion: trophy screen fires on global lesson 10, 20, 30... 90.
- [x] Locked lesson screen: shows correct previous lesson name and global number.
- [x] Breadcrumbs: display correct global lesson number (1–90).
- [x] Continue Learning: all pages resolve next uncompleted lesson correctly.
- [x] Progress page: uses real data (no placeholders).
- [x] Certificates: discoverable from dashboard, progress, settings, portfolio.
- [x] Capstone page: auth uses unified `getServerUser()`.
- [x] Curriculum page: progress-aware module action buttons.
- [x] Production build: 0 TypeScript errors, 0 ESLint errors, 39 routes, 90 lessons.
- [x] Unit tests: 3/3 leaderboard tests pass.

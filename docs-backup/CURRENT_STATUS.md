# PM Academy — Current Status

> **Live Status & Active Focus.** This document represents the current, real-time status of the repository. It is updated at the end of every implementation session to serve as the source of truth for current focus, active bugs, and immediate tasks.
> **Documentation entry point:** See [`docs/INDEX.md`](./INDEX.md) for the full doc map.

---

## 1. Repository Metadata

- **Current Branch:** `main`
- **Current Version:** `1.0.0-rc1` (Release Candidate 1 complete)
- **Last Successful Build:** 2026-08-05 (Next.js 16 App Router production build — clean, 0 errors, 79 routes, 90 lessons compiled)
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
- **Sprint 7.1 (Global Branding & Documentation):** ✅ Complete (`lib/brand.ts`, `BrandLogo` system, static brand assets, full rebrand pass across app/emails/certs/admin, build-time Mermaid→SVG static compilation stage, documentation sync)
- **Current Focus:** Ready for Sprint 7.2 (Settings 2.0)

---

## 3. What's Next

Sprint 7.1 Global Branding & Documentation complete. Ready for **Sprint 7.2 (Settings 2.0)**:

1. **[Sprint 7.2 — Next] Settings 2.0:** Unified Settings IA (Profile, Security, Portfolio, Notifications, Danger Zone) with ledger-respecting reset actions.
2. **[Sprint 7.3] Certificate System 2.0:** Versioned certificates, QR verification, and LinkedIn profile integration.

---

## 4. Active Issues, Blockers & Bugs

None. All stabilization sprint items resolved.

### Resolved This Session (Phase 3 — Stabilization Sprint Priority 1, 2, 3)

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

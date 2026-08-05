# Changelog

All notable changes to the PM Academy project will be documented in this file.

The project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html) (`MAJOR.MINOR.PATCH`).

Release notes are ordered reverse-chronologically. Each release categorizes changes under Added, Changed, Fixed, Removed, Technical, Documentation, Verification, and Known Limitations when applicable.

---

## [Unreleased] - Phase 3 Architecture Refactor Sprint

- **Status:** Development Complete
- **Release Date:** 2026-08-05

### Refactored & Reorganized

- **Feature-Based Business Logic (`apps/web/lib/`)**:
  - Reorganized 27 loose business logic files into clean domain modules (`lib/academy/`, `lib/xp/`, `lib/streaks/`, `lib/badges/`, `lib/leaderboard/`, `lib/portfolio/`, `lib/certificates/`, `lib/capstones/`, `lib/review/`, `lib/radar/`, `lib/notifications/`, `lib/admin/`, `lib/analytics/`).
  - Added backward-compatible barrel exports in root `lib/*.ts` ensuring **0 breaking changes** for existing API routes, components, and test files.
- **Admin Console Architecture Foundation (`apps/web/lib/admin/`)**:
  - Established `lib/admin/types.ts` for unified admin domain models (`AdminDashboardSummary`, `AdminSystemHealth`, `AdminUserOverview`).
  - Implemented `lib/admin/guard.ts` with `requireAdminUser(request)` for strict server-side authorization checking `users.is_admin`.
  - Implemented `lib/admin/service.ts` (`AdminConsoleService`) providing modular data access for future `/admin` console views.
- **Dynamic Module Loading & Import Optimization**:
  - Replaced static `react-dom/server` imports in `emails/index.ts` with dynamic import `import('react-dom/server')` for full Next.js 16 App Router compatibility.
- **Verification**:
  - All 11 automated test suites (`test:xp`, `test:streaks`, `test:radar`, `test:srs`, `test:capstones`, `test:portfolio`, `test:certificates`, `test:badges`, `test:leaderboard`, `test:notifications`, `test:email`) passing cleanly (**87+ tests total**).
  - Clean TypeScript build (`npx tsc --noEmit`), zero ESLint errors (`npm run lint`), clean production build (`npm run build`).

---

## [Unreleased] - Phase 3 Sprint 6.2: Email Engine & Delivery Infrastructure

- **Status:** Development Complete
- **Release Date:** 2026-08-05

### Added

- **React Email Templates (`apps/web/emails/`):** Built 9 responsive HTML & plain text email templates using brand tokens (`#d97706`), accessibility WCAG AA compliance, and Light/Dark mode styling.
  - **Auth**: `auth.welcome`, `auth.verify_email`, `auth.password_reset`.
  - **Learning**: `learning.module_complete`, `learning.weekly_recap`.
  - **Achievements**: `achievement.badge_earned`, `achievement.level_up`, `achievement.certificate`, `achievement.portfolio_published`.
  - **Shared UI Components**: `EmailWrapper` (base layout with headers, footers, unsubscribe links), `Button`, `StatCard`, `BadgeDisplay`, `ProgressBar`.
  - **Template Renderer Registry (`emails/index.ts`)**: Pure template compilation converting React Email component trees to static HTML & plain-text strings with subject variable substitution.
- **Production Resend Provider (`apps/web/lib/notifications/providers/resend-provider.ts`):** Upgraded `ResendProvider` with direct REST API dispatch (`fetch` to `https://api.resend.com/emails`), headers (`List-Unsubscribe`), template tags, replyTo support, error detail extraction, and dev simulation fallback when `RESEND_API_KEY` is absent.
- **Queue Processor & Retry Engine (`apps/web/lib/notifications/queue/processor.ts`):**
  - `enqueueNotificationItem()`: Handles feature flag validation, user preferences gating, priority bypass rules, duplicate enqueuing prevention, and in-memory queue fallback.
  - `processEmailQueue()`: Batch processor executing atomic locks, suppression checks, template rendering, provider dispatch, status lifecycle state updates (`pending` → `processing` → `delivered` / `retrying` / `dead_letter` / `suppressed`), and timeline logging.
  - Exponential backoff retry handling and permanent error dead-letter routing.
- **Event-to-Queue Connectors (`apps/web/lib/notifications/events/connectors.ts`):** Default event handlers registering 8 canonical events (`user.registered`, `user.verified`, `password.reset_requested`, `module.completed`, `badge.earned`, `xp.level_up`, `certificate.generated`, `portfolio.published`) to the `NotificationEventDispatcher`.
- **Scheduled Cron Routes & Configuration (`app/api/cron/`, `vercel.json`):**
  - Next.js App Router authenticated cron routes: `/api/cron/process-email-queue`, `/api/cron/daily-reminders`, `/api/cron/weekly-recap`, `/api/cron/retry-failed`, `/api/cron/cleanup`.
  - Registered schedules in root `vercel.json`.
- **Webhooks & Unsubscribe API (`app/api/email/`):**
  - `/api/email/webhooks`: Resend event delivery webhook handler.
  - `/api/email/unsubscribe`: One-click unsubscribe endpoint returning user preference confirmation.
  - `/api/dev/send-test-email`: Development endpoint for testing template rendering and queue execution.
- **Email Engine Test Suite (`apps/web/lib/__tests__/email-engine.test.ts`):** 8 automated unit tests verifying template rendering output, event-to-queue dispatching, queue processor delivery, duplicate prevention, feature flags gating, user preferences gating, suppression filtering, and dead-letter handling. Added `test:email` script to `package.json`.

---

## [Unreleased] - Phase 3 Sprint 6.1: Notification Platform Foundation

- **Status:** Development Complete
- **Release Date:** 2026-08-05

### Added

- **Notification Module Architecture (`apps/web/lib/notifications/`):** Clean, modular, type-safe notification platform foundation.
  - `types.ts` & `constants.ts`: Core NotificationPriority ('critical'|'high'|'medium'|'low'|'bulk'), Channel, Category, EventEnvelope, and Priority Matrix definitions.
  - `events/`: Strongly typed event payloads (`lesson.completed`, `module.completed`, `quiz.completed`, `review.completed`, `badge.earned`, `xp.level_up`, `streak.updated`, `portfolio.published`, `certificate.generated`, `capstone.submitted`, `user.registered`, `user.verified`, `password.reset_requested`) and payload validators.
  - `dispatcher.ts`: `NotificationEventDispatcher` for registering event handlers, validating payloads, multi-handler dispatching, and fire-and-forget error isolation.
  - `providers/`: Channel-agnostic `NotificationProvider` interface and `ResendProvider` scaffold.
  - `priority/`: `PriorityMatrix` service for exponential backoff calculations and rate limit/preference bypass evaluations.
  - `feature-flags/`: `FeatureFlagService` providing runtime flags (`EMAIL_ENABLED`, `IN_APP_NOTIFICATIONS_ENABLED`, `BADGE_EMAILS_ENABLED`, etc.) with in-memory caching and safe defaults.
  - `preferences/`: Channel-agnostic notification preference models and category permission checkers.
  - `templates/`: `TemplateRegistryService` for template version metadata lookup, active version resolution, and deprecation checks.
  - `queue/`: Queue item types, status lifecycle (`pending`, `processing`, `delivered`, `failed`, `retrying`, `dead_letter`, `suppressed`), priority sorters, and ready filters.
  - `timeline/`: `UserNotificationTimelineRecord` model and queue-item transformer helpers.
  - `analytics/`: Metric tracking models and rate calculation helpers (`openRatePercent`, `clickRatePercent`).
  - `admin/`: `AdminFoundationService` backend interfaces for system status inspection, queue inspection, template registry, and feature flags toggle.
  - `registry.ts`: `NotificationPlatformRegistry` central barrel wrapper.
- **Database Migration (`supabase/migrations/20260806000001_notification_platform_foundation.sql`):** Created `user_notification_preferences`, `notification_events`, `email_queue`, `email_dead_letter`, `in_app_notifications`, `email_delivery_events`, `email_suppressions`, `notification_feature_flags`, `notification_templates`, `notification_template_versions`, `user_notification_timeline`, and `system_settings` tables with indexes and RLS policies. Updated `users.is_admin` column.
- **Supabase Type Definitions (`apps/web/lib/supabase.ts`):** Extended `Database['public']['Tables']` types to include `is_admin` on `users`.
- **Unit Test Suite (`apps/web/lib/__tests__/notifications.test.ts`):** 10 automated unit tests verifying event registration, dispatching, payload validation, provider abstraction, feature flags, priority calculations, preferences, template metadata versioning, and queue sorting. Registered `test:notifications` script in `package.json`.

---

## [Unreleased] - Phase 3: Stabilization Sprint (Priority 1 + 2 + 3)

- **Status:** Complete
- **Release Date:** 2026-08-05

### Fixed

- **Lesson Rendering — Empty Section Cards (Priority 1):** Added `hasRenderableChildren` guard across all 13 section components in `SectionBlock.tsx`. Empty sections (e.g., `InterviewPerspectiveSection` with no content) now return `null` instead of rendering empty card containers.
- **Review Hub Real-Time Progress (Priority 1):** Fixed `ReviewHub.tsx` to progressively decrement `dueTodayCount` and increment `completedTodayCount` on each card submission, clear `dueCards` on session completion, and call `router.refresh()` to invalidate server state.
- **Portfolio Settings 401 (Priority 1):** Corrected `getAuthenticatedUserFromRequest` call in `/api/settings/portfolio/route.ts` — was destructured as `{ user }` instead of used directly.
- **Lesson Navigation Display (Priority 1):** Dashboard "Continue Learning" card showed "Lesson 1: User Research" for Lesson 11 because `activeNext.order` was module-scoped. Fixed to `activeNextIndex + 1` (global curriculum index).
- **Locked Lesson Screen Navigation Bug (Priority 3 — Root Cause):** Locked lesson screen displayed "Lesson 2" (module-scoped order) when attempting Lesson 12. Fixed `page.tsx` to compute `globalOrder` from the 90-lesson curriculum array index and pass it to `LessonPageContent`. Screen now correctly reads "Complete Lesson 11: User Research →".
- **Module Completion Detection (Priority 3):** `isModuleComplete = lesson.order % 10 === 0` used module-scoped order. Fixed to `globalOrder % 10 === 0` using server-computed global position.
- **Breadcrumb Lesson Numbering (Priority 3):** Breadcrumbs displayed module-scoped order. Fixed to use `globalOrder` prop passed from server.
- **Metadata Page Title (Priority 3):** Lesson `<title>` tag used `lesson.order` (module-scoped). Fixed to `globalOrder`.
- **Capstone Auth (Priority 2):** `capstones/page.tsx` used `supabase.auth.getUser()` directly instead of `getServerUser()`.

### Added

- **Module Completion Celebration Screen (Priority 2):** Completing the 10th lesson of a module (global lessons 10, 20, 30… 90) now shows a dedicated trophy celebration view with Capstone unlock CTA, Continue to Next Module button, Review Flashcards shortcut, and Share Achievement action.
- **Dynamic Curriculum Navigation (Priority 2):** `/academy` curriculum page now fetches user progress and points module action buttons to the learner's first uncompleted lesson in each module (not always Lesson 1). Completed modules show a "✓ Completed" badge and "Review Module" CTA.
- **Progress Page — Single Source of Truth (Priority 2):** Replaced the placeholder scaffold at `/progress` with a full competency dashboard: level & career rank, streak status, skill radar breakdown, 9-module capstone status grid, and certificate eligibility/discovery.
- **Certificate Discoverability (Priority 2):** Certificates now visible and linked from `/progress`, `/dashboard`, `/settings`, and the public `/p/[username]` portfolio. Learners who haven't earned a certificate see an eligibility progress bar.

---

## [Unreleased] - Phase 3 Sprint 5: Friends & Cohort Leaderboard System

- **Status:** Development Complete
- **Release Date:** 2026-08-05

### Added

- **Consistency Leaderboard Home (`app/(app)/leaderboard/page.tsx`):** Consistency-first leaderboard page displaying global weekly rankings, friend rankings, learning cohorts, personal rank metric, weekly days studied count (`X / 7`), lessons completed, and opt-in privacy status toggle.
- **Pure Ranking Logic (`lib/leaderboard.ts`):** `calculateWeekStart` (UTC Monday date math) and `calculateRankings` sorting users primarily by `daysStudied` DESC, `lessonsCompleted` DESC, and `xpEarned` DESC as a tie-breaker.
- **Leaderboard & Cohort Database Services (`lib/leaderboard-db.ts`):** `getWeeklyLeaderboard`, `toggleLeaderboardOptIn`, `getFriendLeaderboard`, `addFriend`, `removeFriend`, `getCohortsData`, and `toggleCohortMembership`.
- **API Endpoints (`app/api/leaderboard/route.ts`, `app/api/friends/route.ts`, `app/api/cohorts/route.ts`):** Authenticated route handlers for querying rankings, toggling opt-in privacy, adding/removing friends, and managing cohort memberships.
- **UI Components & Dashboard Integration (`components/leaderboard/LeaderboardTable.tsx`, `components/leaderboard/LeaderboardHeader.tsx`, `components/leaderboard/ProfileComparisonModal.tsx`, `components/dashboard/DashboardLeaderboardWidget.tsx`):** Responsive rank table with position change arrows, opt-in privacy button, peer profile comparison modal, and lightweight dashboard widget.
- **Database Migration (`supabase/migrations/20260805000006_create_leaderboards_and_cohorts.sql`):** Created `user_leaderboard_settings`, `weekly_leaderboard_snapshots`, `user_friends`, `cohorts`, and `cohort_members` tables with public/opt-in RLS policies.
- **Leaderboard Unit Tests (`lib/__tests__/leaderboard.test.ts`):** Automated unit tests verifying Monday date math, consistency-first ranking order, tie-breaking logic, and position change calculations (3 tests).

---

## [Unreleased] - Phase 3 Sprint 4: Badge & Achievement System

- **Status:** Development Complete
- **Release Date:** 2026-08-05

### Added

- **Badge Gallery Page (`app/(app)/badges/page.tsx`):** Complete achievement gallery displaying total badges earned, completion percentage progress bar, recent milestone highlight, category filters (`Learning`, `Quiz`, `XP`, `Consistency`, `Capstones`, `Portfolio`, `Completion`), and live progress tracking (`X / Y`) towards locked badges.
- **Centralized Badge Configuration (`config/badges.ts`):** Defined structured badge metadata and criteria rules across 7 categories (`first_lesson`, `module_complete`, `curriculum_explorer`, `first_perfect_quiz`, `quiz_master`, `first_level_up`, `xp_1000`, `xp_5000`, `streak_7`, `streak_30`, `streak_comeback`, `first_capstone`, `capstones_all`, `portfolio_published`, `pm_academy_graduate`).
- **Badge Engine & DB Services (`lib/badges.ts`, `lib/badges-db.ts`):** Pure badge progress calculator (`calculateBadgeProgress`), eligible badge evaluator (`evaluateEligibleBadges`), database query service (`getUserBadgesData`), and idempotent badge awarding function (`evaluateAndAwardBadges`).
- **Badge API Endpoints (`app/api/badges/route.ts`):** Authenticated `GET` handler returning user's earned badges and progress metrics, and `POST` handler triggering automated badge evaluation and returning newly unlocked badges.
- **UI Components & Portfolio Integration (`components/badges/BadgeCard.tsx`, `components/badges/BadgeNotification.tsx`, `components/portfolio/PortfolioAchievements.tsx`):** Responsive badge cards with category tags, subtle unlock toast notifications, and dynamic portfolio achievement grid rendering live earned badges.
- **Database Migration (`supabase/migrations/20260805000005_seed_badges.sql`):** Seeded standard badge definitions into `badges` table with idempotent `ON CONFLICT (key) DO UPDATE` handling.
- **Badge System Unit Tests (`lib/__tests__/badges.test.ts`):** Automated unit tests verifying badge metadata structure, progress calculations, and duplicate award prevention (3 tests).

---

## [Unreleased] - Phase 3 Sprint 3: Certificate & PDF Export System

- **Status:** Development Complete
- **Release Date:** 2026-08-05

### Added

- **Public Certificate Verification Page (`app/verify/[certificateId]/page.tsx`):** Official verification page for completion certificates displaying verified learner name, career title, level badge, issue date, completion summary metrics, interactive certificate card, and schema.org `EducationalOccupationalCredential` structured data.
- **Printable Certificate Layout (`components/certificates/CertificateCard.tsx`):** High-resolution landscape completion certificate featuring double gold/navy border, PM Academy watermark logo, learner metrics, official signature block, and pure SVG QR Code matrix linking directly to learner's public portfolio.
- **Certificate Actions Bar (`components/certificates/CertificateActions.tsx`):** Interactive action triggers for Print / Download PDF (`window.print()`), Copy Verification Link with toast feedback, Native Web Share API (`navigator.share`), and View Public Portfolio.
- **Certificate Data Services (`lib/certificates.ts`, `lib/certificates-db.ts`):** Certificate code generator (`generateCertificateCode`), QR code SVG matrix generator (`generateQrCodeSvg`), EducationalOccupationalCredential JSON-LD builder, and database service methods (`issueCertificate`, `verifyCertificate`, `getUserCertificates`).
- **Certificate API Route (`app/api/certificates/route.ts`):** Authenticated route handlers for querying (`GET`) and issuing (`POST`) official completion certificates.
- **Database Migration (`supabase/migrations/20260805000004_create_certificates.sql`):** Added `certificates` table storing deterministic certificate codes, user references, learner names, levels, titles, and completion stats with a public verification RLS policy.
- **Print CSS Layout (`app/globals.css`):** Added `@media print` rules for landscape print dimensions, background color retention, and hiding non-printable page elements.
- **Certificates Unit Tests (`lib/__tests__/certificates.test.ts`):** Automated unit tests verifying certificate code formatting, credential JSON-LD generation, and vector SVG QR code matrix rendering (4 tests).

---

## [Unreleased] - Phase 3 Sprint 2: Public Portfolio

- **Status:** Development Complete
- **Release Date:** 2026-08-05

### Added

- **Public Portfolio Page (`app/(portfolio)/p/[username]/page.tsx`):** Shareable personal website profile displaying user's verified career title, level badge, total XP, study streak, bio, social links (LinkedIn, GitHub, Website), Skill Radar competency breakdown, curriculum progress, verified capstones, public reflections, and milestone achievement badges.
- **SEO & Structured Data (`lib/portfolio.ts`):** Dynamic SEO metadata (`og:title`, `og:description`, `og:image`, `twitter:card`, canonical URLs), Person JSON-LD schema generation, and `robots` directive handling (`index, follow` for public vs `noindex, nofollow` for private).
- **Portfolio Database & Business Services (`lib/portfolio.ts`, `lib/portfolio-db.ts`):** `getPublicPortfolioData`, `getPortfolioSettings`, `updatePortfolioSettings`, username format validation (`validateUsername`), and URL validation.
- **Portfolio Settings (`app/(app)/settings/page.tsx`, `components/settings/PortfolioSettingsForm.tsx`, `app/api/settings/portfolio/route.ts`):** Authenticated user settings page allowing configuration of handle/username, display name, bio, avatar URL, social links, and public/private portfolio visibility toggle.
- **Share & Copy Component (`components/portfolio/ShareButton.tsx`):** Interactive Share button supporting Native Web Share API (`navigator.share`) and clipboard copy fallback with toast confirmation.
- **Database Migration (`supabase/migrations/20260805000003_add_portfolio_columns.sql`):** Added `username`, `bio`, `avatar_url`, `linkedin_url`, `github_url`, `website_url`, and `is_portfolio_public` columns to `users` table with public RLS policy.
- **Portfolio Unit Tests (`lib/__tests__/portfolio.test.ts`):** Automated unit tests verifying username validation, URL validation, Person schema JSON-LD generation, and share URL formatting (5 tests).

---

## [Unreleased] - Phase 3 Sprint 1: Capstone Workspace

- **Status:** Development Complete
- **Release Date:** 2026-08-05

### Added

- **Module Capstone Workspace (`app/(app)/capstones/page.tsx`, `app/(app)/capstones/[module]/page.tsx`):** Complete Capstone Workspace supporting all 9 modules with module status overview (`locked`, `unlocked`, `draft`, `submitted`, `reviewed`), interactive guidelines panel, Notion/Linear-like rich text editor, reflection integration, and responsive Design System v3 layout.
- **Capstone Data & Business Services (`config/capstones.ts`, `lib/capstones.ts`, `lib/capstones-db.ts`):** 9 module capstone definitions, word & character count calculators, submission validator (`validateCapstoneSubmission`), status derivator, and database operations for loading, draft saving, and submitting capstones.
- **Debounced Autosave System (`hooks/useCapstoneAutosave.ts`):** 2.5s debounced background draft saver with LocalStorage offline fallback buffer and automatic draft restoration.
- **API Endpoints (`app/api/capstones/`):** Authenticated route handlers for capstones overview (`GET /api/capstones`), module detail (`GET /api/capstones/[module]`), draft saving (`POST /api/capstones/[module]/draft`), and server-side submission (`POST /api/capstones/[module]/submit`).
- **XP & Progress Integration (`lib/capstones-db.ts`):** Idempotent 150 XP award on capstone submission via append-only `xp_events` ledger, reflection update, and streak tracking.
- **Capstones Unit Tests (`lib/__tests__/capstones.test.ts`):** Automated test suite verifying definitions, word count calculations, requirement validation, status logic, and XP constants (7 tests).

---

## [v0.2.0] - Phase 2 Complete

- **Status:** Stable Release
- **Release Date:** 2026-08-05
- **Git Tag:** `v0.2.0-stable`

### Added

- **XP & Level Engine (`lib/xp.ts`, `lib/xp-service.ts`):** Append-only `xp_events` ledger writer, Level and Career Title calculator (`calculateLevel`), anti-gaming dwell time and scroll depth verification for theory reading, first-attempt perfect quiz score bonus (+25 XP), and incremental score recalculation for quiz retries.
- **Timezone-Aware Streak Engine (`lib/streaks.ts`, `lib/streaks-db.ts`):** Daily study streak tracker using local user timezone boundaries, earned streak freeze mechanics (1 freeze earned per 7 consecutive study days, maximum 2 available), automatic streak freeze recovery on missed days, and passive status evaluation (`active`, `at_risk`, `broken`).
- **Skill Radar & Competency Engine (`lib/skillRadar.ts`):** Continuous 0–100 weighted competency scoring formula, 7-cluster curriculum competency mapping (`discovery`, `strategy`, `design`, `execution`, `growth`, `leadership`, `technical`), overall competency score aggregator, and cluster breakdown provider.
- **Dashboard 2.0 (`app/(app)/dashboard/page.tsx`, `components/dashboard/`):** Reconstructed dashboard layout featuring `ContinueLearningCard` hero, `SkillRadarCard` visual hero, 3-column metric grid (`ProgressRingCard`, `LevelCard`, `StreakCard`), and `RecentActivityCard` feed.
- **Flashcard Review Hub (`app/(app)/review/page.tsx`, `lib/srs.ts`, `lib/flashcards-service.ts`, `app/api/review/queue/route.ts`):** SM-2 spaced repetition scheduler, 3D card flip animation component (`Flashcard.tsx`), QualitySelector (0–5 recall rating buttons), review queue endpoint, review statistics (`ReviewStats.tsx`), empty state, and review session completion UI (`ReviewComplete.tsx`).
- **Unit Test Suites (`lib/__tests__/`):** Comprehensive automated unit tests for XP Engine (15 tests), Streak Engine (16 tests), Skill Radar Engine (11 tests), SM-2 SRS Engine (10 tests), and Content Compiler (7 tests).

### Changed

- **Design System v2 / v3.0 (`app/globals.css`, `lib/design/tokens.ts`):** Updated visual system to Deep Navy (`#0D1321`), Emerald (`#10B981`), Teal (`#14B8A6`), Sky Blue (`#38BDF8`), Amber (`#F59E0B`), and Slate (`#64748B`). Injected Sora (`font-heading`) and Inter (`font-sans`) via `next/font`.
- **App Navigation & Shell (`components/layout/Sidebar.tsx`, `Topbar.tsx`):** Redesigned desktop sidebar with deep navy background and emerald active link indicator dot; redesigned glass topbar with `⌘K` search trigger chip and user profile dropdown featuring level title badge.
- **Auth Pages (`app/(auth)/login/page.tsx`, `signup/page.tsx`):** Redesigned login and signup pages with full-page dark navy layout, show/hide password visibility toggle, emerald glowing CTAs, and updated disabled Google OAuth placeholder badges.
- **Error & Loading UI (`app/error.tsx`, `not-found.tsx`, `loading.tsx`):** Redesigned 500 error boundary, 404 page with decorative 404 text and navigation action buttons, and shimmer skeleton loader matching the redesigned dashboard layout.

### Fixed

- **React 19 Render Purity Violation (`app/(app)/loading.tsx`):** Replaced non-deterministic `Math.random()` call inside render function with deterministic index-based width calculation.
- **Unused Import Cleanup (`components/layout/Topbar.tsx`):** Removed unused `User` icon import from `lucide-react`.
- **Competency Color Alignment (`lib/design/tokens.ts`):** Synchronized `SKILL_COLORS` constants in `tokens.ts` to match `Design.md` §3.7 and `globals.css` CSS custom properties.
- **Glossary Validation Performance (`scripts/compiler/validation.ts`):** Replaced O(N^2) nested loop with Set-based single-pass lookup, reducing content validation time from ~15 s to < 5 s.

### Removed

- **Boilerplate Template Assets:** Removed unused default `create-next-app` SVGs (`file.svg`, `globe.svg`, `next.svg`, `vercel.svg`, `window.svg`) from `apps/web/public/`.
- **Redundant Root Files:** Removed untracked archive `docs.zip` from repo root and obsolete 11-byte `apps/web/CLAUDE.md`.

### Technical

- **Next.js 16.2.12 App Router** running on Turbopack build engine.
- **TypeScript 5.x** in strict mode across `apps/web` and `scripts/`.
- **Tailwind CSS v4** with theme configuration in `app/globals.css` via `@theme inline`.
- **Supabase PostgreSQL & Auth** with Row Level Security (RLS) on all user-state tables.
- **Resend SMTP** for transactional email verification and password resets.
- **FlexSearch** client-side search indexer built into content compilation script (`scripts/compiler/compile.ts`).

### Documentation

- Rewrote `docs/Design.md` to v3.0 design system specification.
- Added §11 (UI Architecture & Design Token Strategy) to `docs/Architecture.md`.
- Added §9 (UI Engineering Rules) to `docs/Rules.md`.
- Updated `docs/PRD.md`, `docs/Phases.md`, `README.md`, `MEMORY.md`, `docs/INDEX.md`, `docs/CURRENT_STATUS.md`, and `docs/memory/` knowledge base.

### Verification

- **Content Compiler Validation:** `npm run content:validate` passed with 0 errors and 0 warnings across all 90 lessons.
- **Automated Unit Tests:** 5/5 test suites passing 100% (59 total tests).
- **TypeScript Type Check:** `npx tsc --noEmit` passed with 0 errors.
- **ESLint:** `npm run lint` passed with 0 errors and 0 warnings.
- **Production Build:** `npm run build` compiled 35 routes (11 static, 24 dynamic) with zero build errors.

### Known Limitations

- **Public Profile & Portfolio UI (`/p/[username]`):** Database schema and RLS policies exist; full frontend views scheduled for Phase 3.
- **Cohort Leaderboards (`/leaderboard`):** Database tables (`cohorts`, `cohort_members`) exist; UI views scheduled for Phase 3.
- **Google OAuth Login:** Button disabled with "Coming Soon" badge pending production Google OAuth client credentials setup in Supabase.
- **Client-Side Search UI (`SearchOverlay`):** Pre-compiled search index generated at `public/content/search-index.json`; `Cmd+K` overlay UI scheduled for Phase 4.
- **Capstone Submissions Workspace:** `capstone_submissions` table schema exists; submission UI workspace scheduled for Phase 3.

### Next Release

- **v0.3.0 — Phase 3 (Social & Portfolio Infrastructure):** Focuses on public profiles and shareable portfolios (`/p/[username]`), module capstone submission workspaces, structured peer feedback, and weekly opt-in cohort leaderboards.

---

## Release Template (for future versions)

```markdown
## [vX.Y.Z]

- **Status:** 
- **Release Date:** YYYY-MM-DD
- **Git Tag:** 

### Added

### Changed

### Fixed

### Removed

### Technical

### Documentation

### Verification

### Known Limitations

### Next Release
```

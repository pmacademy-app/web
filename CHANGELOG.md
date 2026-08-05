# Changelog

All notable changes to the PM Academy project will be documented in this file.

The project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html) (`MAJOR.MINOR.PATCH`).

Release notes are ordered reverse-chronologically. Each release categorizes changes under Added, Changed, Fixed, Removed, Technical, Documentation, Verification, and Known Limitations when applicable.

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

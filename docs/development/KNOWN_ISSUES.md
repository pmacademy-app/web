# PM Academy — Known Issues & Deferred Backlog

This document lists all intentionally deferred features, planned enhancements, and remaining non-critical technical debt that has been deprioritized for Phase 1 (Foundation) and will be addressed in future phases.

---

## 1. Resolved Items (as of 2026-08-06)

Items previously deferred that have shipped in Phase 3. Retained for historical reference only.

### ✅ Module Capstones — RESOLVED (Phase 3)
*   **Status:** Shipped. Capstone Workspace (`/capstones`), per-module submission + draft APIs (`/api/capstones/...`), and admin oversight are live in Phase 3 Sprint 1.
*   **Original deferral:** DB scaffold only, no rendering or submission UI.

### ✅ Badge Showcases & Leaderboards — RESOLVED (Phase 3)
*   **Status:** Shipped. Badge & Achievement Gallery (`/badges`), weekly cohort leaderboards (`/leaderboard`, friends/cohorts APIs), and HTML5-based certificate generation (`/verify/[certificateId]`, public portfolio `/p/[username]`) are live in Phase 3 Sprints 3–5.
*   **Original deferral:** placeholder stubs; gamification UI and certification exports scheduled for Phase 3.

### ✅ Mermaid → Static SVG Build-Time Rendering — RESOLVED (Sprint 7.1)
*   **Status:** Shipped & Verified. Mermaid diagrams are compiled to static SVGs at `content:compile` time via `scripts/compiler/mermaid-svg.ts` using the real Mermaid layout engine (in Node.js via JSDOM) styled with PM Academy green/white design tokens (`theme/tokens.ts`). Generated SVGs use fluid responsive `viewBox` sizing (`width: 100%; max-width: ${naturalWidth}px; height: auto`) and clean `MermaidBlock.tsx` flex containers so diagrams scale perfectly at 100% browser zoom without horizontal overflow or clipping. Zero client-side Mermaid JS runtime is shipped to the browser.
*   **Original deferral:** deferred to Sprint 7.1 per `Architecture-Review-Report.md §6` and `content-pipeline.md`.

---

## 2. Intentionally Deferred Product Features

### 🔑 Google OAuth Integration (Still Deferred)
*   **Description:** The "Continue with Google" buttons on the auth pages are currently disabled and marked with a "Coming Soon" badge.
*   **Reason:** Supabase requires a configured Google Cloud Platform (GCP) OAuth client ID/secret and a verified production domain callback. Email + Password login/signup is fully functional and sufficient for the beta.
*   **Resolution:** Configure GCP credentials and enable the Google provider in Supabase settings once the production domain is finalized (tracked in `Roadmap.md` "Gaps Identified").

### 📊 Onboarding Placement Assessment (Still Deferred)
*   **Description:** The placement quiz that seeds the user's initial skill radar during onboarding is excluded. The onboarding flow is restricted to a simple goal-setting selection (Job Search, Fill Gaps, Exploring).
*   **Resolution:** Design a 5-question baseline quiz that populates initial competency levels.

---

## 3. Non-Critical Technical Debt & Remaining Enhancements

### 📐 Supabase DB Query Type Casts (`as unknown as DBChain`)
*   **Description:** Widespread usage of `as unknown as DBChain` and custom return type casting in service layers (`lessons-db.ts`, `flashcards-service.ts`, `lessons-completion-service.ts`, `xp-service.ts`).
*   **Impact:** TypeScript does not statically verify query filters or database row select statements.
*   **Resolution:** Generate database schemas and TypeScript interfaces using the Supabase CLI (`supabase gen types typescript`) and configure the client to use them.

### ⚡ Dashboard "Up Next" Lesson Ordering
*   **Description:** The "Up Next" CTA on the dashboard displays the first incomplete lesson in sequential order, rather than the first incomplete *and unlocked* lesson.
*   **Impact:** If a user completes lessons out of order (due to administrative overrides or historical states), the "Up Next" link might show a locked lesson.
*   **Resolution:** Update the query to find the first lesson that has all prerequisites met and is incomplete.

### 🕒 Timezone-Aware Onboarding Goal Defaults
*   **Description:** Timezone detection in `auth.ts` during server-side user registration defaults to the Vercel server timezone (`UTC`) rather than detecting local browser time.
*   **Impact:** New users are default-initialized to UTC.
*   **Resolution:** Collect client-side timezone offset in the browser via `Intl.DateTimeFormat().resolvedOptions().timeZone` during onboarding and update the profile accordingly.

### ♿ Accessibility (a11y) Pass
*   **Description:** Some interactive elements (e.g. flashcard flip controls, pagination buttons, side navigation collapse chevron) are missing readable `aria-label` or role declarations.
*   **Impact:** Screen-reader navigability is degraded.
*   **Resolution:** Perform a full WCAG 2.1 AA validation pass and add appropriate labels.

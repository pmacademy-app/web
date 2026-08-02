# PM Academy — Known Issues & Deferred Backlog

This document lists all intentionally deferred features, planned enhancements, and remaining non-critical technical debt that has been deprioritized for Phase 1 (Foundation) and will be addressed in future phases.

---

## 1. Intentionally Deferred Product Features

### 🔑 Google OAuth Integration (Deferred to Phase 3)
*   **Description:** The "Continue with Google" buttons on the auth pages are currently disabled and marked with a "Coming Soon" badge.
*   **Reason:** Supabase requires a configured Google Cloud Platform (GCP) OAuth client ID/secret and a verified production domain callback. Email + Password login/signup is fully functional and sufficient for the initial beta.
*   **Resolution:** Configure GCP credentials and enable the Google provider in Supabase settings during Phase 3 rollout.

### 📝 Module Capstones (Deferred to Phase 3)
*   **Description:** End-of-module capstone submissions (`/capstone`) are scaffolded in the database schema (`capstone_submissions` table) but have no rendering or submission UI.
*   **Reason:** PRD/Phases roadmap schedules the capstones for Phase 3 (Retention & Depth).
*   **Resolution:** Build submission dashboard, markdown/PDF submission uploader, and peer review flow.

### 🏆 Badge Showcases & Leaderboards (Deferred to Phase 3)
*   **Description:** The badge showcase UI, weekly cohort leaderboards, and certificate generation are placeholder stubs.
*   **Reason:** Gamification UI and certification exports are scheduled in Phase 3.
*   **Resolution:** Implement badge rules evaluations, weekly resetting cohort cron, and HTML5 canvas-based certificate generator.

### 📊 Onboarding Placement Assessment (Deferred to Phase 2)
*   **Description:** The placement quiz that seeds the user's initial skill radar during onboarding is excluded.
*   **Reason:** The MVP onboarding flow is restricted to a simple goal-setting selection (Job Search, Fill Gaps, Exploring).
*   **Resolution:** Design a 5-question baseline quiz that populates initial competency levels.

---

## 2. Non-Critical Technical Debt & Remaining Enhancements

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

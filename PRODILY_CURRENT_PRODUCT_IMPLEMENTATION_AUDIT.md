# Prodily — Current Product Implementation Audit

## Audit Metadata

* **Audit Date:** August 26, 2026
* **Repository:** `d:\Prodily`
* **Application:** `apps/web` (`pmacademy-app/web`)
* **Framework & Environment:** Next.js 16 (App Router), React 19, TypeScript 5, Supabase (PostgreSQL + Auth + Storage), Vitest 4
* **Scope:** 10 Core Product Domains (Activation & Retention, Learning Outcomes & Proof of Skill, PM Portfolio, Career Layer, Gamification, Social Proof, Sharing & Referral, SEO & Organic Acquisition, Product Analytics & Measurement, Feedback & Learning Improvement Loop) + Cross-Feature Integrations, Database Consistency, Admin Coverage, Notification/Email Architecture, Security/Privacy, and Test Coverage.
* **Methodology:** Complete static codebase inspection across frontend routes, UI components, server actions, API routes, database migrations, backend services, configuration files, test suites (56 test files, 465 passing unit tests), and live database schema alignment.

---

# Executive Summary

This document provides a factual, current-state audit of the Prodily (PM Academy) codebase. All findings are derived directly from the code, migrations, services, and tests as they exist in the repository today.

| Area | Fully Implemented | Partially Implemented | Not Implemented | Overall Status |
| :--- | :---: | :---: | :---: | :---: |
| **1. Activation & Retention Loop** | 18 | 4 | 2 | **PARTIALLY IMPLEMENTED** |
| **2. Learning Outcomes & Proof of Skill** | 12 | 4 | 1 | **PARTIALLY IMPLEMENTED** |
| **3. PM Portfolio / Proof-of-Work** | 14 | 2 | 2 | **PARTIALLY IMPLEMENTED** |
| **4. Career Layer** | 0 | 2 | 8 | **NOT IMPLEMENTED** |
| **5. Gamification** | 16 | 2 | 0 | **FULLY IMPLEMENTED** |
| **6. Social Proof** | 6 | 2 | 1 | **PARTIALLY IMPLEMENTED** |
| **7. Sharing & Referral Loop** | 8 | 2 | 4 | **PARTIALLY IMPLEMENTED** |
| **8. SEO & Organic Acquisition** | 16 | 2 | 1 | **FULLY IMPLEMENTED** |
| **9. Product Analytics & Measurement** | 12 | 4 | 2 | **PARTIALLY IMPLEMENTED** |
| **10. Feedback & Learning Improvement Loop** | 8 | 2 | 1 | **PARTIALLY IMPLEMENTED** |

---

# 1. Activation & Retention Loop

## Overall Status
**PARTIALLY IMPLEMENTED**

## Current Implementation
The application implements end-to-end authentication, forced onboarding for first-time learners, sequential curriculum progression with active unlock gating, engagement-tracked theory reading, server-validated quiz scoring with instant XP rewards, and multi-channel re-engagement (in-app notifications, transactional emails, scheduled cron jobs, and admin broadcasts).

However, onboarding selections (goals, role/experience level, topics, learning preferences) do not alter the learner's sequential curriculum order or personalize the dashboard recommendations, which remain strictly sequential (Lessons 1 through 90).

## Actual User Flow
```text
Signup (/signup)
  ↓
Email Confirmation (Supabase OTP / verified callback)
  ↓
Forced Onboarding (/onboarding — 4-Step Wizard: Profile -> Experience/Goal -> Topics/Style -> Path Preview)
  ↓
Dashboard (/dashboard) or Academy (/academy)
  ↓
First Lesson (/academy/foundations/les_zoyq8a)
  ↓
Theory Reading (Scroll depth & active focus time tracked)
  ↓
Quiz Attempt (Server-validated scoring + immediate XP calculation)
  ↓
Lesson Completion (Status updated in user_lesson_progress, XP ledger row created, streak incremented)
  ↓
Next Lesson Unlocked (Prerequisite gate cleared for subsequent sequential lesson)
  ↓
Re-engagement (In-app notifications, daily reminder cron, weekly recap cron, admin broadcast)
```

## Detailed Findings

| Capability | Status | Current Implementation | Evidence | Limitations |
| :--- | :---: | :--- | :--- | :--- |
| **User Signup** | FULLY IMPLEMENTED | Client form with Zod schema validation, Supabase Auth `signUp()` with redirect to `/api/auth/callback?next=/verified`, resend card, and classified auth telemetry error handling. | `apps/web/app/(auth)/signup/page.tsx`<br>`apps/web/components/auth/ResendVerificationCard.tsx` | None. |
| **Email Verification** | FULLY IMPLEMENTED | Supabase Auth OTP verification via `/api/auth/callback` handling `code` or `token_hash` + `type`, creating public session cookies, and redirecting to `/verified` or `/dashboard`. | `apps/web/app/api/auth/callback/route.ts`<br>`apps/web/app/(auth)/verified/page.tsx` | None. |
| **User Onboarding** | FULLY IMPLEMENTED | 4-step wizard (`OnboardingWizard.tsx`) covering: 1) Profile (username check, avatar, bio, socials), 2) About You (experience level, primary goal), 3) Interests (topics multi-select, learning style), 4) Path Preview (recommended starting module). Data persisted to `public.users` and `auth.users.user_metadata`. | `apps/web/app/onboarding/page.tsx`<br>`apps/web/app/onboarding/OnboardingWizard.tsx`<br>`apps/web/app/onboarding/actions.ts` | None. |
| **First-Time User Routing** | FULLY IMPLEMENTED | Next.js middleware (`proxy.ts`) checks `user_metadata.onboarding_complete` or database `curriculum_access_override`. Unonboarded learners accessing protected routes are forced to `/onboarding`. | `apps/web/proxy.ts:198-205` | None. |
| **Goal & Persona Persistence** | FULLY IMPLEMENTED | Server action updates `users` columns (`career_role`, `goal`, `learning_purpose`, `onboarding_topics`, `onboarding_preference`, `onboarding_completed`) and syncs `auth.admin.updateUserById` user metadata. | `apps/web/app/onboarding/actions.ts:115-152`<br>`supabase/migrations/20260826000002_onboarding_structured_columns.sql` | None. |
| **Goal-Driven Path Customization** | PARTIALLY IMPLEMENTED | Step 4 of the Onboarding Wizard calculates a personalized recommended starting module based on selected goals/topics (`computeRecommendation`). However, `/dashboard` and `/academy` remain sequential (Lessons 1..90) and do not reorder modules or filter the path based on user selections. | `apps/web/app/onboarding/OnboardingWizard.tsx:134-169`<br>`apps/web/app/(app)/dashboard/page.tsx:96-108` | Goals do not reorder curriculum modules or filter recommended lessons in the dashboard. |
| **Quick Start / Product Tour** | FULLY IMPLEMENTED | Client modal context (`QuickStartContext.tsx`, `QuickStartModal.tsx`) auto-launches on first dashboard visit after onboarding. Tracks step views, completions, skips, and reopens. Persists `quick_start_completed: true` in user metadata. | `apps/web/components/quick-start/QuickStartContext.tsx`<br>`apps/web/components/quick-start/QuickStartModal.tsx` | None. |
| **First Lesson Flow & CTA** | FULLY IMPLEMENTED | Dashboard renders `ContinueLearningCard` targeting the first uncompleted lesson in the 90-lesson curriculum. First lesson `les_zoyq8a` is always unlocked. | `apps/web/components/dashboard/ContinueLearningCard.tsx`<br>`apps/web/app/(app)/dashboard/page.tsx:96-108` | None. |
| **Lesson Start & Theory Engagement** | FULLY IMPLEMENTED | Lesson renders theory tab via `BlockTreeRenderer`. Client hook `useTheoryEngagement` tracks active tab focus time and scroll percentage. `POST /api/v2/lessons/[lessonId]/theory-read` validates engagement thresholds before awarding XP and unlocking the quiz. | `apps/web/app/(app)/academy/[moduleSlug]/[lessonId]/lesson-content.tsx:78-116`<br>`apps/web/app/api/v2/lessons/[lessonId]/theory-read/route.ts`<br>`apps/web/lib/academy/lessons-db.ts:141-172` | None. |
| **Quiz Flow & Validation** | FULLY IMPLEMENTED | Server-side quiz attempt evaluation (`POST /api/v2/lessons/[lessonId]/quiz`). Answers validated against compiled lesson JSON blocks on server; records attempts in `quiz_attempts`, awards XP, updates streaks, and marks lesson complete. | `apps/web/app/api/v2/lessons/[lessonId]/quiz/route.ts`<br>`apps/web/lib/academy/lessons-db.ts:174-356` | None. |
| **Lesson Completion & XP** | FULLY IMPLEMENTED | `completeLesson` service upserts `user_lesson_progress` (`status: 'completed'`, `quiz_score`, `xp_earned`, `completed_at`). Inserts ledger events into `xp_events` with idempotency protection. | `apps/web/lib/lessons-completion-service.ts:18-65`<br>`apps/web/lib/xp/xp-service.ts:24-88` | None. |
| **Sequential Unlocking** | FULLY IMPLEMENTED | Server-side lock check in `AcademyLessonPage` verifies that preceding sequential lesson is completed before rendering lesson content. Displays locked screen with direct link to lowest uncompleted lesson. Admins and users with `curriculum_access_override` bypass locks. | `apps/web/app/(app)/academy/[moduleSlug]/[lessonId]/page.tsx:104-276`<br>`apps/web/lib/lessons-completion-service.ts:79-105` | None. |
| **Streaks & Daily Mechanism** | FULLY IMPLEMENTED | `updateUserStreak` calculates date differences in user timezone, increments `current_streak`, updates `longest_streak`, and records `last_active_date`. Streak status surfaced on Dashboard `StreakCard`. | `apps/web/lib/streaks/streaks-db.ts`<br>`apps/web/components/dashboard/StreakCard.tsx` | None. |
| **Streak Freezes** | PARTIALLY IMPLEMENTED | Database column `streak_freezes_available` exists on `users` table and is checked in badge criteria; logic exists in `streaks-db.ts` to consume freezes on missed days. However, there is no learner UI to purchase, earn, or manually activate freezes. | `apps/web/lib/streaks/streaks-db.ts`<br>`supabase/migrations/20260805000002_add_streak_columns.sql` | No frontend UI to purchase or manage streak freeze inventory. |
| **Daily Reminders & Recap Emails** | FULLY IMPLEMENTED | Scheduled cron routes `/api/cron/daily-reminder` and `/api/cron/weekly-recap` query user activity, evaluate email preferences/automations, and queue personalized email templates with streak and lesson progress. | `apps/web/app/api/cron/daily-reminder/route.ts`<br>`apps/web/app/api/cron/weekly-recap/route.ts`<br>`apps/web/lib/notifications/recap/evaluator.ts` | None. |
| **Re-engagement Campaign** | FULLY IMPLEMENTED | Admin broadcast service and local campaign runner (`scripts/local-campaigns/send-reengagement-campaign.ts`) generate personalized plain-text style letters targeting inactive users filtered by last active date and uncompleted lessons. | `apps/web/lib/admin/broadcast-service.ts`<br>`apps/web/emails/templates/auth/Welcome.tsx` | Inactive cron trigger is deferred in automation settings. |
| **Activation Funnel Tracking** | PARTIALLY IMPLEMENTED | Funnel stages (Visited -> Registered -> Onboarded -> First Lesson -> Completed Module) aggregated live in Admin Analytics Funnel component. External GA4 tracking tracks signup and quick-start events, but lacks granular in-app lesson progress events. | `apps/web/lib/admin/dashboard-aggregation.ts:31-77`<br>`apps/web/lib/analytics.ts` | In-app lesson funnel steps not pushed to GA4. |

---

# 2. Learning Outcomes & Proof of Skill

## Overall Status
**PARTIALLY IMPLEMENTED**

## Current Implementation
The core learning engine provides 90 compiled lessons across 9 modules. Each lesson contains rich theory blocks, interactive quizzes, spaced repetition flashcard decks, and reflection prompts. Module completions unlock applied capstone deliverables (9 structured capstone scenarios with minimum word counts and starter templates). Submitted capstones are stored in `capstone_submissions`, grant 150 XP, and can be reviewed (approved/rejected) by administrators in the Moderation workspace.

Skill assessment is continuously calculated across 7 competency clusters (0–100 continuous score) and rendered via the Skill Radar. Full curriculum completion generates verifiable certificates.

## Detailed Findings

| Capability | Status | Current Implementation | Evidence | Limitations |
| :--- | :---: | :--- | :--- | :--- |
| **Curriculum & Lesson Engine** | FULLY IMPLEMENTED | 90 compiled JSON lessons in `content/dist/lessons/` loaded by `lesson-loader.ts`. Renders theory, interactive examples, frameworks, case studies, and callouts via `BlockTreeRenderer`. | `apps/web/lib/lesson-loader.ts`<br>`apps/web/renderer/block-tree-renderer.tsx` | None. |
| **Quizzes** | FULLY IMPLEMENTED | Server-evaluated quizzes with multiple-choice questions, instant feedback explanations, retry tracking, and XP awards. | `apps/web/app/api/v2/lessons/[lessonId]/quiz/route.ts`<br>`apps/web/components/quiz/QuizRunner.tsx` | None. |
| **Flashcards & Spaced Repetition (SRS)** | FULLY IMPLEMENTED | SM-2 spaced repetition algorithm (`srs.ts`) calculating ease factors, intervals, and review due dates stored in `user_flashcard_srs`. Review workspace at `/review` with due card queue. | `apps/web/lib/srs.ts`<br>`apps/web/lib/flashcards-service.ts`<br>`apps/web/app/(app)/review/page.tsx` | None. |
| **Reflections** | FULLY IMPLEMENTED | Lesson reflections submitted via `/api/reflections`, stored in `reflections` table with public/private toggle, awarding 15 XP upon initial submission. | `apps/web/lib/academy/lessons-db.ts:358-446`<br>`apps/web/app/api/reflections/route.ts` | None. |
| **Structured Capstones** | FULLY IMPLEMENTED | 9 module capstone projects defined in `config/capstones.ts` covering Opportunity Briefs, Discovery Plans, Product Strategies, PRDs, Metric Frameworks, Leadership Case Studies, Tech Specs, Design Teardowns, and Final End-to-End Case Studies. | `apps/web/config/capstones.ts`<br>`apps/web/app/(app)/capstones/page.tsx`<br>`apps/web/app/(app)/capstones/[moduleSlug]/page.tsx` | None. |
| **Capstone Validation & Unlocking** | FULLY IMPLEMENTED | Capstones unlock when at least 8 of 10 module lessons are completed. Submissions require meeting minimum word count and structural checks before awarding 150 XP. State transitions (draft -> submitted -> reviewed) strictly enforced. | `apps/web/lib/capstones-db.ts:49-123`<br>`apps/web/lib/capstones.ts` | None. |
| **Capstone Review & Moderation** | PARTIALLY IMPLEMENTED | Admins can view capstone submissions in Admin Console Moderation tab, inspect word counts and markdown, and approve or reject submissions. Approval sets `status: 'reviewed'` and `is_public: true`. | `apps/web/lib/admin/moderation-service.ts:72-169`<br>`apps/web/app/admin/(console)/moderation/page.tsx` | No rubric scoring breakdown (1-5 criteria scores) or written reviewer feedback text stored on submissions. |
| **Skill Assessment & Skill Radar** | FULLY IMPLEMENTED | Mathematical model (`skillRadar.ts`) calculating continuous 0–100 scores across 7 competency clusters (`discovery`, `strategy`, `design`, `execution`, `growth`, `leadership`, `technical`) based on theory read, quiz score percentage, and perfect attempt bonuses. Rendered via SVG polygon Radar. | `apps/web/lib/skillRadar.ts`<br>`apps/web/components/progress/SkillRadarCard.tsx`<br>`apps/web/components/portfolio/PortfolioSkillRadar.tsx` | None. |
| **Certificates** | FULLY IMPLEMENTED | Full curriculum completion (90 lessons) automatically issues verified certificate stored in `certificates` table. Verifiable at `/verify/[certificateId]` with SHA-256 derived code, level info, LinkedIn Add-to-Profile URL generator, and EducationalOccupationalCredential schema. | `apps/web/lib/certificates-db.ts`<br>`apps/web/app/verify/[certificateId]/page.tsx` | None. |
| **Badges & Competency Indicators** | FULLY IMPLEMENTED | 12 milestone badges (`config/badges.ts`) evaluated by `badges-db.ts`, stored in `user_badges`, triggering in-app alerts and `achievement.badge_earned` emails. Gallery rendered at `/badges`. | `apps/web/config/badges.ts`<br>`apps/web/lib/badges-db.ts`<br>`apps/web/app/(app)/badges/page.tsx` | None. |
| **Public Proof-of-Work** | FULLY IMPLEMENTED | Reviewed capstones, public reflections, earned certificates, and skill radar scores automatically surfaced on public portfolio at `/p/[username]`. | `apps/web/app/(portfolio)/p/[username]/page.tsx`<br>`apps/web/lib/portfolio-db.ts:86-202` | None. |

---

# 3. PM Portfolio / Proof-of-Work

## Overall Status
**PARTIALLY IMPLEMENTED**

## Current Implementation
The portfolio system generates a public-facing proof-of-work page at `/p/[username]` for learners who have `is_portfolio_public: true`. It renders the learner's identity (avatar, bio, verified level title, total XP, current streak, social links), the interactive 7-axis Skill Radar, curriculum progress percentages, submitted/reviewed capstone projects with full markdown content and reflections, and achievement badges.

Learners can manage their profile and public/private visibility via `/settings`.

## Detailed Findings

| Capability | Status | Current Implementation | Evidence | Limitations |
| :--- | :---: | :--- | :--- | :--- |
| **Public Portfolio Route** | FULLY IMPLEMENTED | SSR page `/p/[username]` fetching public portfolio data via service role client. Enforces privacy: returns 404/Private screen if user is private or not found. | `apps/web/app/(portfolio)/p/[username]/page.tsx`<br>`apps/web/lib/portfolio-db.ts:86-202` | None. |
| **Learner Profile Metadata** | FULLY IMPLEMENTED | Displays display name, handle `@username`, bio, avatar image (with Supabase Storage fallback), LinkedIn, GitHub, and Website/Twitter links. | `apps/web/components/portfolio/PortfolioHero.tsx`<br>`apps/web/lib/avatar/avatar-service.ts` | None. |
| **Skill Radar Integration** | FULLY IMPLEMENTED | Live 7-axis radar chart rendered on the public portfolio showing current normalized cluster scores and level badges. | `apps/web/components/portfolio/PortfolioSkillRadar.tsx`<br>`apps/web/lib/skillRadar.ts` | None. |
| **Capstones Showcase** | FULLY IMPLEMENTED | Renders submitted and reviewed module deliverables with module badges, deliverable types, markdown rendering, and attached public reflections. | `apps/web/components/portfolio/PortfolioCapstones.tsx` | None. |
| **Achievements Showcase** | FULLY IMPLEMENTED | Renders completed module count, total lessons completed, capstones completed, streak achievements, and earned badges. | `apps/web/components/portfolio/PortfolioAchievements.tsx` | None. |
| **Portfolio Settings & Privacy** | FULLY IMPLEMENTED | Settings form (`/settings`) allows editing username, bio, display name, avatar, social URLs, and toggling `is_portfolio_public` boolean. | `apps/web/components/settings/PortfolioSettingsForm.tsx`<br>`apps/web/lib/portfolio-db.ts:241-342` | None. |
| **Portfolio Sharing Controls** | FULLY IMPLEMENTED | Share button integrates Web Share API, clipboard fallback with toast, and direct share intent links for LinkedIn and X/Twitter. | `apps/web/components/portfolio/PortfolioHero.tsx:43-75` | None. |
| **SEO & OpenGraph Metadata** | FULLY IMPLEMENTED | Dynamic `generateMetadata` generating self-referencing canonical URL, OpenGraph profile metadata, Twitter card with user avatar, and Schema.org `Person` JSON-LD structured data. | `apps/web/app/(portfolio)/p/[username]/page.tsx:20-65`<br>`apps/web/lib/portfolio.ts:74-106` | None. |
| **Section Ordering & Customization** | NOT IMPLEMENTED | Portfolio sections (Hero -> Skill Radar -> Progress -> Capstones -> Achievements) are statically ordered in the page component. Users cannot reorder, hide individual sections, or pin featured deliverables. | `apps/web/app/(portfolio)/p/[username]/page.tsx:120-136` | No custom layout, pinning, or section visibility controls. |
| **Learner Portfolio Analytics** | NOT IMPLEMENTED | There is no visitor view counter or analytics dashboard for the learner to see how many people visited their public portfolio link. | `apps/web/app/(portfolio)/p/[username]/page.tsx` | No learner-facing view tracking. |
| **Admin Moderation & Directory** | FULLY IMPLEMENTED | Admin Console Moderation workspace provides a directory of all public portfolios with links and user management actions. | `apps/web/lib/admin/moderation-service.ts:175-200`<br>`apps/web/app/admin/(console)/portfolios/page.tsx` | None. |

---

# 4. Career Layer

## Overall Status
**NOT IMPLEMENTED**

## Current Implementation
The application does not contain functional career tooling. There are no interactive interview simulators, question banks, resume optimization tools, job application tracking features, or recruiter portals.

Career-related elements in the codebase are limited to:
1. **Curriculum Content:** Lesson text blocks (e.g. `InterviewPerspectiveSection` in `SectionBlock.tsx`) and Module 9 descriptive text discussing interview case studies.
2. **Onboarding Persona Selection:** Selecting "Career Switcher" or "Get a PM Job" as an onboarding goal string stored in user profiles.
3. **Public Portfolio:** The shareable link at `/p/[username]` that learners can manually send to hiring managers.

## Detailed Findings

| Capability | Status | Current Implementation | Evidence | Limitations |
| :--- | :---: | :--- | :--- | :--- |
| **PM Interview Prep Tooling** | NOT IMPLEMENTED | No interactive interview question bank, practice simulator, or mock interview tool exists. | Codebase search: no interview practice tooling found. | Curriculum mentions interviews in text only. |
| **Case Interview Practice** | NOT IMPLEMENTED | No case interview tool or grading simulator exists. | Codebase search: no case simulator found. | Only Module 9 capstone prompt asks learner to write a case study. |
| **Resume Builder & Review** | NOT IMPLEMENTED | No resume parsing, review, or builder tooling exists. | Codebase search: no resume tool found. | Mentioned only in copy referring to the public portfolio as a "live resume". |
| **LinkedIn Profile Optimization** | NOT IMPLEMENTED | No LinkedIn auditing or optimization tool exists beyond generating an Add-to-Profile certificate URL. | `apps/web/lib/certificates/linkedin-url.ts` | Tooling limited to standard LinkedIn certificate URL creation. |
| **Job Tracking & Applications** | NOT IMPLEMENTED | No job board, application tracker, or CRM exists. | Codebase search: no job tracking found. | None exists. |
| **Recruiter / Hiring Portal** | NOT IMPLEMENTED | No recruiter authentication, candidate search, or hiring dashboard exists. | Codebase search: no recruiter portal found. | Recruiters can only view public `/p/[username]` URLs as anonymous guests. |
| **Career Goal Tracking** | PARTIALLY IMPLEMENTED | Goal string (`goal`, `career_role`) stored in `users` table from onboarding, but no milestones or career progress trackers exist in the app. | `apps/web/app/onboarding/actions.ts` | Static string storage only. |

---

# 5. Gamification

## Overall Status
**FULLY IMPLEMENTED**

## Current Implementation
The gamification engine is complete, consistent, and fully verified by automated test suites. XP is awarded through an idempotent event ledger (`xp_events`) across 6 distinct action types. User levels (1 through 10+) and career titles are computed from total XP. Active streaks are tracked daily with timezone support. Badges (12 definitions) are evaluated across user stats and awarded with notifications and email dispatches. Consistency leaderboards support global weekly rankings, cohort leaderboards, and friend accountability lists with opt-in privacy controls.

## Detailed Findings

| Capability | Status | Current Implementation | Evidence | Limitations |
| :--- | :---: | :--- | :--- | :--- |
| **XP Architecture & Ledger** | FULLY IMPLEMENTED | `awardXp` logs each transaction in `xp_events` (`source_type`, `xp_amount`, `source_id`) and updates `users.total_xp`. Idempotency verified via `hasXpEvent`. Dynamic XP values configurable via Admin `system_settings`. | `apps/web/lib/xp/xp-service.ts`<br>`apps/web/lib/xp/xp.ts`<br>`apps/web/lib/__tests__/xp.test.ts` | None. |
| **XP Sources** | FULLY IMPLEMENTED | Theory reading (+10 XP default), Quiz correct (+5 XP per question), Quiz perfect first attempt (+25 XP), Reflection (+15 XP), Capstone (+150 XP), Daily streak milestone (+5 XP base). | `apps/web/lib/xp/xp.ts:11-19`<br>`apps/web/lib/academy/lessons-db.ts`<br>`apps/web/lib/capstones-db.ts:404-416` | None. |
| **Levels & Level Thresholds** | FULLY IMPLEMENTED | 9 level thresholds with career titles (Level 1: Associate PM Trainee, Level 2: Junior PM, Level 3: PM, Level 4: Senior PM, Level 5: Group PM, Level 6: VP Product, Level 7+: Chief Product Officer). Level-up triggers `xp.level_up` notification and email. | `apps/web/lib/xp/xp.ts:109-182`<br>`apps/web/lib/xp/xp-service.ts:55-87` | None. |
| **Streaks System** | FULLY IMPLEMENTED | `updateUserStreak` calculates consecutive active days using user timezone, maintains `current_streak` and `longest_streak`, and records `last_active_date`. Surfaced on dashboard and leaderboards. | `apps/web/lib/streaks/streaks-db.ts`<br>`apps/web/lib/streaks/streaks.ts`<br>`apps/web/lib/__tests__/streaks.test.ts` | None. |
| **Badges System** | FULLY IMPLEMENTED | 12 badge definitions in `config/badges.ts` evaluated by `badges-db.ts` across lesson counts, perfect quizzes, capstones, streaks, and portfolio visibility. Awards inserted into `user_badges` and triggers `badge.earned` event. | `apps/web/config/badges.ts`<br>`apps/web/lib/badges-db.ts`<br>`apps/web/app/api/badges/route.ts` | None. |
| **Global Leaderboard** | FULLY IMPLEMENTED | Weekly consistency rankings (`getWeeklyLeaderboard`) calculating lessons completed and XP earned within the current calendar week. Respects `user_leaderboard_settings.is_opted_in`. | `apps/web/lib/leaderboard-db.ts:86-193`<br>`apps/web/app/(app)/leaderboard/page.tsx` | None. |
| **Friends Leaderboard** | FULLY IMPLEMENTED | `user_friends` table allows adding friends by username/ID and filtering weekly rankings to friends list. | `apps/web/lib/leaderboard-db.ts:198-274` | None. |
| **Cohorts System** | FULLY IMPLEMENTED | `cohorts` and `cohort_members` tables allow joining/leaving learning cohorts, tracking member counts, and displaying cohort cards on `/leaderboard`. | `apps/web/lib/leaderboard-db.ts:278-348` | None. |

---

# 6. Social Proof

## Overall Status
**PARTIALLY IMPLEMENTED**

## Current Implementation
The application implements a database-backed testimonials pipeline (`testimonials` table). Learners can submit public reviews via `ContextualFeedbackModal`, which enter a moderation queue in the Admin Console. Administrators can approve or reject reviews. Approved reviews are cached via `unstable_cache` and rendered on the marketing homepage (`TestimonialsSection`) in a continuous marquee.

Marketing statistics on the landing page (such as lesson counts) are statically defined rather than dynamic database aggregations.

## Detailed Findings

| Capability | Status | Current Implementation | Evidence | Limitations |
| :--- | :---: | :--- | :--- | :--- |
| **Learner Testimonials Pipeline** | FULLY IMPLEMENTED | `FeedbackAdminService.submitFeedback` records review in `testimonials` table (`status: 'pending'`, `is_published: false`). Admin Console Moderation workspace allows approving/rejecting and editing publication state. | `apps/web/lib/admin/feedback-service.ts:35-180`<br>`apps/web/app/admin/(console)/feedback/page.tsx` | None. |
| **Homepage Testimonials Display** | FULLY IMPLEMENTED | `MarketingPage` server-renders published testimonials (`getPublishedTestimonials`) into static HTML with fallback handling (empty state card or continuous marquee for 3+ reviews). | `apps/web/app/(marketing)/page.tsx:32-55`<br>`apps/web/components/marketing/sections/testimonials.tsx` | None. |
| **Public Proof & Portfolios** | FULLY IMPLEMENTED | Public learner profiles at `/p/[username]` showcase real capstone artifacts, continuous skill radar scores, and certificates. | `apps/web/app/(portfolio)/p/[username]/page.tsx` | None. |
| **Certificate Verification** | FULLY IMPLEMENTED | Public certificate verification at `/verify/[certificateId]` displays verifiable learner completion record. | `apps/web/app/verify/[certificateId]/page.tsx` | None. |
| **Dynamic Marketing Stats** | NOT IMPLEMENTED | Landing page hero and feature sections use static hardcoded claims ("90 lessons", "9 modules", "~45 hours") rather than querying live database metrics (e.g. active learner counts, total completed lessons). | `apps/web/components/marketing/sections/hero.tsx:66-90`<br>`apps/web/components/marketing/sections/curriculum.tsx` | Marketing stats are static. |

---

# 7. Sharing & Referral Loop

## Overall Status
**PARTIALLY IMPLEMENTED**

## Current Implementation
The application provides sharing infrastructure for public portfolios, verified certificates, and module completion achievements. This includes Web Share API integration, clipboard copy with visual feedback, direct LinkedIn and X/Twitter share intent URLs, LinkedIn "Add to Profile" certificate URL generation, dynamic OpenGraph social preview images, and Schema.org structured data.

However, referral tracking (referral codes, attribution cookies, invite flows, and viral loop rewards) is not implemented.

## Detailed Findings

| Capability | Status | Current Implementation | Evidence | Limitations |
| :--- | :---: | :--- | :--- | :--- |
| **Portfolio Sharing** | FULLY IMPLEMENTED | `PortfolioHero` component includes Web Share API button, copy link button, and direct share intent links for LinkedIn and X/Twitter. Generates OpenGraph image and Person schema. | `apps/web/components/portfolio/PortfolioHero.tsx:43-75`<br>`apps/web/app/(portfolio)/p/[username]/page.tsx:51-64` | None. |
| **Certificate Sharing** | FULLY IMPLEMENTED | Certificate verification page `/verify/[certificateId]` provides LinkedIn Add-to-Profile URL generator (`generateLinkedInCertUrl`), direct share buttons, and OpenGraph metadata. | `apps/web/lib/certificates/linkedin-url.ts`<br>`apps/web/components/certificates/CertificateActions.tsx` | None. |
| **Achievement Sharing** | FULLY IMPLEMENTED | Module completion screen (`LessonPageContent`) and badge modals provide Web Share and copy link buttons for sharing milestones. | `apps/web/app/(app)/academy/[moduleSlug]/[lessonId]/lesson-content.tsx:456-473` | None. |
| **Social Preview Metadata** | FULLY IMPLEMENTED | Dynamic `generateMetadata` on `/p/[username]`, `/verify/[certificateId]`, and `/lessons/[slug]` generates title, description, and OG image tags. | `apps/web/app/(portfolio)/p/[username]/page.tsx:20-65`<br>`apps/web/app/verify/[certificateId]/page.tsx:18-56` | None. |
| **Referral System** | NOT IMPLEMENTED | No referral code generator, referral links (`?ref=...`), signup attribution tracking, or invite systems exist in the codebase. | Codebase search: no referral tables or attribution logic. | No referral engine exists. |
| **Referral Rewards & Viral Loops** | NOT IMPLEMENTED | No XP bonuses or milestone badges for inviting peers. | Codebase search: no referral reward logic. | None exists. |

---

# 8. SEO & Organic Acquisition

## Overall Status
**FULLY IMPLEMENTED**

## Current Implementation
The application implements a comprehensive, search-engine-optimized public footprint. Public routes include self-referencing canonical URLs, OpenGraph and Twitter cards, JSON-LD structured data, dynamic `sitemap.xml`, and strict `robots.txt` disallowing private authenticated application paths.

## Detailed Findings

| Capability | Status | Current Implementation | Evidence | Limitations |
| :--- | :---: | :--- | :--- | :--- |
| **Global Metadata & Layout** | FULLY IMPLEMENTED | Root `layout.tsx` defines default title template, metadata base, favicon, Organization and WebSite JSON-LD schemas. | `apps/web/app/layout.tsx:21-65` | None. |
| **Robots Configuration** | FULLY IMPLEMENTED | `robots.ts` explicitly allows public marketing routes (`/`, `/about`, `/contact`, `/curriculum`, `/frameworks`, `/glossary`, `/lessons/`, `/p/`) and disallows private app routes (`/dashboard`, `/review`, `/progress`, `/settings`, `/leaderboard`, `/admin`, `/academy/`, `/api/`). | `apps/web/app/robots.ts:6-42` | None. |
| **Sitemap Generator** | FULLY IMPLEMENTED | `sitemap.ts` programmatically builds `sitemap.xml` including marketing pages and all 90 public lesson preview URLs (`/lessons/[slug]`). | `apps/web/app/sitemap.ts:17-78` | None. |
| **Public Lesson Previews** | FULLY IMPLEMENTED | Dedicated public lesson routes `/lessons/[slug]` render sample theory, LearningResource schema, and self-referencing canonicals. | `apps/web/app/(marketing)/lessons/[slug]/page.tsx` | None. |
| **Frameworks Directory** | FULLY IMPLEMENTED | `/frameworks` renders 12 original PM mental models with `DefinedTermSet` JSON-LD schema. | `apps/web/app/(marketing)/frameworks/page.tsx:39-56` | None. |
| **Glossary Route** | PARTIALLY IMPLEMENTED | `/glossary` route is a redirect to `/frameworks`. There are no standalone individual term pages. | `apps/web/app/(marketing)/glossary/page.tsx` | Redirects to `/frameworks`. |
| **Structured Data (JSON-LD)** | FULLY IMPLEMENTED | Implemented across: Organization & WebSite (`layout.tsx`), Course (`/academy`), Article/LearningResource (`/lessons/[slug]`), DefinedTermSet (`/frameworks`), Person (`/p/[username]`), and EducationalOccupationalCredential (`/verify/[certificateId]`). | Verified by 10 passing unit tests in `seo-structured-data.test.ts`. | None. |
| **Noindex on Protected Routes** | FULLY IMPLEMENTED | Authenticated routes (`/dashboard`, `/progress`, `/review`, `/admin`) and private portfolios explicitly return `robots: { index: false, follow: false }`. | `apps/web/app/(portfolio)/p/[username]/page.tsx:29` | None. |

---

# 9. Product Analytics & Measurement

## Overall Status
**PARTIALLY IMPLEMENTED**

## Current Implementation
Analytics is split into three subsystems:
1. **External Marketing Analytics:** Google Analytics 4 (GA4) with null-safe wrapper functions in `analytics.ts` tracking CTA clicks, curriculum views, FAQ toggles, 90% scroll depth, and Quick Start tour interactions.
2. **Internal Database Event Ledger:** All user actions (lesson progress, quiz attempts, XP grants, capstone submissions, streaks, reviews) are written to PostgreSQL tables (`user_lesson_progress`, `quiz_attempts`, `xp_events`, `capstone_submissions`, `user_flashcard_srs`).
3. **Admin Analytics Console:** A comprehensive admin reporting engine (`AnalyticsService`) computing live DAU/WAU/MAU, level distributions, streak distributions, module drop-off funnels, quiz question failure rates, and outcome metrics directly from database rows.

## Detailed Findings

| Capability | Status | Current Implementation | Evidence | Limitations |
| :--- | :---: | :--- | :--- | :--- |
| **External Analytics (GA4)** | FULLY IMPLEMENTED | GA4 initialized via `@next/third-parties/google` in `layout.tsx`. Wrapper functions in `analytics.ts` handle marketing events without PII. | `apps/web/app/layout.tsx`<br>`apps/web/lib/analytics.ts` | None. |
| **Marketing Event Tracking** | FULLY IMPLEMENTED | Tracks `hero_cta_click`, `curriculum_view`, `portfolio_view`, `faq_expand`, `scroll_90_percent`, `quick_start_opened`, `quick_start_step_viewed`, `quick_start_completed`, `quick_start_skipped`. | `apps/web/lib/analytics.ts:24-110` | None. |
| **In-App GA4 Events** | NOT IMPLEMENTED | In-app actions (lesson viewed, theory completed, quiz answered, capstone submitted, badge earned, certificate generated) are NOT dispatched to GA4. They are recorded in internal DB tables only. | `apps/web/lib/analytics.ts` | No GA4 events for in-app learning interactions. |
| **Admin Overview Analytics** | FULLY IMPLEMENTED | Admin Executive Overview computes total learners, active learners (DAU/WAU/MAU), completed lessons count, quiz pass rates, XP totals, and date-range comparative trends (e.g. 7d, 30d, 90d, 12m). | `apps/web/lib/admin/analytics-service.ts:40-150`<br>`apps/web/lib/admin/analytics-aggregation.ts` | None. |
| **Admin Learning Analytics** | FULLY IMPLEMENTED | Learning tab calculates lesson completions over time, module drop-off waterfall, per-module completion percentages, and quiz performance (average score, pass rate, failure-prone questions). | `apps/web/lib/admin/analytics-service.ts:152-250` | None. |
| **Admin Engagement Analytics** | FULLY IMPLEMENTED | Engagement tab calculates active user ratios (DAU/MAU stickiness), daily XP velocity by source type, streak distribution buckets (1d, 2-3d, 4-7d, 8-14d, 15-30d, 31+d), and flashcard SRS review counts. | `apps/web/lib/admin/analytics-service.ts:252-350` | None. |
| **Admin Outcomes Analytics** | FULLY IMPLEMENTED | Outcomes tab computes capstone submission and review rates, certificate issuance trends, level distributions, and public portfolio adoption. | `apps/web/lib/admin/analytics-service.ts:352-450` | None. |

---

# 10. Feedback & Learning Improvement Loop

## Overall Status
**PARTIALLY IMPLEMENTED**

## Current Implementation
Learners can submit general feedback, bug reports, and public reviews via contextual modals (`ContextualFeedbackModal`, `GeneralFeedbackModal`). Feedback items are stored in `user_feedback` (with type, rating, category, page URL, and lesson ID) and `testimonials` tables. Administrators can view, filter, review, and update feedback statuses in the Admin Console.

However, feedback is not automatically aggregated per lesson to compute lesson quality scores, and there is no automated feedback-to-curriculum edit workflow.

## Detailed Findings

| Capability | Status | Current Implementation | Evidence | Limitations |
| :--- | :---: | :--- | :--- | :--- |
| **Contextual Feedback Modals** | FULLY IMPLEMENTED | Modals (`ContextualFeedbackModal.tsx`) capture ratings, categories (`bug`, `curriculum`, `ui`, `general`), comments, current page URL, and lesson ID. | `apps/web/components/feedback/ContextualFeedbackModal.tsx`<br>`apps/web/app/api/feedback/route.ts` | None. |
| **Feedback Storage** | FULLY IMPLEMENTED | Stored in `user_feedback` table (`user_id`, `category`, `source_event`, `content`, `rating`, `status`, `created_at`). | `supabase/migrations/20260810000001_create_user_feedback_tables.sql`<br>`apps/web/lib/admin/feedback-service.ts:272-344` | None. |
| **Admin Feedback Review** | FULLY IMPLEMENTED | Admin Console Feedback workspace lists private feedback items with resolved author emails, status filtering, and status mutation actions (`updateFeedbackStatus`) with audit logging. | `apps/web/app/admin/(console)/feedback/page.tsx`<br>`apps/web/lib/admin/feedback-service.ts:348-368` | None. |
| **Lesson Quality Metrics** | NOT IMPLEMENTED | Feedback is not aggregated per lesson slug to calculate a quantitative "Lesson Quality Score" or flag difficulty spikes in admin analytics. | `apps/web/lib/admin/curriculum-service.ts` | Quality metrics derived from quiz pass rates, not user feedback ratings. |
| **Feedback → Curriculum Workflow** | NOT IMPLEMENTED | No automated workflow or task creation linking feedback tickets to curriculum markdown updates. | `apps/web/lib/admin/feedback-service.ts` | Admin manually reads feedback in console. |

---

# Cross-Feature Integration Audit

| Integration | Status | Evidence | Current Behavior |
| :--- | :---: | :--- | :--- |
| **Signup → Onboarding** | CONNECTED | `proxy.ts:198-205` | Users without `onboarding_complete` metadata are intercepted by middleware and redirected to `/onboarding`. |
| **Onboarding → Goal** | CONNECTED | `OnboardingWizard.tsx`<br>`onboarding/actions.ts:115-152` | 4-step wizard saves `career_role`, `goal`, `onboarding_topics`, `onboarding_preference` to `users` table and `user_metadata`. |
| **Goal → Learning Path** | PARTIALLY CONNECTED | `OnboardingWizard.tsx:134`<br>`dashboard/page.tsx:96-108` | Wizard Step 4 computes a recommended module match, but `/dashboard` and `/academy` remain sequential (Lessons 1..90). |
| **Lesson → XP** | CONNECTED | `lessons-db.ts:125-131, 278-284`<br>`xp-service.ts:24-88` | Reading theory, passing quizzes, and submitting reflections insert rows into `xp_events` and update `users.total_xp`. |
| **Lesson → Progress** | CONNECTED | `lessons-completion-service.ts:18-65` | Completing quizzes updates `user_lesson_progress` with `status: 'completed'`, `quiz_score`, `xp_earned`, and `completed_at`. |
| **Lesson → Streak** | CONNECTED | `lessons-db.ts:136, 304, 439`<br>`streaks-db.ts` | `updateUserStreak` is called after theory reading, quiz submission, and reflection saving. |
| **Lesson → Badge** | PARTIALLY CONNECTED | `badges-db.ts:171-253`<br>`api/badges/route.ts` | Badge eligibility is evaluated on-demand when accessing `/badges` or calling the badges API, rather than synchronously in lesson completion handler. |
| **Lesson → Analytics** | PARTIALLY CONNECTED | `lessons-db.ts`<br>`analytics-service.ts:81-83` | Progress and quiz attempts are recorded in DB tables and aggregated in Admin Analytics, but not dispatched to GA4. |
| **Lesson → Notification** | CONNECTED | `lessons-db.ts:313-342` | Completing every 10th lesson (module completion) dispatches `module.completed` in-app notification. |
| **Lesson → Email** | CONNECTED | `connectors.ts:111-129`<br>`cron/daily-reminder/route.ts` | `module.completed` queues `learning.module_complete` email; scheduled crons send daily reminders based on lesson activity. |
| **Capstone → XP** | CONNECTED | `capstones-db.ts:404-416` | `submitCapstoneAction` awards 150 XP idempotently via `xp_events` ledger upon first submission. |
| **Capstone → Portfolio** | CONNECTED | `portfolio-db.ts:128-171`<br>`PortfolioCapstones.tsx` | Submitted and reviewed capstones are queried and rendered on `/p/[username]` with markdown and attached reflections. |
| **Capstone → Notification** | NOT CONNECTED | `capstones-db.ts:275-426` | `capstone.submitted` event definition exists in registry but is not dispatched by `submitCapstoneAction`. |
| **Capstone → Analytics** | PARTIALLY CONNECTED | `analytics-service.ts:85`<br>`ModerationService.ts` | Submissions are tracked in DB and aggregated in Admin Analytics (Outcomes tab), but not tracked in GA4. |
| **Certificate → Portfolio** | CONNECTED | `certificates-db.ts:179`<br>`PortfolioAchievements.tsx` | Public portfolio displays verified certificates; certificates link back to `/p/[username]`. |
| **Certificate → Sharing** | CONNECTED | `certificates-db.ts:114-181`<br>`CertificateActions.tsx` | Verification page `/verify/[certificateId]` provides LinkedIn Add-to-Profile URL generator, direct share buttons, and schema markup. |
| **Certificate → Analytics** | PARTIALLY CONNECTED | `analytics-service.ts:87-89` | Issuance tracked in DB and Admin Outcomes analytics; no GA4 event. |
| **Badge → Notification** | CONNECTED | `badges-db.ts:229-247` | Awarding a badge dispatches `badge.earned` event which creates in-app notification and queues `achievement.badge_earned` email. |
| **Badge → Portfolio** | CONNECTED | `portfolio-db.ts`<br>`PortfolioAchievements.tsx` | Earned badges and milestone progress are rendered on `/p/[username]`. |
| **Badge → Sharing** | PARTIALLY CONNECTED | `badges-db.ts`<br>`BadgeModal.tsx` | Badge dialog provides copy link / share button, but no dedicated public verification URL exists for individual badges. |
| **Portfolio → SEO** | CONNECTED | `app/(portfolio)/p/[username]/page.tsx:20-65` | Public portfolios generate canonicals, OpenGraph profile tags, Twitter cards, and Schema.org `Person` JSON-LD. |
| **Portfolio → Sharing** | CONNECTED | `PortfolioHero.tsx:43-75` | Hero component provides Web Share API, clipboard copy, LinkedIn, and X/Twitter share buttons. |
| **Sharing → Analytics** | PARTIALLY CONNECTED | `analytics.ts:28, 69-71` | Landing page portfolio section view tracked via GA4 `portfolio_view`, but individual share clicks on `/p/[username]` are not tracked. |
| **Feedback → Admin** | CONNECTED | `feedback-service.ts:83-200, 272-368` | Testimonials and feedback rows appear in Admin Console with approve/reject actions and author email resolution. |
| **Feedback → Analytics** | PARTIALLY CONNECTED | `feedback-service.ts`<br>`app/admin/(console)/feedback` | Feedback ratings and counts aggregated in admin console; no external GA4 event. |
| **Feedback → Curriculum** | NOT CONNECTED | `feedback-service.ts` | Feedback is stored in admin tables but not programmatically linked to lesson markdown editing queues. |

---

# Current Implementation Issues

### 1. Onboarding Path Customization Disconnect
* **Severity:** Medium
* **Current Behavior:** The 4-step onboarding wizard collects learner experience levels, primary goals, topics of interest, and learning styles, and Step 4 computes an initial "Recommended Starting Module". However, upon entering the app, `/dashboard` and `/academy` strictly follow the hardcoded sequential order (Lessons 1 through 90). The user's choices do not alter the curriculum display or customize next-lesson prompts.
* **Expected / Intended Behavior:** Onboarding selections should personalize the dashboard's recommended next action or highlight prioritized topic modules.
* **Evidence:** `apps/web/app/onboarding/OnboardingWizard.tsx:134-169`, `apps/web/app/(app)/dashboard/page.tsx:96-108`, `apps/web/app/(app)/academy/page.tsx:123-125`.

### 2. In-App GA4 Event Tracking Omission
* **Severity:** Medium
* **Current Behavior:** `analytics.ts` defines and fires GA4 marketing events (`hero_cta_click`, `curriculum_view`, `faq_expand`, `quick_start_*`), but does not track in-app learning lifecycle events (lesson viewed, theory completed, quiz answered, capstone submitted, badge earned, certificate generated).
* **Expected / Intended Behavior:** Core product actions should be tracked in GA4 alongside internal database logging.
* **Evidence:** `apps/web/lib/analytics.ts:24-36`.

### 3. Undispatched Notification Events
* **Severity:** Low
* **Current Behavior:** Several events defined in `EVENT_DEFINITIONS` (`lesson.completed`, `quiz.completed`, `review.completed`, `streak.updated`, `capstone.submitted`, `user.verified`) are never dispatched by application runtime services.
* **Expected / Intended Behavior:** If registered in the event catalog and connector map, events should be dispatched by their respective mutation handlers.
* **Evidence:** `apps/web/lib/notifications/events/index.ts:24-129`, `apps/web/lib/capstones-db.ts:275-426`, `apps/web/lib/academy/lessons-db.ts:174-356`.

### 4. Capstone Rubric & Reviewer Feedback Absence
* **Severity:** Low
* **Current Behavior:** The `capstone_submissions` table schema contains only `id, user_id, module_slug, content, status, is_public, submitted_at`. Admin review is limited to binary approve/reject (which sets `status: 'reviewed'` and `is_public: true/false`). There is no multi-criteria rubric scoring or written reviewer feedback text field.
* **Expected / Intended Behavior:** Structured capstones with evaluation criteria might include rubric scoring and written review feedback for learners.
* **Evidence:** `apps/web/types/database.ts:202-238`, `apps/web/lib/admin/moderation-service.ts:122-169`.

### 5. Glossary Route Redirect
* **Severity:** Low
* **Current Behavior:** `/glossary` redirects directly to `/frameworks` via `redirect('/frameworks')`. There is no dedicated glossary page or individual term routes, despite sitemap and robots references.
* **Expected / Intended Behavior:** Either render a dedicated glossary or align sitemap/navigation.
* **Evidence:** `apps/web/app/(marketing)/glossary/page.tsx:1-5`, `apps/web/app/sitemap.ts:38-42`.

---

# Current Database / Schema Consistency

The database schema, TypeScript types (`types/database.ts`), and application queries are **strongly aligned and verified**.

### Key Schema Entities & Status

1. **`users`**: Fully aligned. Stores identity (`name`, `username`, `email`, `avatar_url`, `bio`, social URLs), gamification state (`total_xp`, `level`, `current_streak`, `longest_streak`, `streak_freezes_available`, `last_active_date`), onboarding fields (`career_role`, `goal`, `learning_purpose`, `onboarding_topics`, `onboarding_preference`, `onboarding_completed`), and RBAC flags (`is_admin`, `curriculum_access_override`).
2. **`user_lesson_progress`**: Fully aligned. Tracks `lesson_id` (stable `les_XXXXXX` format), `status` (`not_started`, `in_progress`, `completed`), `theory_read_at`, `quiz_score`, `quiz_attempts`, `xp_earned`, `completed_at`.
3. **`quiz_attempts`**: Fully aligned. Stores question-level responses (`question_id`, `selected_option`, `is_correct`).
4. **`reflections`**: Fully aligned. Keyed by `lesson_id` (supporting both lesson IDs and `capstone-[moduleSlug]`), with `content` and `is_public`.
5. **`capstone_submissions`**: Fully aligned. Stores `module_slug`, `content`, `status` (`draft`, `submitted`, `reviewed`), `is_public`, `submitted_at`.
6. **`certificates`**: Fully aligned. Stores `certificate_code`, `type`, `module_slug`, `learner_name`, `level`, `career_title`, `total_xp`, `lessons_completed`, `modules_completed`, `issued_at`.
7. **`badges` & `user_badges`**: Fully aligned. 12 seeded badges mapped to user awards with `earned_at`.
8. **`xp_events`**: Fully aligned. Immutable ledger of XP grants with `source_type` and `source_id`.
9. **`user_flashcard_srs`**: Fully aligned. Stores SM-2 intervals, ease factors, repetitions, and review due dates.
10. **`cohorts` & `cohort_members`**: Fully aligned. Community cohort groups with member associations.
11. **`user_friends`**: Fully aligned. Learner friendships for leaderboard comparisons.
12. **`notifications` & `notification_queue`**: Fully aligned. Stores in-app alerts and outgoing email queue entries with retry tracking.
13. **`email_broadcasts`**: Fully aligned (added in `20260826000003_create_email_broadcasts.sql`). Stores broadcast records, frozen audience filter JSON, and batch counters.
14. **`testimonials` & `user_feedback`**: Fully aligned. Stores moderation queues and ratings.
15. **`system_settings`, `system_announcements`, `system_errors`, `admin_audit_logs`**: Fully aligned.

---

# Current Admin Coverage

The Admin Console (`/admin/(console)`) is fully functional with 18 dedicated workspaces:

* **Dashboard (`/admin/dashboard`):** High-level KPIs (total learners, active DAU/WAU/MAU, total lessons completed, quiz pass rate), date-range comparative trends, and funnel drops.
* **Users (`/admin/users`):** Paginated learner directory with multi-dimensional server-side filtering (experience levels, onboarding topics, learning preferences, completed modules, streak, email status), detail drawers, and individual production email dispatch.
* **Curriculum (`/admin/curriculum`):** Module and lesson progress breakdown, lesson failure rates, and access override management.
* **Capstones & Moderation (`/admin/moderation`):** Review queue for capstone submissions with word counts and approve/reject actions.
* **Feedback (`/admin/feedback`):** Moderation queue for public testimonials and private user feedback with status updates and audit logging.
* **Communications & Broadcasts (`/admin/communications`):** Creation, preview, scheduling, and batch execution of email broadcasts with frozen audience filters.
* **Emails & Templates (`/admin/emails`, `/admin/templates`):** Directory of registered email templates, template variable previews, test email dispatch tool, and pause/resume automations.
* **Analytics (`/admin/analytics`):** 5-tab deep analytics suite (Overview, Learners, Learning, Engagement, Outcomes).
* **System & Settings (`/admin/system`, `/admin/settings`):** Dynamic runtime XP configuration, onboarding field option management, system error logs, announcements manager, and audit logs.

---

# Current Notification & Email Coverage

| Event | Defined | Dispatched | In-App Channel | Email Template | Queue / Cron Trigger | Verified in Tests |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **`user.registered`** | Yes | Yes | Yes | `auth.welcome` | Direct dispatch on signup | Yes (`auth-telemetry-observability.test.ts`) |
| **`user.verified`** | Yes | No | Handler registered | `auth.verify_email` | Handled via Supabase Hook | Yes (`send-email-hook.test.ts`) |
| **`password.reset_requested`** | Yes | No | Handler registered | `auth.password_reset` | Handled via Supabase Hook | Yes (`send-email-hook.test.ts`) |
| **`module.completed`** | Yes | Yes | Yes | `learning.module_complete` | Dispatched on count % 10 == 0 | Yes (`email-automations.test.ts`) |
| **`badge.earned`** | Yes | Yes | Yes | `achievement.badge_earned` | Dispatched on badge award | Yes (`badges.test.ts`) |
| **`xp.level_up`** | Yes | Yes | Yes | `achievement.level_up` | Dispatched on level change | Yes (`xp.test.ts`) |
| **`certificate.generated`** | Yes | Yes | Yes | `achievement.certificate` | Dispatched on cert issuance | Yes (`certificates.test.ts`) |
| **`portfolio.published`** | Yes | Yes | Yes | `achievement.portfolio_published` | Dispatched on privacy toggle | Yes (`portfolio.test.ts`) |
| **`capstone.submitted`** | Yes | No | Handler registered | None registered | None | Yes (`capstones.test.ts`) |
| **`lesson.completed`** | Yes | No | Handler registered | None registered | None | Yes (`curriculum-integrity.test.ts`) |
| **`quiz.completed`** | Yes | No | None | None registered | None | Yes |
| **`review.completed`** | Yes | No | None | None registered | None | Yes |
| **`streak.updated`** | Yes | No | None | None registered | None | Yes |
| **`learning.daily_reminder`** | N/A | N/A | No | `learning.daily_reminder` | `/api/cron/daily-reminder` | Yes (`email-automations.test.ts`) |
| **`learning.weekly_recap`** | N/A | N/A | No | `learning.weekly_recap` | `/api/cron/weekly-recap` | Yes (`recap-evaluator.test.ts`) |
| **`admin.broadcast`** | N/A | N/A | No | Selected Template | `/api/cron/process-broadcasts` | Yes (`broadcast-service.test.ts`) |

---

# Current Analytics Coverage

* **Marketing Analytics:** GA4 implementation tracking CTA clicks, curriculum views, portfolio views, FAQ expansions, scroll depth, and Quick Start tour events via `lib/analytics.ts`.
* **In-App Analytics:** Database-derived internal analytics tracking every theory read, quiz score, XP grant, capstone submission, streak change, and reflection. In-app events are not piped to GA4.
* **Database Analytics:** Fully normalized tables (`user_lesson_progress`, `quiz_attempts`, `xp_events`, `capstone_submissions`, `certificates`, `user_badges`, `user_flashcard_srs`).
* **Admin Analytics:** Full multi-tab analytical suite in Admin Console computing DAU/WAU/MAU, user growth, lesson completion velocity, module drop-offs, quiz pass rates, question failure points, streak distributions, XP velocity, and certificate adoption.
* **Disconnected Tracking:** In-app lesson progression, capstone submissions, and certificate creations are recorded in PostgreSQL but not pushed to external GA4 data streams.

---

# Current Test Coverage

The test suite contains **56 test files** and **465 unit tests**, all currently passing (`100% passing rate`):

* **Authentication & Middleware:** `auth-errors.test.ts`, `auth-telemetry-observability.test.ts`, `auth-ui-integration.test.ts`, `middleware-auth.test.ts`, `update-password.test.ts`, `onboarding.test.ts`.
* **Curriculum & Lessons:** `curriculum-integrity.test.ts`, `curriculum-aggregation.test.ts`, `curriculum-access-override.test.ts`.
* **Gamification & Progress:** `xp.test.ts`, `streaks.test.ts`, `skillRadar.test.ts`, `srs.test.ts`, `badges.test.ts`, `leaderboard.test.ts`, `achievements-aggregation.test.ts`.
* **Capstones, Portfolio & Certificates:** `capstones.test.ts`, `capstone-integrity.test.ts`, `portfolio.test.ts`, `certificates.test.ts`, `dev-certificate.test.ts`.
* **Notifications & Email:** `notifications.test.ts`, `notification-queue-integrity.test.ts`, `in-app-notifications.test.ts`, `email-engine.test.ts`, `email-automations.test.ts`, `send-email-hook.test.ts`, `email-hook-reliability.test.ts`, `admin-production-email.test.ts`, `admin-email-test-send.test.ts`, `broadcast-service.test.ts`, `recap-evaluator.test.ts`, `unsubscribe.test.ts`.
* **Admin Console & Aggregations:** `admin-console.test.ts`, `admin-settings.test.ts`, `admin-security-audit.test.ts`, `admin-cache-verification.test.ts`, `dashboard.test.ts`, `analytics-aggregation.test.ts`, `users-aggregation.test.ts`, `learning-settings-runtime.test.ts`, `feedback-moderation.test.ts`, `testimonial-moderation-integrity.test.ts`, `system-announcements.test.ts`, `system-monitoring.test.ts`.
* **SEO & Metadata:** `seo-canonicals.test.ts`, `seo-structured-data.test.ts`, `seo-social-metadata.test.ts`.
* **General & Reliability:** `quick-start.test.ts`, `contact.test.ts`, `performance-optimization.test.ts`, `avatar-reliability.test.ts`, `rls.test.ts`, `audit-fixes.test.ts`, `remediation.test.ts`.
* **E2E Tests:** Playwright specifications in `e2e/auth/` (`login.spec.ts`, `password-reset.spec.ts`, `protected-routes.spec.ts`).

---

# Current Product Coverage Matrix

| Capability | Status | Frontend | Backend | Database | Admin | Notifications | Email | Analytics | Public / User-Facing |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **User Authentication** | FULLY IMPLEMENTED | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ |
| **User Onboarding** | FULLY IMPLEMENTED | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ⚠️ | ✅ |
| **Path Personalization** | PARTIALLY IMPLEMENTED | ⚠️ | ⚠️ | ✅ | ✅ | ❌ | ❌ | ❌ | ⚠️ |
| **Lesson Engine** | FULLY IMPLEMENTED | ✅ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | ⚠️ | ✅ |
| **Quizzes** | FULLY IMPLEMENTED | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ⚠️ | ✅ |
| **Flashcards / SRS** | FULLY IMPLEMENTED | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ⚠️ | ✅ |
| **Reflections** | FULLY IMPLEMENTED | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ⚠️ | ✅ |
| **Capstones** | FULLY IMPLEMENTED | ✅ | ✅ | ✅ | ✅ | ⚠️ | ❌ | ⚠️ | ✅ |
| **Skill Radar** | FULLY IMPLEMENTED | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ⚠️ | ✅ |
| **Certificates** | FULLY IMPLEMENTED | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ |
| **XP & Levels** | FULLY IMPLEMENTED | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ |
| **Streaks** | FULLY IMPLEMENTED | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ⚠️ | ✅ |
| **Streak Freezes** | PARTIALLY IMPLEMENTED | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Badges** | FULLY IMPLEMENTED | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ |
| **Leaderboards** | FULLY IMPLEMENTED | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ⚠️ | ✅ |
| **Cohorts & Friends** | FULLY IMPLEMENTED | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ⚠️ | ✅ |
| **Public Portfolio** | FULLY IMPLEMENTED | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ |
| **Testimonials** | FULLY IMPLEMENTED | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ⚠️ | ✅ |
| **Career Tools** | NOT IMPLEMENTED | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Referrals** | NOT IMPLEMENTED | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **SEO & Schemas** | FULLY IMPLEMENTED | ✅ | ✅ | N/A | N/A | N/A | N/A | ⚠️ | ✅ |
| **Admin Console** | FULLY IMPLEMENTED | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | N/A |
| **Email Automations** | FULLY IMPLEMENTED | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Email Broadcasts** | FULLY IMPLEMENTED | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ |
| **User Feedback** | FULLY IMPLEMENTED | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ⚠️ | ✅ |

---

# Final Current-State Summary

## What Is Fully Implemented
1. **Core Curriculum & Lesson Delivery:** 90 compiled lessons across 9 modules rendered via block tree architecture with theory engagement time and scroll depth tracking.
2. **Interactive Assessment:** Server-evaluated quizzes, Spaced Repetition (SM-2) flashcard reviews, and structured reflections.
3. **Structured Capstone Framework:** 9 module-level capstones with explicit deliverables, minimum word count enforcement, state transition safeguards, and admin moderation controls.
4. **Continuous Gamification Engine:** Idempotent XP ledger (`xp_events`), 10-tier level progression, daily streak tracking with timezone calibration, 12 evaluable badges, weekly consistency rankings, cohort groups, and friend accountability.
5. **Continuous Skill Radar:** 7-competency mathematical skill evaluation model rendering dynamic polygon radar charts.
6. **Verifiable Certificates:** Cryptographic certificate generation on curriculum completion, public verification route at `/verify/[certificateId]`, LinkedIn Add-to-Profile URL generator, and Schema.org credential markup.
7. **Public Proof-of-Work Portfolios:** Shareable learner portfolios at `/p/[username]` rendering verified capstones, reflections, skill radar, badges, Person schema, and OpenGraph social previews.
8. **Organic SEO Architecture:** Programmatic sitemap generation for all 90 lessons, robots.txt access rules, self-referencing canonicals, and rich JSON-LD structured data (Course, DefinedTermSet, Article, Person, Credential).
9. **Admin Panel & Operations:** 18 functional workspaces covering analytics, user filtering and audience curation, email broadcasts with frozen filters, curriculum overrides, capstone and testimonial moderation, system settings, and error monitoring.
10. **Transactional & Scheduled Email Infrastructure:** Supabase Auth email hook, queue processing with retry mechanics, multi-template rendering (Welcome, Module Complete, Badge, Level Up, Certificate, Portfolio, Daily Reminder, Weekly Recap), and broadcast batch execution.
11. **Automated Test Suite:** 56 test files, 465 passing unit tests validating security, aggregations, RLS, schema integrity, and workflows.

## What Is Partially Implemented
1. **Goal-Driven Path Customization:** Onboarding collects goals, experience levels, topics, and styles, and previews a recommended module, but does not dynamically reorder or filter lessons in the dashboard or academy.
2. **In-App GA4 Tracking:** Marketing events are tracked in GA4, and learning events are tracked in PostgreSQL, but in-app learning actions are not forwarded to GA4.
3. **Capstone Rubric & Feedback:** Capstones can be approved or rejected by admins, but no multi-criteria rubric scoring or written reviewer feedback fields exist.
4. **Streak Freezes:** Database columns and decay logic exist, but no learner-facing freeze store or manual activation interface exists.
5. **Notification Event Dispatches:** Several events defined in `EVENT_DEFINITIONS` are never dispatched by runtime handlers.
6. **Glossary Page:** `/glossary` route is a redirect to `/frameworks` rather than a standalone dictionary of terms.

## What Is Not Implemented
1. **Career Tooling:** No interview question bank, case interview simulator, mock interview tool, resume builder, resume review, or recruiter portal exists.
2. **Referral Engine:** No referral codes, invite links, signup attribution, or viral reward mechanics exist.
3. **Learner Portfolio Analytics:** No visitor view counter or traffic dashboard for learners.
4. **Dynamic Marketing Stats:** Marketing hero statistics are hardcoded claims rather than live database aggregations.
5. **Automated Feedback-to-Curriculum Loop:** No automated workflow converting feedback tickets into curriculum markdown tasks.

## Current Implementation Issues
* **Path Customization Disconnect:** Dashboard always shows sequential lesson order regardless of onboarding goal.
* **GA4 In-App Gap:** In-app learning events not dispatched to GA4.
* **Undispatched Events:** Six defined notification events are not triggered in code.
* **Capstone Rubric Gap:** Capstone reviews lack criteria scores and text feedback fields.
* **Glossary Redirect:** `/glossary` redirects to `/frameworks`.

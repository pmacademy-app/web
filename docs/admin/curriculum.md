# Curriculum Management & Content Quality — Operating Guide

**Location:** `/admin/curriculum`  
**Workspace:** Learning $\rightarrow$ Curriculum  
**Audience:** Curriculum Authors, Product Leads & Instructors  

---

## 1. Purpose

The Curriculum Workspace allows administrators to inspect the full 9-module, 90-lesson PM Academy curriculum, monitor real-time learner content quality scores (clarity ratings and issue tags), inspect feedback comments, and view live student-facing lesson previews.

---

## 2. Access & Permissions

- **Path:** Navigate to `/admin/curriculum` from the sidebar (or use route alias `/admin/content`).
- **Permissions:** Admin role required (`is_admin = true` or listed in `ADMIN_EMAILS`).

---

## 3. Curriculum Structure & Content Quality Metrics

### A. 9-Module Academy Overview
The workspace organizes all 90 compiled lessons across the 9 core curriculum modules (`lib/admin/curriculum-meta.ts`, `scripts/compiler/compile.ts`):
1. `foundations` — PM Foundations & Mental Models
2. `discovery` — User Research & Problem Discovery
3. `design` — Design Thinking & UX
4. `execution` — Agile Delivery & Roadmapping
5. `growth` — Acquisition, Retention & Monetization
6. `leadership` — Stakeholder Influence & Executive Communication
7. `technical` — Technical PM & Architecture
8. `strategy` — Product Strategy & Vision
9. `capstone` — Capstone & Career Portfolio

### B. Content Quality & Clarity Ratings
Every lesson captures direct learner feedback upon completion:
- **Clarity Score (1–5 Stars):** Average score rating student comprehension.
- **Clarity Satisfaction %:** Percentage of ratings at $\ge 4$ stars.
- **Needs Review Filter:** Automatically flags lessons with an average clarity rating below **3.5 / 5.0** for editorial review.
- **Issue Tag Breakdown:** Categorizes reported friction points:
  - `confusing` — Theory is hard to follow.
  - `typo` — Spelling or grammar error.
  - `outdated` — Framework or example needs updating.
  - `broken_diagram` — Mermaid diagram rendering issue.

---

## 4. Operational Procedures

### A. Inspecting Module Lessons & Quality Scores
1. Open `/admin/curriculum`.
2. Click on any module card (e.g., `discovery`) to open `/admin/curriculum/discovery`.
3. Review the lesson table for:
   - **Lesson ID & Title:** Stable identifier.
   - **Clarity Rating:** Star rating and satisfaction percentage.
   - **Feedback Count:** Total number of student submissions.
   - **Status:** displayed as "Published" — this is a static display field with no backend publish/unpublish control; every lesson is always shown as published.

### B. Reviewing Student Feedback & Issue Tags
1. Click on a lesson row with feedback or low clarity scores.
2. The **Learner Feedback Drawer** slides open.
3. Review student qualitative comments and the distribution of reported issue tags.
4. Use this feedback to plan markdown edits in the source content repository (`content/lessons/lesson-0NN.md` — flat files, not organized by module subfolder).

### C. Viewing Live Lesson Previews
1. Navigate to `/admin/curriculum/[moduleSlug]/[lessonId]`.
2. Review the live server-rendered lesson view exactly as a student sees it, including compiled Mermaid diagram SVGs, interactive flashcards, and quiz components.

---

## 5. Practical Example

**Conducting a Weekly Content Quality Audit:**
1. Open `/admin/curriculum`.
2. Toggle the **"Needs Review (<3.5 Stars)"** filter.
3. If a lesson in the `strategy` module is flagged with 3.1 stars and 4 `confusing` tags:
   - Open the feedback drawer to read what students found confusing.
   - Update the corresponding markdown source file in `content/lessons/lesson-0NN.md`.
   - Run `npm run content:compile` to re-compile the static JSON distribution.

---
name: pm-academy-feature-workflow
description: >
  PM Academy feature implementation workflow. The complete 17-step Plan → Build →
  Review → Test → Refactor → Document pipeline for building features in this project.
  Triggers on: "implement X feature", "build X", "add X", or any task involving building a
  substantial new feature end-to-end.
---

# PM Academy — Feature Implementation Workflow

Load `00-pm-academy-core` alongside this skill. Load relevant specialist skills (frontend, backend, design, etc.) as needed.

---

## 1. The Core Engineering Principles

Every feature implementation must adhere to these foundational principles:
- **Server Components First:** Push page state and fetching to async Server Components. Use `"use client"` only for client interactivity (e.g., event handlers, hooks, Framer Motion).
- **Static-First Architecture:** Serve content as pre-generated JSON via CDN. Use `generateStaticParams` for lessons. Keep dynamic routes to user state mutations or user progress overlays.
- **Least Database Privilege:** Never bypass RLS in the client. Always enable RLS on new tables. Use `SECURITY INVOKER` by default for Postgres functions.
- **Zero-Trust API Routing:** Always re-derive user ID via `auth.getUser()`. Never use `body.user_id` or `getSession()`. Always validate payloads using Zod.
- **Keyboard & Screen Reader Accessible:** Keyboard navigation (focus rings, tab indexes) and ARIA attributes are required for all interactive elements. Wrapping motion in `useReducedMotion` is mandatory.

---

## 2. The 17-Step Mandatory Pipeline

Every feature implementation must proceed sequentially through these 17 steps. **Never stop after step 4 (writing code). A feature is only complete when all 17 steps are verified.**

```
┌───────────────────────────┐      ┌───────────────────────────┐      ┌───────────────────────────┐
│  1. Requirements Review   │ ───> │        2. Planning        │ ───> │ 3. Architecture Validation│
└───────────────────────────┘      └───────────────────────────┘      └───────────────────────────┘
                                                                                    │
                                                                                    v
┌───────────────────────────┐      ┌───────────────────────────┐      ┌───────────────────────────┐
│      6. Refactoring       │ <─── │      5. Self Review       │ <─── │     4. Implementation     │
└───────────────────────────┘      └───────────────────────────┘      └───────────────────────────┘
              │
              v
┌───────────────────────────┐      ┌───────────────────────────┐      ┌───────────────────────────┐
│   7. Performance Review   │ ───> │    8. Security Review     │ ───> │  9. Accessibility Review  │
└───────────────────────────┘      └───────────────────────────┘      └───────────────────────────┘
                                                                                    │
                                                                                    v
┌───────────────────────────┐      ┌───────────────────────────┐      ┌───────────────────────────┐
│     12. Lint check        │ <─── │      11. Build check      │ <─── │10. Doc Compliance Review  │
└───────────────────────────┘      └───────────────────────────┘      └───────────────────────────┘
              │
              v
┌───────────────────────────┐      ┌───────────────────────────┐      ┌───────────────────────────┐
│    13. Type Check (tsc)   │ ───> │        14. Testing        │ ───> │ 15. Dead Code Removal     │
└───────────────────────────┘      └───────────────────────────┘      └───────────────────────────┘
                                                                                    │
                                                                                    v
                                   ┌───────────────────────────┐      ┌───────────────────────────┐
                                   │   17. Completion Report   │ <─── │16. Production Verification│
                                   └───────────────────────────┘      └───────────────────────────┘
```

---

### Step 1: Requirements Review
Read the 5 source-of-truth documents to understand the context:
- PRD.md §4: Confirm the exact product spec and XP/streak boundaries.
- Design.md: Confirm the layout, visual positioning, and motion rules.
- Phases.md: Verify this feature is in scope for the active phase.

### Step 2: Planning
Create an implementation plan (`implementation_plan.md` artifact):
- Outline database changes, new API endpoints, logic modules, and UI components.
- Highlight any open decisions or dependencies.
- Submit the plan for user review and approval before proceeding.

### Step 3: Architecture Validation
Verify that the proposed plan doesn't violate core stack invariants:
- No content stored in Supabase.
- No new libraries added without verifying free-tier ceilings.
- Seams between static content and user state remain clean (referenced by text slug, not FK).

### Step 4: Implementation
Implement changes in a clean, logical order to prevent rework:
1. **Database Schema:** migrations + RLS policies + triggers.
2. **Business Logic:** implement in `lib/` modules (never inside components or APIs).
3. **API Routing:** write endpoints, add `getUser()` auth guards, and write input Zod validation.
4. **Server Components:** fetch data, evaluate permissions, pass data to children.
5. **Client Components:** add layout state, event handlers, animations.
6. **UI Polish:** apply Tailwind v4 semantic classes, responsive styles, accessibility helpers.

### Step 5: Self Review
Assess the initial implementation:
- Test edge cases (first user visit, slow connection, database offline).
- Verify error handling: users shouldn't see blank screens or DB tracebacks.

### Step 6: Refactoring
Improve code structure without altering behavior:
- Deduplicate logic: extract shared queries or calculations to `lib/` helpers.
- Clean up file paths, naming, and type definitions (prefer `type` over `interface`).

### Step 7: Performance Review
Verify performance compliance:
- Target Lighthouse ≥ 90.
- Verify lesson pages are statically generated (`generateStaticParams`).
- Verify images use `next/image` and custom fonts use `next/font`.
- Ensure Framer Motion and Lucide packages are imported individually.

### Step 8: Security Review
Audit the implementation's security bounds:
- Verify API routes use `supabase.auth.getUser()`.
- Ensure all public/portfolio database queries explicitly select `is_public = true`.
- Verify database triggers and functions are marked `SECURITY INVOKER`. If `SECURITY DEFINER` is used, confirm `SET search_path = public` is declared.
- Verify RLS policies are enabled on all new tables.

### Step 9: Accessibility Review
Audit the component list against WCAG AA standards:
- Verify keyboard navigation works (Tab, Space, Enter, Arrow keys).
- Check contrast ratios (body text ≥ 4.5:1, large text ≥ 3:1).
- Confirm all motion animations check `useReducedMotion()`.
- Add screen-reader friendly table options for radar charts and graphics.

### Step 10: Documentation Compliance Review
Ensure project records are accurate:
- Update Architecture.md schema drawings if new columns or tables were added.
- Update PRD.md features logs or Open Decisions tables.
- Append a change summary to document Changelogs with version updates.

### Step 11: Build Check
Verify that the project successfully builds for production:
- Run `npm run build` from `apps/web/`.
- Ensure the Markdown content parse/validate commands execute successfully.

### Step 12: Lint Check
Check for formatting and style compliance:
- Run `npm run lint` from `apps/web/`.
- Fix all warnings and errors. Zero exceptions.

### Step 13: Type Check
Ensure strict type compliance:
- Run `npx tsc --noEmit` from `apps/web/`.
- Eliminate any occurrence of `any` types. Ensure types are correctly declared.

### Step 14: Testing
Ensure logic stability:
- Write unit tests using Vitest in the `tests/` directory for any modifications to business logic (`lib/xp.ts`, `lib/srs.ts`, `lib/streaks.ts`, `lib/skillRadar.ts`, `lib/badges.ts`).
- Run `npm test` and verify that all test suites pass.

### Step 15: Dead Code Removal
Clean up the filesystem and codebase:
- Remove unused variables, imports, and CSS classes.
- Delete debugging comments, `console.log` statements, and old backup files.
- Resolve any unresolved `TODO` comments.

### Step 16: Production Readiness Verification
Confirm launch alignment:
- Ensure all environment variables are documented in `.env.example`.
- Verify that API URLs and redirect URIs are not hardcoded to `localhost`.

### Step 17: Completion Report
Document the completed work:
- Create a walkthrough (`walkthrough.md` artifact).
- Summarize what was changed, what manual and automated tests passed, and embed screenshots/videos for UI updates.
- Declare the feature successfully complete.

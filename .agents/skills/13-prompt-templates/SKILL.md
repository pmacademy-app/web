---
name: pm-academy-prompt-templates
description: >
  PM Academy prompt templates for common development tasks. Use these prompts
  to quickly brief Antigravity on specific task types. Triggers on: "give me a prompt",
  "how should I ask about X", or when looking for a structured way to request
  a specific type of work.
---

# PM Academy — Prompt Templates

These are ready-to-use prompt templates for common tasks. Copy, fill in the brackets, and send.

---

## 🏗️ Implementing a New Feature

```
Load the 00-pm-academy-core skill and 10-feature-workflow skill.

Implement [FEATURE NAME] as described in PRD.md §[SECTION].

Context:
- Current phase: [Phase N]
- Files this will touch: [list files]
- Related lib/ modules: [e.g., lib/xp.ts, lib/streaks.ts]

Specific requirements:
- [Requirement from PRD]
- [Any additional context]

Execute all 17 steps of the mandatory development workflow sequentially. 
Create an implementation plan first and wait for my approval before coding.
```

---

## 🐛 Bug Investigation

```
Load the 00-pm-academy-core skill and 11-bug-fixing skill.

Bug report: [DESCRIBE THE BUG]

Steps to reproduce:
- [Step 1]
- [Step 2]

Expected: [What should happen]
Actual: [What is happening]

Investigate systematically. Fix the root cause directly — do not write workarounds.
Write a unit test that catches this bug before implementing the fix.
```

---

## 🎨 Building a UI Component

```
Load the 00-pm-academy-core skill, 01-frontend-engineer skill, and 04-design-system skill.

Build the [COMPONENT NAME] component.

Spec:
- Location: components/[category]/ComponentName.tsx
- Props: [describe the props/data it receives]
- States: [e.g., default, hover, active, disabled, error]

Follow Design.md specs exactly. Use Tailwind v4 classes.
- Default to a Server Component. If interactivity requires a client component, push state down.
- Enforce WCAG AA accessibility, keyboard navigation, and check useReducedMotion() for all Framer Motion animations.
```

---

## 🗄️ Building an API Route

```
Load the 00-pm-academy-core skill and 02-backend-engineer skill.

Build the API route: [METHOD] /api/[path]

Purpose: [What user action does this handle?]
Input: [What data does the client send?]

Rules to enforce:
- Auth guard (always first, using supabase.auth.getUser())
- Re-derive user ID from session. Never trust request body.
- Input payload validation using Zod schemas.
- Call lib/ business modules for core logic — do not implement business logic inline.
- Check database trigger-based cache updates if recording XP.
```

---

## 🔒 Security Review

```
Load the 00-pm-academy-core skill and 09-security skill.

Review [FILE/FEATURE/DIFF] for security issues.

Focus areas:
- Row-Level Security (RLS): Enabled on tables? Policies valid?
- API Route Auth: Calls getUser()? No body.user_id trusted? Zod validation added?
- Public Portfolio: SQL queries filter is_public = true?
- DB Functions: Marked SECURITY INVOKER? If DEFINER, search_path = public configured?
- Secrets: No exposed keys or missing local env configs?
- CSP & security headers: Added to next.config.ts?
```

---

## 🎨 Accessibility (a11y) Audit

```
Load the 00-pm-academy-core skill, 04-design-system skill, and 06-testing-qa skill.

Perform an accessibility audit on [PAGE/COMPONENT].

Focus areas:
- Keyboard accessibility: Focus visible? Tab index correct? Navigable via arrows/Enter/Space?
- ARIA semantics: Correct roles (radiogroup, button, dialog)? Correct attributes (aria-checked, aria-describedby)?
- Screen Reader: Visually hidden summaries added (e.g., for radar charts)?
- Color Contrast: Check ratio is >= 4.5:1 for body and >= 3:1 for large elements.
- Motion safety: All Framer Motion animations wrapped in useReducedMotion()?
```

---

## 🗃️ Database Review

```
Load the 00-pm-academy-core skill, 02-backend-engineer skill, and 09-security skill.

Review the database changes or schema proposed in [MIGRATION_FILE/PR].

Focus areas:
- Timestamp naming convention: File matches YYYYMMDDHHMMSS_description.sql format?
- Decoupled structure: References content by text slug, not FK?
- RLS Policies: Enabled on all user-owned tables?
- Postgres functions: Security INVOKER/DEFINER defaults properly set?
- Idempotency: Uses IF NOT EXISTS / IF EXISTS checks?
```

---

## ⚡ Performance Optimization

```
Load the 00-pm-academy-core skill and 05-seo-performance skill.

Optimize [PAGE/ROUTE] for performance.

Focus areas:
- Lesson & public routes: Using generateStaticParams for SSG?
- Client footprint: Are Framer Motion and Lucide React packages imported individually?
- Layout stability: Image dimensions set? Skeletons preventing layout shift?
- Search Index: Loaded once in client module scope, not per render?
```

---

## 🧪 Writing Unit Tests

```
Load the 00-pm-academy-core skill and 06-testing-qa skill.

Write unit tests for [MODULE: lib/srs.ts / lib/xp.ts / lib/streaks.ts / lib/badges.ts / lib/skillRadar.ts].

Priority areas:
- SRS: Compare against SM-2 references.
- XP: Anti-gaming validations (time thresholds and scroll percentages).
- Streaks: Timezone boundaries (e.g., IST/UTC edge cases).
- Badges: Evaluation bounds and deduplication.

Use Vitest. Tests in tests/[module-name].test.ts. No active DB connections should be required.
```

---

## 📋 Sprint Planning

```
Load the 00-pm-academy-core skill and 08-sprint-planning skill.

Plan [Sprint N / Phase N] tasks.

Apply the 3-question filter (Rules.md §6) to all proposed features. 
Update Phase scopes and verify previous phase DoD is complete before starting.
```

---

## 🚀 Production Readiness Review

```
Load the 00-pm-academy-core skill, 07-git-deployment skill, and 10-feature-workflow skill.

Perform a production readiness check for [FEATURE/RELEASE].

Focus areas:
- Code checks: Lint, TypeScript (strict), build, and unit tests passing?
- Environment vars: All config variables present in .env.example?
- Hardcoded constants: No local URLs or dev credentials present?
- Dead Code: Unused imports, console.logs, test stubs, or comments removed?
- Migration sync: Timestamped migration SQL committed for all DB changes?
```

---

## 🔍 Code Review

```
Load the 00-pm-academy-core skill and 12-refactoring-code-review skill.

Review [DIFF / PR / FILE] for quality and architectural compliance.

Check against the full review checklist:
- Architecture (business logic in lib/, queries in lib/data/)
- TypeScript standards (strict, zero any, type vs interface)
- API route guards (getUser, Zod)
- Design system tokens & semantic styles
```

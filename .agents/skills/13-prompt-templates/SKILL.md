---
name: pm-academy-prompt-templates
description: >
  PM Academy prompt templates for common development tasks. Use these prompts
  to quickly brief Antigravity on specific task types. Triggers on: "give me a prompt",
  "how should I ask about X", or when looking for a structured way to request
  a specific type of work.
---

# PM Academy — Prompt Templates

These are ready-to-use prompt templates for common tasks. Copy, fill in the bracketed parts, and send.

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

Follow the Plan → Build → Review → Test → Refactor → Document workflow.
Make small, reviewable commits. Do not deviate from Architecture.md or Design.md.
```

---

## 🐛 Bug Investigation

```
Load the 00-pm-academy-core skill and 11-bug-fixing skill.

Bug report: [DESCRIBE THE BUG]

Steps to reproduce:
1. [Step 1]
2. [Step 2]

Expected: [What should happen]
Actual: [What is happening]

Hypothesis: [Your theory about the root cause, if any]

Investigate systematically. Do not write a fix until the root cause is confirmed.
Write a unit test that would catch this regression before fixing it.
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
- Accessibility: [specific a11y requirements]
- Animation: [if any — only approved animations from Design.md §3.6]

Design direction: [quote the relevant section from Design.md, or describe]

Use Tailwind CSS v4 classes inline (no CSS modules).
Server component or client component? [specify based on interactivity needs]
Wrap Framer Motion animations in useReducedMotion.
```

---

## 🗄️ Building an API Route

```
Load the 00-pm-academy-core skill and 02-backend-engineer skill.

Build the API route: [METHOD] /api/[path]

Purpose: [What user action does this handle?]

Input: [What data does the client send?]

Business logic:
1. [Step 1]
2. [Step 2]

DB mutations:
- Table: [table_name]
- Operation: [INSERT/UPDATE]

Rules to enforce:
- Auth guard (always first)
- [Any specific business rule from PRD.md §N or Architecture.md §N]

Do not put business logic inline — call lib/ functions.
Use user.id from session, not request body.
```

---

## 📝 Editing Lesson Content

```
Load the 00-pm-academy-core skill and 03-content-pipeline skill.

Edit [lesson-NNN.md]: [DESCRIBE WHAT NEEDS TO CHANGE]

Rules:
- Edit the source .md file in /content/lessons/ only
- Do not edit generated JSON in public/content/
- Do not change any quiz or flashcard IDs (they're stable and referenced by user DB)
- Run npm run content:build after editing to regenerate JSON
- Verify the generated JSON diff looks correct (IDs unchanged, content updated)

If adding new quiz questions or flashcards: assign new IDs in the format lesson-NNN-q-NNN or lesson-NNN-fc-NNN.
```

---

## 🗃️ Database Schema Change

```
Load the 00-pm-academy-core skill and 02-backend-engineer skill.

Add [DESCRIBE SCHEMA CHANGE] to the database.

Requirements:
- Create a migration file: apps/web/supabase/migrations/00N_[name].sql
- Add RLS policies if this is a user-owned table
- Update lib/supabase.ts Database type to reflect the new table/column
- Update Architecture.md §2 to document the change

Never store lesson content in this table. Only user state.
The migration file is the documentation — make it readable.
```

---

## 🔒 Security Review

```
Load the 00-pm-academy-core skill and 09-security skill.

Review [FILE/FEATURE] for security issues.

Focus areas:
- RLS policies: are they in place and correct?
- API route auth: is user.id from session (not body)?
- Public portfolio routes: do they only expose is_public = true content?
- Secret handling: any environment variables in the browser that shouldn't be?
- XSS: any user-submitted content rendered as HTML?

Report findings with severity (Critical / High / Medium / Low) and exact fix.
```

---

## ⚡ Performance Optimization

```
Load the 00-pm-academy-core skill and 05-seo-performance skill.

Optimize [PAGE/FEATURE] for performance.

Current Lighthouse score: [N]
Target: ≥ 90

Known issues: [any known bottlenecks]

Focus areas:
- Is the page SSR'd for SEO? (lesson pages must be)
- Are images using next/image?
- Are fonts loaded via next/font?
- Is client-side JS bundle minimal?
- Is the search-index.json loaded only once, not per render?

Do not compromise SSR on public lesson pages for the sake of performance shortcuts.
```

---

## 🧪 Writing Unit Tests

```
Load the 00-pm-academy-core skill and 06-testing-qa skill.

Write unit tests for [MODULE: lib/srs.ts / lib/xp.ts / lib/streaks.ts / lib/badges.ts / lib/skillRadar.ts].

Priority areas:
- SM-2: test against reference outputs (known input → known output)
- XP anti-gaming: scroll threshold and dwell time enforcement
- Streak timezone: test with non-UTC timezones specifically
- Badge: ensure no double-awards

Use Vitest. Tests in tests/[module-name].test.ts.
Tests must be runnable independently without a running app or DB.
```

---

## 📋 Sprint Planning

```
Load the 00-pm-academy-core skill and 08-sprint-planning skill.

Plan [Sprint N / Phase N] work.

Current status:
- Phase: [current phase]
- Phase Definition of Done: [what's not yet checked off]
- Recent progress: [what was just completed]
- Blockers: [any open decisions or dependencies]

Produce:
1. Must Ship tasks (blocks next phase)
2. Should Ship tasks (high value, not blocking)
3. Explicit exclusions (out of scope for this sprint)
4. Sprint Definition of Done

Apply the 3-question filter to any uncertain features.
Do not let Phase N+1 work bleed into Phase N scope.
```

---

## 📚 Documentation Update

```
Load the 00-pm-academy-core skill.

Update documentation for [DECISION/CHANGE].

Affected documents (update ALL of these if the change touches them):
- [ ] PRD.md §[section] — if product behavior changed
- [ ] Architecture.md §[section] — if technical design changed
- [ ] Rules.md §[section] — if standards/process changed
- [ ] Phases.md — if scope or timeline changed
- [ ] Design.md — if visual/UX direction changed

Rules:
- Append to the document's Changelog section with version bump
- Never silently rewrite history — note what changed and why
- Check for ripple effects: does this change require updating other docs?
- Never let two docs contradict each other
```

---

## 🚀 Release Readiness Check

```
Load the 00-pm-academy-core skill and 07-git-deployment skill.

Run a release readiness check for [Phase N → Phase N+1 / Public Launch].

Check the phase-specific gate in the git-deployment skill:
- For Phase 0→1: content pipeline, deployment, waitlist, analytics
- For Phase 1→2: core loop user testing, no P0 bugs
- For Phase 4→5 (launch): Lighthouse ≥90, WCAG AA, SEO, email flows, security

Report: ✅ passed / ❌ failed / ⚠️ needs attention — for each gate criterion.
Do not advance the phase until the Definition of Done is fully met.
```

---

## 🔍 Code Review

```
Load the 00-pm-academy-core skill and 12-refactoring-code-review skill.

Review [DIFF / PR / FILE] for quality and correctness.

Apply the full PR review checklist from the refactoring skill:
- Correctness (matches PRD requirements)
- Architecture (no content in DB, business logic in lib/, no duplication)
- Security (auth guard, RLS, no secrets)
- Quality (TypeScript types, no any, readable code)
- Design (matches Design.md, accessible, responsive)
- Ops (CI would pass, no secrets committed)

Flag any violation as: MUST FIX / SHOULD FIX / CONSIDER
```

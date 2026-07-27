---
name: pm-academy-feature-workflow
description: >
  PM Academy feature implementation workflow. The complete Plan → Build → Review →
  Test → Refactor → Document cycle for building features in this project. Triggers on:
  "implement X feature", "build X", "add X", or any task involving building a
  substantial new feature end-to-end.
---

# PM Academy — Feature Implementation Workflow

Load `00-pm-academy-core` alongside this skill. Load relevant specialist skills (frontend, backend, etc.) for the feature type.

---

## The Workflow: Plan → Build → Review → Test → Refactor → Document

---

## Phase 1: PLAN

### 1.1 — Read the docs first
Before writing any code, read:
- PRD.md §4 — Does this feature have a specified requirement? What's the "Done When" condition?
- Architecture.md — Does this feature touch the data model, content pipeline, or API design?
- Rules.md §3 — What coding standards apply?
- Design.md — Is there a visual spec for this feature?
- Phases.md — Is this feature in scope for the current phase?

### 1.2 — Check for open decisions
Consult `docs/PRD.md §11`. Does any unresolved open decision affect this feature?
If yes: **resolve the open decision first** (update the relevant doc), then build.

### 1.3 — Scope the feature
Answer these before coding:
1. What is the minimum implementation that satisfies the PRD's "Done When" condition?
2. What is explicitly out of scope (per PRD.md §6 non-goals or the current phase exclusions)?
3. What data does this feature read/write? (User state → Supabase. Content → static JSON.)
4. What existing `lib/` modules does this feature use? (Don't reimplement — call existing modules.)
5. What new API routes are needed (if any)? Follow the naming convention in backend skill.

### 1.4 — Implementation checklist (create this, then execute)
```
- [ ] API route(s): /api/[...]
- [ ] Supabase migration (if schema change): migrations/00N_[name].sql
- [ ] Business logic in lib/: [which module?]
- [ ] Server component(s): [page/layout file]
- [ ] Client component(s): [component file]
- [ ] Unit tests for lib/ changes: tests/[module].test.ts
- [ ] UI matches Design.md direction
- [ ] Accessibility: aria labels, keyboard nav
- [ ] Responsive: mobile viewport
```

---

## Phase 2: BUILD

### 2.1 — Build in this order (avoid wasted work)
1. **Data layer first** — schema migration (if needed) + RLS policies
2. **Business logic** — `lib/` module implementation + unit tests
3. **API route** — wraps the lib logic with auth guard
4. **Server component** — fetches data, passes to presentational component
5. **Client component** — interactivity, animations
6. **UI polish** — matches Design.md

### 2.2 — Small, reviewable commits
Commit at each meaningful step:
```bash
git commit -m "feat: add user_flashcard_srs RLS policy"
git commit -m "feat: implement SM-2 scheduling in lib/srs.ts"
git commit -m "test: add SM-2 unit tests against reference outputs"
git commit -m "feat: add POST /api/flashcards/[id]/review route"
git commit -m "feat: build FlashcardCard component with flip animation"
```

### 2.3 — Verify the anti-rules as you build
At each step, confirm:
- Content not going into Supabase
- XP being written via xp_events first
- User ID from session, not request body
- No dark patterns in UI copy
- `"use client"` only where genuinely needed

---

## Phase 3: REVIEW

### Self-review checklist (before pushing)
```
[ ] Core functionality: works in the happy path
[ ] Error states: network failure, auth failure, invalid input handled
[ ] Security: auth guard, RLS, no user_id from body
[ ] Performance: no unnecessary client-side JS, images use next/image
[ ] Accessibility: keyboard navigable, aria labels, color contrast
[ ] Responsive: tested at mobile viewport (375px)
[ ] Business rules: matches PRD.md §4 exactly (XP values, streak rules, etc.)
[ ] Anti-gaming: verified if this touches XP or theory-read
[ ] No new services introduced without Architecture.md update
[ ] No secrets hardcoded
[ ] CI would pass: lint, types, build
```

### Design review checklist
```
[ ] Typography: correct font family for headings vs. body
[ ] Colors: semantic tokens used (--color-primary, --color-correct, etc.)
[ ] Motion: only approved animations (see Design.md §3.6 celebration list)
[ ] useReducedMotion: wrapped around all Framer Motion
[ ] Skill radar: still the most prominent dashboard element (if touching dashboard)
[ ] Gamification copy: no dark-pattern urgency language
```

---

## Phase 4: TEST

### 4.1 — Unit tests (for lib/ changes)
If you modified any file in `lib/`:
- Write or update tests in `tests/[module-name].test.ts`
- Ensure SM-2, XP anti-gaming, streak timezone tests pass (see testing-qa skill)
- Run `npm test` — all tests must pass

### 4.2 — Manual QA
Execute the relevant QA flow from the testing-qa skill:
- Core Learning Loop (if touching lesson/quiz/progress)
- Gamification Loop (if touching XP/streaks/badges)
- Anti-gaming Verification (if touching theory-read or XP)
- Portfolio Export (if touching public routes)
- Security Checks (if touching auth or API routes)

### 4.3 — CI verification
```bash
# From apps/web/
npm run content:build  # content pipeline still works
npm run lint           # no ESLint errors
npm run build          # production build succeeds
```

---

## Phase 5: REFACTOR

### Refactoring triggers (do these proactively, not at the end)
- Business logic crept into a component → extract to `lib/`
- Same logic duplicated in two places → extract to shared utility
- Component doing too many things → split into data-fetching + presentational
- Magic numbers hardcoded → extract to named constants
- `any` type used → replace with proper types

### Refactoring constraints
- **Do not refactor and add features in the same commit** — makes diffs unreadable
- **Run tests after every refactoring step** — regression check
- Maintain the same behavior — refactoring = same behavior, better structure

---

## Phase 6: DOCUMENT

### 6.1 — Update source-of-truth docs if the feature changed any decisions
- New service added → Architecture.md §1 table
- New table or column → Architecture.md §2 schema
- New API route → document in backend skill references
- Open decision resolved → PRD.md §11 changelog

### 6.2 — Code documentation
- Document the "why" in comments, not the "what" (the code already says what)
- Every `lib/` module: top-of-file JSDoc comment explaining the module's responsibility
- Complex business rules: inline comment referencing PRD.md section (e.g., `// PRD.md §4.6 — anti-gaming rule`)

### 6.3 — Commit and PR
```bash
git add .
git commit -m "feat: implement flashcard spaced repetition review (SM-2)"
git push origin feature/flashcard-srs
# Create PR → CI runs → Vercel preview → verify → merge
```

---

## Common Feature Templates

### New `lib/` Module

```typescript
/**
 * [Module Name] — [one-line responsibility]
 *
 * [Architecture.md §N] defines the rules this module enforces.
 * [PRD.md §4.N] defines the product behavior this module implements.
 *
 * This is the SINGLE implementation of [formula/logic] — never duplicate
 * this logic in components, API routes, or other lib files.
 */

// Constants (match PRD.md exactly)
export const [MODULE]_CONSTANTS = {
  // ...
} as const

// Types
export type [ModuleType] = {
  // ...
}

// Core logic
export function [mainFunction]([params]: [Types]): [ReturnType] {
  // ...
}
```

### New API Route

```typescript
// app/api/[resource]/[action]/route.ts
import { createServerSupabaseClient } from '@/lib/supabase'
import { NextRequest } from 'next/server'

export async function POST(
  request: NextRequest,
  { params }: { params: { [key]: string } }
) {
  const supabase = createServerSupabaseClient()
  
  // 1. Auth guard — always first
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  // 2. Validate input
  const body = await request.json()
  // Zod validation here
  
  // 3. Business logic (call lib/ functions, not inline)
  
  // 4. DB mutation
  
  // 5. Return
  return Response.json({ data: result })
}
```

### New Page (Server Component)

```typescript
// app/(app)/[feature]/page.tsx
import { createServerSupabaseClient } from '@/lib/supabase'
import { redirect } from 'next/navigation'
import { Metadata } from 'next'
import { FeatureComponent } from '@/components/[feature]/FeatureComponent'

export const metadata: Metadata = {
  title: '[Page Title] | PM Academy',
  description: '[Page description]',
}

export default async function FeaturePage() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) redirect('/login')
  
  // Fetch user state from Supabase (not content — that comes from JSON files)
  const { data } = await supabase.from('[table]').select().eq('user_id', user.id)
  
  return <FeatureComponent data={data} />
}
```

### New Client Component

```typescript
// components/[category]/ComponentName.tsx
'use client'

import { useState } from 'react'
import { useReducedMotion } from 'framer-motion'
// Import only what's needed from lucide-react
import { SomeIcon } from 'lucide-react'

interface ComponentNameProps {
  // typed props — no `any`
}

export function ComponentName({ prop1, prop2 }: ComponentNameProps) {
  const shouldReduceMotion = useReducedMotion()
  
  return (
    <div
      role="[appropriate-role]"
      aria-label="[description]"
      // Keyboard handler if interactive
    >
      {/* Component content */}
    </div>
  )
}
```

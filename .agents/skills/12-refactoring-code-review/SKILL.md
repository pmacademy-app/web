---
name: pm-academy-refactoring
description: >
  PM Academy refactoring and code review skill. Covers when and how to refactor,
  the architectural patterns to enforce, code quality standards, and the review
  checklist for changes in this codebase. Triggers on: code review, refactoring,
  "clean up this code", "this feels messy", technical debt, or architecture review.
---

# PM Academy — Refactoring & Code Review

Load `00-pm-academy-core` alongside this skill.

---

## 1. When to Refactor

**DO refactor when:**
- Business logic is inside a React component (extract to `lib/`)
- Same logic appears in two places (extract to shared utility)
- A function does too many things (split by responsibility)
- Magic numbers / strings are hardcoded (extract to named constants)
- `any` type is used (replace with proper TypeScript types)
- A server component has `"use client"` for no real reason (remove it)
- An API route contains business logic instead of calling `lib/` (extract to lib/)

**DO NOT refactor when:**
- You're also adding features (separate commits for behavior vs. structure)
- The "improvement" makes the code harder to understand for a solo founder reading it cold
- The refactoring introduces new dependencies or patterns not already in the codebase

---

## 2. The Solo-Founder Readability Test

Before any refactoring, ask: **"Could a solo founder (or an AI assistant with no memory of this session) understand this code in 5 minutes?"**

- If yes and you want to "improve" it for elegance — don't. Ship the feature instead.
- If no and it's actively confusing — refactor.

**Cleverness is never a goal.** The most boring, explicit, readable code wins.

---

## 3. Architecture Rules to Enforce (Code Review Lens)

### Business logic belongs in `lib/`
```typescript
// ❌ Business logic in API route
export async function POST(request) {
  // ...
  const newEF = ef + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
  const newInterval = repetitions === 0 ? 1 : repetitions === 1 ? 6 : Math.round(interval * ef)
  // ... more SM-2 logic inline
}

// ✅ Call lib/srs.ts
import { calculateNextReview } from '@/lib/srs'
export async function POST(request) {
  const result = calculateNextReview(currentState, quality)
  // just the mutation
}
```

### Business logic in components
```typescript
// ❌ XP calculation inline in component
function QuizComplete({ attempts, score }) {
  const xp = score === 100 && attempts === 1 ? 75 + 25 : score * 0.75
  // ...
}

// ✅ Delegate to lib/
import { calculateQuizXP } from '@/lib/xp'
function QuizComplete({ attempts, score }) {
  const xp = calculateQuizXP({ attempts, score })
  // ...
}
```

### Duplicated data fetching logic
```typescript
// ❌ Same Supabase query in 3 different pages
// ✅ Create a shared data-fetching function in lib/data/
// e.g., lib/data/user-progress.ts exports getUserProgress(userId, supabase)
```

---

## 4. TypeScript Code Quality

### Types to enforce
```typescript
// ❌ any type
function processLesson(lesson: any) { }

// ✅ Proper types (align with lib/supabase.ts Database type)
import { Database } from '@/lib/supabase'
type LessonProgress = Database['public']['Tables']['user_lesson_progress']['Row']
function processLesson(progress: LessonProgress) { }

// ❌ interface when type is sufficient
interface UserGoal { }

// ✅ type
type UserGoal = 'job_search' | 'fill_gaps' | 'exploring'

// ✅ const assertions for lookup tables
const XP_AMOUNTS = {
  theory_read: 10,
  quiz_correct: 5,
  quiz_bonus: 25,
  // ...
} as const

type XPSourceType = keyof typeof XP_AMOUNTS
```

### Null safety
```typescript
// ❌ Optional chaining without handling the null case
const score = userProgress?.quiz_score  // might be undefined — handle it

// ✅ Explicit null handling
const score = userProgress?.quiz_score ?? 0
```

---

## 5. Component Review Checklist

```
[ ] "use client" — is it actually needed? (state, effects, browser APIs, event handlers, Framer Motion)
[ ] Data fetching — happening in server component, not client?
[ ] Props — typed, no `any`
[ ] Accessibility — aria labels, keyboard nav, focus management
[ ] Responsive — Tailwind breakpoint classes present for key layouts
[ ] Motion — useReducedMotion() wrapping Framer Motion?
[ ] Images — next/image, not raw <img>
[ ] Fonts — next/font, not Google Fonts link tags
[ ] Strings — externalized, not hardcoded in JSX?
[ ] Error state — component handles loading/error gracefully?
[ ] Key props — present on all list-rendered items (stable keys from content IDs)?
```

---

## 6. API Route Review Checklist

```
[ ] auth.getUser() called FIRST before any data access
[ ] user.id from session used, not body.user_id
[ ] Input validation (Zod or manual) before DB mutations
[ ] RLS policies exist for any new tables being queried
[ ] Error handling with try/catch, proper HTTP status codes
[ ] No business logic inline — calls lib/ functions
[ ] No createServerSupabaseClient in wrong context
[ ] Response doesn't expose internal Supabase errors to client
```

---

## 7. Content Pipeline Review Checklist

```
[ ] Source Markdown file edited (not generated JSON)
[ ] All required schema sections present
[ ] Stable IDs unchanged (no ID regenerated after content edit)
[ ] Exactly 15 quiz questions
[ ] Exactly 1-2 skill_clusters
[ ] Honest est_minutes (not inflated)
[ ] npm run content:build runs without errors
[ ] Generated JSON diff reviewed (IDs didn't change unexpectedly)
```

---

## 8. Full PR Review Checklist

Use this for any PR review:

### Correctness
- [ ] Does the change do what the PR description says?
- [ ] Does it match the PRD.md requirement (exact XP values, rule logic, etc.)?
- [ ] Does it handle edge cases (empty state, network failure, unauthorized)?

### Architecture
- [ ] No content stored in Supabase
- [ ] No lesson content fetched from Supabase (fetch from `/content/*.json`)
- [ ] Business logic in `lib/`, not in components or API routes
- [ ] No new service added without Architecture.md §1 update
- [ ] No duplication of existing lib/ logic

### Security
- [ ] API routes auth-guarded
- [ ] user.id from session (not request body)
- [ ] RLS policies on any new tables
- [ ] No secrets in code

### Quality
- [ ] TypeScript — no `any`, proper types
- [ ] No lint errors (CI will catch this too)
- [ ] Unit tests for lib/ changes
- [ ] Code is readable by a solo founder with no context

### Design
- [ ] Matches Design.md visual direction
- [ ] Accessible (aria, keyboard, contrast)
- [ ] Responsive (mobile viewport)
- [ ] Approved animations only (see Design.md §3.6)
- [ ] No dark pattern language in UI copy

### Ops
- [ ] CI would pass
- [ ] No secrets committed
- [ ] Architecture.md updated if decisions changed
- [ ] Content pipeline still works if touching scripts/ or content/

---

## 9. Technical Debt Tracking

When you spot technical debt but can't fix it now:

```typescript
// TODO(tech-debt): This XP calculation is duplicated in api/quiz/route.ts.
// Move to lib/xp.ts and call from both places.
// Tracked: [brief description of the issue]
```

Keep a list in `docs/` or comments. Address during refactoring sprints between phases, not during feature development.

---

## 10. Refactoring Workflow

```bash
# 1. Understand what you're refactoring — read the code thoroughly first
# 2. Write tests FIRST if the module doesn't have them (test the current behavior)
# 3. Refactor in small steps
# 4. Run tests after EVERY step
# 5. Commit each logical refactoring step separately

git commit -m "refactor: extract XP validation logic from API route to lib/xp.ts"
git commit -m "refactor: remove duplicate quiz-score calculation from LessonComplete component"
git commit -m "refactor: add TypeScript types for all lib/xp.ts exports"

# 6. CI must pass
# 7. PR with description explaining what was wrong and what's better now
```

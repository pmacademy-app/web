---
name: pm-academy-testing-qa
description: >
  PM Academy testing and QA skill. Covers unit testing strategy for business logic,
  the definition-of-done quality checklist, manual QA flows for the learning loop,
  and CI verification. Triggers on: writing tests, debugging logic, QA passes,
  verifying business logic correctness, or any task involving lib/ module testing.
---

# PM Academy — Testing & QA

Load `00-pm-academy-core` alongside this skill.

---

## 1. Testing Philosophy

**Test what matters most** — bugs in these modules directly break the product's core promises:

1. `lib/srs.ts` — SM-2 correctness: wrong algorithm = flashcard reviews scheduled incorrectly
2. `lib/xp.ts` — anti-gaming rule enforcement: wrong logic = XP farming exploits
3. `lib/streaks.ts` — timezone-correct day boundaries: wrong logic = streaks feel broken
4. `lib/skillRadar.ts` — scoring formula correctness: wrong logic = radar misleads users
5. `lib/badges.ts` — badge trigger conditions: wrong logic = badges don't award or double-award

**Secondary priority:**
- Content pipeline scripts (`parse-content.ts`, `validate-content.ts`)
- API route authorization logic (auth guard works, user_id from session)

**Phase 4 additions (not Phase 1 blockers):**
- E2E/Playwright tests for the full user journey
- Full component test coverage

---

## 2. Unit Testing Setup

This project uses **Vitest** for unit tests. If not yet configured, set it up as follows:

```bash
# From apps/web/
npm install -D vitest @vitest/ui @vitest/coverage-v8
```

Add to `apps/web/package.json`:
```json
{
  "scripts": {
    "test": "vitest run",
    "test:ui": "vitest --ui",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage"
  }
}
```

Create `apps/web/vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
})
```

Tests live in `apps/web/tests/` (e.g., `tests/srs.test.ts`, `tests/xp.test.ts`).

---

## 3. SM-2 Unit Tests (Critical)

`lib/srs.ts` must be tested against known SM-2 reference outputs:

```typescript
// tests/srs.test.ts
import { describe, it, expect } from 'vitest'
import { calculateNextReview } from '@/lib/srs'

describe('SM-2 Algorithm', () => {
  it('first review with quality 4: interval = 1 day', () => {
    const result = calculateNextReview({ repetitions: 0, interval_days: 0, ease_factor: 2.5 }, 4)
    expect(result.interval_days).toBe(1)
    expect(result.newRepetitions).toBe(1)
  })
  
  it('second review with quality 4: interval = 6 days', () => {
    const result = calculateNextReview({ repetitions: 1, interval_days: 1, ease_factor: 2.5 }, 4)
    expect(result.interval_days).toBe(6)
    expect(result.newRepetitions).toBe(2)
  })
  
  it('third review with quality 4: interval = previous × ease_factor', () => {
    const result = calculateNextReview({ repetitions: 2, interval_days: 6, ease_factor: 2.5 }, 4)
    expect(result.interval_days).toBe(15)  // 6 × 2.5 = 15
  })
  
  it('quality < 3 resets repetitions to 0 and interval to 1', () => {
    const result = calculateNextReview({ repetitions: 5, interval_days: 30, ease_factor: 2.5 }, 2)
    expect(result.newRepetitions).toBe(0)
    expect(result.interval_days).toBe(1)
  })
  
  it('ease factor never drops below 1.3', () => {
    let state = { repetitions: 0, interval_days: 0, ease_factor: 2.5 }
    for (let i = 0; i < 20; i++) {
      const result = calculateNextReview(state, 0)
      state = { repetitions: result.newRepetitions, interval_days: result.interval_days, ease_factor: result.newEaseFactor }
    }
    expect(state.ease_factor).toBeGreaterThanOrEqual(1.3)
  })
  
  it('perfect recall (quality=5) increases ease factor', () => {
    const result = calculateNextReview({ repetitions: 3, interval_days: 10, ease_factor: 2.5 }, 5)
    expect(result.newEaseFactor).toBeGreaterThan(2.5)
  })
})
```

---

## 4. XP Module Tests (Critical)

```typescript
// tests/xp.test.ts
import { describe, it, expect } from 'vitest'
import { XP_AMOUNTS, validateTheoryReadXP, shouldAwardQuizBonus } from '@/lib/xp'

describe('XP Constants — match PRD.md §4.6 exactly', () => {
  it('returns correct XP amounts for each source type', () => {
    expect(XP_AMOUNTS.theory_read).toBe(10)
    expect(XP_AMOUNTS.quiz_correct).toBe(5)
    expect(XP_AMOUNTS.quiz_bonus).toBe(25)
    expect(XP_AMOUNTS.flashcard).toBe(2)
    expect(XP_AMOUNTS.reflection).toBe(15)
    expect(XP_AMOUNTS.capstone).toBe(150)
  })
})

describe('Anti-gaming: Theory Read', () => {
  it('requires scroll_percentage >= 80', () => {
    const result = validateTheoryReadXP({ scroll_percentage: 79, active_seconds: 180 })
    expect(result.eligible).toBe(false)
  })
  
  it('requires active_seconds >= 120', () => {
    const result = validateTheoryReadXP({ scroll_percentage: 90, active_seconds: 119 })
    expect(result.eligible).toBe(false)
  })
  
  it('eligible when both thresholds met', () => {
    const result = validateTheoryReadXP({ scroll_percentage: 80, active_seconds: 120 })
    expect(result.eligible).toBe(true)
  })
  
  it('eligible at exact boundary values', () => {
    const result = validateTheoryReadXP({ scroll_percentage: 80, active_seconds: 120 })
    expect(result.eligible).toBe(true)
  })
})

describe('Anti-gaming: Quiz Bonus', () => {
  it('awards bonus only when first attempt AND 100% score', () => {
    expect(shouldAwardQuizBonus({ quiz_attempts: 1, quiz_score: 100 })).toBe(true)
    expect(shouldAwardQuizBonus({ quiz_attempts: 2, quiz_score: 100 })).toBe(false)
    expect(shouldAwardQuizBonus({ quiz_attempts: 1, quiz_score: 93 })).toBe(false)
    expect(shouldAwardQuizBonus({ quiz_attempts: 0, quiz_score: 100 })).toBe(false)
  })
})
```

---

## 5. Streak Tests (Critical)

```typescript
// tests/streaks.test.ts
import { describe, it, expect } from 'vitest'
import { isNewStudyDay, shouldIncrementStreak, shouldResetStreak } from '@/lib/streaks'

describe('Streak Logic — Timezone Correctness', () => {
  it('uses user timezone for day boundary, not server UTC', () => {
    // User in IST (UTC+5:30), studying at 11pm IST = 5:30pm UTC
    // Last study: 2024-01-15T17:30:00Z (= 2024-01-15 23:00 IST)
    // Current:    2024-01-15T18:31:00Z (= 2024-01-16 00:01 IST — new local day)
    const result = isNewStudyDay('2024-01-15T17:30:00Z', '2024-01-15T18:31:00Z', 'Asia/Kolkata')
    expect(result).toBe(true)
  })
  
  it('does not count as new day when same local calendar day', () => {
    // User in IST, studying twice in the same IST day
    const result = isNewStudyDay('2024-01-15T05:00:00Z', '2024-01-15T10:00:00Z', 'Asia/Kolkata')
    expect(result).toBe(false)
  })
  
  it('does not double-increment if studying twice in same local day', () => {
    // Already studied today — should not increment again
    // (handled by checking isNewStudyDay before incrementing)
  })
  
  it('resets streak to 0 if two local days missed (no freeze available)', () => {
    // 2+ days missed with 0 freezes = reset
  })
  
  it('applies freeze when exactly one local day missed and freeze available', () => {
    // streak stays, streak_freezes_available decrements by 1
  })
  
  it('does NOT apply freeze when 2+ days missed', () => {
    // streak resets even with freezes available — freeze only covers 1 day
  })
})
```

---

## 6. Badge Tests

```typescript
// tests/badges.test.ts
import { describe, it, expect } from 'vitest'
import { evaluateNewlyEarnedBadges } from '@/lib/badges'

describe('Badge Evaluation', () => {
  it('does not re-award already-earned badges', () => {
    const result = evaluateNewlyEarnedBadges({
      completedLessonsCount: 10,
      perfectQuizzesCount: 1,
      capstonesCount: 0,
      currentStreak: 7,
      completedModules: [1],
      existingBadgeKeys: ['perfect_quiz', 'module_1_complete', 'streak_7']
    })
    expect(result).toHaveLength(0)
  })
  
  it('awards CPO badge only when 90 lessons AND 9 capstones complete', () => {
    const notYet = evaluateNewlyEarnedBadges({
      completedLessonsCount: 90,
      capstonesCount: 8,
      completedModules: [1,2,3,4,5,6,7,8,9],
      existingBadgeKeys: []
    })
    expect(notYet.find(b => b.key === 'cpo_completion')).toBeUndefined()
    
    const yes = evaluateNewlyEarnedBadges({
      completedLessonsCount: 90,
      capstonesCount: 9,
      completedModules: [1,2,3,4,5,6,7,8,9],
      existingBadgeKeys: []
    })
    expect(yes.find(b => b.key === 'cpo_completion')).toBeDefined()
  })
})
```

---

## 7. Content Pipeline Tests

```typescript
// tests/content-pipeline.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import path from 'path'

describe('Content Pipeline Output', () => {
  it('generates valid JSON for expected lessons', () => {
    const lessonPath = path.join(process.cwd(), '../../public/content/lessons/lesson-001.json')
    if (!existsSync(lessonPath)) {
      console.warn('Content pipeline not yet run — skipping. Run: npm run content:build')
      return
    }
    const lesson = JSON.parse(readFileSync(lessonPath, 'utf-8'))
    expect(lesson.meta.slug).toBeTruthy()
    expect(lesson.quiz).toHaveLength(15)
    expect(lesson.flashcards.length).toBeGreaterThan(0)
  })
  
  it('search index contains expected structure', () => {
    const indexPath = path.join(process.cwd(), '../../public/content/search-index.json')
    if (!existsSync(indexPath)) return
    const index = JSON.parse(readFileSync(indexPath, 'utf-8'))
    expect(Array.isArray(index.lessons)).toBe(true)
    expect(index.lessons.length).toBeGreaterThan(0)
  })
})
```

---

## 8. Manual QA Flows

### Core Learning Loop (Phase 1 — must pass before Phase 2)
1. Sign up with email + password → email verification arrives (Resend)
2. Complete onboarding (goal-setting question) → land on dashboard
3. Start Lesson 1 → theory loads from static JSON (not from Supabase — verify in Network tab)
4. Scroll through theory → "Continue to Quiz" unlocks after scroll + dwell threshold (not immediately on page load)
5. Complete quiz → see immediate feedback per question → see summary score
6. Lesson 1 marked complete → Lesson 2 unlocks
7. Sign out → sign back in → progress preserved

### Gamification Loop (Phase 2)
1. Complete a lesson → XP counter increments with tick-up animation
2. Complete a quiz with 100% first attempt → +25 bonus XP fires
3. Study two days in a row → streak increments correctly
4. Study in a non-UTC timezone → streak increments on local calendar day, not UTC
5. Open flashcard review → SM-2-scheduled cards appear → rate a card → next review date updates
6. Skill radar updates immediately after lesson/quiz completion
7. Level-up animation fires at the correct XP threshold

### Anti-Gaming Verification (Phase 2)
1. Open Network tab → navigate to Theory section → scroll quickly to bottom without reading → "Continue to Quiz" should be blocked (dwell time not met)
2. Try submitting theory-read via direct API call without scroll signals → should return 400
3. Try a quiz second time → +25 first-attempt bonus should NOT fire again
4. Verify `xp_events` row exists in Supabase BEFORE `users.total_xp` is updated

### Portfolio Export (Phase 3)
1. Mark a reflection as public → visible on `/p/[username]` without login
2. Submit a capstone, mark as public → visible on portfolio page
3. Open portfolio page in incognito → renders without any auth redirect
4. Verify only `is_public = true` content appears — no private reflections leak

### Security Checks (every phase)
1. Try calling `/api/lessons/[slug]/progress` with a forged `user_id` in the body → API should use session user, not body
2. Try accessing another user's progress via direct Supabase query → verify RLS blocks it (returns empty, not error)
3. Verify `SUPABASE_SERVICE_ROLE_KEY` is NOT in the client-side JS bundle (check browser Network tab → bundle files)
4. Verify no API route uses `getSession()` — all should use `getUser()`

---

## 9. CI Verification Checklist

The CI pipeline (`.github/workflows/ci.yml`) must pass before any merge:
- [ ] `npm run content:parse` — no parser errors
- [ ] `npm run content:validate` — all lessons valid
- [ ] `npm run content:search` — search index generated
- [ ] `npm run lint` — zero ESLint errors
- [ ] `npx tsc --noEmit` — zero TypeScript errors
- [ ] `npm run build` — Next.js production build succeeds
- [ ] `npm test` — all unit tests pass (when test suite exists)

---

## 10. Definition of Done Checklist

**A feature is NOT done until every item below is checked.** This is a quality gate, not a suggestion.

### Functionality
- [ ] Feature works in the happy path
- [ ] Feature handles error states gracefully (network failure, auth failure, invalid input, empty state)
- [ ] Feature works on mobile viewport (375px width minimum)

### Code Quality
- [ ] All business logic lives in `lib/`, not in components or API routes directly
- [ ] No `any` TypeScript types (use proper types from `types/` or infer from Supabase schema)
- [ ] No unused imports, no commented-out code, no debug `console.log` statements
- [ ] Unit tests written/updated for any new or modified `lib/` module logic

### Security
- [ ] API routes call `supabase.auth.getUser()` FIRST before any data access
- [ ] `user.id` from session used — never from request body
- [ ] New tables have RLS enabled + policies defined
- [ ] Public portfolio routes only query `is_public = true`
- [ ] No secrets committed or hardcoded

### Design & Accessibility
- [ ] Matches Design.md visual direction (semantic color tokens, typography hierarchy)
- [ ] WCAG AA: keyboard navigable, aria labels, color contrast ≥ 4.5:1
- [ ] `useReducedMotion` wrapping all Framer Motion animations
- [ ] No dark pattern language in UI copy

### Infrastructure
- [ ] CI passes: lint, type check, content validation, build, tests
- [ ] No new services added without updating Architecture.md §1
- [ ] Migrations timestamped (`YYYYMMDDHHMMSS_description.sql`) and committed

### Documentation
- [ ] Architecture.md updated if new table/column/service was added
- [ ] PRD.md updated if product behavior changed
- [ ] Open decisions resolved in PRD.md §11 if applicable

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

**Not a Phase 1 blocker** (Phase 4 hardening):
- E2E/Playwright tests
- Full component test coverage

---

## 2. Unit Testing Setup

The project does not yet have a test runner configured. When setting up:

```bash
# Recommended: Vitest (compatible with TypeScript, Vite-based, faster than Jest)
npm install -D vitest @vitest/ui @vitest/coverage-v8

# OR: Jest with ts-jest
npm install -D jest @types/jest ts-jest
```

Add to `package.json`:
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
    expect(result.interval_days).toBe(15) // 6 × 2.5 = 15
  })
  
  it('quality < 3 resets repetitions to 0', () => {
    const result = calculateNextReview({ repetitions: 5, interval_days: 30, ease_factor: 2.5 }, 2)
    expect(result.newRepetitions).toBe(0)
    expect(result.interval_days).toBe(1)
  })
  
  it('ease factor never drops below 1.3', () => {
    // Apply quality=0 repeatedly
    let state = { repetitions: 0, interval_days: 0, ease_factor: 2.5 }
    for (let i = 0; i < 10; i++) {
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
describe('XP Module', () => {
  it('returns correct XP amounts for each source type', () => {
    // Test that XP_AMOUNTS constant matches PRD.md §4.6 exactly
    expect(XP_AMOUNTS.theory_read).toBe(10)
    expect(XP_AMOUNTS.quiz_correct).toBe(5)
    expect(XP_AMOUNTS.quiz_bonus).toBe(25)
    expect(XP_AMOUNTS.flashcard).toBe(2)
    expect(XP_AMOUNTS.reflection).toBe(15)
    expect(XP_AMOUNTS.capstone).toBe(150)
  })
  
  it('theory_read XP requires scroll_percentage >= 80', () => {
    const result = validateTheoryReadXP({ scroll_percentage: 79, active_seconds: 180 })
    expect(result.eligible).toBe(false)
  })
  
  it('theory_read XP requires active_seconds >= 120', () => {
    const result = validateTheoryReadXP({ scroll_percentage: 90, active_seconds: 119 })
    expect(result.eligible).toBe(false)
  })
  
  it('theory_read XP eligible when both thresholds met', () => {
    const result = validateTheoryReadXP({ scroll_percentage: 80, active_seconds: 120 })
    expect(result.eligible).toBe(true)
  })
  
  it('quiz bonus only when first attempt AND 100% score', () => {
    expect(shouldAwardQuizBonus({ quiz_attempts: 1, quiz_score: 100 })).toBe(true)
    expect(shouldAwardQuizBonus({ quiz_attempts: 2, quiz_score: 100 })).toBe(false)
    expect(shouldAwardQuizBonus({ quiz_attempts: 1, quiz_score: 93 })).toBe(false)
  })
})
```

---

## 5. Streak Tests (Critical)

```typescript
// tests/streaks.test.ts
describe('Streak Logic', () => {
  it('increments streak when studying in same local calendar day', () => {
    // user in Asia/Kolkata timezone
    // last_study_at: 2024-01-15T18:30:00Z (= 2024-01-16 00:00 IST)
    // current_at:    2024-01-16T18:30:00Z (= 2024-01-17 00:00 IST)
    // These are DIFFERENT local days → increment
  })
  
  it('uses user timezone for day boundary, not server UTC', () => {
    // A user in UTC-5 at 11pm local = 4am UTC next day
    // The "day" is still the user's local day, not the UTC day
  })
  
  it('does not double-increment if studying twice in same local day', () => {})
  
  it('resets streak to 0 if two local days missed (no freeze available)', () => {})
  
  it('applies freeze when one local day missed and freeze available', () => {
    // streak stays, streak_freezes_available decrements by 1
  })
  
  it('does not apply freeze when two+ days missed', () => {
    // streak resets even with freeze available
  })
  
  it('awards one freeze per 7-day consistent study streak', () => {})
})
```

---

## 6. Badge Tests

```typescript
// tests/badges.test.ts
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
    expect(result).toHaveLength(0) // nothing new to award
  })
  
  it('awards CPO badge only when 90 lessons AND 9 capstones complete', () => {
    const notYet = evaluateNewlyEarnedBadges({ completedLessonsCount: 90, capstonesCount: 8, /* ... */ existingBadgeKeys: [] })
    expect(notYet.find(b => b.key === 'cpo_completion')).toBeUndefined()
    
    const yes = evaluateNewlyEarnedBadges({ completedLessonsCount: 90, capstonesCount: 9, /* ... */ existingBadgeKeys: [] })
    expect(yes.find(b => b.key === 'cpo_completion')).toBeDefined()
  })
  
  it('awards all 9 module badges when appropriate modules completed', () => {
    const result = evaluateNewlyEarnedBadges({
      completedModules: [1, 2, 3, 4, 5, 6, 7, 8, 9],
      existingBadgeKeys: [],
      /* ... other fields */
    })
    const moduleBadges = result.filter(b => b.key.startsWith('module_'))
    expect(moduleBadges).toHaveLength(9)
  })
})
```

---

## 7. Content Pipeline Tests

```typescript
// tests/content-pipeline.test.ts
describe('Content Pipeline', () => {
  it('parse-content.ts generates valid JSON for all 90 lessons', async () => {
    // Run parser, verify 90 JSON files created
    // Each has required fields: meta, theory, quiz (15 questions), flashcards
  })
  
  it('stable IDs do not change on re-parse', async () => {
    // Parse once, record IDs
    // Parse again with same source files
    // All IDs must match
  })
  
  it('validate-content.ts fails on lesson with < 15 quiz questions', () => {
    // Create a temp test lesson with 14 questions
    // Expect validator to throw
  })
  
  it('validate-content.ts fails on duplicate IDs across lessons', () => {
    // Create two test lessons with same quiz ID
    // Expect validator to throw
  })
  
  it('search index contains all 90 lesson slugs', async () => {
    const index = JSON.parse(readFileSync('public/content/search-index.json', 'utf8'))
    expect(index.lessons).toHaveLength(90)
  })
})
```

---

## 8. Manual QA Flows

### Core Learning Loop (Phase 1 — must pass before Phase 2)
1. Sign up with email + password → email verification arrives (Resend)
2. Complete onboarding quiz (5-8 questions) → land on dashboard
3. Start Lesson 1 → theory loads from JSON (not from Supabase, verify in Network tab)
4. Scroll through theory → "Continue to Quiz" unlocks after scroll threshold (not immediately)
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

### Anti-gaming Verification
1. Open Network tab → navigate to Theory section → scroll quickly to bottom without reading → attempt to click "Continue to Quiz" → should be blocked (dwell time not met)
2. Try submitting theory-read via direct API call without scroll signals → should return 400
3. Try a quiz second time → +25 first-attempt bonus should NOT fire again

### Portfolio Export (Phase 3)
1. Mark a reflection as public → visible on `/p/[username]` without login
2. Submit a capstone, mark as public → visible on portfolio page
3. Open portfolio page in incognito → renders without any auth redirect
4. Verify only `is_public = true` content appears — no private reflections leak

### Security Checks
1. Try calling `/api/lessons/[slug]/progress` with a forged `user_id` in the body → should use session user, not body
2. Try accessing another user's progress via direct Supabase query (verify RLS blocks it)
3. Verify `SUPABASE_SERVICE_ROLE_KEY` is not exposed in client-side JS bundle

---

## 9. CI Verification Checklist

The CI pipeline (`ci.yml`) must pass before any merge:
- [ ] `npm run content:parse` — no parser errors
- [ ] `npm run content:validate` — all 90 lessons valid
- [ ] `npm run content:search` — search index generated
- [ ] `npm run lint` — no ESLint errors
- [ ] TypeScript: `tsc --noEmit` — no type errors
- [ ] `npm run build` — Next.js production build succeeds

---

## 10. Definition of Done Checklist

Before any feature is marked "done":
- [ ] Feature works in the happy path
- [ ] Feature handles error states gracefully (network failure, auth failure, invalid input)
- [ ] Feature is accessible (WCAG AA — keyboard nav, screen-reader labels, contrast)
- [ ] Feature is responsive (works on mobile viewport)
- [ ] All business logic lives in `lib/`, not in components or API routes directly
- [ ] RLS policies verified if touching user-owned data
- [ ] No new secrets committed to the repo
- [ ] CI passes (lint, types, build, content validation)
- [ ] Unit tests written/updated for any new `lib/` module logic
- [ ] Design.md direction followed (no ad-hoc visual patterns introduced)
- [ ] Feature doesn't violate any of the 4 Product Principles from PRD.md §1

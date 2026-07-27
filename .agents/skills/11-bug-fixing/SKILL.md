---
name: pm-academy-bug-fixing
description: >
  PM Academy bug fixing and debugging skill. Covers systematic debugging approaches,
  common bugs in this codebase, and the fix workflow. Triggers on: bugs, errors,
  unexpected behavior, something "not working", debugging sessions, or any investigation
  into why something behaves incorrectly.
---

# PM Academy — Bug Fixing & Debugging

Load `00-pm-academy-core` alongside this skill.

---

## 1. Debugging Protocol

**Before writing any fix, understand the bug completely:**

1. **Reproduce** — confirm you can reproduce the bug consistently
2. **Isolate** — identify the smallest reproducible case
3. **Hypothesize** — form a theory about the root cause
4. **Verify** — test the hypothesis before writing the fix
5. **Fix** — minimal change that addresses the root cause (not a workaround)
6. **Test** — verify the fix and check for regressions

---

## 2. Common Bug Categories & Root Causes

### Streak timezone bugs
**Symptom:** Streak increments on wrong day, or fails to increment when it should.
**Root cause:** Day boundary calculated using server UTC instead of `users.timezone`.
```typescript
// WRONG
const isNewDay = new Date().toDateString() !== new Date(lastStudyAt).toDateString()

// CORRECT — use lib/streaks.ts which handles timezone
import { isNewStudyDay } from '@/lib/streaks'
const isNewDay = isNewStudyDay(lastStudyAt, user.timezone)
```

### XP not recording
**Symptom:** XP gained but not reflected in `users.total_xp`.
**Root cause (A):** `xp_events` row inserted but `users.total_xp` cache not updated.
**Root cause (B):** `users.total_xp` updated directly without `xp_events` row.
```typescript
// Debug: check xp_events table for the user — is the row there?
// If yes but total_xp wrong: trigger/function for cache update is broken
// If no row: XP code path isn't reaching the insert
```

### Theory-read XP not firing
**Symptom:** User reads a lesson but gets no XP for theory.
**Root cause:** Anti-gaming threshold not met (scroll < 80% or dwell < 120s), or client isn't sending signals.
**Debug:** Check the Network tab — is the client sending `POST /api/lessons/[slug]/theory-read`? With what values? What does the server return?

### Quiz bonus XP not firing / double-firing
**Symptom:** 100% first-attempt bonus doesn't award, or awards on retry.
**Root cause:** `quiz_attempts` count check wrong, or first-attempt detection logic off.
```typescript
// Check lib/xp.ts — shouldAwardQuizBonus checks quiz_attempts === 1
// Check user_lesson_progress.quiz_attempts in DB — is it correct?
```

### Content not loading (blank lesson page)
**Symptom:** Lesson page is blank or shows an error.
**Root cause (A):** JSON file not generated — run `npm run content:build`.
**Root cause (B):** Fetch URL wrong — should be `/content/lessons/lesson-NNN.json`.
**Root cause (C):** JSON file is malformed — check `public/content/lessons/` for invalid JSON.
```typescript
// Debug: open /content/lessons/lesson-001.json in browser — does it return valid JSON?
```

### Auth redirect loop
**Symptom:** User stuck in login → redirect → login loop.
**Root cause:** Session not persisting, or auth callback route returning wrong redirect.
```typescript
// Debug: check Supabase Auth logs for session creation
// Check app/api/auth/callback/route.ts — is it correctly exchanging code for session?
// Check middleware.ts (if exists) — is the auth guard working correctly?
```

### RLS blocking legitimate queries
**Symptom:** User can't see their own data; Supabase returns empty array.
**Root cause:** RLS policy too restrictive or missing.
```sql
-- Debug: test the policy in Supabase SQL editor with auth.uid() set to the user's ID
-- Run: SELECT * FROM [table] WHERE user_id = 'your-test-user-uuid';
```

### SM-2 flashcard scheduling wrong
**Symptom:** Flashcards due too soon or too late; ease factor not updating.
**Root cause:** `lib/srs.ts` logic or the API route not saving updated SRS state correctly.
```typescript
// Debug: check user_flashcard_srs table — are ease_factor, interval_days, repetitions updating?
// Unit test: run calculateNextReview with known inputs and compare to SM-2 reference
```

### Portfolio page shows private content
**Symptom:** Logged-out user sees a user's private reflections/capstones.
**Root cause (CRITICAL):** RLS policy missing, or query doesn't filter `is_public = true`.
```typescript
// IMMEDIATE FIX: add explicit .eq('is_public', true) to all portfolio queries
// Then verify RLS policy is also in place (defense in depth)
```

### Build fails on content validation
**Symptom:** `npm run build` fails with content validation error.
**Root cause:** A lesson Markdown file doesn't conform to the required schema.
```bash
# Debug: run npm run content:validate and read the error message
# It will tell you which lesson and which field is missing/invalid
# Fix the source .md file, never the generated JSON
```

---

## 3. Debugging Tools

### Browser DevTools
```
Network tab: verify API routes are being called with correct payloads
Console: check for client-side errors
Application → Local Storage: check Supabase session tokens
React DevTools: inspect component tree, props, state
```

### Next.js debugging
```bash
# Enable verbose logging
DEBUG=* npm run dev

# Type check without building
npx tsc --noEmit

# Check which bundle a component ends up in
ANALYZE=true npm run build
```

### Supabase debugging
```sql
-- Check RLS policies on a table
SELECT * FROM pg_policies WHERE tablename = 'user_lesson_progress';

-- Test a specific user's accessible rows (run as that user via API key)
SELECT * FROM user_lesson_progress WHERE user_id = 'test-uuid';

-- Check xp_events for a user
SELECT * FROM xp_events WHERE user_id = 'test-uuid' ORDER BY created_at DESC;
```

---

## 4. Fix Workflow

```bash
# 1. Reproduce locally
# 2. Create a fix branch
git checkout -b fix/streak-timezone-bug main

# 3. Write the fix — MINIMAL change
# Do NOT refactor other things while fixing a bug

# 4. Add a unit test that would have caught this bug
# (prevents regression)

# 5. Verify the fix locally
npm run dev
# Test the specific scenario that was failing

# 6. Run CI checks
npm run lint
npm run content:build
npm run build

# 7. Commit with clear message explaining what was wrong
git commit -m "fix: compute streak day boundary from user timezone not server UTC

Streak was resetting incorrectly for users in IST (+5:30) because
day boundary was computed using server UTC midnight instead of the
user's local midnight. Uses lib/streaks.ts isNewStudyDay() which
reads users.timezone. Resolves the issue where studying at 11pm IST
didn't count toward that local calendar day."

# 8. Push and create PR
git push origin fix/streak-timezone-bug
```

---

## 5. Regression Prevention

Every bug fix should come with a unit test that would have caught it:

```typescript
// tests/streaks.test.ts — add this after fixing the timezone bug
it('streak increments based on user local timezone, not server UTC', () => {
  // User is in IST (Asia/Kolkata, UTC+5:30)
  // Last study: 2024-01-15T18:30:00Z = 2024-01-16 00:00:00 IST
  // Current:    2024-01-16T01:30:00Z = 2024-01-16 07:00:00 IST (same local day)
  // Should NOT increment — same local day
  
  const result = isNewStudyDay(
    '2024-01-15T18:30:00Z',
    '2024-01-16T01:30:00Z', 
    'Asia/Kolkata'
  )
  expect(result).toBe(false)
  
  // Current: 2024-01-16T18:31:00Z = 2024-01-17 00:01:00 IST (next local day)
  // Should increment — new local day
  const result2 = isNewStudyDay(
    '2024-01-15T18:30:00Z',
    '2024-01-16T18:31:00Z',
    'Asia/Kolkata'
  )
  expect(result2).toBe(true)
})
```

---

## 6. Performance Bug Investigations

### Slow lesson page load
```
1. Run Lighthouse on the lesson page
2. Check LCP — is it the heading? An image? If image, add priority prop to next/image
3. Check if lesson content is being fetched at runtime instead of from static JSON
4. Check if any heavy libraries are being bundled into the lesson page client bundle
5. Run ANALYZE=true npm run build — check the client bundle composition
```

### Slow API routes
```
1. Add timing logs around Supabase queries
2. Check if RLS policies are causing slow query plans (run EXPLAIN ANALYZE in Supabase)
3. Check for N+1 queries (fetching lessons one by one instead of batch)
4. Add Supabase indexes on frequently-queried columns: user_id, lesson_slug, next_review_at
```

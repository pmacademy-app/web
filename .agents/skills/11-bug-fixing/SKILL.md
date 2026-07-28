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

**Before writing any fix, understand the bug completely. Fix the root cause, never use a workaround.**

1. **Reproduce** — confirm you can reproduce the bug consistently.
2. **Isolate** — identify the smallest reproducible case, bypassing components or routing.
3. **Hypothesize** — form a theory about the root cause based on data, not guesses.
4. **Verify** — test the hypothesis (using breakpoints, logs, or unit tests) before writing the fix.
5. **Fix** — write the minimal change that addresses the root cause directly. **Never apply "wrapper" workarounds** (like patching UI code because an API returns the wrong data shape).
6. **Test** — verify the fix, check for regressions, and add a regression unit test.

---

## 2. Common Bug Categories & Root Causes

### Streak timezone bugs
- **Symptom:** Streak increments on wrong day, or fails to increment when it should.
- **Root cause:** Day boundary calculated using server UTC instead of `users.timezone`.
- **Debug:** Check if timezone logic relies on client UTC conversions or ignores the user's database settings. Use `lib/streaks.ts` which handles local calendar boundaries.

### XP not caching / ledger divergence
- **Symptom:** XP gained but not reflected in `users.total_xp`.
- **Root cause:** `xp_events` row inserted but database trigger for cache update failed, or client updated user cache directly without writing the event first.
- **Debug:** Verify if `xp_events` table contains the matching log row. Check database triggers.

### Theory-read XP not firing
- **Symptom:** User reads a lesson but gets no XP.
- **Root cause:** Anti-gaming threshold not met (scroll < 80% or active dwell time < 120s), or heartbeat telemetry signals not sending from client.
- **Debug:** Check the Network tab — is the client sending `POST /api/lessons/[slug]/theory-read`? With what values? What does the server return?

### Quiz bonus XP double-firing
- **Symptom:** 100% first-attempt bonus awards multiple times.
- **Root cause:** `quiz_attempts` check in API handler evaluated after user progress attempts incremented, or first-attempt detection logic is faulty.

### Content not loading (blank pages)
- **Symptom:** Lesson page is blank or shows a 404.
- **Root cause:** JSON file not generated in `public/content/lessons/` because the content pipeline hasn't run.
- **Debug:** Run `npm run content:build`. Verify the JSON file path.

---

## 3. Row-Level Security (RLS) Debugging

### Symptom
API queries return empty arrays `[]` or blank pages instead of throwing errors, even though the user is authenticated.

### Root Cause
An RLS policy on the table is missing, incorrect, or `user_id = auth.uid()` is failing.

### How to Debug RLS Policies
Run these diagnostics in the Supabase SQL Editor:

```sql
-- 1. Check if RLS is enabled on the table
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' AND tablename = 'user_lesson_progress';

-- 2. List all RLS policies on the table
SELECT policyname, cmd, roles, qual, with_check 
FROM pg_policies 
WHERE schemaname = 'public' AND tablename = 'user_lesson_progress';

-- 3. Test policy evaluation by masquerading as a specific user
BEGIN;
  -- Set the authenticated user ID for the transaction
  SET LOCAL request.jwt.claim.sub = 'your-test-user-uuid';
  SET LOCAL role = 'authenticated';
  
  -- Run the query as that user
  SELECT * FROM user_lesson_progress WHERE lesson_slug = 'lesson-001';
ROLLBACK;
```

---

## 4. Debugging Tools

### Browser DevTools
```
Network tab: verify API routes are being called with correct payloads
Console: check for client-side errors
Application → Local Storage: check Supabase session tokens
React DevTools: inspect component tree, props, state
```

### Next.js Debugging
```bash
# Type check without building
npx tsc --noEmit

# Check client bundle composition
ANALYZE=true npm run build
```

---

## 5. Fix Workflow

```bash
# 1. Reproduce locally
# 2. Create a fix branch
git checkout -b fix/streak-timezone-bug main

# 3. Write the fix — MINIMAL change. Do NOT refactor other things while fixing a bug.
# 4. Add a unit test that would have caught this bug (prevents regression).
# 5. Verify the fix locally (npm run dev and npm test).
# 6. Run CI checks:
npm run lint
npm run content:build
npx tsc --noEmit
npm run build

# 7. Commit with clear message explaining the root cause, fix, and why
git commit -m "fix: compute streak day boundary from user timezone not server UTC"

# 8. Push and create PR
```

---

## 6. Regression Prevention

Every bug fix should come with a unit test that validates the correct behavior:

```typescript
// tests/streaks.test.ts — add after fixing the timezone bug
it('streak increments based on user local timezone, not server UTC', () => {
  // User is in IST (UTC+5:30)
  // Last study: 2024-01-15T18:30:00Z = 2024-01-16 00:00:00 IST
  // Current:    2024-01-16T01:30:00Z = 2024-01-16 07:00:00 IST (same local day)
  
  const result = isNewStudyDay(
    '2024-01-15T18:30:00Z',
    '2024-01-16T01:30:00Z', 
    'Asia/Kolkata'
  )
  expect(result).toBe(false)
})
```

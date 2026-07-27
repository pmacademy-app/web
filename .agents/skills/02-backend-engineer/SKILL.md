---
name: pm-academy-backend
description: >
  PM Academy backend engineering skill. Covers Supabase (PostgreSQL, Auth, RLS),
  API route design, data model rules, migrations, and server-side business logic.
  Triggers on: Supabase queries, RLS policies, API routes, migrations, user-state
  mutations, XP events, streaks, SRS, or any work touching lib/supabase.ts or the
  supabase/migrations/ directory.
---

# PM Academy — Backend Engineering

Load `00-pm-academy-core` alongside this skill.

---

## 1. Supabase Client Rules

```typescript
// lib/supabase.ts exports two clients — use the RIGHT one:

// createServerSupabaseClient() — SERVICE_ROLE_KEY, bypasses RLS
// Use ONLY in: app/api/ route handlers, server-only scripts
// NEVER import in: client components, shared lib functions called from browser

// createBrowserSupabaseClient() — ANON_KEY, subject to RLS
// Use in: client components that need real-time or user-specific reads
// Always assume RLS filters the results — test that it does
```

### Auth pattern in API routes (ALWAYS do this)
```typescript
import { createServerSupabaseClient } from '@/lib/supabase'

export async function POST(request: Request) {
  const supabase = createServerSupabaseClient()
  
  // Step 1: Verify the session
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  // Step 2: Use user.id from session — NEVER trust body.user_id
  const userId = user.id
  
  // Step 3: Do the mutation
  // ...
}
```

---

## 2. Database Schema Rules

### Tables and their rules

**`users`** — denormalized cache fields
- `total_xp` and `level` are caches. Source of truth is `xp_events`.
- Update `total_xp` and `level` via database trigger (preferred) or immediately after inserting `xp_events`.
- `timezone` is stored at signup. Use it in streak calculations. Never use server UTC for "end of day" logic.

**`user_lesson_progress`**
- PK is `(user_id, lesson_slug)` — no separate UUID.
- `lesson_slug` is a TEXT reference to the static JSON content slug — no FK.
- `status`: `'not_started' | 'in_progress' | 'completed'`
- `theory_read_at`: set only when server has verified scroll-depth + dwell-time.

**`quiz_attempts`**
- Records each individual question attempt.
- `question_id` is a TEXT reference to the stable ID in static JSON.
- Do NOT aggregate quiz score here — compute it from quiz_attempts or store in `user_lesson_progress.quiz_score`.

**`user_flashcard_srs`**
- PK is `(user_id, flashcard_id)`.
- `flashcard_id` is TEXT reference to stable ID in static JSON.
- SM-2 state: `ease_factor` (default 2.5), `interval_days` (default 0), `repetitions` (default 0), `next_review_at`.
- Logic lives in `lib/srs.ts` — the API route calls that function, never reimplements SM-2.

**`xp_events`** — append-only ledger
- `source_type` enum: `'theory_read' | 'quiz_correct' | 'quiz_bonus' | 'flashcard' | 'reflection' | 'capstone' | 'streak'`
- `source_id`: nullable — lesson slug or content ID that triggered it.
- Never DELETE from this table. Auditing requires the full history.

**`reflections`**
- `is_public = true` rows are readable by anyone (portfolio export).
- RLS: `user_id = auth.uid() OR is_public = true` for SELECT.

**`capstone_submissions`**
- `is_public = true` rows are readable by anyone (portfolio export).
- `module_slug` is TEXT reference to static JSON module.

**`waitlist`**
- Collected pre-launch: `name`, `email`, `career_position`.
- No foreign key to `users` — waitlist sign-up precedes auth.

---

## 3. RLS Policies

RLS must be **enabled on every user-owned table**. Policy template:

```sql
-- Standard user-owned data policy
CREATE POLICY "Users can manage their own data"
ON [table_name]
FOR ALL
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Public read for portfolio/reflection data
CREATE POLICY "Public reflections are readable by all"
ON reflections
FOR SELECT
USING (is_public = true OR user_id = auth.uid());

-- Same for capstone_submissions
CREATE POLICY "Public capstones are readable by all"
ON capstone_submissions
FOR SELECT
USING (is_public = true OR user_id = auth.uid());
```

**Tables requiring RLS:** `user_lesson_progress`, `quiz_attempts`, `user_flashcard_srs`, `xp_events`, `reflections`, `bookmarks`, `capstone_submissions`, `user_badges`, `cohort_members`.

**Tables without user-specific RLS:** `badges` (read-only reference data), `waitlist` (insert-only for public form).

---

## 4. Migration File Rules

- All schema changes go in `apps/web/supabase/migrations/` as numbered SQL files: `001_initial_schema.sql`, `002_user_state_schema.sql`, etc.
- **Never alter the DB schema manually** via Supabase dashboard UI — always write a migration file.
- Migrations must be idempotent where possible (use `IF NOT EXISTS`, `IF EXISTS`).
- No `seed.sql` — content is NEVER seeded into the DB.
- Before adding a new column/table: check `Architecture.md §2` for the full schema. Ensure it doesn't duplicate existing tables.

---

## 5. API Route Design

### Naming
```
/api/lessons/[slug]/progress       # GET, PATCH — lesson progress
/api/lessons/[slug]/theory-read    # POST — server-verify theory read, award XP
/api/lessons/[slug]/quiz           # POST — record quiz attempt, award XP
/api/flashcards/[id]/review        # POST — update SRS state
/api/streaks/update                # POST — increment/reset streak
/api/reflections                   # GET, POST
/api/reflections/[id]              # PATCH, DELETE
/api/bookmarks                     # GET, POST
/api/bookmarks/[slug]              # DELETE
/api/capstones                     # GET, POST
/api/capstones/[id]                # PATCH
/api/waitlist                      # POST (public, no auth)
```

### Theory-read verification (anti-gaming rule)
```typescript
// POST /api/lessons/[slug]/theory-read
// Body: { scroll_percentage: number, active_seconds: number }

// Server-side validation:
const MIN_SCROLL_PERCENTAGE = 80  // must scroll 80%+ of lesson
const MIN_ACTIVE_SECONDS = 120    // must spend at least 2 minutes active

if (body.scroll_percentage < MIN_SCROLL_PERCENTAGE || body.active_seconds < MIN_ACTIVE_SECONDS) {
  return Response.json({ error: 'Engagement threshold not met' }, { status: 400 })
}
// Only then award theory_read XP
```

---

## 6. XP Recording Pattern

**Always use this pattern — never deviate:**

```typescript
import { createServerSupabaseClient } from '@/lib/supabase'

async function recordXP(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  userId: string,
  sourceType: 'theory_read' | 'quiz_correct' | 'quiz_bonus' | 'flashcard' | 'reflection' | 'capstone' | 'streak',
  xpAmount: number,
  sourceId?: string
) {
  // 1. Write the event row FIRST
  const { error: eventError } = await supabase
    .from('xp_events')
    .insert({ user_id: userId, source_type: sourceType, xp_amount: xpAmount, source_id: sourceId })
  
  if (eventError) throw eventError
  
  // 2. Update the denormalized cache (via DB function/trigger is preferred)
  // If using application-layer update:
  const { error: updateError } = await supabase.rpc('recalculate_user_xp', { p_user_id: userId })
  if (updateError) throw updateError
}
```

---

## 7. Streak Logic

The correct implementation lives in `lib/streaks.ts`. Key rules:
- Day boundary is computed using `users.timezone` (stored at signup), not server UTC.
- A "study day" = at least one lesson/quiz/flashcard interaction in the user's local calendar day.
- Streak increments by 1 each consecutive day. Reset to 0 if a calendar day is missed (unless a freeze is applied).
- One streak freeze is auto-earned per week of consistent study. NOT purchasable.
- Freeze consumption: auto-apply when a day is missed and `streak_freezes_available > 0`.

```typescript
// lib/streaks.ts is the SINGLE implementation — call it, never reimplement
import { shouldIncrementStreak, shouldResetStreak, applyFreeze } from '@/lib/streaks'
```

---

## 8. SM-2 Spaced Repetition

The correct implementation lives in `lib/srs.ts`. Reference:
- Ease factor default: 2.5
- `quality` ratings: 0 (blackout), 1 (wrong), 2 (wrong+hint), 3 (correct+hard), 4 (correct), 5 (perfect)
- If quality < 3: reset repetitions to 0, interval to 1 day.
- Interval formula: `I(1) = 1`, `I(2) = 6`, `I(n) = I(n-1) × ease_factor`
- Ease factor update: `EF' = EF + (0.1 - (5-q) × (0.08 + (5-q) × 0.02))`
- Minimum ease factor: 1.3

```typescript
// lib/srs.ts is the SINGLE implementation — always call it from API routes
import { calculateNextReview } from '@/lib/srs'
const { nextInterval, newEaseFactor, newRepetitions, nextReviewAt } = calculateNextReview(current, quality)
```

---

## 9. Supabase Auth Flows

- Email + Password: standard Supabase Auth signup/signin. Email verification via Resend SMTP.
- Google Login: Supabase OAuth with Google provider.
- Password reset: Supabase magic-link reset, confirmation email via Resend SMTP.
- Session management: Supabase manages JWTs. Client uses `createBrowserSupabaseClient()` for session state.
- On new user signup: create a row in `users` table (use Supabase Auth hook or `(app)/api/auth/callback` route).

```typescript
// Redirect after OAuth (app/api/auth/callback/route.ts)
const { data: { session } } = await supabase.auth.exchangeCodeForSession(code)
// Upsert user record if not exists
```

---

## 10. Error Handling in API Routes

```typescript
// Standard error response pattern
try {
  // ...logic...
  return Response.json({ data: result })
} catch (error) {
  console.error('[api/route-name]', error)
  return Response.json(
    { error: error instanceof Error ? error.message : 'Internal server error' },
    { status: 500 }
  )
}
```

- Log errors server-side with route context.
- Never expose Supabase internals or service role key details in error responses.
- Return appropriate HTTP status codes: 400 (bad input), 401 (unauthorized), 404 (not found), 500 (server error).

---

## 11. Portfolio Export (Public Routes)

The `(portfolio)/p/[username]` route MUST be accessible without authentication.
- Query only `is_public = true` rows from `reflections` and `capstone_submissions`.
- Double-check at the query layer — RLS is the safety net but query should also explicitly filter.
- The page must render cleanly for a logged-out recruiter clicking a LinkedIn link.

```typescript
// CORRECT — explicit is_public filter even though RLS covers it
const { data } = await supabase
  .from('reflections')
  .select('*')
  .eq('user_id', userId)
  .eq('is_public', true)  // explicit filter — defense in depth
```

---

## 12. Waitlist API (Public Endpoint)

`POST /api/waitlist` — no auth required.
- Validates: name (required), email (valid format), career_position (required).
- Inserts into `waitlist` table.
- Triggers Resend confirmation email via Supabase SMTP connection.
- Rate-limit consideration: Vercel + Supabase handle basic rate limiting. Add IP-based rate limiting if abuse occurs post-launch.

---

## 13. Common Backend Pitfalls

1. Importing `createServerSupabaseClient` in a client component — will fail (no service role key in browser).
2. Trusting `user_id` from request body — always re-derive from `auth.getUser()`.
3. Skipping RLS policies on new tables.
4. Storing lesson content (quiz questions, flashcards) in the DB — they belong in static JSON.
5. Using Supabase realtime for content — it's not in the DB.
6. Adding foreign keys from user-state tables to content — content is referenced by slug text only.
7. Deleting from `xp_events` — it's an append-only audit ledger.
8. Hand-editing generated JSON in `public/content/` — run `npm run content:build` instead.

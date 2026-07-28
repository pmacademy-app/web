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
// Use ONLY in: app/api/ route handlers, server components that need auth
// NEVER import in: client components, hooks, shared utilities called from browser

// createBrowserSupabaseClient() — ANON_KEY, subject to RLS
// Use in: client components for auth state or real-time subscriptions
// Assumes RLS is configured correctly — test that it is
```

### Auth Pattern in API Routes (ALWAYS use this exact pattern)

```typescript
import { createServerSupabaseClient } from '@/lib/supabase'
import { z } from 'zod'

// Define input schema at the top of the file
const requestSchema = z.object({
  // ... your fields
})

export async function POST(request: Request) {
  const supabase = createServerSupabaseClient()
  
  // Step 1: Verify the session — ALWAYS FIRST, before touching the request body
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  // Use getUser(), NOT getSession() — getUser() re-validates the JWT server-side
  if (authError || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  // Step 2: Use user.id from session — NEVER trust body.user_id
  const userId = user.id
  
  // Step 3: Validate and parse request body with Zod
  const body = await request.json()
  const parsed = requestSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 })
  }
  
  // Step 4: Call lib/ functions — no inline business logic
  // Step 5: DB mutation
  // Step 6: Return
}
```

---

## 2. Database Schema Rules

### Table Rules

**`users`** — denormalized cache fields
- `total_xp` and `level` are caches. Source of truth is `xp_events`.
- Update `total_xp` and `level` via **database trigger** — not application-layer code.
- `timezone` is stored at signup. Use it in streak calculations. Never use server UTC for "end of day" logic.
- `goal`: `'job_search' | 'fill_gaps' | 'exploring'` — set during onboarding.

**`user_lesson_progress`**
- PK is `(user_id, lesson_slug)` — no separate UUID.
- `lesson_slug` is TEXT reference to the static JSON content slug — no FK.
- `status`: `'not_started' | 'in_progress' | 'completed'`
- `theory_read_at`: set only when server has verified scroll-depth + dwell-time.

**`quiz_attempts`**
- Records each individual question attempt (one row per question, not per session).
- `question_id` is TEXT reference to the stable ID in static JSON.
- Do NOT store quiz score here — compute it from `quiz_attempts` rows or cache in `user_lesson_progress.quiz_score`.

**`user_flashcard_srs`**
- PK is `(user_id, flashcard_id)`.
- `flashcard_id` is TEXT reference to stable ID in static JSON.
- SM-2 state: `ease_factor` (default 2.5), `interval_days` (default 0), `repetitions` (default 0), `next_review_at`.
- Logic lives in `lib/srs.ts` — the API route calls that function, never reimplements SM-2.

**`xp_events`** — append-only ledger
- `source_type` enum: `'theory_read' | 'quiz_correct' | 'quiz_bonus' | 'flashcard' | 'reflection' | 'capstone' | 'streak'`
- `source_id`: nullable — lesson slug or content ID that triggered it.
- **Never DELETE or UPDATE rows in this table.** It is an audit ledger.

**`reflections`**
- `is_public = true` rows are readable by anyone (portfolio export).
- RLS: `user_id = auth.uid() OR is_public = true` for SELECT.

**`capstone_submissions`**
- `is_public = true` rows are readable by anyone (portfolio export).
- `module_slug` is TEXT reference to static JSON module.

**`waitlist`**
- Pre-launch only: `name`, `email`, `career_position`.
- No foreign key to `users` — waitlist signup precedes auth.

---

## 3. RLS Policies

RLS must be **enabled on every user-owned table**. No exceptions. Enable RLS before writing any policy.

```sql
-- Step 1: Enable RLS first
ALTER TABLE [table_name] ENABLE ROW LEVEL SECURITY;

-- Step 2: Standard user-owned data policy
CREATE POLICY "Users can manage their own data"
ON [table_name]
FOR ALL
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- For public read (portfolio/reflection data)
CREATE POLICY "Public reflections are readable by all"
ON reflections
FOR SELECT
USING (is_public = true OR user_id = auth.uid());

CREATE POLICY "Public capstones are readable by all"
ON capstone_submissions
FOR SELECT
USING (is_public = true OR user_id = auth.uid());

-- waitlist: insert-only for unauthenticated users (public form)
ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can join waitlist"
ON waitlist
FOR INSERT
TO anon
WITH CHECK (true);
```

**Tables requiring RLS:** `user_lesson_progress`, `quiz_attempts`, `user_flashcard_srs`, `xp_events`, `reflections`, `bookmarks`, `capstone_submissions`, `user_badges`, `cohort_members`.

**Tables without user-specific RLS:** `badges` (read-only reference data), `cohorts` (readable to members).

---

## 4. Migration File Rules

- **ALL schema changes** go in timestamped SQL files.
- **Naming format:** `YYYYMMDDHHMMSS_description.sql` — e.g., `20240115120000_add_user_lesson_progress.sql`
- **Never use sequential numbering** (`001_`, `002_`) — timestamps prevent merge conflicts.
- Location: `apps/web/supabase/migrations/` (verify against actual project structure).
- **Never alter an applied migration.** If a migration has been run in any environment, create a new migration to amend it.
- Migrations must be idempotent where possible (use `IF NOT EXISTS`, `IF EXISTS`).
- No `seed.sql` — content is NEVER seeded into the DB.
- The migration file is documentation — write readable SQL with comments explaining why.

```sql
-- Example: 20240115120000_add_user_lesson_progress.sql
-- Adds progress tracking table for lesson completion state.
-- References lesson_slug as TEXT (not FK) to decouple from content rebuilds.
-- See Architecture.md §2 for the full data model context.

CREATE TABLE IF NOT EXISTS user_lesson_progress (
  user_id           uuid references users(id) ON DELETE CASCADE,
  lesson_slug       text not null,
  status            text not null default 'not_started',
  theory_read_at    timestamptz,
  quiz_score        int,
  quiz_attempts     int not null default 0,
  xp_earned         int not null default 0,
  completed_at      timestamptz,
  primary key (user_id, lesson_slug)
);

ALTER TABLE user_lesson_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own progress"
ON user_lesson_progress
FOR ALL
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());
```

---

## 5. API Route Design

### Endpoint Naming
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

### Theory-Read Verification (anti-gaming rule — PRD.md §4.6)
```typescript
// POST /api/lessons/[slug]/theory-read
// Body validated with Zod: { scroll_percentage: number, active_seconds: number }

const MIN_SCROLL_PERCENTAGE = 80   // must scroll 80%+ of lesson
const MIN_ACTIVE_SECONDS = 120     // must spend at least 2 minutes active

if (parsed.data.scroll_percentage < MIN_SCROLL_PERCENTAGE || 
    parsed.data.active_seconds < MIN_ACTIVE_SECONDS) {
  return Response.json({ error: 'Engagement threshold not met' }, { status: 400 })
}
// Only then award theory_read XP
```

---

## 6. XP Recording Pattern (append-only — never deviate)

XP is recorded by **inserting to `xp_events` first**. The `users.total_xp` cache is updated by a database trigger — NOT by application code.

```typescript
import { createServerSupabaseClient } from '@/lib/supabase'

type XPSourceType = 'theory_read' | 'quiz_correct' | 'quiz_bonus' | 'flashcard' | 'reflection' | 'capstone' | 'streak'

async function recordXP(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  userId: string,
  sourceType: XPSourceType,
  xpAmount: number,
  sourceId?: string
) {
  // 1. Write the event row FIRST — this is the source of truth
  const { error: eventError } = await supabase
    .from('xp_events')
    .insert({
      user_id: userId,
      source_type: sourceType,
      xp_amount: xpAmount,
      source_id: sourceId ?? null,
    })
  
  if (eventError) throw eventError
  
  // 2. The DB trigger handles updating users.total_xp and users.level
  // Do NOT update users.total_xp directly in application code
}
```

**If the DB trigger is not yet implemented:** create a migration to add it. Do not fall back to application-layer cache updates — they create consistency risks.

---

## 7. Streak Logic

The correct implementation lives in `lib/streaks.ts`. Key rules:
- Day boundary computed using `users.timezone` (stored at signup), not server UTC.
- A "study day" = at least one lesson/quiz/flashcard interaction in the user's local calendar day.
- Streak increments by 1 each consecutive day. Reset to 0 if a calendar day is missed (unless a freeze is applied).
- One streak freeze is auto-earned per week of consistent study. NOT purchasable.
- Freeze consumption: auto-apply when a single day is missed and `streak_freezes_available > 0`. Does NOT apply if 2+ days missed.

```typescript
// lib/streaks.ts is the SINGLE implementation — call it, never reimplement
import { shouldIncrementStreak, shouldResetStreak, applyFreeze } from '@/lib/streaks'
```

---

## 8. SM-2 Spaced Repetition

The correct implementation lives in `lib/srs.ts`:
- Ease factor default: 2.5
- `quality` ratings: 0 (blackout), 1 (wrong), 2 (wrong+hint), 3 (correct+hard), 4 (correct), 5 (perfect)
- If quality < 3: reset repetitions to 0, interval to 1 day.
- Interval formula: `I(1) = 1`, `I(2) = 6`, `I(n) = I(n-1) × ease_factor`
- Ease factor update: `EF' = EF + (0.1 - (5-q) × (0.08 + (5-q) × 0.02))`
- Minimum ease factor: 1.3

```typescript
// Always call lib/srs.ts — never reimplement SM-2 inline
import { calculateNextReview } from '@/lib/srs'
const { nextInterval, newEaseFactor, newRepetitions, nextReviewAt } = calculateNextReview(current, quality)
```

---

## 9. Supabase Auth Flows

- Email + Password: standard Supabase Auth. Email verification via Resend SMTP.
- Google Login: Supabase OAuth with Google provider.
- Password reset: Supabase built-in reset, confirmation email via Resend SMTP.
- Session management: Supabase manages JWTs via `createBrowserSupabaseClient()`.
- On new user signup: create a row in `users` table via Supabase Auth webhook or `app/api/auth/callback/route.ts`.

```typescript
// app/api/auth/callback/route.ts — OAuth callback
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  
  if (code) {
    const supabase = createServerSupabaseClient()
    const { data: { session } } = await supabase.auth.exchangeCodeForSession(code)
    
    if (session?.user) {
      // Upsert user record — ignore conflict if user already exists
      await supabase.from('users').upsert({
        id: session.user.id,
        email: session.user.email!,
        name: session.user.user_metadata?.full_name ?? null,
        auth_provider: session.user.app_metadata?.provider ?? 'email',
        timezone: 'UTC',  // updated during onboarding
      }, { onConflict: 'id', ignoreDuplicates: true })
    }
  }
  
  // Redirect to onboarding for new users, dashboard for returning users
  return Response.redirect(new URL('/onboarding', request.url))
}
```

---

## 10. Error Handling in API Routes

```typescript
try {
  // ...logic...
  return Response.json({ data: result })
} catch (error) {
  console.error('[api/route-name]', error)
  // Never expose Supabase internals or stack traces to the client
  return Response.json(
    { error: 'Internal server error' },
    { status: 500 }
  )
}
```

- Log errors server-side with route context (`[api/route-name]`).
- Never expose Supabase service role key details in error responses.
- HTTP status codes: 400 (bad input), 401 (unauthorized), 403 (forbidden), 404 (not found), 500 (server error).

---

## 11. Portfolio Export (Public Routes)

The `(portfolio)/p/[username]` route MUST be accessible without authentication.
- Query only `is_public = true` rows from `reflections` and `capstone_submissions`.
- Apply both the RLS policy AND an explicit query filter (defense in depth).

```typescript
// ✅ CORRECT — explicit is_public filter AND RLS covers it
const { data } = await supabase
  .from('reflections')
  .select('id, lesson_slug, content, created_at')
  .eq('user_id', userId)
  .eq('is_public', true)  // explicit — never rely on RLS alone for public data
```

---

## 12. Waitlist API (Public Endpoint)

`POST /api/waitlist` — no auth required.
- Validates with Zod: name (required, non-empty), email (valid format), career_position (required, non-empty).
- Inserts into `waitlist` table using service role client.
- Triggers Resend confirmation email via `lib/email.ts`.

---

## 13. Common Backend Pitfalls

1. Using `getSession()` instead of `getUser()` for authorization — `getSession()` can be spoofed.
2. Trusting `user_id` from request body — always re-derive from `auth.getUser()`.
3. Using sequential migration naming (`001_`) instead of timestamps — causes merge conflicts.
4. Skipping RLS policies on new tables — security hole.
5. Storing lesson content (quiz questions, flashcards) in the DB — they belong in static JSON.
6. Adding foreign keys from user-state tables to content — content is referenced by slug text only.
7. Deleting from `xp_events` — it's an append-only audit ledger.
8. Updating `users.total_xp` directly without an `xp_events` row first.
9. Importing `createServerSupabaseClient` in client components — will throw at runtime.
10. Modifying an applied migration — create a new migration instead.
11. Skipping Zod validation on API route input — never trust raw request body.

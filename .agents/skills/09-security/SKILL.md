---
name: pm-academy-security
description: >
  PM Academy security skill. Covers RLS policies, auth security, API authorization,
  secret management, XSS prevention, and the privacy rules for user data.
  Triggers on: any security-related work, RLS policies, API route authorization,
  public/portfolio route security, secret handling, or user data privacy questions.
---

# PM Academy — Security

Load `00-pm-academy-core` alongside this skill.

---

## 1. Security Model Overview

PM Academy's security rests on three pillars:
1. **Supabase Auth** — handles identity (never build custom auth/session/password hashing).
2. **Row-Level Security (RLS)** — database-layer access control on all user-owned tables.
3. **Server-side authorization** — API routes re-derive user identity from session, never trust request body.

---

## 2. RLS — Non-Negotiable

**Every user-owned table must have RLS enabled.** No exceptions.

```sql
-- Step 1: Enable RLS
ALTER TABLE [table_name] ENABLE ROW LEVEL SECURITY;

-- Step 2: Define Row Policies
CREATE POLICY "Users manage their own rows"
ON [table_name]
FOR ALL
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());
```

### Tables requiring RLS
| Table | Policy Type |
|-------|-------------|
| `user_lesson_progress` | user_id = auth.uid() |
| `quiz_attempts` | user_id = auth.uid() |
| `user_flashcard_srs` | user_id = auth.uid() |
| `xp_events` | user_id = auth.uid() |
| `reflections` | user_id = auth.uid() OR is_public = true (SELECT) |
| `bookmarks` | user_id = auth.uid() |
| `capstone_submissions` | user_id = auth.uid() OR is_public = true (SELECT) |
| `user_badges` | user_id = auth.uid() |
| `cohort_members` | user_id = auth.uid() |

### Portfolio/Public Content Rule
Public routes (`/p/[username]`) must ONLY expose `is_public = true` rows:
```sql
-- Reflections: public read for is_public rows
CREATE POLICY "Public reflections readable by all"
ON reflections FOR SELECT
USING (is_public = true OR user_id = auth.uid());
```

**Defense in depth:** The query layer MUST ALSO explicitly filter `is_public = true`. Do not rely solely on RLS.
```typescript
const { data } = await supabase
  .from('reflections')
  .select('id, lesson_slug, content')
  .eq('user_id', userId)
  .eq('is_public', true) // ALWAYS add explicit filter
```

---

## 3. API Route Authorization Pattern

**The golden rule: re-derive user from session in every mutation API route.**

```typescript
// ✅ CORRECT
export async function POST(request: Request) {
  const supabase = createServerSupabaseClient()
  
  // Always verify session first using getUser()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  const userId = user.id  // Use this — from session, not from body
  // ...
}

// ❌ WRONG — never trust body.user_id
export async function POST(request: Request) {
  const body = await request.json()
  const userId = body.user_id  // NEVER do this — can be forged
  // ...
}
```

---

## 4. Client vs. Server Supabase Client

```typescript
// createServerSupabaseClient() uses SERVICE_ROLE_KEY — bypasses RLS
// Only in: app/api/ route handlers, server components
// NEVER import in: components, hooks, shared utilities called from browser

// createBrowserSupabaseClient() uses ANON_KEY — subject to RLS
// In: client components for real-time subscriptions or auth state
```

### Guard in Code
```typescript
if (typeof window !== 'undefined') {
  throw new Error('createServerSupabaseClient cannot be called in browser context')
}
```

---

## 5. PostgreSQL Function Security

When creating database functions or triggers via migrations:
- **Default to `SECURITY INVOKER`:** Functions run with the privileges of the user calling them. This ensures RLS policies apply to operations within the function.
- **Avoid `SECURITY DEFINER` by default:** Functions run with the privileges of the user who created them (owner/superuser). This bypasses RLS policies and can create major privilege escalation holes.
- **`SECURITY DEFINER` Exception Rules:** Only use if a function absolutely must perform operations the user doesn't have privileges for (e.g., updating a denormalized user cache after inserting into an RLS-guarded table).
  - You MUST set the `search_path` explicitly: `SET search_path = public` to prevent search path hijacking.
  - Keep the function body extremely minimal and validate all inputs.

```sql
-- ✅ CORRECT trigger function with SECURITY DEFINER
CREATE OR REPLACE FUNCTION update_user_xp_cache()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE users
  SET total_xp = (SELECT COALESCE(SUM(xp_amount), 0) FROM xp_events WHERE user_id = NEW.user_id)
  WHERE id = NEW.user_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
```

---

## 6. HTTP Security Headers

Secure headers must be configured in `apps/web/next.config.ts` to mitigate security exploits:

- `X-Frame-Options: DENY` (prevents clickjacking)
- `X-Content-Type-Options: nosniff` (prevents MIME type sniffing)
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy` (limits browser APIs)
- `Content-Security-Policy` (limits resource loading domains)

Refer to the `05-seo-performance` skill for the complete config block code.

---

## 7. Secret Management Rules

| Variable | Type | Exposed to Browser? | Where to Set |
|----------|------|---------------------|--------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Public | ✅ Yes | .env.local + Vercel |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public | ✅ Yes | .env.local + Vercel |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret | ❌ NO | .env.local + Vercel (server only) |
| `RESEND_API_KEY` | Secret | ❌ NO | .env.local + Vercel (server only) |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | Public | ✅ Yes | .env.local + Vercel |

- **Prefix rule:** Only public config has `NEXT_PUBLIC_` prefix. Never prefix secret keys with it.
- **If a secret is accidentally committed:** rotate it IMMEDIATELY, rewrite history using `git filter-repo`, and force push.

---

## 8. XSS Prevention

- **Never use `dangerouslySetInnerHTML`** unless content is fully sanitized HTML from a controlled source (e.g., lesson JSON generated by the content pipeline).
- User-submitted content (reflections, capstone submissions): render as plain text, not HTML. Use `{content}` in JSX, never `dangerouslySetInnerHTML`.

---

## 9. Security Checklist

For any PR touching auth, database, API routes, or user data:
- [ ] API route calls `supabase.auth.getUser()` before any data access.
- [ ] `user.id` from session is used (not `body.user_id`).
- [ ] Zod validation is applied to all request payloads.
- [ ] New tables have RLS enabled + policies defined.
- [ ] Public routes only query `is_public = true` rows explicitly in SQL.
- [ ] Database functions default to `SECURITY INVOKER`. If `SECURITY DEFINER` is used, `search_path = public` is set.
- [ ] No secrets committed or hardcoded in the codebase.
- [ ] No `NEXT_PUBLIC_` prefix on secret variables.
- [ ] `createServerSupabaseClient` is not imported in client components.

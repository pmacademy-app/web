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
1. **Supabase Auth** — handles identity (never build custom auth/session/password hashing)
2. **Row-Level Security (RLS)** — database-layer access control on all user-owned tables
3. **Server-side authorization** — API routes re-derive user identity from session, never trust request body

---

## 2. RLS — Non-Negotiable

**Every user-owned table must have RLS enabled.** No exceptions.

```sql
-- Template: user-owned data
ALTER TABLE [table_name] ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own rows"
ON [table_name]
FOR ALL
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());
```

### Tables requiring RLS
| Table | Policy type |
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

### Portfolio/public content rule
Public routes (`/p/[username]`) must ONLY expose `is_public = true` rows:
```sql
-- Reflections: public read for is_public rows
CREATE POLICY "Public reflections readable by all"
ON reflections FOR SELECT
USING (is_public = true OR user_id = auth.uid());

-- Same for capstone_submissions
```

**Defense in depth:** The query layer ALSO explicitly filters `is_public = true`. Don't rely solely on RLS.

---

## 3. API Route Authorization Pattern

**The golden rule: re-derive user from session in every mutation API route.**

```typescript
// ✅ CORRECT
export async function POST(request: Request) {
  const supabase = createServerSupabaseClient()
  
  // Always verify session first
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

## 4. Client vs. Server Supabase

```typescript
// createServerSupabaseClient() uses SERVICE_ROLE_KEY — bypasses RLS
// Only in: app/api/ route handlers
// NEVER import in: components, hooks, shared utilities called from browser

// createBrowserSupabaseClient() uses ANON_KEY — subject to RLS
// In: client components for real-time subscriptions or auth state
// Assumes RLS is configured correctly — test it explicitly
```

**Guard in code:**
```typescript
// If you ever need to check: is this being called server-side?
if (typeof window !== 'undefined') {
  throw new Error('createServerSupabaseClient cannot be called in browser context')
}
```

---

## 5. Secret Management Rules

| Variable | Type | Exposed to browser? | Where to set |
|----------|------|---------------------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Public | ✅ Yes | .env.local + Vercel |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public | ✅ Yes | .env.local + Vercel |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret | ❌ NO | .env.local + Vercel (server only) |
| `RESEND_API_KEY` | Secret | ❌ NO | .env.local + Vercel (server only) |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | Public | ✅ Yes | .env.local + Vercel |

**`NEXT_PUBLIC_` prefix = exposed to browser.** Only use it for non-sensitive config. Never prefix secrets with `NEXT_PUBLIC_`.

**If a secret is accidentally committed:**
1. Rotate it immediately in Supabase/Resend dashboard (the committed key is compromised)
2. Remove from git history: `git filter-branch` or `git filter-repo`
3. Force push (after rotating the key — the code history is now safe)

---

## 6. XSS Prevention

- **Never use `dangerouslySetInnerHTML`** unless content is fully sanitized HTML from a controlled source (the pre-generated lesson JSON HTML — which was generated from your own Markdown, not user input).
- Lesson Theory HTML (from pre-generated JSON): if using `dangerouslySetInnerHTML`, ensure the parser script sanitizes the HTML output. No user-submitted HTML ever rendered via `dangerouslySetInnerHTML`.
- User-submitted content (reflections, capstone submissions): render as plain text, not HTML. Use `{content}` in JSX, never `dangerouslySetInnerHTML`.

---

## 7. Privacy Rules

- **Google Analytics:** configure to anonymize IP addresses. Do not send PII to GA (no email, name, or user ID).
- **Resend SMTP:** receives only the email address for transactional sends. No additional user data.
- **Waitlist data:** name, email, career_position stored in Supabase only. Not shared with any third party.
- **Portfolio export (`/p/[username]`):** only `is_public = true` data — user controls what's public via toggle.
- **Session data:** Supabase Auth handles JWTs — no custom session storage.

---

## 8. Content Security

Since lesson content is pre-generated JSON (not user-submitted):
- The Markdown parser in `scripts/parse-content.ts` controls what HTML reaches the browser
- The parser should escape or sanitize any HTML in source Markdown to prevent injected `<script>` tags
- All content changes go through the CI pipeline (Markdown → validate → JSON) — no direct DB insertion

---

## 9. Security Checklist

For any PR touching auth, API routes, or user data:
- [ ] API route calls `supabase.auth.getUser()` before any data access
- [ ] `user.id` from session used (not `body.user_id`)
- [ ] New tables have RLS enabled + policies defined
- [ ] Public portfolio routes only query `is_public = true`
- [ ] No secrets in code (no API keys hardcoded)
- [ ] No `NEXT_PUBLIC_` prefix on secret variables
- [ ] User-submitted content rendered as text, not HTML
- [ ] `createServerSupabaseClient` not imported in client components

---

## 10. Supabase Auth Configuration

- **Email + Password:** enabled. Email verification required (via Resend SMTP).
- **Google OAuth:** enabled. Configure with your Google Cloud OAuth credentials.
- **Magic links / OTP:** optional — Supabase Auth supports this if needed.
- **MFA:** not required for MVP (Supabase Auth defaults handle standard security).
- **JWT expiry:** use Supabase defaults (typically 1 hour access token, long refresh token).
- **Session storage:** Supabase Auth handles this — don't build custom session management.

On new user signup via OAuth callback:
```typescript
// app/api/auth/callback/route.ts
// Exchange code for session
// Upsert user row in public.users table (if not exists)
// Redirect to /dashboard (or /onboarding if new user)
```

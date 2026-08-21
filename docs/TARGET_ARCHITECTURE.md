# Prodily — Target Architecture

> **Status:** VERIFIED DESIGN (Next.js 16 + Supabase SSR)
> **Updated:** 2026-08-21
> **Based on:** VERIFIED_AUDIT.md

---

## 1. Frontend

### CURRENT
- Next.js 16.2.12 with App Router
- Route groups: `(marketing)`, `(auth)`, `(app)`, `(portfolio)`, `admin/`
- Auth state managed via `AuthStateListener` client component in root layout
- Split-brain token storage (browser `localStorage` vs custom `sb-access-token` cookie)

### TARGET
- Next.js 16.2.12 with App Router — **NO CHANGE TO ROUTE STRUCTURE**
- Route groups: unchanged
- Client auth initialized via `@supabase/ssr` `createBrowserClient()` reading standard Supabase cookies
- `<AuthStateListener />` deleted from root layout

### WHY
With `@supabase/ssr`, the browser client directly reads the shared auth cookie set by Supabase SSR. There is no need for a client-side listener to sync tokens via HTTP requests.

---

## 2. Request Interception & Proxy Layer

### CURRENT
- File: `apps/web/proxy.ts`
- Implementation: Uses raw `@supabase/supabase-js` `createClient`, manual cookie manipulation with `httpOnly: true`, and in-proxy database queries.

### TARGET
- File: `apps/web/proxy.ts` — **KEEP LOCATION AND CONVENTION**
- Export: `export async function proxy(request: NextRequest)`
- Implementation: Rewrite using `@supabase/ssr` `createServerClient`
- Logic:
  1. Synchronizes request and response cookies via `getAll()` and `setAll()`.
  2. Calls `supabase.auth.getUser()` to validate the session and refresh tokens if expired.
  3. Enforces public vs protected route access boundaries.
  4. Returns `supabaseResponse` with updated cookie headers.

### WHY
`proxy.ts` is the official Next.js 16 standard for edge request interception. Rewriting it to use `@supabase/ssr` restores automated token refreshing and standard cookie synchronization.

---

## 3. Authentication & Session Architecture

### CURRENT
```text
Signup / Login:
  Supabase Auth → tokens stored in browser localStorage
  → AuthStateListener detects event
  → POST /api/auth/session
  → custom HTTP-only cookies ('sb-access-token', 'sb-refresh-token')
  → Server Components read custom cookies manually
```

### TARGET
```text
Browser:
  createBrowserClient() reads and writes standard 'sb-<project-ref>-auth-token' cookies
      ↓
Next.js 16 proxy.ts:
  createServerClient() intercepts request, calls getUser(), refreshes token if needed,
  and writes updated cookies to response headers
      ↓
Server Components / Route Handlers:
  createServerClient() reads validated session seamlessly from cookies
      ↓
Database / RLS:
  Supabase queries execute with user context adhering to RLS policies
```

### Comparison Matrix

| Component | Current Implementation | Target Implementation |
|-----------|------------------------|-----------------------|
| Request Interceptor | `apps/web/proxy.ts` (custom supabase-js) | `apps/web/proxy.ts` (@supabase/ssr) |
| Browser Client | `createBrowserSupabaseClient()` (localStorage) | `createBrowserClient()` (cookies) |
| Server Client | `createAuthenticatedServerClient(token)` | `createServerClient()` |
| Session Bridge | `/api/auth/session/route.ts` | **DELETED** (not needed) |
| Event Listener | `AuthStateListener.tsx` | **DELETED** (not needed) |
| Cookie Name | `sb-access-token`, `sb-refresh-token` | `sb-<project-ref>-auth-token` (standard) |
| Cookie `httpOnly` | `true` (breaks client SDK sync) | `false` (standard Supabase SSR) |

---

## 4. Database & Type Safety

### CURRENT
- Manually typed schema in `lib/supabase.ts` covering only 18 of 38 tables.
- Extensive `as any` casts in notification platform, error logging, and admin services.

### TARGET
- Complete schema generated directly from Supabase via CLI:
  ```bash
  supabase gen types typescript --project-id <SUPABASE_PROJECT_ID> > types/database.ts
  ```
- All table interactions fully typed with zero `as any` casts.
- `types/database.ts` committed and kept in sync via CI validation step.

---

## 5. Email Infrastructure

### CURRENT
- Primary provider: Resend.
- Fallback: Brevo.
- Welcome emails triggered in duplicate from `auth.ts` and `send-email-hook/route.ts`.
- `SEND_EMAIL_HOOK_SECRET` optional.

### TARGET
- Welcome email deduplicated: Path A (`auth.ts` / notification dispatcher) is canonical; Path B (in `send-email-hook/route.ts`) removed.
- `SEND_EMAIL_HOOK_SECRET` strictly required in production with fail-fast validation.
- Template rendering centralized via React Email in `emails/`.

---

## 6. Testing Strategy

### CURRENT
- 36 custom `tsx` scripts with Node `assert`.
- Sequential execution in single `npm test` string.
- Tests rely on mock fallback URLs (`mock.supabase.co`).
- Zero E2E browser tests.

### TARGET
- **Unit Testing**: Vitest running pure logic tests (XP calculation, SM-2 SRS, streaks, badges, date aggregation).
- **Integration Testing**: Vitest against an isolated Supabase test instance for RLS verification and API routes.
- **E2E Testing**: Playwright testing real browser auth flows (signup, email verification, login, session refresh, logout, protected routes).

---

## 7. CI/CD & Deployment

### CURRENT
- Monorepo with duplicate `vercel.json` at root and `apps/web/`.
- CI pushes migrations directly to production on every merge to `main`.

### TARGET
- **Vercel**: Set `Root Directory = apps/web` in Vercel dashboard. Delete root `vercel.json`. Keep minimal `apps/web/vercel.json`.
- **CI Pipeline**:
  1. `validate`: Lint, typecheck, content build, Vitest unit tests.
  2. `test-integration`: Vitest integration tests against test Supabase project.
  3. `deploy-staging`: Staging migration & deployment gate.
  4. `deploy-production`: Applied to production only after staging verification succeeds.

---

## 8. Summary of Migration Strategy

| Phase | Milestone | Focus Area |
|-------|-----------|------------|
| **Phase 0** | Vercel Configuration | Set dashboard root to `apps/web`, delete root `vercel.json`. |
| **Phase 1** | Database Types | Generate `types/database.ts`, replace manual types, resolve `as any` casts. |
| **Phase 2** | Auth & Proxy Rebuild | Install `@supabase/ssr`, rewrite `proxy.ts`, implement `lib/supabase/client.ts` and `server.ts`, delete `/api/auth/session` and `AuthStateListener`. |
| **Phase 3** | Email Fixes | Remove duplicate welcome email dispatch, enforce `SEND_EMAIL_HOOK_SECRET`. |
| **Phase 4** | Test Migration | Setup Vitest, migrate pure unit tests, setup Playwright E2E suites. |
| **Phase 5** | CI Hardening | Add staging gate and automated database type check to GitHub Actions. |

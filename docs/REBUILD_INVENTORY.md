# Prodily — Rebuild Inventory

> **Status:** VERIFIED (Next.js 16 + Supabase SSR)
> **Updated:** 2026-08-21

---

## Action Classification Key
- `KEEP` — Retain file and current implementation.
- `REFACTOR` — Adjust logic without structural replacement.
- `REWRITE` — Re-implement file using modern pattern/SDK.
- `DELETE` — Remove obsolete or dead file.
- `CREATE` — New file to be added.

---

## Complete Application File Inventory

### 1. Request Interception & Proxy Layer

| File | Current State | Action | Target State / Purpose | Risk |
|------|---------------|--------|------------------------|------|
| `apps/web/proxy.ts` | Custom supabase-js & manual cookies | **REWRITE** | Next.js 16 `proxy.ts` using `@supabase/ssr` `createServerClient` | HIGH |

---

### 2. Supabase & Authentication Clients

| File | Current State | Action | Target State / Purpose | Risk |
|------|---------------|--------|------------------------|------|
| `apps/web/lib/supabase/client.ts` | Non-existent | **CREATE** | `@supabase/ssr` browser client factory | MEDIUM |
| `apps/web/lib/supabase/server.ts` | Non-existent | **CREATE** | `@supabase/ssr` server client factory (cookies getAll/setAll) | HIGH |
| `apps/web/lib/supabase.ts` | Mixed client factories & manual DB types | **REFACTOR** | Retain `createServiceRoleClient()`, export types from `types/database.ts` | MEDIUM |
| `apps/web/lib/auth.ts` | Mixed token retrieval & profile helpers | **REFACTOR** | Clean helpers using `@supabase/ssr` server client | MEDIUM |
| `apps/web/components/layout/AuthStateListener.tsx` | Client component posting to `/api/auth/session` | **DELETE** | Obsolete — `@supabase/ssr` shares cookies automatically | MEDIUM |
| `apps/web/app/api/auth/session/route.ts` | Session sync POST handler | **DELETE** | Obsolete — no manual session bridging required | HIGH |
| `apps/web/app/api/auth/callback/route.ts` | Auth callback with service-role `verifyOtp` | **REFACTOR** | Use standard server client for OTP verification | LOW |
| `apps/web/app/layout.tsx` | Renders `<AuthStateListener />` | **REFACTOR** | Remove `<AuthStateListener />` import and tag | LOW |
| `apps/web/app/(app)/layout.tsx` | Reads `sb-access-token` cookie manually | **REWRITE** | Validate user via `createServerClient().auth.getUser()` | MEDIUM |
| `apps/web/app/admin/(console)/layout.tsx` | Reads `sb-access-token` cookie manually | **REWRITE** | Validate user via `createServerClient().auth.getUser()` | MEDIUM |
| `apps/web/app/(auth)/login/page.tsx` | POSTs to `/api/auth/session` after login | **REFACTOR** | Remove manual session POST block; rely on `@supabase/ssr` | MEDIUM |
| `apps/web/app/(auth)/signup/page.tsx` | Uses legacy browser client | **REFACTOR** | Update import to `@/lib/supabase/client` | LOW |
| `apps/web/app/(auth)/reset-password/page.tsx` | Uses legacy browser client | **REFACTOR** | Update import to `@/lib/supabase/client` | LOW |

---

### 3. Database Schema & Types

| File | Current State | Action | Target State / Purpose | Risk |
|------|---------------|--------|------------------------|------|
| `apps/web/types/database.ts` | Non-existent | **CREATE** | Auto-generated Supabase database types (38 tables) | MEDIUM |
| `apps/web/lib/monitoring/logger.ts` | Uses `as any` for `system_errors` | **REFACTOR** | Fully typed logging without `as any` | LOW |

---

### 4. Email Infrastructure

| File | Current State | Action | Target State / Purpose | Risk |
|------|---------------|--------|------------------------|------|
| `apps/web/app/api/auth/send-email-hook/route.ts` | Enqueues duplicate welcome email (lines 320-341) | **REFACTOR** | Remove duplicate welcome email enqueue; require hook secret | LOW |
| `apps/web/lib/email.ts` | Raw HTML waitlist confirmation | **REFACTOR** | Standardize with React Email templates | LOW |
| `apps/web/emails/*` | React Email templates | **KEEP** | No changes needed | — |
| `apps/web/lib/notifications/*` | Notification dispatcher, queue, processor | **KEEP** | Production-grade; fully typed via generated DB types | — |

---

### 5. Testing & Quality Assurance

| File | Current State | Action | Target State / Purpose | Risk |
|------|---------------|--------|------------------------|------|
| `apps/web/vitest.config.ts` | Non-existent | **CREATE** | Vitest configuration for unit & integration testing | LOW |
| `apps/web/playwright.config.ts` | Non-existent | **CREATE** | Playwright configuration for E2E browser testing | LOW |
| `apps/web/e2e/auth/*.spec.ts` | Non-existent | **CREATE** | Playwright E2E test specs (signup, login, refresh, logout) | MEDIUM |
| `apps/web/lib/__tests__/rls-service-role.test.ts` | False-passing test skipping errors | **DELETE** | Replaced with real Vitest RLS integration tests | LOW |
| `apps/web/lib/__tests__/rls.test.ts` | Non-existent | **CREATE** | Real RLS integration test suite against test instance | MEDIUM |
| `apps/web/lib/__tests__/*.test.ts` | 16 pure logic unit tests | **REFACTOR** | Migrate assertions to Vitest standard (`describe`/`it`/`expect`) | LOW |

---

### 6. Deployment & Configuration

| File | Current State | Action | Target State / Purpose | Risk |
|------|---------------|--------|------------------------|------|
| `vercel.json` (root) | Duplicate config at repo root | **DELETE** | Remove; Vercel Dashboard sets `rootDirectory: apps/web` | LOW |
| `apps/web/vercel.json` | Redundant custom commands | **REFACTOR** | Minimal config `{ "framework": "nextjs" }` | LOW |
| `.github/workflows/ci.yml` | Runs mock tsx tests, direct prod push | **REFACTOR** | Vitest execution, staging deployment gate | MEDIUM |

---

### 7. Core Application Domain (KEEP — No Changes Needed)

| Domain | Files | Rationale |
|--------|-------|-----------|
| Content Engine | `scripts/compiler/*`, `lib/content.ts` | Highly robust and stable |
| Learning Algorithms | `lib/xp/*`, `lib/streaks/*`, `lib/srs/*`, `lib/badges/*` | Verified mathematical correctness |
| UI & Design Tokens | `components/*`, `theme/*`, `lib/brand.ts` | Consistent design system implementation |
| Admin Console Views | `app/admin/(console)/*`, `components/admin/*` | Functional operational dashboards |
| Public Pages | `app/(marketing)/*`, `app/(portfolio)/*` | Fully functional static & dynamic rendering |

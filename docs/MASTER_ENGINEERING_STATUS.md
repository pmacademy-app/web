# Prodily — Master Engineering Status

> **Audit Branch:** `audit/prodily-architecture-rebuild`
> **Base Commit:** `cb5e814`
> **Audited:** 2026-08-21
> **Status:** AUDIT COMPLETE — REBUILD PLANNED

---

## 1. Repository Architecture

### Monorepo Layout

```
prodily-monorepo/          ← root package (thin coordinator)
├── apps/web/              ← Next.js 16 App Router application
├── content/               ← Raw MDX/markdown lesson content
├── scripts/               ← Compiler, brand generator, benchmark scripts
├── supabase/              ← Migrations, config.toml, seed
├── theme/                 ← Shared design tokens
├── docs/                  ← Documentation
└── .github/workflows/     ← CI/CD (3 workflow files)
```

### Critical Observation
The root `vercel.json` exists AND `apps/web/vercel.json` ALSO exists with identical content. Vercel is configured at the root level but the working directory and build commands have been repeatedly patched (4 commits in 5 days) to fight the monorepo structure. This is a deployment architecture problem, not a config problem.

---

## 2. Frontend Architecture

- **Framework:** Next.js 16.2.12 with App Router
- **React:** 19.2.4
- **Styling:** Tailwind CSS v4 + custom CSS
- **State:** No global state manager. Auth state spread across cookies, AuthStateListener, and server layout guards.
- **Route Groups:**
  - `(marketing)` — public pages
  - `(auth)` — login, signup, reset-password, verified
  - `(app)` — protected app (layout guard: checks sb-access-token cookie)
  - `(portfolio)` — public portfolio pages
  - `admin/` — admin console (layout guard: checks cookie + isAdminUser())
  - `api/` — 25 top-level route directories

### Missing
- **No `middleware.ts`** — there is zero Next.js middleware in this project. Auth protection is done entirely in layout server components. This means there is no edge-level protection on any route.
- **No `@supabase/ssr`** — the project does not use the standard Supabase SSR package.

---

## 3. Backend Architecture

### Session Architecture (CRITICAL PROBLEM)

The current session architecture is a custom homegrown session bridge that does NOT follow Supabase or Next.js conventions:

```
Browser                         Server
  |                               |
  |-- supabase.auth.signInWithPassword()
  |    (stores session in localStorage + supabase cookie)
  |                               |
  |-- POST /api/auth/session ---->|
  |    { session: { access_token, refresh_token } }
  |                               |
  |                      Sets HTTP-only cookies:
  |                      - sb-access-token
  |                      - sb-refresh-token
  |                               |
  |-- router.push('/dashboard') ->|
  |                               |
  |                    Layout reads cookie:
  |                    cookies().get('sb-access-token')
  |                    createAuthenticatedServerClient(token)
  |                    supabase.auth.getUser()
```

The custom architecture replaces what @supabase/ssr does natively. Every token refresh, sign-out, and auth state change must manually call /api/auth/session to keep the HTTP-only cookie in sync.

### API Routes
25 top-level API route groups containing ~57 individual route files:
- `auth/` — callback, resend-verification, send-email-hook, session, update-password
- `admin/` — audit, capstones review, content, dev/generate-test-certificate, emails (automations, queue, test-send, production-send), feature-flags, feedback, contact
- `cron/` — daily-reminder, process-email-queue, retry-failed, weekly-recap
- `email/webhooks/` — Resend webhook receiver
- Plus: badges, capstones, certificates, cohorts, contact, feedback, flashcards, friends, leaderboard, notifications, reflections, review, search-index, settings, skill-radar, streaks, testimonials, v2/, waitlist, xp

---

## 4. Authentication

### Current Implementation
- **Library:** @supabase/supabase-js v2 (browser SDK only — no SSR package)
- **Session Storage (Browser):** Supabase's own localStorage + sb- prefixed cookies (set by supabase-js)
- **Session Storage (Server):** Custom HTTP-only cookies sb-access-token and sb-refresh-token set manually via /api/auth/session
- **Auth State Sync:** AuthStateListener component mounted in root layout calls /api/auth/session on every onAuthStateChange event
- **Server Auth:** createAuthenticatedServerClient(accessToken) — passes the token as Authorization: Bearer header
- **Protected Routes:** Server layout components read sb-access-token cookie directly

### Problems
- Custom session bridge introduces a race condition window between login and server-side cookie availability
- No middleware means requests to protected pages can reach server components before auth check
- Token refresh is not handled server-side (no middleware to refresh expired tokens)
- The AuthStateListener fires SIGNED_IN on EVERY page load (token refresh events), causing unnecessary /api/auth/session POSTs on every navigation
- getServerUser() and getAuthenticatedUserFromRequest() are duplicate auth utilities with different cookie-reading strategies

---

## 5. Authorization

- **Admin Authorization:** Dual-gate — ADMIN_EMAILS env var OR users.is_admin DB flag
- **User Data:** RLS-enforced at database level
- **API Routes:** Most routes use getAuthenticatedUserFromRequest() — reading Authorization: Bearer header OR sb-access-token cookie
- **Admin API Routes:** Additional isAdminUser() check
- **Protected Layout:** Server component layout guards (not middleware)

---

## 6. Database (Supabase)

### Tables Defined in Database Type (supabase.ts)
users, user_lesson_progress, quiz_attempts, user_flashcard_srs, xp_events, reflections, bookmarks, capstone_submissions, certificates, badges, user_badges, user_leaderboard_settings, weekly_leaderboard_snapshots, testimonials, user_friends, cohorts, cohort_members, waitlist

### Tables in Migrations but NOT in Database Type (type gap)
email_queue, email_dead_letter, email_delivery_events, email_suppressions, notification_preferences, notification_feature_flags, notification_templates, notification_template_versions, in_app_notifications, rate_limits, system_errors, system_settings, contact_messages, user_feedback, admin_audit_logs

### Migration Status
28 migration files. Latest: 20260819000001_phase3_onboarding_storage.sql. Applied via supabase db push in CI on push to main.

### Problems
- Database type definition in supabase.ts is manually maintained and severely out of sync with actual schema
- Many tables require `as any` casts throughout the codebase due to type gaps
- system_errors is cast as any in logger.ts — critical for observability but lacks type safety
- Views and Functions are empty in the type definition despite triggers existing in migrations
- No local Supabase testing — migrations deployed directly to production

---

## 7. Supabase

- **Version:** @supabase/supabase-js v2.110.8
- **Missing:** @supabase/ssr — the standard server-side rendering package
- **Auth Hook:** Custom send-email hook at /api/auth/send-email-hook — replaces Supabase's default auth emails with Resend-delivered branded emails
- **Migrations:** 28 files, applied via CI supabase db push
- **No local Supabase testing** — migrations are deployed directly against production via GitHub Actions

---

## 8. Email

### Current Architecture
- **Primary Provider:** Resend (REST API via lib/email.ts)
- **Fallback Provider:** Brevo (implemented in sendEmail() fallback block)
- **Auth Emails:** Intercepted via Supabase send_email hook -> /api/auth/send-email-hook -> Resend
- **Transactional Emails:** Email queue system (email_queue table) with cron processors
- **Notification System:** Full pipeline — dispatcher -> queue -> processor -> Resend
- **Webhook:** Resend webhook at /api/email/webhooks for delivery events

### Problems
- **Dual welcome email dispatch:** auth.ts ensureUserProfile() dispatches a welcome email notification, AND send-email-hook/route.ts also enqueues a welcome email on signup action type. Welcome emails are queued twice for every new registration.
- BREVO_API_KEY is documented in .env.example but Brevo is only used as a silent fallback — its presence is untested and undocumented meaningfully
- Email queue is processed by GitHub Actions cron every 5 minutes — creates up to 5-minute email delivery delays
- sendWaitlistConfirmationEmail() in email.ts uses raw HTML string templates instead of the proper email template system

---

## 9. Error Handling

- **Logger:** lib/monitoring/logger.ts -> logSystemError() -> writes to system_errors table
- **Sanitization:** Strips tokens, API keys, secrets from error messages
- **Deduplication:** 15-minute fingerprint window to avoid duplicate entries
- **Admin Alerts:** Critical errors trigger in-app notifications to all admin users
- **Frontend:** Global error.tsx and page-level error boundaries
- **Problems:**
  - system_errors is not in the Database type — accessing it requires as any cast
  - No external observability (no Sentry, no structured log aggregation)
  - Error visibility limited to admin console

---

## 10. Testing

### Framework
No standard test framework (no Jest, no Vitest). All tests are custom Node.js scripts using Node's built-in assert module, run with tsx. The test runner is a hand-rolled sequential chain in npm test.

### Test Count
36 test files.

### Key Problems
- Tests run against mock Supabase URLs (mock.supabase.co) — they do not prove real database behavior
- The RLS test uses a dummy token and gracefully skips on fetch failures against mock.supabase.co — it tests nothing real
- Many admin service tests call real Supabase functions which will execute against production if SUPABASE_SERVICE_ROLE_KEY is set in CI
- No framework-level test runner (Jest/Vitest) — no parallel test execution, no coverage, no snapshot testing
- No E2E tests (Playwright, Cypress)
- No authentication lifecycle tests

---

## 11. CI/CD

### Workflows
1. **ci.yml** — Main CI: install -> content:build -> lint -> typecheck -> tests -> brand check -> Next.js build -> Supabase migrations (main only)
2. **email-cron.yml** — Email automation: 3 crons (queue/5min, daily/9am, weekly/Monday 9am) calling production API endpoints
3. **notification-scheduler.yml** — Additional notification scheduling

### Problems
- CI runs tests against mock Supabase URLs — zero proof real database behavior works
- Supabase migrations are deployed on every push to main without a staging environment
- GitHub Actions cron is unreliable for production email delivery (GitHub does not guarantee cron timing)
- No health checks or smoke tests after deployment
- Node version in CI is 22 — no engines field in package.json
- CI secrets environment check is warnings-only — the build proceeds even if secrets are missing

---

## 12. Vercel

### Current State
- Root vercel.json: framework=nextjs, buildCommand=npm run build, installCommand=npm install
- apps/web/vercel.json: Identical content (duplicate)
- Root package.json build script delegates to apps/web
- No rootDirectory configured in vercel.json

### Problems
- The last 4 commits were all Vercel deployment fixes — the deployment configuration is fundamentally wrong
- No explicit rootDirectory — Vercel must be configured via dashboard to apps/web/ OR the config must specify it
- Duplicate vercel.json files create ambiguity
- Build command chain is unnecessarily indirect

---

## 13. Security

| Area | Status | Severity |
|------|--------|----------|
| Auth cookie theft (no middleware refresh) | OPEN | HIGH |
| Session race condition on login | MITIGATED (manual sync) | MEDIUM |
| No middleware route protection | OPEN | HIGH |
| CSRF protection on /api/auth/update-password | PRESENT (Origin check) | — |
| RLS on sensitive tables | PRESENT | — |
| Service role key never exposed client-side | CORRECT | — |
| Admin routes: dual auth guard (cookie + DB) | PRESENT | — |
| Hardcoded production URL in login/signup page | OPEN | LOW |
| Duplicate welcome email on signup | OPEN | LOW |
| SEND_EMAIL_HOOK_SECRET optional | OPEN | MEDIUM |

---

## 14. Dependencies

### Notable Issues
- `recharts` declared in both root package.json AND apps/web/package.json
- `hermes-parser`, `mdn-data`, `lightningcss`, `bail` — unusual Next.js deps; likely compiler pipeline deps that should be dev-only
- No @supabase/ssr
- next: 16.2.12 — verify this is a valid published version (official latest is 15.x)

---

## 15. Known Issues

See KNOWN_ISSUES.md

---

## 16. Code to DELETE

| File | Reason |
|------|--------|
| apps/web/vercel.json | Duplicate of root vercel.json |
| apps/web/lib/badges.ts | 32-byte re-export wrapper — unnecessary |
| apps/web/lib/streaks.ts | 34-byte re-export wrapper — unnecessary |
| apps/web/lib/xp.ts | 24-byte re-export wrapper — unnecessary |
| apps/web/lib/lessons-db.ts | 37-byte re-export wrapper — unnecessary |
| apps/web/lib/xp-service.ts | 32-byte re-export wrapper — unnecessary |
| apps/web/lib/streaks-db.ts | 37-byte re-export wrapper — unnecessary |
| apps/web/app/api/auth/session/route.ts | Replaced by @supabase/ssr middleware |
| apps/web/components/layout/AuthStateListener.tsx | Replaced by @supabase/ssr |

---

## 17. Code to REWRITE

| File | Reason |
|------|--------|
| apps/web/lib/supabase.ts | Database type is out of sync; split into server/client/types |
| apps/web/lib/auth.ts | Duplicate auth utilities; replace with @supabase/ssr pattern |
| apps/web/app/(app)/layout.tsx | Auth guard via @supabase/ssr createServerClient |
| apps/web/app/(auth)/login/page.tsx | Remove /api/auth/session POST call |
| apps/web/app/(auth)/signup/page.tsx | Remove direct session handling |
| apps/web/app/(auth)/reset-password/page.tsx | Align with SSR auth pattern |
| apps/web/lib/email.ts | Extract Brevo fallback, fix sendWaitlistConfirmationEmail |

---

## 18. Code to CREATE

| File | Purpose |
|------|---------|
| apps/web/middleware.ts | Edge-level route protection using @supabase/ssr |
| apps/web/lib/supabase/server.ts | Standard @supabase/ssr server client factory |
| apps/web/lib/supabase/client.ts | Standard @supabase/ssr browser client factory |
| supabase/types.ts | Auto-generated Database types via supabase gen types |

---

## 19. Database Changes Required

- Run `supabase gen types typescript --project-id <id>` to generate correct Database type
- Add staging environment before applying production migrations
- Review and document all RLS policies per table

---

## 20. Production Readiness Criteria

```
[ ] middleware.ts exists and protects all /app/* and /admin/* routes at edge
[ ] @supabase/ssr is used for all server-side session management
[ ] No custom /api/auth/session endpoint
[ ] No AuthStateListener component
[ ] Database types generated from Supabase (not manually maintained)
[ ] All tables have correct and documented RLS policies
[ ] No mock Supabase URL in any test that claims to test DB behavior
[ ] E2E tests cover full auth lifecycle (signup, verify, login, logout)
[ ] Vercel deployment uses rootDirectory: apps/web or equivalent
[ ] Email delivery verified end-to-end (not simulated)
[ ] No duplicate welcome email on signup
[ ] No duplicate vercel.json
[ ] CI runs against real Supabase test instance for DB-touching tests
[ ] Production email delivery does not depend on GitHub Actions cron reliability
[ ] Staging environment exists before production DB changes
[ ] next version verified as published and supported
```

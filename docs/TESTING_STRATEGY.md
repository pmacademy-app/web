# Prodily — Testing Strategy

> **Status:** AUDIT RESULT — Current tests are insufficient. This document defines what the test suite should look like.
> **Updated:** 2026-08-21

---

## Current State Assessment

### Framework
None. All tests are `tsx` scripts using Node's built-in `assert` module, run sequentially via a 500-character `&&` chain in `npm test`.

### Problems
- No parallel execution — 36 tests run serially; one failure stops all subsequent tests
- No coverage measurement
- No test isolation — shared global state between test files
- No snapshot testing
- Tests run against `mock.supabase.co` — DB behavior is untested
- No E2E tests
- No auth lifecycle tests
- One test (rls-service-role.test.ts) explicitly skips assertions on failure — it always passes

---

## Test Classification (Current Tests)

### HIGH VALUE — Keep and migrate to Vitest
These test pure business logic with no external dependencies:

| File | What it actually tests | Verdict |
|------|------------------------|---------|
| xp.test.ts | XP calculation formulas | KEEP |
| streaks.test.ts | Streak logic | KEEP |
| srs.test.ts | Spaced repetition algorithm | KEEP |
| skillRadar.test.ts | Skill radar calculations | KEEP |
| capstones.test.ts | Capstone business rules | KEEP |
| certificates.test.ts | Certificate generation logic | KEEP |
| badges.test.ts | Badge evaluation logic | KEEP |
| leaderboard.test.ts | Leaderboard ranking | KEEP |
| portfolio.test.ts | Portfolio generation | KEEP |
| recap-evaluator.test.ts | Weekly recap evaluation | KEEP |
| update-password.test.ts | Password update route validation | KEEP |
| send-email-hook.test.ts | Hook signature verification, template dispatch | KEEP (unit portions) |
| seo-phase1.test.ts | SEO static output | KEEP |
| seo-phase2.test.ts | SEO static output | KEEP |
| seo-phase3.test.ts | SEO static output | KEEP |

### WEAK — Keep but improve with real Supabase test project
These test service functions that call Supabase — currently they may pass because of mock URL skipping:

| File | Problem | Verdict |
|------|---------|---------|
| notifications.test.ts | Calls notification dispatcher — unclear if mocked | MIGRATE to integration |
| email-engine.test.ts | Verifies template rendering — mostly pure | KEEP |
| admin-console.test.ts | Calls AdminConsoleService — hits real Supabase if KEY set | MIGRATE to integration |
| dashboard.test.ts | Calls dashboard aggregation — real Supabase | MIGRATE to integration |
| users-aggregation.test.ts | Calls real admin aggregation | MIGRATE to integration |
| curriculum-aggregation.test.ts | Calls real aggregation | MIGRATE to integration |
| analytics-aggregation.test.ts | Calls real aggregation | MIGRATE to integration |
| achievements-aggregation.test.ts | Calls real aggregation | MIGRATE to integration |

### MISLEADING — Delete or rewrite
Tests that give false confidence:

| File | Problem | Verdict |
|------|---------|---------|
| rls-service-role.test.ts | Uses dummy token + mock URL; skips assertions on fetch failure; always passes | DELETE and RECREATE |
| audit-fixes.test.ts | Calls real Supabase with no explicit isolation | REWRITE |
| contact.test.ts | Unclear isolation | REVIEW |
| remediation.test.ts | Unclear isolation | REVIEW |
| system-monitoring.test.ts | Calls logSystemError() which hits real Supabase | REWRITE |
| in-app-notifications.test.ts | Creates real in-app notifications? | REVIEW |
| quick-start.test.ts | Unclear scope | REVIEW |

### MISSING — Create these
Critical paths with no test coverage:

| What | Type |
|------|------|
| Auth lifecycle: signup → verify → login → logout | E2E |
| Auth lifecycle: password reset flow | E2E |
| Auth lifecycle: expired token refresh via middleware | Integration |
| Protected route blocks unauthenticated access | E2E |
| Admin route blocks non-admin users | E2E |
| RLS: user cannot read another user's data | Integration (real Supabase) |
| RLS: service role bypasses RLS | Integration (real Supabase) |
| Email: single welcome email per signup | Integration |
| Middleware: token refresh updates cookies | Integration |
| CSRF: Origin validation on /api/auth/update-password | Unit (already partially covered) |

---

## Target Test Pyramid

```
                      E2E (Playwright)
                   ╱──────────────────╲
                  ╱  Auth lifecycle    ╲
                 ╱  Protected routes   ╲
                ╱  Admin access        ╲
               ╱───────────────────────╲
              
         Integration (Vitest + real Supabase test project)
        ╱────────────────────────────────────────────────╲
       ╱  RLS policy enforcement                         ╲
      ╱  API routes with real DB operations              ╲
     ╱  Email delivery (Resend sandbox)                 ╲
    ╱  Middleware behavior                              ╲
   ╱─────────────────────────────────────────────────────╲
    
            Unit (Vitest, no network calls)
           ╱──────────────────────────────╲
          ╱  XP, streaks, SRS, radar       ╲
         ╱  Badges, certificates, capstones ╲
        ╱  Email template rendering         ╲
       ╱  Schema validation                 ╲
      ╱  Rate limiting logic                ╲
     ╱  Hook signature verification         ╲
    ╱  Brand/SEO static output              ╲
   ╱─────────────────────────────────────────╲
```

---

## Recommended Stack

| Layer | Tool |
|-------|------|
| Unit + Integration | Vitest |
| E2E | Playwright |
| Test DB | Supabase test project (separate from production) |
| Email test | Resend sandbox mode or Mailpit |
| Coverage | Vitest coverage (v8) |

---

## Tests to DELETE

| File | Reason |
|------|--------|
| lib/__tests__/rls-service-role.test.ts | Always passes; tests nothing real |

---

## Tests to REWRITE (after framework migration)

All 36 current test files should be migrated to Vitest format.
The scripts-based tests should become proper `describe`/`it` blocks with proper setup/teardown.

---

## Tests to CREATE

### E2E (Playwright)
- `e2e/auth/signup.spec.ts` — complete signup flow with real email verification
- `e2e/auth/login.spec.ts` — login, session persistence, logout
- `e2e/auth/password-reset.spec.ts` — forgot password → email → update password
- `e2e/auth/protected-route.spec.ts` — unauthenticated access redirects to login
- `e2e/admin/admin-access.spec.ts` — admin routes block non-admin users

### Integration (Vitest + Supabase test project)
- `lib/__tests__/rls.test.ts` — real RLS policy tests per table (replaces current misleading test)
- `lib/__tests__/middleware.test.ts` — token refresh behavior
- `lib/__tests__/email-welcome.test.ts` — exactly one welcome email per signup
- `app/api/__tests__/auth-callback.test.ts` — real callback URL exchange

### Unit (Vitest)
- `lib/__tests__/supabase-clients.test.ts` — client factory configuration
- `lib/__tests__/middleware-routing.test.ts` — routing logic without network calls

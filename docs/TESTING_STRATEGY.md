# Prodily — Testing Strategy

> **Status:** VERIFIED DESIGN
> **Updated:** 2026-08-21 (Second-pass audit)
> **Replaces:** Previous testing strategy based on unverified claims

---

## Current State (Verified)

### What Actually Exists
- 36 custom `tsx` scripts using Node's built-in `assert` module
- Sequential runner via `&&` chain in `npm test`
- No framework: no Jest, no Vitest, no Playwright
- No parallelism, no coverage, no test isolation
- Tests run against `mock.supabase.co` as fallback
- CI: runs tests with real Supabase secrets in env — unclear if secrets are actually set
- One test (`rls-service-role.test.ts`) explicitly skips assertions on network failure — always passes

### Test Quality Assessment (Verified from Code)

**HIGH VALUE — Pure logic, no network, trustworthy:**
- `xp.test.ts` — XP calculation formulas
- `streaks.test.ts` — Streak logic and freeze mechanics
- `srs.test.ts` — SM-2 spaced repetition algorithm
- `skillRadar.test.ts` — Skill radar chart calculations
- `capstones.test.ts` — Capstone business rules
- `certificates.test.ts` — Certificate generation logic
- `badges.test.ts` — Badge evaluation and award logic
- `leaderboard.test.ts` — Leaderboard ranking
- `portfolio.test.ts` — Portfolio generation
- `recap-evaluator.test.ts` — Weekly recap logic
- `dashboard.test.ts` — Date/aggregation logic ONLY (no Supabase — verified)
- `notifications.test.ts` — Pure notification logic (no Supabase — verified)
- `email-engine.test.ts` — React Email template rendering (no Supabase)
- `send-email-hook.test.ts` — HMAC signature verification, template dispatch logic
- `update-password.test.ts` — Password validation logic
- `seo-phase1/2/3.test.ts` — Static SEO output validation

**WEAK — Hit real Supabase when secrets available:**
- `admin-console.test.ts` — AdminConsoleService hits Supabase
- `users-aggregation.test.ts` — hits Supabase
- `curriculum-aggregation.test.ts` — hits Supabase
- `analytics-aggregation.test.ts` — hits Supabase
- `audit-fixes.test.ts` — hits Supabase
- `in-app-notifications.test.ts` — hits Supabase
- `system-monitoring.test.ts` — logSystemError hits Supabase
- `contact.test.ts` — unclear, likely hits Supabase
- `remediation.test.ts` — unclear

**FALSE CONFIDENCE — Must be deleted or rewritten:**
- `rls-service-role.test.ts` — always passes, tests nothing

---

## Target Test Architecture

```
                    E2E (Playwright)
               ╔══════════════════════╗
               ║ Auth lifecycle       ║  ~5 specs
               ║ Protected routes     ║
               ║ Admin access         ║
               ╚══════════════════════╝
                         │
          Integration (Vitest + Supabase test project)
          ╔══════════════════════════════════════════╗
          ║ RLS policy enforcement per table        ║  ~10 tests
          ║ API routes with real DB                 ║
          ║ Email queue idempotency                 ║
          ║ Middleware token refresh behavior       ║
          ╚══════════════════════════════════════════╝
                         │
              Unit (Vitest, no network)
              ╔══════════════════════════╗
              ║ XP, streaks, SRS        ║  ~100+ tests
              ║ Badges, certificates    ║  (from existing 16 files)
              ║ Email templates         ║
              ║ Schema validation       ║
              ║ Rate limiting           ║
              ║ Hook verification       ║
              ║ SEO static output       ║
              ╚══════════════════════════╝
```

---

## Tool Choices

### Unit + Integration: Vitest

**Why Vitest:**
- Native ESM — compatible with Next.js 16 module system without transpilation
- First-class TypeScript support without additional config
- Same API as Jest — migration effort is minimal (change imports, add vitest.config.ts)
- `vi.mock()` is simpler than Jest's module mocking for Next.js modules
- Watch mode, UI mode, coverage (v8/istanbul) built-in
- Runs existing `assert`-based tests with minimal changes

**Configuration:**
```typescript
// apps/web/vitest.config.ts
import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 70,
      },
      include: ['lib/**', 'app/api/**'],
      exclude: ['lib/__tests__/**', '**/*.d.ts'],
    },
  },
})
```

### E2E: Playwright

**Why Playwright:**
- Supports Next.js App Router natively (handles SSR, server actions)
- Cookie handling for HTTP-only cookies (needed for auth flow testing)
- Multi-browser support (Chromium, Firefox, WebKit)
- Built-in network interception
- Better suited than Cypress for server-rendered auth flows

**Configuration:**
```typescript
// apps/web/playwright.config.ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
})
```

### Database Tests: Supabase Test Project

**Requirements:**
- Separate Supabase project (not production)
- Same migrations as production (applied via CI)
- Test-specific seed data
- Secrets stored in GitHub Actions as `SUPABASE_TEST_*` secrets

**Why a real Supabase test project:**
- RLS policies can only be meaningfully tested against a real Postgres instance
- Mock clients cannot simulate RLS enforcement
- Auth token validation requires real Supabase auth service

---

## npm Scripts (Target)

```json
{
  "scripts": {
    "test": "npm run test:unit",
    "test:unit": "vitest run",
    "test:unit:watch": "vitest",
    "test:unit:coverage": "vitest run --coverage",
    "test:integration": "vitest run --config vitest.integration.config.ts",
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "test:all": "npm run test:unit && npm run test:integration && npm run test:e2e"
  }
}
```

---

## Migration Plan

### Step 1: Install Vitest (Phase 4 start)
```bash
npm install -D vitest @vitest/coverage-v8 vite-tsconfig-paths
```

### Step 2: Create vitest.config.ts
See configuration above.

### Step 3: Create vitest.setup.ts
```typescript
// apps/web/vitest.setup.ts
import { beforeAll } from 'vitest'

beforeAll(() => {
  // Set mock env vars for tests that check env presence
  process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mock.supabase.co'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'mock-anon-key'
})
```

### Step 4: Migrate Unit Tests
Convert each pure logic test file from:
```typescript
// OLD: custom runner
function runTest(name, fn) { ... }
runTest('name', () => { assert.strictEqual(...) })
```
to:
```typescript
// NEW: Vitest
import { describe, it, expect } from 'vitest'
describe('Feature', () => {
  it('name', () => { expect(...).toBe(...) })
})
```

The `assert` module tests can be kept as-is initially — Vitest runs Node assert tests. But migrating to `expect` provides better error messages.

### Step 5: Delete rls-service-role.test.ts
Replace with real RLS tests once Supabase test project is set up.

### Step 6: Create Integration Tests
```typescript
// apps/web/lib/__tests__/rls.test.ts
import { describe, it, expect, beforeAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'

describe('RLS: user_lesson_progress', () => {
  it('user can only read own progress', async () => {
    // Use real test user token from Supabase test project
    const client = createClient(TEST_URL, TEST_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${TEST_USER_A_TOKEN}` } }
    })
    // Insert progress for User B, try to read as User A
    const { data } = await client.from('user_lesson_progress')
      .select().eq('user_id', TEST_USER_B_ID)
    expect(data).toHaveLength(0) // RLS should filter this out
  })
})
```

### Step 7: Install Playwright and Create E2E Tests
```bash
npm install -D @playwright/test
npx playwright install chromium
```

---

## E2E Test Coverage (Target)

### `e2e/auth/signup.spec.ts`
```
1. Navigate to /signup
2. Fill form (email + password)
3. Submit → verify "check inbox" message shown
4. [Simulated via Supabase test]: verify OTP
5. Verify redirect to /verified
6. Verify sb-access-token cookie set
7. Navigate to /dashboard → renders without redirect
```

### `e2e/auth/login.spec.ts`
```
1. Navigate to /login
2. Fill form with test credentials
3. Submit → verify redirect to /dashboard
4. Navigate to /settings → renders without redirect
5. Click logout → verify redirect to /login
6. Navigate to /dashboard → redirects to /login
```

### `e2e/auth/protected-route.spec.ts`
```
1. Without session cookies: navigate to /dashboard → redirects to /login
2. Without session cookies: navigate to /academy → redirects to /login
3. Without session cookies: navigate to /admin → redirects to /admin/login
4. With non-admin token: navigate to /admin → redirects to access-denied
```

### `e2e/auth/token-refresh.spec.ts`
```
1. Login → set session
2. Manually expire sb-access-token cookie (set maxAge to -1)
3. Navigate to protected page
4. Verify: middleware refreshes token via sb-refresh-token
5. Verify: page renders (no redirect to login)
6. Verify: new sb-access-token cookie set
```

### `e2e/auth/password-reset.spec.ts`
```
1. Navigate to /reset-password
2. Submit test email
3. [Simulated]: receive reset token
4. Navigate to /reset-password?mode=update with recovery session
5. Submit new password
6. Verify redirect to /login
7. Login with new password → verify success
```

---

## Coverage Targets

| Layer | Target | Rationale |
|-------|--------|-----------|
| Core business logic (XP, SRS, streaks, badges) | 90%+ | Critical, pure, should be near 100% |
| Email template rendering | 80%+ | Important but template changes are frequent |
| API route handlers | 70%+ | Integration tested; unit coverage supplementary |
| Auth flow utilities | 80%+ | Critical path |
| Admin aggregations | 60%+ | Complex, relies on integration tests |
| UI components | Not targeted | E2E covers critical UI paths |

---

## What We Will NOT Do

- **No snapshot tests for UI components.** Snapshots break on every styling change and create false noise.
- **No mock-based Supabase testing.** Mocks cannot test RLS. Use the real test instance.
- **No 100% coverage mandate.** Coverage is a signal, not a goal. Focus on the correct paths.
- **No Cypress.** Playwright handles Next.js App Router server rendering correctly; Cypress has known issues with SSR.

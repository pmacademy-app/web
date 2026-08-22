# Automated Testing & Verification Framework — Prodily PM Academy

**Repository:** `pmacademy-app/web`
**Last Updated:** August 23, 2026

---

## 1. Overview & Test Framework

The repository uses **Vitest** as the unit and integration test runner, and **Playwright** for E2E browser tests. All test files live under `apps/web/lib/__tests__/` (unit/integration) and `apps/web/e2e/` (E2E).

| Layer | Framework | Runner Command | Config File |
|---|---|---|---|
| **Unit & Integration** | Vitest | `vitest run` | `apps/web/vitest.config.mts` |
| **E2E Browser** | Playwright | `playwright test` | `apps/web/playwright.config.ts` |

The top-level `npm test` in `apps/web` runs `vitest run`.

---

## 2. Test Suite Inventory (44 Files)

### High-Value Pure Logic Tests (no network)
| Test File | Purpose | Status |
|---|---|---|
| `xp.test.ts` | XP calculation formulas | 🟢 Passing |
| `streaks.test.ts` | Streak logic and freeze mechanics | 🟢 Passing |
| `srs.test.ts` | SM-2 spaced repetition algorithm | 🟢 Passing |
| `skillRadar.test.ts` | Skill radar chart calculations | 🟢 Passing |
| `capstones.test.ts` | Capstone business rules | 🟢 Passing |
| `certificates.test.ts` | Certificate generation logic | 🟢 Passing |
| `badges.test.ts` | Badge evaluation and award logic | 🟢 Passing |
| `leaderboard.test.ts` | Leaderboard ranking | 🟢 Passing |
| `portfolio.test.ts` | Portfolio generation | 🟢 Passing |
| `recap-evaluator.test.ts` | Weekly recap logic | 🟢 Passing |
| `dashboard.test.ts` | Date/aggregation logic (no Supabase) | 🟢 Passing |
| `notifications.test.ts` | Pure notification logic (no Supabase) | 🟢 Passing |
| `email-engine.test.ts` | React Email template rendering | 🟢 Passing |
| `send-email-hook.test.ts` | HMAC signatures, template dispatch | 🟢 Passing |
| `update-password.test.ts` | Password validation logic | 🟢 Passing |
| `seo-phase1.test.ts` | Static SEO output validation | 🟢 Passing |
| `seo-phase2.test.ts` | Structured data validation | 🟢 Passing |
| `seo-phase3.test.ts` | Information architecture validation | 🟢 Passing |
| `quick-start.test.ts` | Quick Start tour logic | 🟢 Passing |
| `curriculum-integrity.test.ts` | Curriculum structural integrity | 🟢 Passing |
| `unsubscribe.test.ts` | Unsubscribe logic | 🟢 Passing |

### Integration Tests (may touch Supabase)
| Test File | Purpose |
|---|---|
| `audit-fixes.test.ts` | Rate limit, unverified user discovery, template rendering |
| `system-monitoring.test.ts` | Secret sanitization, 15m dedup, webhook 401s |
| `admin-console.test.ts` | Feature flags, RBAC, user overview |
| `email-automations.test.ts` | Queue processor, daily limits, dead-letter retry |
| `rls.test.ts` | Row Level Security policy enforcement |
| `middleware-auth.test.ts` | Auth middleware behavior |
| `in-app-notifications.test.ts` | In-app notification delivery |
| `admin-email-test-send.test.ts` | Admin test email logic |
| `admin-settings.test.ts` | Admin settings persistence |
| `analytics-aggregation.test.ts` | Analytics data aggregation |
| `curriculum-aggregation.test.ts` | Curriculum metrics |
| `users-aggregation.test.ts` | User aggregation queries |
| `achievements-aggregation.test.ts` | Achievement metrics |
| `contact.test.ts` | Contact form handling |
| `remediation.test.ts` | Production remediation fixes |
| `settings.test.ts` | Settings service |
| `curriculum-access-override.test.ts` | Access override logic |
| `dev-certificate.test.ts` | Dev certificate generation |
| `phase1-learning-notifications.test.ts` | Learning notification platform Phase 1 |
| `phase2-announcements-performance.test.ts` | Announcements + performance Phase 2 |
| `phase3-final-integrity.test.ts` | Phase 3 integrity checks |
| `final-learner-notification-integrity.test.ts` | Learner notification integrity |

---

## 3. E2E Test Suite (`apps/web/e2e/auth/`)

Three Playwright E2E test specs cover the core authentication lifecycle:

| Spec File | Coverage |
|---|---|
| `login.spec.ts` | Login, session persistence, navigation, logout |
| `password-reset.spec.ts` | Password reset request and update flow |
| `protected-routes.spec.ts` | Unauthenticated redirect, admin access gates |

---

## 4. Standard Verification Commands

```bash
# From apps/web/

# Run all unit + integration tests
npm test                    # alias: vitest run

# Run E2E browser tests
npx playwright test

# Run Next.js production build (also type-checks)
npm run build

# Run ESLint
npm run lint
```

---

## 5. CI/CD Integration (`.github/workflows/ci.yml`)

GitHub Actions runs on every pull request and push to `main`:
- Content compiler verification (`npm run content:compile`)
- Unit test suite execution (`vitest run`)
- ESLint linting
- TypeScript type checking
- Next.js production build

---

## 6. Known Testing Gaps

- **No Vitest integration config** for tests that require a dedicated Supabase test project. Integration tests that hit Supabase run against production credentials when secrets are available in CI, which is a risk.
- **E2E specs exist** but require a running local dev server and valid test credentials — not yet wired into CI.
- **No coverage thresholds** enforced in CI currently (coverage config is in `vitest.config.mts` but not required to pass).

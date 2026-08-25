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

## 2. Test Suite Inventory (54 Unit/Integration Files, 439 Tests)

### High-Value Domain & Pure Logic Tests
| Test File | Domain / Purpose | Status |
|---|---|---|
| `xp.test.ts` | XP calculation formulas & ledger rewards | 🟢 Passing |
| `streaks.test.ts` | Streak logic and freeze mechanics | 🟢 Passing |
| `srs.test.ts` | SM-2 spaced repetition algorithm | 🟢 Passing |
| `skillRadar.test.ts` | Skill radar chart calculations | 🟢 Passing |
| `capstones.test.ts` | Capstone business rules & validation | 🟢 Passing |
| `capstone-integrity.test.ts` | State transitions & duplicate submit guard | 🟢 Passing |
| `certificates.test.ts` | Certificate generation logic | 🟢 Passing |
| `badges.test.ts` | Badge evaluation and award logic | 🟢 Passing |
| `leaderboard.test.ts` | Leaderboard ranking calculations | 🟢 Passing |
| `portfolio.test.ts` | Portfolio generation & public visibility | 🟢 Passing |
| `recap-evaluator.test.ts` | Weekly recap evaluation logic | 🟢 Passing |
| `dashboard.test.ts` | Date/aggregation logic | 🟢 Passing |
| `notifications.test.ts` | Notification dispatch & event handlers | 🟢 Passing |
| `notification-queue-integrity.test.ts` | Queue claiming & worker processing | 🟢 Passing |
| `email-engine.test.ts` | React Email template rendering | 🟢 Passing |
| `send-email-hook.test.ts` | HMAC signatures & template dispatch | 🟢 Passing |
| `email-hook-reliability.test.ts` | Bounded timeouts, status codes & Brevo fallback | 🟢 Passing |
| `update-password.test.ts` | Password validation logic | 🟢 Passing |
| `auth-errors.test.ts` | Error classification & message mapping | 🟢 Passing |
| `auth-ui-integration.test.ts` | Auth form state & validation | 🟢 Passing |
| `auth-telemetry-observability.test.ts` | Telemetry rate limit & PII protection | 🟢 Passing |
| `avatar-reliability.test.ts` | Transactional avatar upload & storage cleanup | 🟢 Passing |
| `seo-canonicals.test.ts` | Self-referencing canonical URLs | 🟢 Passing |
| `seo-structured-data.test.ts` | Schema.org LearningResource & Course JSON-LD | 🟢 Passing |
| `seo-social-metadata.test.ts` | OpenGraph and Twitter card metadata | 🟢 Passing |
| `quick-start.test.ts` | Quick Start tour logic | 🟢 Passing |
| `curriculum-integrity.test.ts` | 90-lesson ID structure & module alignment | 🟢 Passing |
| `unsubscribe.test.ts` | Unsubscribe token & preference handling | 🟢 Passing |
| `performance-optimization.test.ts` | Curriculum caching & query index tests | 🟢 Passing |

### Admin & Integration Tests
| Test File | Domain / Purpose | Status |
|---|---|---|
| `audit-fixes.test.ts` | Rate limit & unverified user discovery | 🟢 Passing |
| `system-monitoring.test.ts` | Secret sanitization, 15m dedup, webhook 401s | 🟢 Passing |
| `system-announcements.test.ts` | System announcements & KPI aggregations | 🟢 Passing |
| `admin-console.test.ts` | Feature flags, RBAC, user overview | 🟢 Passing |
| `admin-settings.test.ts` | Admin settings persistence & email quotas | 🟢 Passing |
| `admin-production-email.test.ts` | Direct production email dispatch & template validation | 🟢 Passing |
| `admin-security-audit.test.ts` | RBAC route authorization & guard enforcement | 🟢 Passing |
| `admin-cache-verification.test.ts` | Cache revalidation & verified email mapping | 🟢 Passing |
| `feedback-moderation.test.ts` | Learner feedback submission & moderation | 🟢 Passing |
| `testimonial-moderation-integrity.test.ts` | Testimonial publishing & author attribution | 🟢 Passing |
| `email-automations.test.ts` | Queue processor, daily limits, dead-letter retry | 🟢 Passing |
| `rls.test.ts` | Row Level Security policy enforcement | 🟢 Passing |
| `middleware-auth.test.ts` | Auth middleware route protection | 🟢 Passing |
| `in-app-notifications.test.ts` | In-app notification delivery | 🟢 Passing |
| `admin-email-test-send.test.ts` | Admin test email dispatch | 🟢 Passing |
| `analytics-aggregation.test.ts` | Analytics data aggregation & charts | 🟢 Passing |
| `curriculum-aggregation.test.ts` | Curriculum overview & module metrics | 🟢 Passing |
| `users-aggregation.test.ts` | User overview SQL range pagination & search | 🟢 Passing |
| `achievements-aggregation.test.ts` | Achievement & badge metrics | 🟢 Passing |
| `contact.test.ts` | Contact form submission & rate limiting | 🟢 Passing |
| `remediation.test.ts` | Production remediation fixes | 🟢 Passing |
| `settings.test.ts` | User profile and account settings | 🟢 Passing |
| `curriculum-access-override.test.ts` | Admin access override logic | 🟢 Passing |
| `dev-certificate.test.ts` | Development certificate preview | 🟢 Passing |
| `learning-settings-runtime.test.ts` | Dynamic runtime XP & settings resolution | 🟢 Passing |

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

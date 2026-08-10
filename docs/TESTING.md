# Automated Testing & Verification Framework — Prodily PM Academy

**Repository:** `pmacademy-app/web`  
**Current Baseline HEAD:** `490fea37ea08813aa582fc5ebbc3896ee4eb070c`  
**Last Updated:** August 10, 2026  

---

## 1. Overview & Test Suite Architecture

The repository contains specialized unit and integration test suites in `apps/web/lib/__tests__/`, executed via `npx tsx`.

| Test Script | Command | Purpose / Target Subsystems | Status |
|---|---|---|---|
| **Production Remediation Suite** | `npm run test:audit-fixes` | 60s rate limit, unverified user discovery, admin email enqueueing, template rendering | 🟢 100% Pass |
| **System Error Monitoring Suite** | `npm run test:monitoring` | Secret sanitization, 15m fingerprint dedup, webhook 401s, cron auth checks | 🟢 100% Pass |
| **Admin Console Suite** | `npm run test:admin` | Feature flags, RBAC auth, content overview, user overview mapping | 🟢 100% Pass |
| **Supabase Send Email Hook Suite**| `npm run test:send-email-hook` | HMAC-SHA256 signatures, `whsec_` decoding, callback URL assembly, action mapping | 🟢 100% Pass |
| **Email Automations Suite** | `npm run test:automations` | Queue processor, daily limit checks, dead-letter retry logic | 🟢 100% Pass |
| **Content Validation Suite** | `npm run content:validate` | Markdown syntax, quiz answer counts, lesson ID uniqueness, cross-links | 🟢 100% Pass |

---

## 2. Standard Verification Command

To verify code changes before committing:

```bash
# 1. Execute all test suites
npm run test:audit-fixes
npm run test:monitoring
npm run test:admin
npm run test:send-email-hook
npm run test:automations
npm run content:validate

# 2. Run targeted ESLint check
npx eslint app/api/admin/emails/production-send/route.ts lib/__tests__/audit-fixes.test.ts

# 3. Execute Next.js production build & type check
npm run build
```

---

## 3. CI/CD Integration (`.github/workflows/ci.yml`)

GitHub Actions automatically executes on every pull request and push to `main`:
- Content compiler verification.
- Unit test suite execution.
- ESLint linting.
- Next.js production build and TypeScript compilation.

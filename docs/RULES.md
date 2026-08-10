# Engineering Rules & Guidelines — Prodily PM Academy

**Repository:** `pmacademy-app/web`  
**Current Baseline HEAD:** `490fea37ea08813aa582fc5ebbc3896ee4eb070c`  
**Last Updated:** August 10, 2026  

---

## 1. Documentation Authority Rule (CRITICAL)

> **Rule: Documentation Must Never Override Implementation Reality**
> 
> 1. Source code, database migrations, verified production behavior, and actual external integration behavior take absolute precedence over documentation.
> 2. Documentation must be updated immediately whenever implementation decisions or codebase contracts change.
> 3. Documentation must NEVER claim functionality exists merely because a UI component, API route, database table, test, or service stub exists.
> 4. When documentation and implementation disagree, the current implementation must be investigated and the documentation corrected to reflect reality.

---

## 2. Non-Negotiable Engineering Constraints

1. **No Duplicate Infrastructure**: Do not create parallel or secondary infrastructure when existing infrastructure can be extended (e.g., use existing Supabase Auth Hook for all authentication emails).
2. **Never Expose Secrets**: `SUPABASE_SERVICE_ROLE_KEY`, `SEND_EMAIL_HOOK_SECRET`, `CRON_SECRET`, and `RESEND_API_KEY` are strictly server-side. Never import service-role keys into client code or expose them in Git.
3. **No Unhandled Silent Errors**: Every failure path must log a sanitized, deduplicated system error via `logSystemError()` and return appropriate HTTP status codes.
4. **Auditable Email Operations**: Admin production sends must be enqueued, processed through `email_queue`, and logged in `admin_audit_logs` and `notification_delivery_events`.
5. **Separate Test vs Production Sends**: Admin "Send Test Email" (direct verification to admin inbox) must remain completely separate from Admin "Send Production Email" (queued delivery to learner account).
6. **No Fake External Telemetry**: External monitoring (Resend, Supabase, Vercel) must never be falsely presented as active telemetry when only environment-variable configuration checks exist.
7. **Database-Backed Persistence**: State that requires survival across serverless restarts (rate limits, email queues, system errors, user progress) MUST use PostgreSQL database tables (`public.rate_limits`, `public.email_queue`, `public.system_errors`).

---

## 3. Verification Standards Before Commits

Before declaring any work complete or committing to `main`:

```bash
# 1. Run targeted unit test suite
npm run test:audit-fixes
npm run test:monitoring
npm run test:admin
npm run test:send-email-hook
npm run test:automations

# 2. Run targeted ESLint check on changed files
npx eslint app/api/admin/emails/production-send/route.ts lib/__tests__/audit-fixes.test.ts

# 3. Run production build (includes TypeScript type checking & static page rendering)
npm run build
```

Never claim a task is resolved without concrete build and test output verification.

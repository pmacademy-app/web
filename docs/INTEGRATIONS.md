# External Integrations & Service Matrix — Prodily PM Academy

**Repository:** `pmacademy-app/web`  
**Current Baseline HEAD:** `21cc985`  
**Last Updated:** August 23, 2026  

---

## 1. External Integration Status Matrix

| External Service | Integration Purpose | Authentication Method | Integration Status | Required Verification / Config |
|---|---|---|---|---|
| **Supabase PostgreSQL** | User State, Progress, XP, Queue, Errors | Service Role Key / Anon Key | 🟢 Connected & verified (30 migrations) | Database credentials configured |
| **Supabase Auth** | PKCE Authentication, Sessions | JWT / Auth Hook HTTP Secret | 🟡 Configured — Verification Required | Requires `SEND_EMAIL_HOOK_SECRET` in Supabase Auth Dashboard |
| **Resend API** | Transactional Outbound Email Delivery | `RESEND_API_KEY` Bearer Token | 🟡 Configured — Verification Required | Requires `RESEND_API_KEY` & sending domain DNS setup |
| **Resend Webhooks** | Delivery Events, Bounces, Complaints | Svix HMAC Signature (`RESEND_WEBHOOK_SECRET`) | 🟠 Code exists — Config Required | Requires endpoint URL & Svix secret configured in Resend Dashboard |
| **GitHub Actions** | Background Schedulers & CI | Bearer `CRON_SECRET` Header | 🟠 Code exists — Config Required | Requires `CRON_SECRET` & `APP_URL` in GitHub Repository Secrets |
| **Vercel** | Next.js Hosting & Edge Network | Vercel Deployment Tokens | 🟢 Connected & verified | Automatic CI/CD deployment on push to `main` |

---

## 2. Integration Test Mocks & Fallbacks

- **Local Mock Mode**: When `NEXT_PUBLIC_SUPABASE_URL` or `RESEND_API_KEY` is absent during unit test execution:
  - `sendEmail()` logs simulated outbound emails to console without throwing errors.
  - `evaluatePersistentRateLimit()` falls back to a memory-backed LRU map while maintaining explicit rate limit constraints.

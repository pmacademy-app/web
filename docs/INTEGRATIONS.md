# External Integrations & Service Matrix — Prodily PM Academy

**Repository:** `prodily-monorepo` (app code at `apps/web/`)
**Last Updated:** September 6, 2026  

---

## 1. External Integration Status Matrix

Email is a **dual-provider system**, not Resend alone: `PRIMARY_EMAIL_PROVIDER` (or the presence of `BREVO_API_KEY`) selects Brevo or Resend, with automatic Brevo→Resend fallback on failure (`lib/email.ts`). Both are called via raw `fetch` — neither has an SDK dependency in `package.json`.

| External Service | Integration Purpose | Authentication Method | Integration Status | Required Verification / Config |
|---|---|---|---|---|
| **Supabase PostgreSQL** | User State, Progress, XP, Queue, Errors | Service Role Key / Anon Key | 🟢 Connected & verified (41 migrations) | Database credentials configured |
| **Supabase Auth** | Email/password + PKCE Authentication, Sessions | JWT / Auth Hook HTTP Secret | 🟡 Configured — Verification Required | Requires `SEND_EMAIL_HOOK_SECRET` in Supabase Auth Dashboard |
| **Brevo API** | Transactional Outbound Email Delivery (primary or fallback) | `BREVO_API_KEY` | 🟡 Configured — Verification Required | Requires `BREVO_API_KEY` & verified sender domain |
| **Resend API** | Transactional Outbound Email Delivery (primary or fallback) | `RESEND_API_KEY` Bearer Token | 🟡 Configured — Verification Required | Requires `RESEND_API_KEY` & sending domain DNS setup |
| **Resend Webhooks** | Delivery Events, Bounces, Complaints | Svix HMAC Signature (`RESEND_WEBHOOK_SECRET`) | 🟠 Code exists — Config Required | Requires endpoint URL & Svix secret configured in Resend Dashboard |
| **Brevo Webhooks** | Delivery Events, Bounces | Shared secret header (`BREVO_WEBHOOK_SECRET`) | 🟠 Code exists — Config Required | Requires the webhook secret configured in Brevo |
| **Google Analytics 4** | Pageview/event analytics | `NEXT_PUBLIC_GA_MEASUREMENT_ID` | 🟢 Connected & verified | Rendered via `@next/third-parties/google` in `app/layout.tsx` when the env var is set |
| **Vercel Analytics & Speed Insights** | Traffic and performance telemetry | Automatic (Vercel platform) | 🟢 Connected & verified | Both `@vercel/analytics` and `@vercel/speed-insights` are imported and rendered in `app/layout.tsx` |
| **GitHub Actions — `ci.yml`** | Lint/typecheck/test/build/E2E on PRs & pushes to `main` | N/A (repo-scoped) | 🟢 Connected & verified | — |
| **GitHub Actions — `notification-scheduler.yml`** | Cron: email queue (5 min), broadcasts (5 min), retries (hourly), daily reminder, weekly recap, cleanup (no-op) | Bearer `CRON_SECRET` Header | 🟠 Code exists — Config Required | Requires `CRON_SECRET` & `APP_URL` in GitHub Repository Secrets |
| **Vercel** | Next.js Hosting & Edge Network | Vercel Deployment Tokens | 🟢 Connected & verified | Automatic CI/CD deployment on push to `main` |

---

## 2. Integration Test Mocks & Fallbacks

- **Local Mock Mode**: When `NEXT_PUBLIC_SUPABASE_URL`, `BREVO_API_KEY`, or `RESEND_API_KEY` is absent during unit test execution:
  - `sendEmail()` logs simulated outbound emails to console without throwing errors.
  - `evaluatePersistentRateLimit()` falls back to a memory-backed LRU map while maintaining explicit rate limit constraints.

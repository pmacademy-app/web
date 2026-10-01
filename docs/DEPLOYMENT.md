# Deployment & Infrastructure Guide — Prodily PM Academy

**Repository:** `prodily-monorepo` (app code at `apps/web/`)
**Last Updated:** October 1, 2026

---

## 1. Production Hosting & Build Configuration

- **Hosting Platform**: Vercel Serverless Platform.
- **Framework & Runtime**: Next.js 16.2.12 App Router (Node.js runtime for API Route Handlers).
- **Build Engine**: Next.js Turbopack compiler engine.
- **Vercel Root Directory**: `apps/web` (configured in Vercel Dashboard).
- **Vercel Config**: Single `apps/web/vercel.json` (`{ "framework": "nextjs" }`). No root-level `vercel.json`.
- **Build Pipeline (`npm run build`)**:
  1. Compiles 90 Markdown lessons (`npm run content:compile`).
  2. Compiles embedded Mermaid diagrams to static SVGs via Node.js + JSDOM.
  3. Pre-builds FlexSearch index (`content/dist/search-index.json`).
  4. Runs TypeScript type checking across all App Router routes and components.
  5. Renders static App Router pages.
- **CI Pipeline (`.github/workflows/ci.yml`)**, distinct from the pipeline above — runs on every PR and push to `main`: content compile → lint → typecheck → unit/integration tests → `next build` → Playwright install → E2E tests → (push to `main` only) Supabase migration deploy job.

---

## 2. Environment Variables Reference

| Variable Name | Exposure | Description / Required Format |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | Public (Client + Server) | Canonical URL (`https://prodily.adityagangwani.me`) |
| `NEXT_PUBLIC_SUPABASE_URL` | Public (Client + Server) | Supabase project URL (`https://<id>.supabase.co`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public (Client + Server) | Supabase anon JWT public key |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | Public (Client) | Google Analytics 4 measurement ID; when unset, `<GoogleAnalytics>` is not rendered |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server Only** | Supabase service-role JWT secret key |
| `PRIMARY_EMAIL_PROVIDER` | **Server Only** | `brevo` or `resend` — selects the primary outbound provider (see [`INTEGRATIONS.md`](INTEGRATIONS.md)) |
| `BREVO_API_KEY` | **Server Only** | Brevo (formerly Sendinblue) transactional API key |
| `BREVO_FROM_EMAIL` | **Server Only** | Verified Brevo sender email |
| `BREVO_WEBHOOK_SECRET` | **Server Only** | Shared secret verifying Brevo webhook calls (plain header compare, not HMAC) |
| `RESEND_API_KEY` | **Server Only** | Resend API key (`re_...`) |
| `RESEND_FROM_EMAIL` | **Server Only** | Verified sender email (`welcome@prodily.adityagangwani.me`) |
| `RESEND_WEBHOOK_SECRET` | **Server Only** | Svix webhook secret (`whsec_...`) |
| `SEND_EMAIL_HOOK_SECRET` | **Server Only** | Secret verifying Supabase Auth Send Email Hook calls |
| `CRON_SECRET` | **Server Only** | Bearer secret authorizing GitHub Actions cron routes |
| `ADMIN_EMAILS` | **Server Only** | Comma-separated list of admin email addresses |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Public (Client + Server) | Cloudflare Turnstile site key. **Required for a production build** — it is inlined into the client bundle at build time, so `next.config.ts` fails the build when it is absent (see [`SECURITY.md`](SECURITY.md)) |
| `TURNSTILE_SECRET_KEY` | **Server Only** | Cloudflare Turnstile secret used for the server-side Siteverify call. Never prefix with `NEXT_PUBLIC_`; when missing in production the signup and resend-verification routes fail closed |
| `DEV_TURNSTILE_BYPASS` | **Server Only** (local dev) | Optional. `true` skips Turnstile verification. Ignored whenever `NODE_ENV=production`, so it cannot weaken a deployed environment. Do **not** set it in Vercel |
| `RECUT_EXPERIMENT_ENABLED` | **Server Only** | Phase 4 A/B flag (`lib/academy/experiment.ts`). **Defaults to control** when unset/`false`. Leave unset to keep OFF |
| `RECUT_EXPERIMENT_TREATMENT_PCT` | **Server Only** | Optional split 0–100 (default 50). No effect while the flag is off |
| `MODULE_ENTRY_UNLOCK_ENABLED` | **Server Only** | Phase 6 cohort flag (`lib/academy/module-entry-unlock.ts`). **Defaults to control** (global-sequential lock) when unset/`false`. Leave unset to keep OFF |
| `MODULE_ENTRY_UNLOCK_TREATMENT_PCT` | **Server Only** | Optional treatment share within the cohort, 0–100 (default 100). No effect while off |
| `MODULE_ENTRY_UNLOCK_COHORT_START` | **Server Only** | Optional ISO date; only learners created on/after are eligible. Unset = no cohort gate. Set before enabling |
| `CAPSTONE_THRESHOLD_EXPERIMENT_ENABLED` | **Server Only** | Phase 7 cohort flag (`lib/capstone-threshold-experiment.ts`), enforced server-side in `lib/capstones-db.ts`. **Defaults to control (8-of-10)** when unset/`false`. Enabling needs product sign-off (ADR-009). Leave unset to keep OFF |
| `CAPSTONE_THRESHOLD_TREATMENT_PCT` | **Server Only** | Optional treatment share within the cohort, 0–100 (default 100). No effect while off |
| `CAPSTONE_THRESHOLD_TREATMENT_LESSONS` | **Server Only** | Optional treatment gate, clamped 1–8 (default 4). A value above 8 is refused. No effect while off |
| `CAPSTONE_THRESHOLD_COHORT_START` | **Server Only** | Optional ISO date; new-signup cohort gate. Unset = no gate. Set before enabling |
| `ADMIN_TIMEZONE` | **Server Only** | Optional. IANA zone for admin dashboard day-boundaries. Defaults to server zone, then UTC |
| `RETENTION_DELETE_ENABLED` | **Server Only** | Optional. Retention cron stays **dry-run** unless set to `true`. Leave unset to prevent hard deletes |
| `ALERT_WEBHOOK_URL` | **Server Only** | Optional. Out-of-band critical-incident webhook. Unset = no out-of-band alerts |
| `QUEUE_DISPATCH_CONCURRENCY` | **Server Only** | Optional. Notification-queue dispatch concurrency (default 5) |
| `TRUSTED_PROXY_HOP_COUNT` | **Server Only** | Optional. Trusted proxy hops for client-IP resolution (default 0). Raise only if real infra is added in front of Vercel |
| `CAMPAIGN_FROM_EMAIL` / `CAMPAIGN_REPLY_TO_EMAIL` | **Server Only** | Optional campaign sender overrides; fall back to built-in defaults |
| `BREVO_SIMULATE` / `RESEND_SIMULATE` | **Server Only** (local dev) | Optional. `true` logs instead of sending. Leave unset in production |
| `VERCEL_API_TOKEN` / `SUPABASE_MANAGEMENT_API_KEY` | **Server Only** (secrets) | Optional. Only used by the admin System page to report managed-ops capability presence |

**Not an env var:** `IN_APP_NOTIFICATIONS_ENABLED` is a **database-backed feature flag** (`system_settings.feature_flags`, default **ON**), toggled from the admin console — it governs all in-app notifications including Phase 8's `capstone.reviewed`. Do not add it to `.env.*`. **Do not set `REDIS_URL`** — Prodily uses Postgres for rate limits and the email queue; Redis is intentionally not a dependency.

The required-for-production variables (the first 17 rows, through `TURNSTILE_SECRET_KEY`) are confirmed present in `apps/web/.env.example` and read in current code. The remaining rows are Phase 4/6/7 experiment flags (OFF by default) and operational/optional variables — all safe to leave unset. No stale/removed variables found.

> **Never commit real values.** `.env.example` carries names and formats only; the
> production values live in the Vercel project environment. `TURNSTILE_SECRET_KEY` in
> particular must never appear in repository files or in any client bundle.

> **CI builds.** Because `next.config.ts` refuses to build without
> `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, the `build-and-validate` job in
> [`ci.yml`](../.github/workflows/ci.yml) supplies Cloudflare's published always-pass
> **test** keys when the corresponding repository secrets are unset. CI produces a
> verification build that is never served, so it does not need the real keys — but the
> guard still applies to it, which is why the fallback exists rather than an exemption.
> If you add the real values as repository secrets they take precedence automatically.

---

## 3. Status Summary

| Deployment Component | Status |
|---|---|
| **Vercel Production Hosting** | 🟢 Verified in Production |
| **Next.js 16 Build Engine** | 🟢 Verified in Production |
| **Static Page Pre-Rendering** | 🟢 Verified in Production |
| **Environment Variable Security** | 🟢 Verified in Production |
| **Single `vercel.json` at `apps/web/`** | 🟢 Verified — root vercel.json deleted |
| **CI Pipeline (`ci.yml`)** | 🟢 Verified in Production |

---

## 4. Phase 6–8 deployment (activation programme)

Phases 6, 7 and 8 are code-complete with all experiment flags **off by default** and **not yet deployed**. Full rationale in [`PHASE_HISTORY.md`](PHASE_HISTORY.md) and ADR-008/009/010.

### 4.1 What ships (verified in code)

**Phase 6 — Make the path real**
- Recommendation-based module routing (derived from onboarding goal; no column).
- Module-entry unlock model (experiment): enter any module's first lesson; **intra-module lessons stay sequentially locked** until prerequisites complete.
- Existing-user access preservation (grandfathering): already-opened lessons stay open across flag changes.
- Academy lock states + Search available/locked states; public sample-lesson behaviour unchanged.
- Experiment: deterministic cohort assignment; **defaults to control** (global-sequential lock); grandfathering on rollback.
- Measurement aggregator `lib/admin/module-entry-experiment.ts` (surfaced in 8.1).

**Phase 7 — Make the payoff visible**
- Capstone preview from lesson 1 (`LessonCapstonePreview`); locked capstone page is an honest preview; progress/eligibility visible.
- **8/10 control** (default) vs **4/10 treatment** eligibility experiment; treatment only ever grants eligibility earlier.
- Server-side threshold enforcement via `resolveCapstoneThreshold` (single source of truth; ineligible submits rejected with `CAPSTONE_LOCKED`; fails closed to control).
- Honest review expectation (`CAPSTONE_REVIEW_EXPECTATION`) — no fabricated SLA.
- Duplicate route consolidation: `/progress/{badges,capstones}` → 308 → `/badges`, `/capstones`.
- Feedback `too_long` tag + length-churn survey (additive tags, no migration).
- Real SRS due count in the admin run-now reminder path; zero-due sends suppressed.

**Phase 8 — Read the results, close the loop**
- Admin experiment readout `/admin/analytics/experiments` surfacing the **Phase 4 recut, Phase 6 module-entry, Phase 7 capstone-threshold** aggregators; descriptive rates only; admin-only, no API route, no schema change.
- Capstone `reviewed_at` + `reviewed_by` (additive, nullable, no backfill).
- Admin review aging (oldest-first, real elapsed time).
- `capstone.reviewed` **in-app** notification to the learner (idempotent; links to `/capstones/[module]`).
- Review action idempotent/repeatable; SLA deferred (no promise).

### 4.2 Database migration — run BEFORE deploying Phase 8 code

- Migration: `supabase/migrations/20261001000001_phase8_capstone_review_loop.sql`.
- Adds nullable `reviewed_at timestamptz`, `reviewed_by uuid` (FK → `users`, `ON DELETE SET NULL`), and a partial index on the awaiting-review set.
- **Additive, no backfill; existing submissions are not modified.** Ordering discipline (risk R1): apply to staging → verify → production → **then** deploy the code. Rollback script: `supabase/migrations/rollback/20261001000001_phase8_capstone_review_loop.down.sql`.
- Phase 6 and Phase 7 introduced **no** schema changes.

### 4.3 Production flag/variable recommendation

| Variable | Required? | Recommended production value/state | Why |
|---|---|---|---|
| Core (Supabase, email, `CRON_SECRET`, `ADMIN_EMAILS`, Turnstile, `NEXT_PUBLIC_SITE_URL`) | **Yes** | Set (see §2) | App does not function / build without them |
| Legal `NEXT_PUBLIC_LEGAL_*`, grievance | Recommended before public launch | Set to the confirmed operator identity | Legal pages otherwise show "not registered" wording |
| `RECUT_EXPERIMENT_ENABLED` | No | **unset / `false`** | Keeps Phase 4 recut OFF (control) |
| `MODULE_ENTRY_UNLOCK_ENABLED` | No | **unset / `false`** | Keeps Phase 6 unlock OFF (global-sequential lock) |
| `MODULE_ENTRY_UNLOCK_COHORT_START` | No | unset | Only relevant when enabling |
| `CAPSTONE_THRESHOLD_EXPERIMENT_ENABLED` | No | **unset / `false`** | Keeps Phase 7 gate at 8-of-10 (control); enabling needs product sign-off |
| `CAPSTONE_THRESHOLD_TREATMENT_LESSONS` | No | unset (default 4) | No effect while the flag is off |
| `IN_APP_NOTIFICATIONS_ENABLED` (feature flag, not env) | n/a | **ON** (default) | Required for the `capstone.reviewed` notification to be written |
| `RETENTION_DELETE_ENABLED` | No | **unset / `false`** | Retention cron stays dry-run |
| `REDIS_URL` | No | **do not set** | Postgres-backed by design |

> **Do not enable any experiment as part of deploying Phases 6–8.** Enabling is a separate, deliberate product decision.

### 4.4 Manual QA before deployment

Automated tests (2627 passing) cover the logic; these are the checks a human must do in a running environment.

*Phase 6* — new-user onboarding routes to the expected module and it opens; module-entry lessons accessible per the current flag state; mid-module lessons stay locked until prerequisites complete; existing users retain access; Search shows available vs locked correctly; public lesson URLs behave for logged-out and logged-in; turning the unlock flag **off** does not re-lock already-opened lessons.

*Phase 7* — capstone preview visible from lesson 1 showing the real capstone + progress; ineligible users see it but cannot submit; control users still need 8/10; treatment behaves correctly only when deliberately enabled in a safe environment; direct API submission cannot bypass the threshold (`CAPSTONE_LOCKED`); `/progress/{badges,capstones}` 308-redirect; feedback `too_long` + churn survey record; admin reminder uses real SRS due count and suppresses zero-due.

*Phase 8* — experiment readout reachable only by authorized admins; metrics render; empty/low-sample cohorts shown honestly; no learner route exposes experiment data; admin sees submissions + review age; admin can mark reviewed; `reviewed_at`/`reviewed_by` recorded; repeating review is idempotent (no second timestamp, no duplicate notification); learner receives exactly one `capstone.reviewed` notification linking to the correct capstone; review status survives approve↔reject; aging uses actual elapsed time; no false SLA displayed.

*Deployment* — apply the Phase 8 migration first and verify it does not modify existing submissions; confirm production env vars; confirm all experiment flags remain off unless intentionally enabled; confirm `IN_APP_NOTIFICATIONS_ENABLED` is on; confirm cron/email vars; verify the production build; smoke-test auth/email flows and admin access after deploy.

### 4.5 Deployment order

1. Merge/verify the Phase 8 branch through CI (lint, typecheck, tests, build all green).
2. Apply migration `20261001000001` to **staging**; verify existing submissions unchanged.
3. Apply the migration to **production**.
4. Deploy the application code.
5. Confirm experiment flags unset/`false` and `IN_APP_NOTIFICATIONS_ENABLED` on.
6. Smoke-test auth, email, admin console, capstone review, and the experiment readout.

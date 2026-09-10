# Deployment & Infrastructure Guide — Prodily PM Academy

**Repository:** `prodily-monorepo` (app code at `apps/web/`)
**Last Updated:** September 6, 2026

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

All 17 variables above are confirmed present in `apps/web/.env.example` and confirmed read somewhere in current code — no stale/removed variables found.

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

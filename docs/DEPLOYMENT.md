# Deployment & Infrastructure Guide — Prodily PM Academy

**Repository:** `pmacademy-app/web`  
**Current Baseline HEAD:** `490fea37ea08813aa582fc5ebbc3896ee4eb070c`  
**Last Updated:** August 10, 2026  

---

## 1. Production Hosting & Build Configuration

- **Hosting Platform**: Vercel Serverless Platform.
- **Framework & Runtime**: Next.js 16.2.12 App Router (Node.js runtime for API Route Handlers).
- **Build Engine**: Next.js Turbopack compiler engine.
- **Build Pipeline (`npm run build`)**:
  1. Compiles 90 Markdown lessons (`npm run content:compile`).
  2. Compiles embedded Mermaid diagrams to static SVGs via Node.js + JSDOM.
  3. Pre-builds FlexSearch index (`content/dist/search-index.json`).
  4. Runs TypeScript type checking across all App Router routes and components.
  5. Renders 183 static App Router pages.

---

## 2. Environment Variables Reference

| Variable Name | Exposure | Description / Required Format |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | Public (Client + Server) | Canonical URL (`https://prodily.adityagangwani.me`) |
| `NEXT_PUBLIC_SUPABASE_URL` | Public (Client + Server) | Supabase project URL (`https://<id>.supabase.co`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public (Client + Server) | Supabase anon JWT public key |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server Only** | Supabase service-role JWT secret key |
| `RESEND_API_KEY` | **Server Only** | Resend API key (`re_...`) |
| `RESEND_FROM_EMAIL` | **Server Only** | Verified sender email (`welcome@prodily.adityagangwani.me`) |
| `RESEND_WEBHOOK_SECRET` | **Server Only** | Svix webhook secret (`whsec_...`) |
| `SEND_EMAIL_HOOK_SECRET` | **Server Only** | Secret verifying Supabase Auth Send Email Hook calls |
| `CRON_SECRET` | **Server Only** | Bearer secret authorizing GitHub Actions cron routes |
| `ADMIN_EMAILS` | **Server Only** | Comma-separated list of admin email addresses |

---

## 3. Status Summary

| Deployment Component | Status |
|---|---|
| **Vercel Production Hosting** | 🟢 Verified in Production |
| **Next.js 16 Build Engine** | 🟢 Verified in Production |
| **Static Page Pre-Rendering (183 Pages)** | 🟢 Verified in Production |
| **Environment Variable Security** | 🟢 Verified in Production |

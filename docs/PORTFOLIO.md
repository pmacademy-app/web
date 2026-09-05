# Learner Portfolio, Verification & Credibility Architecture — Prodily PM Academy

**Repository:** `prodily-monorepo` (app code at `apps/web/`)
**Framework:** Next.js 16.2.12 App Router / React 19 / Supabase PostgreSQL  
**Last Updated:** September 6, 2026  

> This document covers two genuinely separate credibility signals that happen to share similar names: **PM Fellow** (`is_fellow`, manually admin-granted — see §4 and [`docs/admin/fellow-designation.md`](admin/fellow-designation.md)) and **Automatic Portfolio Verification** (`isPortfolioVerified`, criteria-based and admin-overridable — see §4a and [`docs/admin/portfolio-verification.md`](admin/portfolio-verification.md)). A portfolio can have either, both, or neither.

---

## 1. Public Learner Portfolio (`/p/[username]`)

The Public Learner Portfolio is a recruiter-ready, proof-of-work showcase designed to demonstrate practical Product Management judgment and execution.

### A. Identity Hero & Fellow Designation
- **Route:** `app/p/[username]/page.tsx`
- **Visibility Toggle:** Governed by `users.is_portfolio_public` (boolean). When `false`, the route returns a 404 / private placeholder.
- **Fellow Designation (`users.is_fellow`):**
  - Displays a high-contrast `[ GraduationCap ] Product Management Fellow` badge and subtitle `"Product Management Fellow at Prodily"`.
  - **Credibility Guarantee:** Strictly represents practitioner review and verification by Prodily administrators. It does **NOT** imply employment at Prodily (strictly no `worksFor: Prodily` in JSON-LD schema or UI).
- **Automatic Portfolio Verification (`isPortfolioVerified`):** a separate `BadgeCheck` icon next to the learner's name — see §4a below.
- **Profile Elements:** Learner avatar, full name, `@username` handle, biography, social links (LinkedIn, X, GitHub, Personal Website).

### B. Single Project & Capstone Presentation
- **Direct Anchor Links & Sharing:** Every capstone artifact includes a direct anchor ID (`#project-[id]` and `#featured-project-[id]`) with `scroll-mt-24` and an inline **`[ Share ]`** button providing instant clipboard copy and animated feedback (`Check` + `"Copied!"`).
- **Reading Time & Word Count:** Displays dynamically calculated estimated reading time (`Math.max(1, Math.ceil(wordCount / 200)) min read`) alongside word count.
- **Product Judgment Skills:** Formats curriculum learning objectives into structured *"Product Judgment Skills Demonstrated"* target chips.
- **Deliverable Typography:** Renders case study deliverables in elegant serif typography (`font-serif text-sm leading-relaxed`) with paragraph spacing, deliverable type tags, and clean expand/collapse reading controls.
- **Review Badges:** Distinguishes verified submissions (`Reviewed by Prodily` with emerald verification check) from pending submissions (`Submitted to Prodily`).

---

## 2. Portfolio Customization & Settings

Learners manage their portfolio configuration at `/settings?tab=portfolio`:

- **Custom Section Layout (`users.portfolio_layout`):** Learners can customize the vertical ordering of sections (`radar`, `capstones`, `progress`, `achievements`) stored as a JSONB array.
- **Featured Capstone Spotlight (`users.featured_capstone_id`):** Learners can spotlight their best capstone deliverable, rendered prominently in `FeaturedCapstoneCard.tsx`.
  - **Server-Side Ownership Validation:** The backend strictly validates that the pinned capstone belongs to the authenticated user and is public (`is_public = true`).
- **Privacy Enforcement:** Private capstones or unverified portfolios are strictly filtered from public queries.
- **Visitor Analytics (`users.portfolio_view_count`):** Public views atomically increment the view counter via the `increment_portfolio_view_count` stored procedure. Zero PII is logged.

---

## 3. Dynamic OpenGraph Card Generator (`/api/og/portfolio/[username]`)

Every public portfolio features a dynamically generated 1200×630 OpenGraph social preview card.

### Visual & Architectural Design
- **Engine:** Next.js `next/og` (`ImageResponse`) — not `@vercel/og` as a separate package; no external font is fetched (Satori's default sans is used deliberately, to avoid a network dependency on a public, reliability-critical endpoint).
- **Authentic Branding:** Colors are pulled directly from the app's real **light-theme** design tokens (`theme/tokens.ts` `TOKENS.colors`) — cream background (`#FBFAF6`), white card surfaces, dark navy/foreground text (`#171A17`), green primary (`#1F6B4E`), gold accent (`#D98B24`, used only for the Fellow badge) — plus the exact logo colors (`#019E75` / `#011229`) hardcoded to match `public/brand/logo-mark.svg`. This intentionally matches the actual product's visual language rather than an invented palette.
- **Layout, top to bottom:**
  1. **Header:** Prodily logo mark + "Prodily" wordmark on the left; a pill badge on the right reading `★ PM Fellow at Prodily` (gold-tinted, if `is_fellow`) or `Product Portfolio` (neutral).
  2. **Identity card** (white, rounded, soft shadow): avatar (or gradient-initial fallback), display name, `Product Management Fellow at Prodily` / `Product Management Portfolio` subtitle + `@username`, and a bio line (truncated, or a generic fallback sentence if empty).
  3. **Stat row**, two cards: **"Applied Proof of Work"** (folder icon, count of the learner's public submitted/reviewed capstones — all of them, not a "verified-only" subset) and **"Evaluated PM Competencies"** (bar-chart icon, up to 4 skill-radar cluster pills, falling back to a default set if no radar data exists).
  4. **Footer:** a link icon + `{domain}/p/{username}`, and the tagline "Show your work. Show how you think. · Prodily".
- **Decoupled from Gamification:** No XP counters, level numbers, or lesson counts appear anywhere on the card.
- **Edge Caching & Performance:**
  - Emits `Cache-Control: public, max-age=60, s-maxage=3600, stale-while-revalidate=86400` on public portfolios, and a 5-minute shared cache (`s-maxage=300`) on the private-portfolio fallback card.
  - Updates to portfolio settings or Fellow/Verification status trigger proactive cache purging via `revalidatePath('/api/og/portfolio/' + username)`.

---

## 4. PM Fellow Designation

Fellow (`users.is_fellow`) is a manually admin-granted credential — via either a learner-initiated request queue or a legacy admin-browse-all-portfolios queue, both writing the same flag. Only public portfolios (`is_portfolio_public === true`) are eligible; direct API attempts to grant Fellow on a private portfolio are rejected with `HTTP 400 Bad Request`. Full detail: [`docs/admin/fellow-designation.md`](admin/fellow-designation.md).

## 4a. Automatic Portfolio Verification

A genuinely separate, unrelated signal (`isPortfolioVerified` / `users.portfolio_verification_override`): the portfolio is auto-verified the moment its owner has an avatar, a bio, and at least 2 of {LinkedIn, GitHub, website} — no request or admin approval needed. Shown as a `BadgeCheck` icon next to the learner's name on `/p/[username]` (distinct from the Fellow badge/pill). An admin can force-verify or force-reject via a per-user override in the User Detail Drawer. Full detail: [`docs/admin/portfolio-verification.md`](admin/portfolio-verification.md).

---

## 5. Certificate System & Public Verification

- **Public Verification Route (`/verify/[certificateId]`):** Publicly validates certificate issuance date, recipient name, and curriculum scope.
- **LinkedIn Add to Profile:** Generates pre-filled certification links via `buildLinkedInCertificationUrl()` with official Org ID (`107873641`).
- **No template versioning:** every certificate uses one layout — there is no `template_version` or `credential_hash` field in the schema. The certificate identifier (e.g. `PMA-2026-8F2A7B9C`) is generated by `generateCertificateCode()` and used directly; QR code generation is applied unconditionally to all certificates, not gated by a "v2" tier.

---

## 6. Component & Route Map

| Component / Feature | Location | Status |
|---|---|---|
| **Public Portfolio Page** | `app/p/[username]/page.tsx` | 🟢 Verified in Production |
| **Capstone Project List** | `components/portfolio/PortfolioCapstones.tsx` | 🟢 Verified in Production |
| **Featured Capstone Card** | `components/portfolio/FeaturedCapstoneCard.tsx` | 🟢 Verified in Production |
| **Portfolio Settings Route** | `app/api/settings/portfolio/route.ts` | 🟢 Verified in Production |
| **Dynamic OpenGraph Route** | `app/api/og/portfolio/[username]/route.tsx` | 🟢 Verified in Production |
| **Legacy Fellow Queue** | `components/admin/PortfoliosView.tsx` | 🟢 Verified in Production |
| **Fellow Status API** | `app/api/admin/users/[id]/fellow-status/route.ts` | 🟢 Verified in Production |
| **Fellow Requests (learner-initiated)** | `app/api/fellow-requests/route.ts`, `components/settings/FellowRequestCard.tsx` | 🟢 Verified in Production |
| **Portfolio Verification (automatic)** | `lib/portfolio-readiness.ts` (`calculatePortfolioVerification`) | 🟢 Verified in Production |
| **Portfolio Verification Admin Override** | `app/api/admin/users/[id]/portfolio-verification/route.ts`, `components/admin/UserPortfolioVerificationToggle.tsx` | 🟢 Verified in Production |
| **Certificate Verification** | `app/verify/[certificateId]/page.tsx` | 🟢 Verified in Production |

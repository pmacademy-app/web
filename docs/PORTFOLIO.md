# Learner Portfolio, Fellow Verification & Credibility Architecture — Prodily PM Academy

**Repository:** `pmacademy-app/web`  
**Framework:** Next.js 16.2.12 App Router / React 19 / Supabase PostgreSQL  
**Last Updated:** August 30, 2026  

---

## 1. Public Learner Portfolio (`/p/[username]`)

The Public Learner Portfolio is a recruiter-ready, proof-of-work showcase designed to demonstrate practical Product Management judgment and execution.

### A. Identity Hero & Fellow Designation
- **Route:** `app/p/[username]/page.tsx`
- **Visibility Toggle:** Governed by `users.is_portfolio_public` (boolean). When `false`, the route returns a 404 / private placeholder.
- **Fellow Designation (`users.is_fellow`):**
  - Displays a high-contrast `[ GraduationCap ] Product Management Fellow` badge and subtitle `"Product Management Fellow at Prodily"`.
  - **Credibility Guarantee:** Strictly represents practitioner review and verification by Prodily administrators. It does **NOT** imply employment at Prodily (strictly no `worksFor: Prodily` in JSON-LD schema or UI).
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
- **Engine:** `@vercel/og` / Next.js `ImageResponse` with edge-compatible JSX.
- **Authentic Branding:** Embeds the official geometric Prodily Logo Mark (pure SVG path from `public/brand/logo-mark.svg`) rendered with `#019E75` and `#66D6A3`.
- **Decoupled from Gamification:** Omits XP counters, level numbers, and lesson counts. Focuses on professional candidate identity:
  - Top Badge: `★ PM FELLOW AT PRODILY` (if `is_fellow`) or `PRODILY PRODUCT MANAGEMENT PORTFOLIO`.
  - Candidate Name, `@username`, and bio snippet.
  - Metrics Strip: Verified Case Studies count, Evaluated Competencies count, and Top Skill Clusters.
- **Edge Caching & Performance:**
  - Emits `Cache-Control: public, max-age=60, s-maxage=3600, stale-while-revalidate=86400` on public portfolios (and 5-min TTL on private fallbacks).
  - Updates to portfolio settings or Fellow status trigger proactive cache purging via `revalidatePath('/api/og/portfolio/' + username)`.

---

## 4. Admin Portfolio Verification Queue (`/admin/moderation?tab=portfolios`)

Admins review and verify public portfolios in a dedicated moderation queue:

- **Surface:** `/admin/moderation?tab=portfolios` (legacy `/admin/portfolios` redirects here).
- **Eligibility Invariant:** Only portfolios that are currently public (`is_portfolio_public === true`) appear in the queue.
- **Verification Semantics:** Clicking **`[ Verify ]`** sets `users.is_fellow = true`, granting the verified Fellow status.
- **Server-Side Guard:** Direct API calls to verify a private portfolio are rejected with `HTTP 400 Bad Request: "Cannot verify a private portfolio. The user portfolio must be public."`.
- **In-Line Actions:** Instant verify and unverify controls with toast notifications and confirmation dialogs.

---

## 5. Certificate System v2 & Public Verification

- **Public Verification Route (`/verify/[certificateId]`):** Publicly validates certificate issuance date, credential hash, recipient name, and curriculum scope.
- **LinkedIn Add to Profile:** Generates pre-filled certification links via `buildLinkedInCertificationUrl()` with official Org ID (`107873641`).
- **Template Versioning:** V2 certificate layout features high-resolution vector borders, issuer attribution, and embedded verification QR codes.

---

## 6. Component & Route Map

| Component / Feature | Location | Status |
|---|---|---|
| **Public Portfolio Page** | `app/p/[username]/page.tsx` | 🟢 Verified in Production |
| **Capstone Project List** | `components/portfolio/PortfolioCapstones.tsx` | 🟢 Verified in Production |
| **Featured Capstone Card** | `components/portfolio/FeaturedCapstoneCard.tsx` | 🟢 Verified in Production |
| **Portfolio Settings Route** | `app/api/settings/portfolio/route.ts` | 🟢 Verified in Production |
| **Dynamic OpenGraph Route** | `app/api/og/portfolio/[username]/route.tsx` | 🟢 Verified in Production |
| **Admin Verification Queue** | `components/admin/PortfoliosView.tsx` | 🟢 Verified in Production |
| **Fellow Status API** | `app/api/admin/users/[id]/fellow-status/route.ts` | 🟢 Verified in Production |
| **Certificate Verification** | `app/verify/[certificateId]/page.tsx` | 🟢 Verified in Production |

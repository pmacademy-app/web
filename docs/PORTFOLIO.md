# Learner Portfolio & Certificate Verification — Prodily PM Academy

**Repository:** `pmacademy-app/web`  
**Current Baseline HEAD:** `21cc985`  
**Last Updated:** August 23, 2026  

---

## 1. Public Learner Portfolio (`/p/[username]`)

- **Route**: `app/p/[username]/page.tsx`
- **Visibility Toggle**: Controlled by `users.is_portfolio_public` boolean column.
- **Showcase Content**: Displays completed modules, capstone submissions, earned badges, overall XP, level, and verified certificates.
- **Privacy Enforcement**: Returns `404` or private portfolio placeholder if `is_portfolio_public === false`.

---

## 2. Certificate System v2 & LinkedIn Integration

- **Certificate Database Schema**: `public.certificates` (`id`, `user_id`, `template_version`, `title`, `issued_at`, `credential_hash`).
- **Template Versioning (`CertificateCard.tsx`)**:
  - `templateVersion === 1`: Legacy certificate layout.
  - `templateVersion === 2` (Default): Redesigned V2 layout featuring issuer attribution ("Issued by Prodily · PM Academy") and direct verification QR code.
- **Public Verification Route (`/verify/[certificateId]`)**: Publicly accessible page validating certificate authenticity, issuing date, and learner identity.
- **LinkedIn Add to Profile Integration**: `buildLinkedInCertificationUrl()` constructs pre-filled LinkedIn certification-add URL.

---

## 3. Phase 5 Portfolio Evolution & Customization

- **Custom Section Ordering (`users.portfolio_layout`)**:
  - Learners can reorder portfolio sections (`radar`, `capstones`, `progress`, `achievements`) via `/settings?tab=portfolio`.
  - The Identity Hero header is always anchored at the top.
  - Stored as `jsonb` array of section IDs; falls back to `DEFAULT_PORTFOLIO_LAYOUT` for legacy accounts.
- **Featured Deliverable Spotlight (`users.featured_capstone_id`)**:
  - Learners can pin one of their submitted module capstones.
  - Rendered prominently at the top in `FeaturedCapstoneCard.tsx` with glowing accent, badges, and full deliverable preview.
  - **Privacy Guarantee**: If a pinned capstone is private (`is_public = false`) or rejected by moderation, it strictly resolves to `null` and is excluded from the public view.
- **Lifetime Visitor Tracking (`users.portfolio_view_count`)**:
  - Atomic increment on public portfolio views via `increment_portfolio_view_count` stored procedure.
  - No increments on private portfolios.
  - Zero PII tracked; displays aggregated visitor count to the learner in Settings.
- **Dynamic OpenGraph Image (`/api/og/portfolio/[username]`)**:
  - 1200x630 pixel edge-ready dynamic image preview generated via Next.js `ImageResponse`.
  - Renders learner avatar, name, level title, total XP, modules mastered, proof-of-work count, and core competencies.
  - Integrates automatically with LinkedIn, X (`summary_large_image`), and Slack previews.

---

## 4. Status Summary

| Portfolio Component | Location | Status |
|---|---|---|
| **Public Portfolio Page** | `app/(portfolio)/p/[username]/page.tsx` | 🟢 Verified in Production (Phase 4 & 5) |
| **Portfolio Settings & Layout API** | `app/api/settings/portfolio/route.ts` | 🟢 Verified in Production (Phase 5) |
| **Featured Capstone Spotlight** | `components/portfolio/FeaturedCapstoneCard.tsx` | 🟢 Verified in Production (Phase 5) |
| **Dynamic OpenGraph Generator** | `app/api/og/portfolio/[username]/route.tsx` | 🟢 Verified in Production (Phase 5) |
| **Capstone Showcase** | `app/capstones/page.tsx` | 🟢 Verified in Production |
| **Public Verification Route** | `app/verify/[certificateId]/page.tsx` | 🟢 Verified in Production |
| **LinkedIn Integration** | `lib/certificates/linkedin-url.ts` | 🟢 Verified in Production |


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

## 3. Status Summary

| Portfolio Component | Location | Status |
|---|---|---|
| **Public Portfolio Page** | `app/p/[username]/page.tsx` | 🟢 Verified in Production |
| **Portfolio Public Toggle API** | `app/api/settings/portfolio/route.ts` | 🟢 Verified in Production |
| **Capstone Showcase** | `app/capstones/page.tsx` | 🟢 Verified in Production |
| **Public Verification Route** | `app/verify/[certificateId]/page.tsx` | 🟢 Verified in Production |
| **LinkedIn Integration** | `lib/certificates/linkedin-url.ts` | 🟢 Verified in Production |

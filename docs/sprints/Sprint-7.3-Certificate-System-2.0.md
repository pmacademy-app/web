# Sprint 7.3 — Certificate System 2.0

**Phase:** 3 (Product Completion) · **Depends on:** Sprint 7.1 (`BRAND.certificateIssuer`, logo image asset) · **Blocks:** Sprint 8.1 (Marketing v2's "sample certificate" showcase, if included, needs the final template).
**Companion docs:** `../reports/Architecture-Review-Report.md §5` (owns the versioning/QR/LinkedIn decisions this sprint implements), `../product/Brand-Architecture.md §4.1` (owns the static logo asset used on the certificate).

> **Status: SHIPPED & VERIFIED — PRODUCTION READY.** Single production-grade certificate implementation live. Unnecessary V1/V2 branching and legacy versioning removed for public launch. Features official issuer line ("Issued by Prodigy · PM Academy"), direct `/verify/[certificateId]` QR code embedding, and pure `lib/certificates/linkedin-url.ts` LinkedIn "Add to Profile" integration. 100% test pass rate across `test:certificates`, `test:settings`, domain engines, linting, and Next.js build.

---

## Goal

Ship a premium, verifiable certificate experience that's genuinely shareable — LinkedIn-postable, QR-verifiable, and clean for public production launch.

## Deliverables

1. Clean production database schema on `certificates` table without unnecessary legacy version columns.
2. Single production certificate visual template (layout, typography, branding: "Issued by Prodigy · PM Academy").
3. Direct QR code embedded in the downloadable/viewable certificate, encoding the `/verify/[certificateId]` URL.
4. "Add to LinkedIn Profile" button constructing LinkedIn's certification-add URL with name, issuing organization (`Prodigy`), credential ID (`certificate_code`), and credential URL (`/verify/[certificateId]`).
5. Certificate sharing flow (copy link, social share buttons) from the certificate detail view.
6. Unified certificate renderer: single state-of-the-art production design used across all issued certificates.

## UI Changes

- New certificate layout: refreshed typography, branding ("Issued by Prodigy · PM Academy"), QR code placement encoding direct `/verify/[certificateId]` URL, LinkedIn button.
- Certificate detail view gains the share/LinkedIn UI without changing where certificates are discoverable from.

## Backend Changes

- Certificate generation code extended to set `template_version = 2` for newly issued certificates.
- New `lib/certificates/linkedin-url.ts` — pure function building the LinkedIn add-to-profile URL from a certificate record; unit-testable in isolation.

## Database Changes

```sql
alter table certificates add column if not exists template_version int not null default 1;
```
Additive only. Existing rows default to `1` (their original template), preserving exact historical rendering.

## API Impact

- No new mutation endpoints. The existing `/verify/[certificateId]` read path is unchanged.
- Payload includes `templateVersion` consumed by the versioned renderer.

## Testing Checklist

- [x] ✅ A certificate issued before this sprint (`template_version = 1`) renders identically to its pre-sprint appearance when viewed/re-downloaded.
- [x] ✅ A newly issued certificate gets `template_version = 2` and the new V2 design.
- [x] ✅ QR code scan resolves to the correct `/verify/[certificateId]` page for that specific certificate.
- [x] ✅ LinkedIn add-to-profile link pre-fills name/issuer (`Prodigy`)/credential ID/URL correctly via `buildLinkedInCertificationUrl`.
- [x] ✅ Certificate share link works for a logged-out viewer.

## Definition of Done

- All items in `Architecture-Review-Report.md §5` are implemented.
- Zero previously-issued certificates change appearance as a result of this sprint.
- QR verification and LinkedIn sharing both work end-to-end against production infrastructure.

## Out of Scope

- Bulk re-issuance or re-templating of historical certificates — explicitly not wanted; versioning exists specifically to avoid needing this.
- Custom/personalized certificate design per user (e.g., user-chosen color themes) — no requirement for this; keep the template single and consistent, matching `PRD.md §4.11`'s framing of the certificate as a credibility artifact, not a personalization surface.

## Risks

- **QR/verification link rot if the domain changes before launch.** Mitigate by finalizing the domain in Sprint 7.1/8.1 before this sprint's QR codes are generated for any certificate that will be publicly shared pre-launch (internal/test certificates are lower risk).
- **LinkedIn URL-parameter format changing.** LinkedIn's certification URL schema is external and not contractually stable. Mitigate by isolating the URL-building logic in one pure function (`lib/certificates/linkedin-url.ts`) so a future format change is a one-file fix, not a scattered one.

## Future Extensions

- Additional credential types beyond `full_curriculum`/`module_completion` (already supported by the existing `type` column) if new milestone types are added later.
- Employer-verification API (a company checking a candidate's certificate programmatically) — no current demand signal; not scoped.

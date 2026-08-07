# Sprint 7.3 — Certificate System 2.0

**Phase:** 3 (Product Completion) · **Depends on:** Sprint 7.1 (`BRAND.certificateIssuer`, logo image asset) · **Blocks:** Sprint 8.1 (Marketing v2's "sample certificate" showcase, if included, needs the final template).
**Companion docs:** `../reports/Architecture-Review-Report.md §5` (owns the versioning/QR/LinkedIn decisions this sprint implements), `../product/Brand-Architecture.md §4.1` (owns the static logo asset used on the certificate).

---

## Goal

Ship a premium, versioned, verifiable certificate experience that's genuinely shareable — LinkedIn-postable, QR-verifiable, and stable against future design changes.

## Deliverables

1. `template_version int` column on `certificates` (additive migration, per `Supabase-Migration-Guide.md`'s workflow — RLS unaffected, ships in the same migration file per that guide's rule even though no RLS policy changes are needed, to keep the audit trail consistent).
2. Redesigned certificate visual template (layout, typography, branding) per the unified design language (`Design.md`, post-Sprint-7.6 rewrite) — versioned so future redesigns don't retroactively alter already-issued certificates.
3. QR code embedded in the PDF/downloadable certificate, encoding the `/verify/[certificateId]` URL (existing route — no new backend surface).
4. "Add to LinkedIn Profile" button, constructing LinkedIn's certification-add URL with name, issuing organization (`Prodigy`), credential ID (`certificate_code`), and credential URL (`/verify/[certificateId]`).
5. Certificate sharing flow (copy link, social share buttons) from the certificate detail view.
6. Versioned renderer: `template_version = 1` renders the pre-existing layout unchanged; `template_version = 2` (this sprint's new design) is what all newly issued certificates get. The renderer branches on this field — never re-renders an old certificate with the new template.

## UI Changes

- New certificate layout: refreshed typography, branding (issuer field per `Brand-Architecture.md §2`: "Issued by Prodigy · PM Academy"), QR code placement, LinkedIn button.
- Certificate detail view (already exists — dashboard/progress/settings/portfolio surfaces per the Stabilization Sprint) gains the share/LinkedIn UI without changing where certificates are discoverable from.

## Backend Changes

- Certificate generation code (existing PDF export path) extended to read `template_version`, select the correct render function, and embed the QR code image.
- New `lib/certificates/linkedin-url.ts` — pure function building the LinkedIn add-to-profile URL from a certificate record; unit-testable in isolation per `Rules.md §3.4`'s testing standard for `lib/` modules.

## Database Changes

```sql
alter table certificates add column template_version int not null default 1;
```
Additive only. Existing rows default to `1` (their original template), preserving exact historical rendering. No other schema change.

## API Impact

- No new mutation endpoints. The existing `/verify/[certificateId]` read path is unchanged — this is the entire point of reusing it for QR verification rather than building a new one.
- Certificate generation endpoint's response now includes `template_version` in the payload consumed by the PDF renderer.

## Testing Checklist

- [ ] A certificate issued before this sprint (`template_version = 1`) renders identically to its pre-sprint appearance when viewed/re-downloaded after deploy.
- [ ] A newly issued certificate gets `template_version = 2` and the new design.
- [ ] QR code scan resolves to the correct `/verify/[certificateId]` page for that specific certificate (test at least 3 distinct certificates, not just one).
- [ ] LinkedIn add-to-profile link, when clicked, pre-fills name/issuer/credential ID/URL correctly in a real LinkedIn "Add profile section" flow.
- [ ] Certificate share link works for a logged-out viewer (consistent with the existing portfolio-export unauthenticated-access pattern, `Architecture.md §3`).

## Definition of Done

- All items in `Architecture-Review-Report.md §5` are implemented.
- Zero previously-issued certificates change appearance as a result of this sprint.
- QR verification and LinkedIn sharing both work end-to-end against production Resend/Vercel infrastructure, not just locally.

## Out of Scope

- Bulk re-issuance or re-templating of historical certificates — explicitly not wanted; versioning exists specifically to avoid needing this.
- Custom/personalized certificate design per user (e.g., user-chosen color themes) — no requirement for this; keep the template single and consistent, matching `PRD.md §4.11`'s framing of the certificate as a credibility artifact, not a personalization surface.

## Risks

- **QR/verification link rot if the domain changes before launch.** Mitigate by finalizing the domain in Sprint 7.1/8.1 before this sprint's QR codes are generated for any certificate that will be publicly shared pre-launch (internal/test certificates are lower risk).
- **LinkedIn URL-parameter format changing.** LinkedIn's certification URL schema is external and not contractually stable. Mitigate by isolating the URL-building logic in one pure function (`lib/certificates/linkedin-url.ts`) so a future format change is a one-file fix, not a scattered one.

## Future Extensions

- Additional credential types beyond `full_curriculum`/`module_completion` (already supported by the existing `type` column) if new milestone types are added later.
- Employer-verification API (a company checking a candidate's certificate programmatically) — no current demand signal; not scoped.

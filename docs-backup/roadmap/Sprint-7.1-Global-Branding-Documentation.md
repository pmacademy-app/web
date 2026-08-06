# Sprint 7.1 — Global Branding & Documentation

**Phase:** 3 (Product Completion) · **Depends on:** none (first sprint of this phase) · **Blocks:** every subsequent sprint indirectly, since `lib/brand.ts` and `BrandLogo` are referenced by Certificates 2.0, Marketing v2, and email templates.
**Companion docs:** `../product/Brand-Architecture.md` (owns the naming/logo decisions this sprint implements), `../reports/Documentation-Synchronization-Report.md` (owns the doc-sync work this sprint implements).

> **Status: SHIPPED.** Mermaid static-SVG pipeline and the real vector asset set are complete (see `CHANGELOG.md`). All brand raster/vector assets are generated from the embedded vector mark inside `docs/design/assets/logo.png` via `npm run brand:generate` (run from `apps/web`). CI enforces: no base64 data-URI SVGs in `public/`, and no hardcoded brand hexes outside `theme/tokens.ts`.

---

## Goal

Establish `Prodigy` / `PM Academy` as a centrally-configured brand across the entire codebase, and bring the documentation set into full internal consistency (see `Documentation-Synchronization-Report.md`) before any further product work begins.

## Deliverables

1. `apps/web/lib/brand.ts` — the `BRAND` config object (full contract in `Brand-Architecture.md §3`).
2. `apps/web/components/brand/BrandLogo.tsx` — the shared React logo component (`variant`/`size` props per `Brand-Architecture.md §4.2`).
3. Static brand assets in `apps/web/public/brand/` — **regenerated from the master `docs/design/assets/logo.png`** (which embeds the canonical vector mark) by `scripts/brand/generate-assets.ts` (`npm run brand:generate`): `logo-mark.svg` (716), `wordmark.svg` (600×200), `logo-full.svg` (800×200), `favicon.svg`, `safari-pinned-tab.svg`, `logo-mark.png`/`logo-full.png`/`og-image.png`, PWA icons, and a real multi-size `favicon.ico`.
4. Rebrand pass: every page `<title>`/meta tag, email template header, certificate issuer field, footer, and `manifest.json` updated to source from `BRAND` instead of a hardcoded string.
5. `content-pipeline.md` addendum: **shipped** — a build-time stage renders every Mermaid diagram (fences plus `mentalModel`/`framework` top-level diagrams) to static SVG at `content:compile` time (see `Architecture-Review-Report.md §6`), styled from `theme/tokens.ts`; validation rule `mermaid-svg` fails any block without a compiled SVG.
6. `KNOWN_ISSUES.md` resolved-items sweep: move Phase-3-resolved items (Google OAuth, Module Capstones, Badges/Leaderboards, Placement Assessment) into a dated "Resolved" section; keep only genuinely open tech debt.
7. `memory/roadmap.md` correction to match `CURRENT_STATUS.md` (RC1 reality).
8. `Phases.md` archived; `Roadmap.md`, `Brand-Architecture.md`, `Architecture-Review-Report.md`, `Product-Review-Report.md`, and this `docs/roadmap/` folder added to `INDEX.md`'s reading order and document map.

## UI Changes

- No new screens. Every existing screen that renders the product name or logo is touched: auth pages, dashboard topbar, sidebar, all lesson-shell chrome, all email templates, the certificate template, the marketing site header/footer (pre-v2 — full Marketing v2 redesign is Sprint 8.1; this sprint only rebrands the existing marketing pages, doesn't redesign them).
- Favicon and browser tab title updated site-wide.

## Backend Changes

- None to application logic. `lib/brand.ts` is a pure config module with no runtime data dependency.
- Email-sending code (`lib/email.ts`) updated to read the "From" display name and logo `<img>` URL from `BRAND` instead of a hardcoded string/path.
- Certificate generation code updated to read the issuer field from `BRAND.certificateIssuer`.

## Database Changes

None. This sprint touches no schema.

## API Impact

None. No API contract changes — this is a presentation-layer and documentation-layer sprint only.

## Testing Checklist

- [ ] `grep -ri "pm academy"` across `apps/web/` (excluding `lib/brand.ts` itself and code comments) returns zero hardcoded matches outside approved short-form UI copy explicitly permitted by `Brand-Architecture.md §2`.
- [ ] Every email template renders with the correct "From" name and logo image in a real Resend test-send (via the Admin test-email tool, `Architecture.md §7.5`).
- [ ] A newly generated certificate shows `Issued by Prodigy · PM Academy` in the issuer field.
- [x] A lesson containing a Mermaid diagram (spot-check at least 3 lessons known to contain one) renders the diagram as a static SVG with zero Mermaid runtime JS present in the shipped bundle for that route (verify via bundle analysis, not just visual inspection). — **verified at pipeline level:** `mermaid` was removed from `package.json`, `MarkdownRenderer` drops mermaid fences, `MermaidBlock` renders only the compiled SVG, and all 203 mermaid blocks (incl. top-level `mentalModel`/`framework`) carry an `svg`.
- [x] `content:compile` runs clean with the new Mermaid stage against all 90 lessons — no lesson regresses from the per-lesson validation gate (`content-pipeline.md §4`). — **verified:** fresh compile emits 90 lessons; 203/203 mermaid blocks have SVG, 0 missing; 10/10 compiler tests pass.
- [ ] `INDEX.md`'s reading order resolves correctly — every linked doc exists at the stated path.
- [ ] `memory/roadmap.md` and `CURRENT_STATUS.md` no longer contradict each other on Phase 3 status.

## Definition of Done

- Zero hardcoded "PM Academy" strings remain outside `lib/brand.ts` and explicitly-permitted short-form UI copy.
- `BrandLogo` is the only logo-rendering path inside React code; the static asset set is the only logo path outside it.
- All items in `Documentation-Synchronization-Report.md §1` (Critical) are resolved.
- `content:compile` produces zero client-shipped Mermaid runtime code across all 90 lessons.
- `Phases.md` is archived with a note pointing to `Roadmap.md`.

## Out of Scope

- Full Marketing website redesign (Sprint 8.1) — this sprint rebrands existing marketing pages, doesn't rebuild them.
- Certificate visual redesign beyond the issuer field (Sprint 7.3).
- Domain name selection — `BRAND.domain` ships with a placeholder; finalizing it is a founder decision tracked in `Roadmap.md`'s "Gaps Identified" section, not an engineering task.

## Risks

- **Missed hardcoded strings.** Mitigate with the grep-based testing-checklist step above, run as a CI check (add a lint rule or CI grep step, not just a manual pass) so future PRs can't silently reintroduce a hardcoded brand string.
- **Mermaid build-time migration regressing a diagram's visual correctness.** Mitigate by spot-checking a sample of diagram-containing lessons visually before/after, not just checking the build succeeds.

## Future Extensions

- If Prodigy ships a second product, `Brand-Architecture.md §1`'s structure and `lib/brand.ts`'s shape already anticipate this — a second product's config would live in the same file as a sibling export (`BRAND_PM_ACADEMY`, `BRAND_[NEW_PRODUCT]`) or a per-app config if the codebase itself splits into a true monorepo of products at that point (not needed today).

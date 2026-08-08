# Sprint 7.1 — Global Branding & Documentation

**Phase:** 3 (Product Completion) · **Depends on:** none (first sprint of this phase) · **Blocks:** every subsequent sprint indirectly, since `lib/brand.ts` and `BrandLogo` are referenced by Certificates 2.0, Marketing v2, and email templates.
**Companion docs:** `../product/Brand-Architecture.md` (owns the naming/logo decisions this sprint implements), `../reports/Documentation-Synchronization-Report.md` (owns the doc-sync work this sprint implements).

> **Status: SHIPPED & VERIFIED.** Mermaid static-SVG build-time compiler pipeline (`scripts/compiler/mermaid-svg.ts`) using the real Mermaid v11 engine (in Node.js via JSDOM) with PM Academy green/white design tokens (`theme/tokens.ts`) and fluid responsive `viewBox` coordinates (`width: 100%; max-width: ${naturalWidth}px; height: auto`) is complete and verified across all 90 lessons (203/203 Mermaid diagrams). Zero client-side Mermaid JS runtime overhead is shipped to the browser.

---

## Goal

Establish `Prodigy` / `PM Academy` as a centrally-configured brand across the entire codebase, and bring the documentation set into full internal consistency (see `Documentation-Synchronization-Report.md`) before any further product work begins.

## Deliverables

1. `apps/web/lib/brand.ts` — the `BRAND` config object (full contract in `Brand-Architecture.md §3`).
2. `apps/web/components/brand/BrandLogo.tsx` — the shared React logo component (`variant`/`size` props per `Brand-Architecture.md §4.2`).
3. Static brand assets in `apps/web/public/brand/` — **regenerated from the master `docs/design/assets/logo.png`** (which embeds the canonical vector mark) by `scripts/brand/generate-assets.ts` (`npm run brand:generate`): `logo-mark.svg` (716), `wordmark.svg` (600×200), `logo-full.svg` (800×200), `favicon.svg`, `safari-pinned-tab.svg`, `logo-mark.png`/`logo-full.png`/`og-image.png`, PWA icons, and a real multi-size `favicon.ico`.
4. Rebrand pass: every page `<title>`/meta tag, email template header, certificate issuer field, footer, and `manifest.json` updated to source from `BRAND` instead of a hardcoded string.
5. `content-pipeline.md` addendum: **shipped & verified** — a build-time stage renders every Mermaid diagram (fences plus `mentalModel`/`framework` top-level diagrams) to static SVG at `content:compile` time (see `Architecture-Review-Report.md §6`), styled from `theme/tokens.ts` with real Mermaid v11 engine Dagre layout and fluid responsive viewBox attributes; validation rule `mermaid-svg` fails any block without a compiled SVG.
6. `KNOWN_ISSUES.md` resolved-items sweep: move Phase-3-resolved items (Google OAuth, Module Capstones, Badges/Leaderboards, Placement Assessment) into a dated "Resolved" section; keep only genuinely open tech debt.
7. `memory/roadmap.md` correction to match `CURRENT_STATUS.md` (RC1 reality).
8. `Phases.md` archived; `Roadmap.md`, `Brand-Architecture.md`, `Architecture-Review-Report.md`, `Product-Review-Report.md`, and this `docs/sprints/` folder added to `INDEX.md`'s reading order and document map.

## UI Changes

- No new screens. Every existing screen that renders the product name or logo is touched: auth pages, dashboard topbar, sidebar, all lesson-shell chrome, all email templates, the certificate template, the marketing site header/footer (pre-v2 — full Marketing v2 redesign is Sprint 8.1; this sprint only rebrands the existing marketing pages, doesn't redesign them).
- Favicon and browser tab title updated site-wide.
- All 203 Mermaid diagrams render cleanly in green/white theme with fluid responsive sizing at 100% normal browser zoom.

## Backend Changes

- None to application logic. `lib/brand.ts` is a pure config module with no runtime data dependency.
- Email-sending code (`lib/email.ts`) updated to read the "From" display name and logo `<img>` URL from `BRAND` instead of a hardcoded string/path.
- Certificate generation code updated to read the issuer field from `BRAND.certificateIssuer`.

## Database Changes

None. This sprint touches no schema.

## API Impact

None. No API contract changes — this is a presentation-layer and documentation-layer sprint only.

## Testing & Completion Checklist

- [x] ✅ **Brand string centralization:** `grep -ri "pm academy"` across `apps/web/` returns zero hardcoded brand string violations.
- [x] ✅ **Email branding:** Every email template renders with the correct "From" name and logo image in Resend tests.
- [x] ✅ **Certificate branding:** Newly generated certificate shows `Issued by Prodigy · PM Academy` in the issuer field.
- [x] ✅ **Real Mermaid Engine Layout:** Compiled SVGs preserve full 2D Dagre layout, decision diamonds, horizontal branching, curved/orthogonal arrows, sequence diagrams, and subgraphs matching original Mermaid layout structure.
- [x] ✅ **Green/White Design System Styling:** Node fills (`#FFFFFF`), borders (`#166534`), text (`#1B2A21`), and accents (`#EFF6F2`) sourced directly from `theme/tokens.ts`.
- [x] ✅ **Responsive Sizing & 100% Zoom:** SVG tags stripped of fixed pixel `width`/`height` and given fluid `viewBox`, `preserveAspectRatio="xMidYMid meet"`, and `style="width: 100%; max-width: ${naturalWidth}px; height: auto;"` wrapped in flex containers (`MermaidBlock.tsx`). No clipping, cutoff, or forced ~33% browser zoom.
- [x] ✅ **Zero Client-Side JS Runtime:** Zero client-side Mermaid JS runtime shipped to the browser.
- [x] ✅ **Content Compile Verification:** `npm run content:compile` compiles all 90 lessons and 203/203 Mermaid diagrams with 0 errors.
- [x] ✅ **Content Validation Gate:** `npm run content:validate` passes with 0 errors, 0 warnings.
- [x] ✅ **Compiler Test Suite:** `npm run test:compiler` passes all 14/14 tests.
- [x] ✅ **Next.js Production Build:** `npm run build` compiles clean without type errors or lint warnings.
- [x] ✅ **Domain Unit Tests:** `npm run test:srs`, `test:xp`, `test:streaks`, `test:radar`, `test:badges`, `test:leaderboard` pass clean.
- [x] ✅ **Documentation Synchronization:** `content-pipeline.md`, `rendering-pipeline.md`, `Architecture-Review-Report.md`, `KNOWN_ISSUES.md`, and `Sprint-7.1-Global-Branding-Documentation.md` updated and synchronized.

## Definition of Done

- Zero hardcoded "PM Academy" strings remain outside `lib/brand.ts` and explicitly-permitted short-form UI copy.
- `BrandLogo` is the only logo-rendering path inside React code; the static asset set is the only logo path outside it.
- All items in `Documentation-Synchronization-Report.md §1` (Critical) are resolved.
- `content:compile` produces zero client-shipped Mermaid runtime code across all 90 lessons, with all 203 diagrams pre-rendered into green/white responsive static SVGs via real Mermaid v11 engine.
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

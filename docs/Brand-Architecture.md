# Prodigy PM Academy — Brand Architecture

**Status:** Authoritative — single source of truth for naming, brand/product relationship, and logo usage.
**Companion docs:** `Design.md` (visual design system that implements this brand), `Roadmap.md` (`Sprint 7.1` ships this document's requirements in code).

---

## 1. Brand Structure

```
Prodigy                    ← Parent brand (company/umbrella)
  └── PM Academy            ← Product (this codebase)
        = Prodigy PM Academy   ← Full product name, used in formal/first-reference contexts
```

- **Prodigy** is the company/umbrella brand. It exists so future products can share the parent brand without every one of them being named "PM Academy something."
- **PM Academy** is this specific product: the 90-lesson Product Management curriculum.
- **Prodigy PM Academy** is the full name — used on the marketing homepage `<title>`, in the site footer, in the certificate issuer field, in email "From" display names, and the first mention on any given page. Subsequent mentions on the same page/screen may shorten to "PM Academy" or "the Academy" for readability — this is a deliberate exception to strict full-name-everywhere branding, chosen because "Prodigy PM Academy" repeated in every UI string reads as noisy, not premium.

## 2. Naming Conventions

| Context | Use |
|---|---|
| Page `<title>`, meta tags, Open Graph | `Prodigy PM Academy — [Page-specific title]` |
| Marketing site hero, footer, About page | `Prodigy PM Academy` (full name) |
| In-app chrome (sidebar, topbar, dashboard greeting) | `PM Academy` (short form — full brand every screen is noise, not premium) |
| Certificates — issuing organization field | `Prodigy` (the company issues the credential; the curriculum is `PM Academy`) — rendered as `Issued by Prodigy · PM Academy` |
| Email "From" display name | `Prodigy PM Academy <hello@[domain]>` |
| Admin Console | `PM Academy Admin` (internal tool, short form always) |
| Legal/Terms/Privacy | `Prodigy` (the legal entity), referencing `PM Academy` as "the Service" |
| Social handles / LinkedIn company page | `Prodigy PM Academy` |

**Rule for any future second product under Prodigy:** it takes the same pattern — `Prodigy [Product Name]` — and this document is updated to list it alongside PM Academy in §1's structure diagram. Do not invent a different naming pattern per product.

## 3. Centralized Brand Configuration

Brand strings and assets must not be hardcoded per-component. A single config module is the source of truth:

```
apps/web/lib/brand.ts
```

```ts
export const BRAND = {
  company: "Prodigy",
  product: "PM Academy",
  fullName: "Prodigy PM Academy",
  shortName: "PM Academy",
  tagline: "The Duolingo of Product Management.",   // PRD.md §1 primary positioning line
  domain: "[final domain — TBD at Sprint 8.1]",
  social: {
    linkedin: "[TBD]",
    twitter: "[TBD]",
  },
  legalEntity: "Prodigy",
  certificateIssuer: "Prodigy",
} as const;
```

Every place currently hardcoding "PM Academy" (page titles, email templates, certificate templates, footer, `manifest.json`/favicon metadata) is updated in `Sprint 7.1` to import from `BRAND` instead. This is the mechanism that makes a future rename (or a future second product) a one-file change instead of a grep-and-replace across the codebase — directly serving the "solo-founder maintainability" non-functional requirement already established in `PRD.md §5`.

## 4. Logo Strategy

Two variants, used in two distinct contexts. Do not use one where the other belongs — they solve different problems (a static brand mark for contexts with no React runtime, vs. a themeable component for contexts that need to react to light/dark mode, size constraints, or loading states).

### 4.1 Variant 1 — Image Asset (static)

**Format:** SVG primary (scalable, small), PNG fallback (email clients, social previews), ICO for favicon.

**Used in:**
| Context | Notes |
|---|---|
| Marketing website | Static SVG in the header/footer; no React state needed since marketing pages are largely static/SSR |
| Certificates (PDF export) | Must be a static raster/vector embed — PDF generation (`Sprint 7.3`) can't depend on a live React component |
| Emails | Email clients don't execute JS/React — must be a hosted PNG referenced by `<img>` in every template (`Notification-Architecture.md §5`) |
| Landing page hero | Static SVG, largest rendering of the mark |
| Favicon | ICO/PNG, generated from the same master SVG at build time |
| Social assets (Open Graph image, LinkedIn share cards) | Static PNG, pre-rendered at build time, not generated per-request |

**Asset location:** `apps/web/public/brand/` — `logo-full.svg`, `logo-mark.svg` (icon-only, for favicon/small contexts), `logo-full.png` (email), `og-image.png`.

### 4.2 Variant 2 — Shared React `BrandLogo` Component

**Format:** `apps/web/components/brand/BrandLogo.tsx` — renders the SVG inline (not an `<img>` tag) so it can inherit `currentColor` for theming and animate/transition with the rest of the UI.

**Used in:**
| Context | Notes |
|---|---|
| Navigation (learner app topbar) | Needs to respond to light/dark theming via `currentColor` |
| Dashboard | Small mark variant, part of a loading-state skeleton where relevant |
| Sidebar (curriculum shell) | Collapsed-state icon-only variant vs. expanded-state full lockup — component handles both via a `variant` prop |
| Admin Console | Same component, distinct color token per `Design.md`'s Admin theming |
| Dialogs / modals | e.g., the Delete Account confirmation dialog header |
| Any other reusable in-app UI | Default choice for anything rendered inside the React tree |

**Component contract:**
```tsx
<BrandLogo variant="full" | "mark" size="sm" | "md" | "lg" />
```
`variant="mark"` is the icon-only version (used in collapsed sidebar, favicon-adjacent in-app contexts); `variant="full"` includes the wordmark. This is the only branded logo component permitted inside `apps/web/` React code — no component should inline its own `<svg>` logo markup or reference the static PNG/SVG assets directly.

## 5. Decision Rule for Future Additions

Before adding any new brand touchpoint (a new page, a new email template, a new export format): (a) does it run inside the React app? → use `BrandLogo`. (b) Does it run outside React (PDF, email, static marketing page, favicon)? → use the image asset. If genuinely unsure, default to the image asset — it's the safer, more portable choice, and downgrading from component to static asset is always possible later with no data loss, while the reverse (a PDF generator suddenly needing to execute React) is not.

---

## Changelog

- v1.0 (2026-08-06) — Initial brand architecture document, establishing Prodigy/PM Academy structure, centralized `BRAND` config, and the two-variant logo strategy, per this phase's Global Branding requirement (`Roadmap.md` Sprint 7.1).

# Design System & Visual Identity — Prodily PM Academy

**Repository:** `pmacademy-app/web`  
**Current Baseline HEAD:** `490fea37ea08813aa582fc5ebbc3896ee4eb070c`  
**Last Updated:** August 10, 2026  

---

## 1. Visual Identity & Brand Tokens

The Prodily PM Academy design system delivers a glassmorphic aesthetic built on curated color tokens (`theme/tokens.ts` and `lib/brand.ts`).

### Palette Tokens
- **Primary Brand Green**: `#019E75` (Teal Hexagonal Ring / Primary Accents)
- **Primary Dark Navy**: `#011229` (Gem Color / Dark Backgrounds)
- **Dark Surface Background**: `#050B14`
- **Card Fill / Glass Fill**: `rgba(255, 255, 255, 0.03)`
- **Border / Glass Stroke**: `rgba(255, 255, 255, 0.08)`
- **Text Primary**: `#F3F4F6`
- **Text Secondary**: `#9CA3AF`

---

## 2. Typography & Component Hierarchy

- **Font Family**: Inter (Google Fonts) with system sans-serif fallback.
- **Headings**: `h1` (28–36px, bold), `h2` (20–24px, semibold), `h3` (16–18px, medium).
- **Brand Logo Component (`BrandLogo.tsx`)**:
  - `animated-full`: Hero marketing logo with CSS ring rotation animation.
  - `full`: Static mark + wordmark for header, footer, certificates.
  - `icon`: Monochrome mark silhouette for collapsed sidebars & mobile nav.

---

## 3. Viewport & Responsive Design Requirements

Layouts are designed and tested across standard viewports:
- **Mobile Extra Small**: 360px (Samsung Galaxy / compact screens)
- **Mobile Standard**: 390px / 414px (iPhone 12 / 13 / 14 / Pro Max)
- **Tablet**: 768px / 1024px (iPad / portrait & landscape)
- **Desktop**: 1440px+ (Standard widescreen)

### Mobile Notification Center Constraint
Notification Center panel uses `position: fixed; left: 16px; right: 16px; max-width: calc(100vw - 32px)` on `<640px` viewports to guarantee 0 horizontal page overflow and zero left-edge clipping.

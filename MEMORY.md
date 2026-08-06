# Prodigy PM Academy — Project Memory Index

**Last Updated:** 2026-08-07  
**Project Stage:** Sprint 7.1 Complete — Global Branding & Documentation (brand: **Prodigy**, product: **PM Academy**)

This file is a **lightweight index** into the full memory system under `docs/memory/`. Read this first for a quick orientation, then follow the links for detailed context.

---

## Quick Orientation

**Prodigy PM Academy** is a free, structured, gamified Product Management curriculum — 90 lessons across 9 modules, built as a Next.js 16 App Router application on a ₹0-at-launch infrastructure stack.

**Current state:** All phases 0–3 and Sprints 1–7.1 are complete, including the v1.0.0-rc1 release candidate and the Sprint 7.1 global rebrand to **Prodigy** (brand) / **PM Academy** (product). The repository is ready for **Sprint 7.2 (Settings 2.0)**.

---

## Sprint 7.1 — Global Branding & Documentation (Complete)

### Prodigy Rebrand
- **Brand architecture:** `Prodigy` is the parent brand, `PM Academy` is the product, `Prodigy PM Academy` is the formal full name. Owned by [`docs/product/Brand-Architecture.md`](docs/product/Brand-Architecture.md).
- **Centralized brand config** in `apps/web/lib/brand.ts` (`BRAND` object: company, product, full name, certificate issuer lines, asset metadata) sourcing colors from `apps/web/theme/tokens.ts`.
- **`BrandLogo` component** (`apps/web/components/brand/BrandLogo.tsx`) with explicit variants: `animated-full` (hero/marketing), `full` / `static-full`, `icon` / `mark`.

### Branding Strategy (how logos are used)
- **Animated React logo** on the homepage hero only (`animated-full`).
- **Static logo components** everywhere else (navbar, sidebar, auth, admin console, certificates, emails, footer).
- **Full logo** (mark + wordmark) used only where space allows — footer, certificates, emails, marketing sections.
- **Logo-mark only** for compact UI — mobile nav, favicon, collapsed sidebar, small avatars/badges.

### Asset Strategy (SVG + PNG + favicon)
- Single source of truth: `docs/design/assets/logo.png`; canonical vector geometry extracted into `scripts/brand/mark-source.ts`.
- `scripts/brand/generate-assets.ts` (`npm run brand:generate`) emits the full bundle:
  - **SVG:** `logo-mark.svg`, `logo-mark-on-dark.svg` (monochrome-light for dark surfaces), `logo-full.svg`, `wordmark.svg`, `favicon.svg`, `safari-pinned-tab.svg`.
  - **PNG (via sharp):** `logo-mark.png`, `logo-full.png`, `og-image.png`, `icon-192.png`, `icon-512.png`, `apple-touch-icon.png`.
  - **Favicon:** `app/favicon.ico` (multi-size ICO, App Router convention), `public/favicon.svg`.
- Approved **two-tone mark**: teal hexagonal ring (`#019E75`) + dark-navy gem (`#011229`).

### Mermaid Architecture
- Mermaid diagrams are **compiled into static SVGs at build time** during the content compilation pipeline (`scripts/compiler/mermaid-svg.ts` invoked from `scripts/compiler/compile.ts`) — for both code fences and top-level `mentalModel` / `framework` blocks.
- **Runtime Mermaid rendering has been removed**: `MermaidBlock.tsx` renders the compiled static SVG inline; `MarkdownRenderer` drops raw mermaid fences; the `mermaid` npm dependency is gone.
- Parser/layout supports chained edges, subgraph grouping, TD & LR layouts, feedback loops, multi-line labels; responsive sizing with fluid scaling for narrow diagrams and horizontal scroll for wide (LR) ones.

### UI, Branding & Documentation Improvements
- Rebrand pass across every surface: marketing pages, curriculum, dashboard, auth, admin console, certificates, emails, footer/nav, portfolio.
- Metadata now token-driven: `app/layout.tsx`, `app/manifest.ts`, `app/robots.ts`, `app/sitemap.ts`, favicon/mask-icon colors sourced from `BRAND`/`TOKENS`.
- Documentation reorganized into `docs/product/`, `docs/architecture/`, `docs/development/`, `docs/design/`, `docs/roadmap/`, `docs/reports/`, `docs/archive/`; added `Brand-Architecture.md`, `Roadmap.md`, per-sprint roadmap docs (7.1–8.6), and audit reports.
- CI hardening (`.github/workflows/ci.yml`): rejects base64 data-URI SVGs in `public/` and hardcoded brand hexes outside `theme/tokens.ts`.

### Architectural Decisions (Sprint 7.1)
1. **Single source of truth for brand**: `lib/brand.ts` + `theme/tokens.ts`; no hardcoded brand hexes in components/emails.
2. **Compile-time static diagrams**: Mermaid → SVG at build time instead of client-side rendering (no runtime JS, no `ssr:false`, deterministic output, token-styled).
3. **Two-tone mark with dedicated on-dark variant** for the Admin Console (monochrome-light silhouette).
4. **favicon.ico lives only in `apps/web/app/`** (App Router auto-serve convention); `public/favicon.ico` removed.
5. **Docs reorganized by concern** (product / architecture / development / design / roadmap / reports) with `docs/INDEX.md` as the canonical entry point.

---

## Memory System

The project memory is split into focused files to prevent any single file from becoming unwieldy:

| File | What it contains |
|------|----------------|
| [`docs/memory/architecture.md`](docs/memory/architecture.md) | Core architectural invariants, locked tech stack, data model contracts, security rules, business logic module map, deployment architecture |
| [`docs/memory/implementation.md`](docs/memory/implementation.md) | Current implementation status by feature, completed sprint work, directory layout, current routing structure, build verification status |
| [`docs/memory/decisions.md`](docs/memory/decisions.md) | Major technical and product decisions with rationale, alternatives considered, and consequences |
| [`docs/memory/mistakes.md`](docs/memory/mistakes.md) | Known pitfalls, previous implementation mistakes, concrete "do not repeat" guidance |
| [`docs/memory/roadmap.md`](docs/memory/roadmap.md) | Phase-by-phase progress tracking, remaining work, milestone checklist, recommended execution sequence |

---

## Documentation Entry Point

For the full documentation map (reading order, document authority hierarchy, source-of-truth rules), see:

**→ [`docs/INDEX.md`](docs/INDEX.md)**

This is the first document any developer or AI agent should read before starting work.

---

## Non-Negotiables (5-Second Reference)

1. Lesson content → Markdown files in `content/`, compiled to static JSON. Never in Supabase.
2. Supabase → user state only (auth, profiles, progress, XP, streaks, reflections).
3. XP is append-only → write `xp_events`, never increment `users.total_xp` directly.
4. RLS on every user-owned table → same migration file as the table.
5. No AI Mentor feature — cut from v1, see `docs/product/PRD.md §11`.
6. No dark patterns — no purchasable streaks, no paywalled lessons.
7. Deploy through the pipeline → GitHub → Actions → Vercel only.
8. `SUPABASE_SERVICE_ROLE_KEY` is server-only — never in the browser.

Full rules: [`docs/development/Rules.md`](docs/development/Rules.md) | Full architecture: [`docs/architecture/Architecture.md`](docs/architecture/Architecture.md)

---

## Tech Stack (Locked)

Next.js 16 (App Router) · TypeScript 5 (strict) · Tailwind CSS v4 · shadcn/ui · Framer Motion  
Supabase (PostgreSQL + Auth) · Vercel · Resend SMTP · Google Analytics

Full stack table with free-tier ceilings: [`docs/architecture/Architecture.md §1`](docs/architecture/Architecture.md)

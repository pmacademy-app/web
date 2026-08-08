# Prodigy PM Academy — Project Memory Index

**Last Updated:** 2026-08-08  
**Project Stage:** Sprint 7.2 Complete — Settings 2.0 (brand: **Prodigy**, product: **PM Academy**)

This file is a **lightweight index** into the full memory system under `docs/memory/`. Read this first for a quick orientation, then follow the links for detailed context.

---

## Quick Orientation

**Prodigy PM Academy** is a free, structured, gamified Product Management curriculum — 90 lessons across 9 modules, built as a Next.js 16 App Router application on a ₹0-at-launch infrastructure stack.

**Current state:** All phases 0–3 and Sprints 1–7.2 are complete, including the v1.0.0-rc1 release candidate, Sprint 7.1 global rebrand, and Sprint 7.2 Settings 2.0 overhaul. The repository is ready for **Sprint 7.3 (Certificate System 2.0)**.

---

## Sprint 7.2 — Settings 2.0 (Complete)

- **Unified Settings IA (`/settings`)**: 5 tabs — `Profile`, `Security`, `Portfolio`, `Notifications`, `Danger Zone`.
- **`ConfirmDestructiveAction` Dialog**: Modal component enforcing exact-match typed confirmation keywords (`RESET`, `DELETE`, or module title) for all destructive actions.
- **Ledger-Respecting Reset Architecture (`lib/settings/settings-service.ts`)**:
  - XP reset writes a negative `xp_events` row (`source_type = 'user_reset'`) to reduce `total_xp` to 0 without violating the append-only ledger invariant.
  - Progress, Flashcards, Streak, and Skill Radar resets produce state-change audit records.
  - Delete Account flow cascades across all RLS user tables, revokes public portfolio, delinks certificates, and emits an `account.deleted` event to clear queued notifications.
- **API & Testing**: Thin API routes under `/api/settings/*`; regression unit test suite in `lib/__tests__/settings.test.ts` verifying `getAuthenticatedUserFromRequest` return type and ledger math.

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
- Mermaid diagrams are **compiled into static SVGs at build time** during content compilation (`scripts/compiler/mermaid-svg.ts` invoked from `compile.ts`) using the **official `mermaid` v11 engine inside Node.js via JSDOM**.
- **Real Engine Layout**: Preserves full 2D Dagre layout, decision diamonds, horizontal branching, curved/orthogonal arrows, sequence diagrams, and subgraphs matching original Mermaid visual structure.
- **Green/White Design System Styling**: Color tokens directly sourced from `theme/tokens.ts` (`#FFFFFF` node fills, `#166534` green borders/edges, `#1B2A21` text, `#EFF6F2` accent fills) with embedded `.dark` CSS overrides for zero-overhead dark theme switching.
- **Fluid Responsive Sizing & 100% Zoom**: Strips fixed pixel SVG `width`/`height` attributes, post-processes with fluid `viewBox`, `preserveAspectRatio="xMidYMid meet"`, and `style="width: 100%; max-width: ${naturalWidth}px; height: auto;"`, and wraps SVGs in responsive flex containers inside `MermaidBlock.tsx` (`w-full max-w-full flex justify-center`). Never causes horizontal overflow or forces ~33% browser zoom out.
- **Zero Runtime Overhead**: `MermaidBlock.tsx` renders pre-compiled static SVGs directly; zero client-side Mermaid JS runtime is shipped to the browser.
- **Cache Invalidation & Verification**: `CACHE_VERSION` bumped to `'6'`; all 90 lessons (203/203 Mermaid blocks) compiled cleanly with 0 validation errors and 14/14 compiler test passes.

### Sprint 7.1 Wrap-up Hotfixes & Rebuilds (2026-08-08)
- **Universal Mermaid Engine Rebuild**: Replaced mock string parser with real `mermaid` v11 layout engine in JSDOM, added JSDOM `CSSStyleSheet` polyfill, and added regex `cleanSource` for multi-line `%%{init}` blocks.
- **Lesson rendering**: theory tab no longer drops authored `connections`/`unlocks` content; lesson header shows the true course position (`Lesson {globalOrder}`, not per-module `order`).
- **`notification-scheduler.yml`**: required GitHub secrets `APP_URL` + `CRON_SECRET` documented; workflow falls back to canonical origin and fails loudly (`curl --fail-with-body`) instead of silently no-opping on 401s/404s.
- **`ci.yml`**: automatic triggers (push/PR to `main`) confirmed present; Sprint 7.1 brand-hardening check restored verbatim.

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

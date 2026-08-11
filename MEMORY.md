# Prodily PM Academy — Project Memory Index

**Last Updated:** August 11, 2026  
**Project Stage:** Production Baseline HEAD `875f6ba` (brand: **Prodily**, product: **PM Academy**)

This file is a **lightweight index** into the canonical documentation suite under `docs/`. Read this first for a quick orientation, then follow the links for detailed context.

---

## Quick Orientation

**Prodily PM Academy** is a free, structured, gamified Product Management curriculum — 90 lessons across 9 modules, built as a Next.js 16 App Router application on a ₹0-at-launch infrastructure stack.

**Current state:** All phases 0–3, Sprints 1–8, Quick Start tour, Header Feedback / Review trigger integration, Verification Pending signup UX, and Re-engagement Email Campaign (`reengagement_aug_2026`) are fully implemented and verified in production (100% build & lint pass rate).

---

## Recent August 2026 Updates

- **Signup Verification Pending UX**: Updated `app/(auth)/signup/page.tsx` to replace generic "Account created" messages with a dedicated **Check Your Email to Verify Your Account** screen featuring a 3-step progress pipeline (*Signup request received → Email verification pending → Account ready after confirmation*). Includes `ResendVerificationCard` (persistent 60s cooldown limit on `/api/auth/resend-verification`) and a 1-click typo recovery option (*"Entered the wrong email? Sign up again with a different address →"*).
- **Asynchronous Bounce Handling**: Documented out-of-band SMTP delivery via Resend. Bounced emails trigger an `email.bounced` event on `/api/email/webhooks` and log to `public.email_delivery_events`. Clarified that synchronous mailbox existence validation during signup is technically impossible.
- **Header Feedback / Review Integration**: Added responsive Feedback button to `components/layout/Topbar.tsx` in sequence `Search | Feedback | Notifications | Profile`. Clicking the button dispatches `learner:feedback:prompt` CustomEvent to `LearnerFeedbackProvider`, opening `ContextualFeedbackModal` for private feedback (`/api/feedback`) or public review (`/api/testimonials`).
- **Re-engagement Email Campaign (`reengagement_aug_2026`)**: Documented one-time marketing campaign targeting Audience A (0 completed lessons) and Audience B (1–5 completed lessons), excluding 6+ completed lessons. Uses Supabase as real-time source of truth immediately prior to each send, respects marketing opt-outs and `email_suppressions`, enforces idempotency, supports dry-run/test-send/production batch modes, and keeps execution code local outside version control (`.gitignore`).

---

## Sprint 7.3 — Certificate System 2.0 (Complete)

- **Additive Template Versioning Migration (`20260808000001_add_certificate_template_version.sql`)**: Added `template_version int not null default 1` to `certificates` table.
- **Versioned Renderer (`CertificateCard.tsx`)**: `templateVersion === 1` renders original legacy card layout unchanged; `templateVersion === 2` (default for newly issued certs) renders redesigned V2 layout with issuer attribution ("Issued by Prodily · PM Academy") and direct `/verify/[certificateId]` QR code.
- **LinkedIn Add to Profile Integration (`lib/certificates/linkedin-url.ts`)**: Pure function `buildLinkedInCertificationUrl` constructing LinkedIn's certification-add endpoint with pre-filled credential parameters.
- **Action Bar & Verification Embedding (`CertificateActions.tsx`)**: Added "Add to LinkedIn Profile" action button alongside PDF print/download, Web Share API, and clipboard link copying.
- **Testing & Verification**: 100% test pass rate across `test:certificates`, `test:settings`, domain engines, ESLint, and production Next.js build.

---

## Sprint 7.1 — Global Branding & Documentation (Complete)

### Prodily Rebrand
- **Brand architecture:** `Prodily` is the parent brand, `PM Academy` is the product, `Prodily PM Academy` is the formal full name. Owned by [`docs/product/Brand-Architecture.md`](docs/product/Brand-Architecture.md).
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

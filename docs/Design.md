# Prodigy PM Academy — Design System

**Status:** Unified this phase — one visual language across Learner Experience, Admin Console, Marketing Website, Certificates, Emails, Notification Panel, and Settings, per this phase's explicit requirement. Finalized as an early Sprint 7.1 deliverable (extending that sprint's brand work) precisely because several later sprints (`7.3`, `7.4`, `8.1`) depend on these tokens existing before they build against them — see `Roadmap.md`'s Gaps section, item 5.
**Companion docs:** `Brand-Architecture.md` (naming/logo — implemented visually here), `Architecture-Review-Report.md §6` (Mermaid → static SVG, styled from these tokens), `Performance-Budget-Checklist.md` (the enforcement mechanism for §4 below).

---

## 1. Design Tokens (single source: `theme/tokens.ts`)

Every surface listed in the Status line above imports from this one file. No surface defines its own color/spacing/type scale independently — this is the mechanical enforcement of "one unified design language," not just a stated intention.

```ts
export const tokens = {
  color: {
    brand: { /* primary, from Prodigy PM Academy's brand palette */ },
    semantic: {
      success: "…", warning: "…", destructive: "…",   // Danger Zone (Settings 2.0) uses `destructive`
      info: "…",
    },
    surface: { learner: "…", admin: "…", marketing: "…" },  // subtle per-context tint, same underlying scale
  },
  typography: { /* type scale shared by app, certificates, emails (email-safe font stack fallback) */ },
  spacing: { /* 4px-based scale */ },
  radius: { /* consistent corner radii across cards, dialogs, buttons */ },
} as const;
```

**Per-surface theming is a tint of the shared palette, never a separate palette.** Admin gets a subtly distinct `surface.admin` tone (operational, focused) without introducing new hues; Marketing is bolder/higher-contrast for conversion without breaking the shared brand color identity.

## 2. Information Architecture Principles

- **Dashboard vs. Progress:** one screen answers "what next," the other "how am I doing" — no element is the primary focus of both (`PRD.md §2`, enforced in `Roadmap.md` Sprint 7.6).
- **Admin: dialogs for inspection, pages for management.** Established this phase (`Architecture-Review-Report.md §2`) — a lookup (user detail) is a drawer; a workspace (Communications, Feedback moderation) is a page.
- **Settings: flat sections, not nested menus.** Profile / Security / Portfolio / Notifications / Danger Zone are peer sections, not a hierarchy — matches how infrequently most of them are visited (`Sprint 7.2`).
- **Notification Panel, not a notification page.** Transient, dismissible concerns get a slide-over, not a destination route (`Sprint 8.4`).

## 3. Component Library

Shared `shadcn/ui`-based primitives, extended (not forked) per surface:

| Component | Learner | Admin | Notes |
|---|---|---|---|
| `AdminDataTable` / `AdminKpiCard` / `AdminPageHeader` / `AdminStatusBadge` | — | ✅ | Sprint 6.4.2, gains a **drawer variant** in Sprint 7.4 for user inspection |
| `BrandLogo` | ✅ | ✅ | Sprint 7.1 — the only in-React logo path (`Brand-Architecture.md §4.2`) |
| `ConfirmDestructiveAction` | ✅ (Settings) | — | New Sprint 7.2 — typed-confirmation dialog, reused across all seven destructive actions |
| `NotificationPanel` | ✅ | — | New Sprint 8.4 — replaces the dedicated Notifications page |
| `NotificationBell` / `NotificationCenterDrawer` | ✅ | — | Sprint 6.3, retained as the panel's trigger/base |

**Rule:** a new component is added to this table the sprint it ships. A component used on only one surface still belongs here if it's shared infrastructure (e.g., `ConfirmDestructiveAction` could plausibly extend to Admin later) — this table is the map that keeps "one design language" true as the surface count grows.

## 4. Performance & Accessibility Budget

**Targets (unchanged from prior phases):** Lighthouse ≥ 90 on lesson pages; WCAG AA across the product.

**What changed this phase:** these targets stop being documented-and-assumed and become **measured and enforced**. `Security-Threat-Model.md` and `Performance-Budget-Checklist.md` (Sprint 7.5) record actual, dated Lighthouse/axe-core results per page type — including every new surface this phase adds (Settings, Certificates, Admin's new IA, Marketing v2, Notification Panel) — and are re-verified at mobile viewport widths (Sprint 8.5) and again at final launch QA (Sprint 8.6). See those documents for the live results; this section states the target, not the proof.

**Rendering strategy (unchanged):** Server Components by default; Client Components only where interactivity requires it (forms, the Notification Panel's open/close state, `SearchOverlay`); lazy-load anything not needed for first paint (the search index, the Mermaid-replaced-by-static-SVG diagrams need no client JS at all now — see §5).

## 5. Certificates

Redesigned this phase (Sprint 7.3) using the shared token set — brand color, shared type scale, `BrandLogo`'s static image-asset variant (PDF export has no React runtime, per `Brand-Architecture.md §4.1`). Layout: issuer line ("Issued by Prodigy · PM Academy"), learner name, credential details, QR code (linking to `/verify/[certificateId]`), LinkedIn add-to-profile CTA. **Versioned** — `template_version` pins historical certificates to their original render; this design system section describes `template_version = 2` (this phase's design) only. `template_version = 1`'s legacy layout is preserved in code, not deleted, and is out of scope for future design-system changes.

## 6. Marketing Website

Rebuilt this phase (Sprint 8.1) on the shared tokens: Hero, Features, Curriculum preview, Testimonials (live-sourced, §7 below), FAQ, Buy Me A Coffee, About, Contact, Privacy, Terms. Higher visual contrast/boldness than the learner app (conversion-oriented) while staying within the shared brand palette (§1) — this is the "tint, not a separate palette" rule in practice. SEO structure (structured data, sitemap, Open Graph) specified in `Sprint 8.2`, not here — this section owns visual layout only.

## 7. Emails

Templates use the email-safe fallback of the shared type scale and the static `BrandLogo` PNG asset (`Brand-Architecture.md §4.1` — email clients don't execute React). Content/sending logic is `Notification-Architecture.md`'s domain; this section owns only the visual template, which must stay visually consistent with the in-app notification content it mirrors.

## 8. Notification Panel

New this phase (Sprint 8.4). Visual spec: persistent right-side slide-over, reusing the existing `NotificationBell` trigger and `NotificationCenterDrawer`'s data-rendering logic, restyled to a persistent-panel pattern instead of a route-navigating drawer. Mobile behavior (full-screen takeover below a defined breakpoint) specified and verified in `Sprint 8.5` — this section states the desktop-primary pattern; that sprint's doc owns the mobile-specific decision explicitly rather than this doc guessing at it.

## 9. Settings

New unified IA this phase (Sprint 7.2): five peer sections (§2 above). Danger Zone uses `tokens.color.semantic.destructive` — the only surface in the product that uses this token prominently, which is deliberate: destructive-action color should be rare enough to carry real weight when it appears.

## 10. Admin Console

Visual system unchanged in its component kit (`AdminDataTable` etc., §3) but **reorganized IA** this phase (Sprint 7.4): Overview, Content, Users, Communications, Certificates, Feedback, System. `surface.admin` tint (§1) applied consistently across all seven sections — previously applied inconsistently as sections were added ad hoc sprint-by-sprint; this phase's reorganization is also the point at which visual consistency across all Admin sections is verified, not just assumed.

## 11. Accessibility Notes Specific to This Phase's New Surfaces

- **Danger Zone confirmation dialogs** must remain fully operable via screen reader and must not be obscured by the mobile keyboard when the typed-confirmation input is focused (`Sprint 7.5`, `Sprint 8.5` testing checklists both call this out explicitly — it's the single highest-stakes accessibility surface added this phase, since it gates irreversible actions).
- **Notification Panel** must not trap keyboard focus and must be dismissible via `Escape` — verified in `Sprint 7.5`/`Sprint 8.4`.

---

## Changelog

- v3.0 — Full rewrite unifying Learner/Admin/Marketing/Certificates/Emails/Notification-Panel/Settings under one token source (`theme/tokens.ts`); added component-sharing table (§3); reframed §4 (Performance & Accessibility) as measured-and-enforced via `Security-Threat-Model.md`/`Performance-Budget-Checklist.md` rather than assumed; added §5–§10 covering every new/redesigned surface this phase.
- v2.x — Prior Admin visual system (§10, Sprint 6.4.2) and IA principles (§2) preserved conceptually, reorganized into this version's structure.

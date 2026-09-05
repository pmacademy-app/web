# Design System & Visual Identity — Prodily PM Academy

**Repository:** `prodily-monorepo` (app code at `apps/web/`)
**Last Updated:** September 6, 2026  

---

## 1. Visual Identity & Brand Tokens

`theme/tokens.ts` defines **two genuinely separate palettes** — an earlier version of this document described the admin-only palette as if it were the global brand palette. They are not interchangeable; `lib/brand.ts`'s `BRAND.colors` pulls from the **main app light theme** tokens below, not the admin ones.

### Main App Palette (`TOKENS.colors` — light theme, the actual brand identity)
- **Background**: `#FBFAF6` (cream, not dark)
- **Foreground**: `#171A17` (near-black text)
- **Primary**: `#1F6B4E` (dark green)
- **Accent**: `#D98B24` (amber/orange — used for the Fellow badge)
- **Border**: `#DED8CB`

### Main App Palette (`TOKENS.colors.dark` — dark theme)
- **Background**: `#0E1110`
- **Foreground**: `#F4F1E8`
- **Primary**: `#66D6A3`
- **Border**: `#343A34`

### Admin Console Palette (`TOKENS.colors.admin` — scoped to `.admin-console`, a distinct dark UI theme)
- **Background**: `#050B14`
- **Accent**: `#019E75` (this is the exact logo-mark green — the admin console's accent, not the main app's primary)
- **Foreground**: `#F3F4F6`
- **Muted Text**: `#9CA3AF`
- **Border**: `rgba(255, 255, 255, 0.08)`

### Logo Mark Colors (used only for the literal logo graphic, everywhere it appears)
- `#019E75` (outer ring) / `#011229` (inner gem) — see `public/brand/logo-mark.svg`. `#011229` exists only as this graphic's color and a descriptive code comment — it is not an applied UI token anywhere in `theme/tokens.ts`.

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

---

## 4. Authenticated Header Navigation & Feedback Integration

The authenticated application header (`components/layout/Topbar.tsx`) features structured navigation controls designed for desktop and responsive viewports.

### A. Header Control Layout & Sequencing
Right-hand controls follow the strict visual hierarchy:  
`Search (⌘K) | Feedback | Notifications (Bell) | User Profile`

### B. Feedback / Review Trigger Button
- **Component Placement**: Rendered in `components/layout/Topbar.tsx` adjacent to the Search overlay trigger.
- **Visual Styling**: Matches header controls (`border border-input bg-card hover:bg-secondary/40 text-muted-foreground hover:text-foreground px-3.5 py-2.5 min-h-[44px] rounded-lg text-xs`).
- **Responsive Behavior**:
  - **Desktop (`md`+)**: Displays `<MessageSquare className="w-4 h-4" />` with text label `"Feedback"`.
  - **Mobile (`< md`)**: Collapses to a compact icon button with tooltip `title="Give Feedback"`, maintaining standard 44px touch targets without crowding mobile headers.

### C. Component Reuse & Event Bridge Flow
1. Learner clicks the header **Feedback** button.
2. Button dispatches a custom event: `new CustomEvent('learner:feedback:prompt', { detail: { key: 'header_feedback' } })`.
3. `LearnerFeedbackProvider` (`components/feedback/LearnerFeedbackProvider.tsx`) intercepts the event and opens `ContextualFeedbackModal` (`components/feedback/ContextualFeedbackModal.tsx`) with the title *"Share Your Feedback & Review"*.
4. **Submission Logic**: Reuses existing form handling and backend endpoints:
   - **Private Feedback**: Posts to `/api/feedback` (persisted in `public.user_feedback`).
   - **Public Review**: Posts to `/api/testimonials` (persisted in `public.testimonials` for admin moderation).
5. **Authentication Context**: Automatically inherits logged-in Supabase session headers without requiring manual user ID entry.

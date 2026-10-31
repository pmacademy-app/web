/**
 * Shared class recipes for the public marketing pages.
 *
 * ## Why this exists
 *
 * The homepage sections were written across several batches and had drifted: five
 * different h2 scales, four card radii, three primary-button shapes, and secondary copy
 * set in `text-locked`, which measures about 3.8:1 against the page background and fails
 * WCAG AA for body text.
 *
 * These are plain strings, not components, so server sections can use them without
 * crossing a client boundary and without adding a line of JavaScript to the page.
 * Anything that varies per call site (spacing, alignment) stays at the call site.
 *
 * ## Shape, depth and type rules (homepage round 2)
 *
 * - Interactive controls are pills (`rounded-full`). Plain cards stay flat (CARD).
 * - Major artefacts (mocks, bento tiles, the hero visual) use the double bezel:
 *   an outer SHELL (tinted tray, hairline ring, p-1.5, 1.5rem radius) holding a
 *   SHELL_CORE (own surface, concentric smaller radius, tinted shadow).
 * - Shadows are tinted from --color-primary (SHADOW_TINTED / SHADOW_TINTED_LG), never
 *   black and never a glow. In dark mode they sink toward green-black instead.
 * - One typeface: Inter throughout. Headlines get weight and tight tracking.
 * - Sections are separated by alternating background bands (BAND_PLAIN / BAND_MUTED);
 *   the closing band is BAND_DEEP.
 * - Motion is CSS only, transform/opacity only (Tailwind v4 translate-/scale-
 *   utilities set the `translate`/`scale` properties, so transitions list those, not
 *   `transform`), and every recipe that moves is off
 *   under prefers-reduced-motion (in the recipe or in app/globals.css).
 * - The effect recipes (SPOTLIGHT, GLARE, CONIC_BORDER, DOT_GRID, BAND_DEEP) each own
 *   a pseudo-element; see the "Marketing depth" block in app/globals.css before
 *   stacking two on one element.
 *
 * `faq`, `frameworks` and `reviews` pages import BUTTON_PRIMARY and BUTTON_SECONDARY,
 * so those names and their roles must stay stable.
 */

/** Horizontal page container shared by every marketing section. */
export const CONTAINER = 'max-w-[1120px] mx-auto px-5 lg:px-8'

/** Vertical rhythm for a standard section. Tightened in round 2 so screens carry content, not air. */
export const SECTION_Y = 'py-16 sm:py-20 lg:py-24'

/** Full-bleed section background bands. Alternate these between sections. */
export const BAND_PLAIN = 'bg-background'
export const BAND_MUTED = 'bg-surface-muted'

/** Small uppercase eyebrow label (Inter) above a section heading. Use on at most two homepage sections. */
export const EYEBROW =
  'inline-flex items-center gap-2 text-xs font-sans font-semibold uppercase tracking-[0.14em] text-primary'

/** Small leading rule that precedes eyebrow text. */
export const EYEBROW_RULE = 'h-px w-5 bg-primary/50'

/**
 * Largest type on the page: hero H1 and the belief band. About 44px on a phone,
 * 88px on a wide desktop. Two lines at most; size the copy, not the clamp.
 */
export const DISPLAY_TITLE =
  'font-display text-[clamp(2.75rem,6vw,5.5rem)] font-semibold text-foreground tracking-[-0.04em] leading-[1.02] text-balance'

/** Section h2. One scale for every section on the page: 32px to 56px. */
export const SECTION_TITLE =
  'font-display text-[clamp(2rem,4vw,3.5rem)] font-semibold text-foreground tracking-[-0.035em] leading-[1.06] text-balance'

/** Lead paragraph under a section heading. Keep it to one line of thought. */
export const SECTION_LEAD =
  'text-body sm:text-body-lg text-ink-muted leading-relaxed text-pretty max-w-[60ch]'

/** Lead under DISPLAY_TITLE (hero sub, belief band). One step larger than SECTION_LEAD. */
export const DISPLAY_LEAD =
  'text-body-lg sm:text-[1.25rem] text-ink-muted leading-relaxed text-pretty max-w-[52ch]'

/** Oversized step / ledger numeral ("01" to "09"). Pair with `aria-hidden` when the list is an <ol>. */
export const NUMERAL =
  'font-display tabular-nums text-[clamp(2.5rem,5vw,4rem)] font-semibold leading-none tracking-[-0.04em] text-primary'

/** Resting card surface for small, secondary cards. Flat: hairline border, no shadow. */
export const CARD = 'rounded-lg bg-surface border border-border'

/**
 * Hover treatment for a card that is itself a link. Flat: the border darkens and the
 * surface shifts one step; nothing lifts and nothing glows.
 */
export const CARD_INTERACTIVE = `
  transition-[background-color,border-color] duration-200 ease-out-quint
  hover:border-border-strong hover:bg-surface-muted
  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background
`

/** Primary call to action, a solid pill. Analytics-bearing links add their own tracking. */
export const BUTTON_PRIMARY = `
  group relative inline-flex items-center justify-center gap-2 h-12 px-6
  bg-primary text-primary-foreground font-semibold text-sm rounded-full whitespace-nowrap
  hover:bg-primary-hover
  active:scale-[0.97]
  transition-[background-color,scale] duration-200 ease-out-quint
  motion-reduce:transition-colors motion-reduce:active:scale-100
  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background
`

/** Secondary call to action, an outlined pill paired with BUTTON_PRIMARY. */
export const BUTTON_SECONDARY = `
  group inline-flex items-center justify-center gap-2 h-12 px-6
  bg-surface text-foreground font-semibold text-sm rounded-full whitespace-nowrap
  border border-border
  hover:border-border-strong hover:bg-surface-muted
  active:scale-[0.97]
  transition-[background-color,border-color,scale] duration-200 ease-out-quint
  motion-reduce:transition-colors motion-reduce:active:scale-100
  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background
`

/**
 * Quiet text link for secondary destinations ("Browse the curriculum", "See all
 * questions"). Underline on hover; at least 44px tall so it stays a comfortable target.
 */
export const LINK_QUIET = `
  group inline-flex items-center gap-1.5 min-h-11 text-sm font-semibold text-primary
  underline-offset-4 decoration-primary/40 hover:underline
  rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background
`

/** Static label pill ("Public portfolio", "Streaks. A daily habit..."). Not interactive. */
export const CHIP =
  'inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3.5 py-1.5 text-body-sm text-foreground'

/**
 * Two-state toggle (Skill Radar, Why before/after). Wrap the buttons in SEGMENT_GROUP
 * and give each `@/components/ui/button` SEGMENT_OPTION plus `aria-pressed`; the
 * pressed state is styled from the attribute, so no extra class juggling is needed.
 */
export const SEGMENT_GROUP =
  'inline-flex items-center gap-1 rounded-full border border-border bg-surface-muted p-1'

export const SEGMENT_OPTION = `
  min-h-11 rounded-full px-4 text-sm font-semibold text-ink-muted bg-transparent shadow-none
  hover:text-foreground hover:bg-transparent
  aria-pressed:bg-surface aria-pressed:text-foreground aria-pressed:border aria-pressed:border-border
  transition-colors duration-200 ease-out-quint
  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background
`

/** Trailing arrow that nudges right on hover of its `group` parent. */
export const ARROW_NUDGE =
  'transition-[translate] duration-200 ease-out-quint group-hover:translate-x-1 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0'

/* ─── Depth (double bezel) ─────────────────────────────────────────────────── */

/**
 * Outer tray of the double bezel: a primary-tinted surface with a hairline ring and
 * 6px of padding. Put exactly one SHELL_CORE inside. `min-w-0` keeps it from forcing
 * grid/flex tracks wider than the viewport.
 */
export const SHELL =
  'min-w-0 rounded-[1.5rem] p-1.5 ring-1 ring-border bg-[color-mix(in_oklch,var(--color-primary)_6%,var(--color-surface-muted))]'

/** Inner core of the double bezel: own surface, concentric radius (1.5rem - p-1.5), tinted shadow. */
export const SHELL_CORE =
  'min-w-0 rounded-[calc(1.5rem-0.375rem)] bg-surface border border-border/60 shadow-tinted overflow-hidden'

/** Soft primary-tinted elevation for a single surface. */
export const SHADOW_TINTED = 'shadow-tinted'

/** Deeper tinted elevation for the top sheet of a layered composition (hero cascade). */
export const SHADOW_TINTED_LG = 'shadow-tinted-lg'

/**
 * Button-in-button trailing icon holder for BUTTON_PRIMARY (and the inverse button on
 * BAND_DEEP). Wrap the arrow icon in a span with this class as the last child of a
 * `group` button; it sits flush with the pill's right padding (`-mr-3.5` against
 * px-6 / h-12) and nudges up-right on hover.
 */
export const ARROW_BUBBLE = `
  -mr-3.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full
  bg-primary-foreground/15
  transition-[translate,scale] duration-300 ease-out-quint
  group-hover:translate-x-0.5 group-hover:-translate-y-px group-hover:scale-105
  motion-reduce:transition-none motion-reduce:group-hover:translate-x-0
  motion-reduce:group-hover:translate-y-0 motion-reduce:group-hover:scale-100
`

/** ARROW_BUBBLE for light-surface buttons (BUTTON_SECONDARY): a muted circle instead of a translucent one. */
export const ARROW_BUBBLE_QUIET = `
  -mr-3.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full
  bg-surface-muted text-foreground
  transition-[translate,scale] duration-300 ease-out-quint
  group-hover:translate-x-0.5 group-hover:-translate-y-px group-hover:scale-105
  motion-reduce:transition-none motion-reduce:group-hover:translate-x-0
  motion-reduce:group-hover:translate-y-0 motion-reduce:group-hover:scale-100
`

/* ─── Surface effects (defined in app/globals.css) ─────────────────────────── */

/**
 * Deep closing band: primary background, primary-foreground text, static grain.
 * Re-points colour tokens inside itself, so text-ink-muted, border-border,
 * bg-primary-foreground / text-primary (inverse button) and focus rings stay legible
 * in light and dark. Combine with SECTION_Y at the call site.
 */
export const BAND_DEEP = 'band-deep'

/**
 * Pointer spotlight on a card. Add `data-spotlight` to the same element and wrap the
 * grid in <SpotlightGroup> (components/marketing/spotlight-group.tsx) so the glow
 * follows the pointer. Fine pointers only; off under reduced motion. Uses ::before.
 */
export const SPOTLIGHT = 'spotlight'

/** One diagonal light sweep on hover (images, sample lesson cards). Clips overflow. Uses ::after. */
export const GLARE = 'glare'

/**
 * Slowly rotating accent-to-primary ring (PM Fellow tile only). Static ring under
 * reduced motion. Give the host a border radius. Uses ::after.
 */
export const CONIC_BORDER = 'conic-border'

/** Static dot grid faded out from the upper middle. Safe on a whole section (paints on ::before). */
export const DOT_GRID = 'bg-dot-grid'

/** Highlight sweep through short label text (the hero pill only, never a heading). Plain text under reduced motion. */
export const SHINY_TEXT = 'shiny-text'

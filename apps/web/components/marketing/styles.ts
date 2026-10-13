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
 * ## Shape and type rules (homepage redesign)
 *
 * - Interactive controls are pills (`rounded-full`); surfaces are flat, square-ish
 *   cards (`rounded-lg`, hairline border, no shadow). No glow shadows anywhere.
 * - One typeface: Inter throughout. Headlines get weight and tight tracking, not a second font.
 * - Sections are separated by alternating background bands (BAND_PLAIN / BAND_MUTED),
 *   not hairline rules.
 * - Motion is CSS only, transform/opacity only, and every recipe that moves has a
 *   `motion-reduce:` fallback.
 *
 * `faq`, `frameworks` and `reviews` pages import BUTTON_PRIMARY and BUTTON_SECONDARY,
 * so those names and their roles must stay stable.
 */

/** Horizontal page container shared by every marketing section. */
export const CONTAINER = 'max-w-[1120px] mx-auto px-5 lg:px-8'

/** Vertical rhythm for a standard section. Generous, so each section reads as one idea. */
export const SECTION_Y = 'py-20 sm:py-24 lg:py-32'

/** Full-bleed section background bands. Alternate these between sections. */
export const BAND_PLAIN = 'bg-background'
export const BAND_MUTED = 'bg-surface-muted'

/** Mono eyebrow label above a section heading. Use on at most two homepage sections. */
export const EYEBROW =
  'inline-flex items-center gap-2 text-xs font-mono font-semibold uppercase tracking-[0.14em] text-primary'

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

/** Resting card surface. Flat: hairline border, no shadow. */
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
  transition-[background-color,transform] duration-200 ease-out-quint
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
  transition-[background-color,border-color,transform] duration-200 ease-out-quint
  motion-reduce:transition-colors motion-reduce:active:scale-100
  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background
`

/**
 * Quiet text link for secondary destinations ("See a real portfolio", "View the
 * curriculum"). Underline on hover; at least 44px tall so it stays a comfortable target.
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
  'transition-transform duration-200 ease-out-quint group-hover:translate-x-1 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0'

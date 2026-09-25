/**
 * Shared class recipes for the public marketing pages (UI polish pass).
 *
 * ## Why this exists
 *
 * The homepage sections were written across several batches and had drifted: five
 * different h2 scales, four card radii (`rounded-sm`, `-lg`, `-xl`, `-2xl`), three
 * primary-button shapes, and secondary copy set in `text-locked`, which measures about
 * 3.8:1 against the page background and fails WCAG AA for body text.
 *
 * These are plain strings, not components, so server sections can use them without
 * crossing a client boundary and without adding a line of JavaScript to the page.
 * Anything that varies per call site (spacing, alignment) stays at the call site.
 */

/** Horizontal page container shared by every marketing section. */
export const CONTAINER = 'max-w-[1120px] mx-auto px-5 lg:px-8'

/** Vertical rhythm for a standard section. */
export const SECTION_Y = 'py-20 lg:py-28'

/** Mono eyebrow label above a section heading. */
export const EYEBROW =
  'inline-flex items-center gap-2 text-xs font-mono font-semibold uppercase tracking-[0.14em] text-primary'

/** Small leading rule that precedes eyebrow text. */
export const EYEBROW_RULE = 'h-px w-5 bg-primary/50'

/** Section h2. One scale for every section on the page. */
export const SECTION_TITLE =
  'font-display text-[1.875rem] sm:text-h1 lg:text-display-lg font-semibold text-foreground tracking-[-0.025em] leading-[1.12] text-balance'

/** Lead paragraph under a section heading. */
export const SECTION_LEAD = 'text-body sm:text-body-lg text-ink-muted leading-relaxed text-pretty'

/** Resting card surface. */
export const CARD = 'rounded-xl bg-surface border border-border'

/**
 * Hover treatment for a card that is itself a link. A 2px lift and a soft shadow; the
 * lift is dropped for reduced-motion users, the border and shadow change is kept.
 */
export const CARD_INTERACTIVE = `
  transition-[transform,box-shadow,border-color] duration-300 ease-out-quint
  hover:-translate-y-0.5 hover:border-border-strong hover:shadow-[0_12px_32px_-12px_rgba(23,26,23,0.18)]
  motion-reduce:transition-colors motion-reduce:hover:translate-y-0
  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background
`

/** Primary call to action. The analytics-bearing links add their own onClick. */
export const BUTTON_PRIMARY = `
  group relative inline-flex items-center justify-center gap-2 h-12 px-6
  bg-primary text-primary-foreground font-semibold text-sm rounded-lg
  shadow-[0_1px_2px_rgba(23,26,23,0.12),inset_0_1px_0_rgba(255,255,255,0.18)]
  hover:bg-primary-hover hover:shadow-[0_8px_24px_-8px_rgba(31,107,78,0.55),inset_0_1px_0_rgba(255,255,255,0.18)]
  active:scale-[0.97]
  transition-[background-color,box-shadow,transform] duration-200 ease-out-quint
  motion-reduce:transition-colors motion-reduce:active:scale-100
  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background
`

/** Secondary call to action, paired with BUTTON_PRIMARY. */
export const BUTTON_SECONDARY = `
  group inline-flex items-center justify-center gap-2 h-12 px-6
  bg-surface text-foreground font-semibold text-sm rounded-lg
  border border-border shadow-xs
  hover:border-border-strong hover:bg-surface-muted
  active:scale-[0.97]
  transition-[background-color,border-color,transform] duration-200 ease-out-quint
  motion-reduce:transition-colors motion-reduce:active:scale-100
  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background
`

/** Trailing arrow that nudges right on hover of its `group` parent. */
export const ARROW_NUDGE =
  'transition-transform duration-200 ease-out-quint group-hover:translate-x-1 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0'

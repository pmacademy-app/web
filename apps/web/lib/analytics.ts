/**
 * Google Analytics 4 event tracking helpers.
 *
 * Rules:
 * - Never call window.gtag() directly in components. Use these wrappers.
 * - Never pass PII (email, name, role) in any event payload.
 * - All wrappers are null-safe: no-ops if GA is not loaded.
 */

// Extend Window type so TypeScript knows about gtag
declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void
    dataLayer?: unknown[]
  }
}

// ─── Event definitions ────────────────────────────────────────────────────────

type HeroCTALocation = 'nav' | 'hero' | 'why' | 'portfolio' | 'community' | 'final_cta'

type QuickStartMode = 'auto' | 'manual'

type EventMap = {
  waitlist_signup:          Record<string, never>
  hero_cta_click:           { location: HeroCTALocation }
  curriculum_view:          Record<string, never>
  portfolio_view:           Record<string, never>
  faq_expand:               { question_index: number }
  scroll_90_percent:        Record<string, never>
  quick_start_opened:       { mode: QuickStartMode }
  quick_start_step_viewed:  { step: number; step_title: string }
  quick_start_completed:    Record<string, never>
  quick_start_skipped:      { at_step: number }
  quick_start_reopened:     Record<string, never>
}

// ─── Core helper ──────────────────────────────────────────────────────────────

function trackEvent<K extends keyof EventMap>(
  eventName: K,
  params?: EventMap[K],
): void {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return
  window.gtag('event', eventName, params ?? {})
}

// ─── Named event functions ────────────────────────────────────────────────────

/** Fired after a successful 201 response from POST /api/waitlist. */
export function trackWaitlistSignup() {
  trackEvent('waitlist_signup')
}

/**
 * Fired when any "Join Waitlist" CTA button is clicked.
 * @param location - Which section the CTA was in
 */
export function trackHeroCTAClick(location: HeroCTALocation) {
  trackEvent('hero_cta_click', { location })
}

/** Fired once when the Curriculum section enters the viewport. */
export function trackCurriculumView() {
  trackEvent('curriculum_view')
}

/** Fired once when the Portfolio section enters the viewport. */
export function trackPortfolioView() {
  trackEvent('portfolio_view')
}

/**
 * Fired when an FAQ accordion item is opened.
 * @param questionIndex - 0-based index of the question
 */
export function trackFAQExpand(questionIndex: number) {
  trackEvent('faq_expand', { question_index: questionIndex })
}

/** Fired once when the user scrolls to 90% of the page height. */
export function trackScroll90Percent() {
  trackEvent('scroll_90_percent')
}

/** Fired when Quick Start product tour opens automatically or manually. */
export function trackQuickStartOpened(mode: QuickStartMode) {
  trackEvent('quick_start_opened', { mode })
}

/** Fired when a Quick Start step is viewed. */
export function trackQuickStartStepViewed(step: number, stepTitle: string) {
  trackEvent('quick_start_step_viewed', { step, step_title: stepTitle })
}

/** Fired when Quick Start is completed. */
export function trackQuickStartCompleted() {
  trackEvent('quick_start_completed')
}

/** Fired when Quick Start is skipped. */
export function trackQuickStartSkipped(atStep: number) {
  trackEvent('quick_start_skipped', { at_step: atStep })
}

/** Fired when Quick Start is manually reopened. */
export function trackQuickStartReopened() {
  trackEvent('quick_start_reopened')
}


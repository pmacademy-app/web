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

  // ─── Learning Lifecycle Events (Phase 1) ──────────────────────────────────
  lesson_start:             { lesson_id: string; module_slug?: string }
  theory_read:              { lesson_id: string; xp_earned?: number }
  quiz_complete:            { lesson_id: string; score: number }
  lesson_complete:          { lesson_id: string; lesson_title?: string; xp_earned?: number }
  capstone_submit:          { module_slug: string; module_title?: string }
  badge_earn:               { badge_id: string; badge_name?: string }
  level_up:                 { level: number; level_title?: string }

  // ─── First-Session Activation Events (Phase 2) ───────────────────────────
  first_session_started:    { lesson_id?: string; module_slug?: string }
  first_lesson_completed:   { lesson_id: string; xp_earned?: number }
  first_reward_celebrated:  { lesson_id: string; xp_earned?: number }
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

// ─── Learning Lifecycle Event Trackers (Phase 1) ─────────────────────────────

/** Fired when a learner opens/starts a lesson. */
export function trackLessonStarted(lessonId: string, moduleSlug?: string) {
  trackEvent('lesson_start', { lesson_id: lessonId, module_slug: moduleSlug })
}

/** Fired when a learner completes reading the theory section. */
export function trackTheoryRead(lessonId: string, xpEarned?: number) {
  trackEvent('theory_read', { lesson_id: lessonId, xp_earned: xpEarned })
}

/** Fired when a learner completes a practice quiz attempt. */
export function trackQuizCompleted(lessonId: string, score: number) {
  trackEvent('quiz_complete', { lesson_id: lessonId, score })
}

/** Fired when a lesson status transitions to completed. */
export function trackLessonCompleted(lessonId: string, lessonTitle?: string, xpEarned?: number) {
  trackEvent('lesson_complete', { lesson_id: lessonId, lesson_title: lessonTitle, xp_earned: xpEarned })
}

/** Fired when a learner submits a module capstone project. */
export function trackCapstoneSubmitted(moduleSlug: string, moduleTitle?: string) {
  trackEvent('capstone_submit', { module_slug: moduleSlug, module_title: moduleTitle })
}

/** Fired when a learner earns an achievement badge. */
export function trackBadgeEarned(badgeId: string, badgeName?: string) {
  trackEvent('badge_earn', { badge_id: badgeId, badge_name: badgeName })
}

/** Fired when a learner advances to a new level. */
export function trackLevelUp(level: number, levelTitle?: string) {
  trackEvent('level_up', { level, level_title: levelTitle })
}

// ─── First-Session Activation Trackers (Phase 2) ────────────────────────────

/** Fired when a new learner starts their first session via the kickoff card. */
export function trackFirstSessionStarted(params?: { lesson_id?: string; module_slug?: string }) {
  trackEvent('first_session_started', params)
}

/** Fired when a learner completes their very first lesson. */
export function trackFirstLessonCompleted(lessonId: string, xpEarned?: number) {
  trackEvent('first_lesson_completed', { lesson_id: lessonId, xp_earned: xpEarned })
}

/** Fired when the first-session reward celebration modal is displayed. */
export function trackFirstRewardCelebrated(lessonId: string, xpEarned?: number) {
  trackEvent('first_reward_celebrated', { lesson_id: lessonId, xp_earned: xpEarned })
}




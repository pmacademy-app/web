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

  // ─── Goal-Driven Personalization Events (Phase 3) ─────────────────────────
  goal_context_viewed:      { goal_id?: string; recommended_module?: string }

  // ─── Capstone & Proof-of-Work Events (Phase 4) ───────────────────────────
  portfolio_artifact_created:     { module_slug: string; is_public: boolean }
  portfolio_visited_from_capstone: { module_slug: string }

  // ─── Portfolio Evolution Events (Phase 5) ─────────────────────────────────
  portfolio_layout_updated:        { layout: string[] }
  portfolio_featured_capstone_set: { module_slug?: string }
  portfolio_viewed:                { username: string }

  // ─── Lesson Feedback Loop Events (Phase 6) ───────────────────────────────
  lesson_feedback_submitted:       { lesson_id: string; rating: number; tags_count: number; has_comment: boolean }

  // ─── Sharing & Referral Events (Phase 7) ──────────────────────────────────
  referral_link_copied:            { channel?: string }
  referral_shared:                 { platform: 'linkedin' | 'twitter' | 'whatsapp' | 'generic' }
  referral_signup_completed:       Record<string, never>
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

// ─── Goal-Driven Personalization Trackers (Phase 3) ─────────────────────────

/** Fired when personalized goal context is displayed on the learner dashboard. */
export function trackGoalContextViewed(goalId?: string, recommendedModule?: string) {
  trackEvent('goal_context_viewed', { goal_id: goalId, recommended_module: recommendedModule })
}

// ─── Capstone & Proof-of-Work Trackers (Phase 4) ───────────────────────────

/** Fired when a capstone submission creates/updates a portfolio artifact. */
export function trackPortfolioArtifactCreated(moduleSlug: string, isPublic: boolean) {
  trackEvent('portfolio_artifact_created', { module_slug: moduleSlug, is_public: isPublic })
}

/** Fired when a learner navigates to their portfolio directly from a capstone submission. */
export function trackPortfolioVisitedFromCapstone(moduleSlug: string) {
  trackEvent('portfolio_visited_from_capstone', { module_slug: moduleSlug })
}

// ─── Portfolio Evolution Trackers (Phase 5) ─────────────────────────────────

/** Fired when a learner updates their portfolio section layout ordering. */
export function trackPortfolioLayoutUpdated(layout: string[]) {
  trackEvent('portfolio_layout_updated', { layout })
}

/** Fired when a learner sets or updates their featured/pinned capstone deliverable. */
export function trackPortfolioFeaturedCapstoneSet(moduleSlug?: string) {
  trackEvent('portfolio_featured_capstone_set', { module_slug: moduleSlug })
}

/** Fired when a public portfolio page is viewed. */
export function trackPortfolioViewed(username: string) {
  trackEvent('portfolio_viewed', { username })
}

// ─── Lesson Feedback Loop Trackers (Phase 6) ────────────────────────────────

/** Fired when a learner submits feedback or rating for a lesson. */
export function trackLessonFeedbackSubmitted(
  lessonId: string,
  rating: number,
  tagsCount: number,
  hasComment: boolean
) {
  trackEvent('lesson_feedback_submitted', {
    lesson_id: lessonId,
    rating,
    tags_count: tagsCount,
    has_comment: hasComment,
  })
}

// ─── Sharing & Referral Trackers (Phase 7) ──────────────────────────────────

/** Fired when a learner copies their personal referral invitation link. */
export function trackReferralLinkCopied(channel = 'direct') {
  trackEvent('referral_link_copied', { channel })
}

/** Fired when a learner shares their referral link to a social platform. */
export function trackReferralShared(platform: 'linkedin' | 'twitter' | 'whatsapp' | 'generic') {
  trackEvent('referral_shared', { platform })
}

/** Fired when a learner successfully completes registration via a referral link. */
export function trackReferralSignupCompleted() {
  trackEvent('referral_signup_completed')
}








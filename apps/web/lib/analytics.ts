/**
 * Google Analytics 4 event tracking helpers.
 *
 * Rules:
 * - Never call window.gtag() directly in components. Use these wrappers.
 * - Never pass PII (email, name, role) in any event payload.
 * - All wrappers are null-safe: no-ops if GA is not loaded.
 */

import type { PortfolioNavState } from '@/lib/portfolio'
import type { AchievementCelebrationKind } from '@/lib/api/contracts/achievement-celebration'

// Extend Window type so TypeScript knows about gtag
declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void
    dataLayer?: unknown[]
  }
}

// ─── Event definitions ────────────────────────────────────────────────────────

export type HeroCTALocation = 'nav' | 'hero' | 'why' | 'portfolio' | 'community' | 'final_cta'

// ─── Marketing homepage (redesign) ───────────────────────────────────────────

/** `data-home-section` values observed by SectionViewTracker. */
export type HomeSection =
  | 'hero'
  | 'proof'
  | 'leave-with'
  | 'skill-radar'
  | 'sample-lesson'
  | 'how-it-works'
  | 'curriculum'
  | 'why'
  | 'testimonials'
  | 'faq'
  | 'final-cta'

/** Where on the homepage a secondary (non-signup) CTA sits. */
export type HomeSecondaryCTALocation =
  | 'hero'
  | 'proof'
  | 'leave_with'
  | 'sample_lesson'
  | 'how_it_works'
  | 'curriculum'
  | 'why'
  | 'check_it_yourself'
  | 'final_cta'

export type HomeSecondaryCTATarget =
  | 'sample_lesson'
  | 'curriculum'
  | 'sample_portfolio'
  | 'verify_certificate'
  | 'glossary'
  | 'frameworks'

export type RadarPreviewState = 'module_1' | 'module_9'
export type WhyCompareState = 'certificate' | 'portfolio'
export type NavSurface = 'desktop' | 'mobile'
/** Where a signed-in visitor saw the "Go to dashboard" swap of the signup CTA. */
export type DashboardCTALocation = HeroCTALocation

/**
 * `auto` = entrance auto-launch (gated off), `manual` = reopened by the learner,
 * `post_first_lesson` = deferred open after the first completed lesson (Growth R1).
 */
export type QuickStartMode = 'auto' | 'manual' | 'post_first_lesson'

export type PortfolioSharePlatform = 'linkedin' | 'x' | 'native' | 'copy'

export type AchievementCelebrationCtaAction =
  | 'add_to_linkedin'
  | 'share_portfolio'
  | 'publish_portfolio'
  | 'invite_peers'
  | 'start_capstone'
  | 'view_capstone'
  | 'continue_learning'

type EventMap = {
  waitlist_signup:          Record<string, never>
  hero_cta_click:           { location: HeroCTALocation }
  curriculum_view:          Record<string, never>
  faq_expand:               { question_index: number }
  scroll_90_percent:        Record<string, never>

  // ─── Marketing homepage (redesign) ───────────────────────────────────────
  home_section_view:           { section: HomeSection }
  home_secondary_cta_click:    { location: HomeSecondaryCTALocation; target: HomeSecondaryCTATarget }
  sample_lesson_card_click:    { lesson_slug: string; position: number }
  radar_preview_toggle:        { state: RadarPreviewState }
  why_compare_toggle:          { state: WhyCompareState }
  nav_link_click:              { label: string; href: string; surface: NavSurface }
  nav_login_click:             { surface: NavSurface }
  footer_link_click:           { group: string; label: string; href: string }
  dashboard_cta_click:         { location: DashboardCTALocation }
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
  dashboard_proof_card_clicked: {
    action:
      | 'view_portfolio'
      | 'share_portfolio'
      | 'publish_portfolio'
      | 'setup_portfolio'
      | 'view_certificates'
      | 'view_fellow_readiness'
      | 'request_fellow'
      | 'view_badges'
      | 'invite_peers'
      | 'view_progress'
    portfolio_state: 'public' | 'private' | 'none'
  }

  // ─── Capstone & Proof-of-Work Events (Phase 4) ───────────────────────────
  portfolio_artifact_created:     { module_slug: string; is_public: boolean }
  portfolio_visited_from_capstone: { module_slug: string }

  // ─── Portfolio Evolution Events (Phase 5) ─────────────────────────────────
  portfolio_layout_updated:        { layout: string[] }
  portfolio_featured_capstone_set: { module_slug?: string }
  portfolio_viewed:                { username: string }

  // ─── Lesson Feedback Loop Events (Phase 6) ───────────────────────────────
  lesson_feedback_submitted:       { lesson_id: string; rating: number; tags_count: number; has_comment: boolean }

  // ─── Re-cut Unit of Work Events (Plan Phase 4) ────────────────────────────
  // GA4 is consent-gated (correction C2), so the authoritative Phase 4 funnel is the
  // server-side one; these mirror the key moments for consenting-visitor colour. The
  // server-measurable stages (opened / theory read / completed / deep-dive marker) remain
  // the source of truth for the experiment readout.
  recut_experiment_exposed:  { lesson_id: string; variant: 'control' | 'treatment' }
  core_viewed:               { lesson_id: string; variant?: 'control' | 'treatment' }
  quiz_started:              { lesson_id: string; question_count: number }
  deep_dive_opened:          { lesson_id: string }

  // ─── Sharing & Referral Events (Phase 7) ──────────────────────────────────
  referral_modal_opened:           { source: string }
  notification_action_clicked:     { kind: 'share_portfolio' | 'link' | 'linkedin_add_to_profile' }
  referral_link_copied:            { channel?: string }
  referral_shared:                 { platform: 'linkedin' | 'twitter' | 'whatsapp' | 'generic' }
  referral_signup_completed:       Record<string, never>
  portfolio_share_clicked:         { platform: PortfolioSharePlatform }
  nav_portfolio_clicked:           { state: PortfolioNavState; surface: 'sidebar' | 'sidebar_collapsed' | 'mobile_drawer' }

  // ─── Achievement Celebration Events (Growth R1) ───────────────────────────
  achievement_celebration_viewed:      { kind: AchievementCelebrationKind }
  achievement_celebration_cta_clicked: { kind: AchievementCelebrationKind; action: AchievementCelebrationCtaAction }
}

/** Payload of `nav_portfolio_clicked`; the single source for its `state`/`surface` unions. */
export type NavPortfolioClickedParams = EventMap['nav_portfolio_clicked']

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

// ─── Marketing homepage trackers (redesign) ─────────────────────────────────
// GA4 is consent-gated, so these under-report; read them as relative signals.

/** Fired once per page view when a `[data-home-section]` block first enters the viewport. */
export function trackHomeSectionView(section: HomeSection) {
  trackEvent('home_section_view', { section })
}

/** Fired when a non-signup homepage CTA is clicked (sample lesson, curriculum, sample portfolio...). */
export function trackHomeSecondaryCTAClick(
  location: HomeSecondaryCTALocation,
  target: HomeSecondaryCTATarget,
) {
  trackEvent('home_secondary_cta_click', { location, target })
}

/** Fired when a sample lesson card is clicked. `position` is 1-based. */
export function trackSampleLessonCardClick(lessonSlug: string, position: number) {
  trackEvent('sample_lesson_card_click', { lesson_slug: lessonSlug, position })
}

/** Fired when the Skill Radar concept preview is switched between states. */
export function trackRadarPreviewToggle(state: RadarPreviewState) {
  trackEvent('radar_preview_toggle', { state })
}

/** Fired when the Why section before/after toggle is switched. */
export function trackWhyCompareToggle(state: WhyCompareState) {
  trackEvent('why_compare_toggle', { state })
}

/** Fired when a marketing nav link is clicked. */
export function trackNavLinkClick(label: string, href: string, surface: NavSurface) {
  trackEvent('nav_link_click', { label, href, surface })
}

/** Fired when the marketing nav "Log in" link is clicked. */
export function trackNavLoginClick(surface: NavSurface) {
  trackEvent('nav_login_click', { surface })
}

/** Fired when a footer link is clicked. */
export function trackFooterLinkClick(group: string, label: string, href: string) {
  trackEvent('footer_link_click', { group, label, href })
}

/** Fired when a signed-in visitor clicks the "Go to dashboard" swap of a signup CTA. */
export function trackDashboardCTAClick(location: DashboardCTALocation) {
  trackEvent('dashboard_cta_click', { location })
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

/** Fired when a learner clicks an action on the dashboard Portfolio & Proof card (no PII). */
export function trackDashboardProofCardClicked(
  action: EventMap['dashboard_proof_card_clicked']['action'],
  portfolioState: EventMap['dashboard_proof_card_clicked']['portfolio_state'],
) {
  trackEvent('dashboard_proof_card_clicked', { action, portfolio_state: portfolioState })
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

// ─── Re-cut Unit of Work Trackers (Plan Phase 4) ─────────────────────────────

/** Fired once per lesson mount with the learner's A/B variant for the recut experiment. */
export function trackRecutExperimentExposed(lessonId: string, variant: 'control' | 'treatment') {
  trackEvent('recut_experiment_exposed', { lesson_id: lessonId, variant })
}

/** Fired when the Core (theory) surface is first viewed. */
export function trackCoreViewed(lessonId: string, variant?: 'control' | 'treatment') {
  trackEvent('core_viewed', { lesson_id: lessonId, variant })
}

/** Fired when the learner opens the practice quiz, with the number of questions presented. */
export function trackQuizStarted(lessonId: string, questionCount: number) {
  trackEvent('quiz_started', { lesson_id: lessonId, question_count: questionCount })
}

/** Fired the first time the learner expands the optional Deep-dive section. */
export function trackDeepDiveOpened(lessonId: string) {
  trackEvent('deep_dive_opened', { lesson_id: lessonId })
}

// ─── Sharing & Referral Trackers (Phase 7) ──────────────────────────────────

/** Fired when a notification's second action (share, add to LinkedIn, link) is used. */
export function trackNotificationActionClicked(kind: EventMap['notification_action_clicked']['kind']) {
  trackEvent('notification_action_clicked', { kind })
}

/** Fired each time the referral share modal opens, with the surface that opened it. */
export function trackReferralModalOpened(source: string) {
  trackEvent('referral_modal_opened', { source })
}

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

/** Fired when anyone (owner or visitor) uses a share control on a public portfolio page. */
export function trackPortfolioShareClicked(platform: PortfolioSharePlatform) {
  trackEvent('portfolio_share_clicked', { platform })
}

/** Fired when a learner clicks the app-nav portfolio item ("My Portfolio" when public, "Publish portfolio" when private). No username is sent. */
export function trackNavPortfolioClicked(
  state: NavPortfolioClickedParams['state'],
  surface: NavPortfolioClickedParams['surface'],
) {
  trackEvent('nav_portfolio_clicked', { state, surface })
}

// ─── Achievement Celebration Trackers (Growth R1) ────────────────────────────

/** Fired once when the celebration modal for a certificate, published capstone or Fellow grant is shown. */
export function trackAchievementCelebrationViewed(kind: AchievementCelebrationKind) {
  trackEvent('achievement_celebration_viewed', { kind })
}

/** Fired when a learner uses a CTA in the celebration modal. No certificate code, username or notification id is sent. */
export function trackAchievementCelebrationCtaClicked(
  kind: AchievementCelebrationKind,
  action: AchievementCelebrationCtaAction,
) {
  trackEvent('achievement_celebration_cta_clicked', { kind, action })
}








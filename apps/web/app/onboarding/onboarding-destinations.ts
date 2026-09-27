/**
 * Post-onboarding destinations (Phase 3, 3.1).
 *
 * The dominant "Start Learning" CTA lands on /dashboard, which renders the
 * FirstSessionKickoffCard ("Start Your First Lesson") — the lowest-friction path to a
 * meaningful first learning action. Browsing the full curriculum at /academy (nine
 * collapsed modules) is the secondary, exploratory choice.
 *
 * Kept in a standalone module so the routing decision is unit-testable without importing
 * the full client wizard component.
 */

export const ONBOARDING_PRIMARY_DESTINATION = '/dashboard' as const
export const ONBOARDING_SECONDARY_DESTINATION = '/academy' as const

export type OnboardingDestination =
  | typeof ONBOARDING_PRIMARY_DESTINATION
  | typeof ONBOARDING_SECONDARY_DESTINATION

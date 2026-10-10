import { XP_VALUES } from '@/lib/xp/xp'

/**
 * XP the referrer earns when an invited learner completes their first lesson. This is the
 * amount lib/referral/referral-service.ts actually awards; every place that states the reward
 * reads it from here so the copy cannot drift from the award. Client-safe.
 */
export const REFERRAL_REWARD_XP = XP_VALUES.REFERRAL_ACTIVATION

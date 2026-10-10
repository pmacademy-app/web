import { XP_VALUES } from '@/lib/xp/xp'

/**
 * Default XP the referrer earns when an invited learner completes their first lesson. Admins can
 * change it (Settings → Learning → "XP per Referral"); the server resolves the live value with
 * `resolveReferralRewardXp` and sends it to every surface that states the reward, which fall
 * back to this default. Client-safe.
 */
export const REFERRAL_REWARD_XP = XP_VALUES.REFERRAL_ACTIVATION

/** Highest reward an admin setting is allowed to grant; anything else falls back to the default. */
export const MAX_REFERRAL_REWARD_XP = 10_000

/** A configured value if it is a positive whole number within bounds, otherwise the default. */
export function normalizeReferralRewardXp(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= MAX_REFERRAL_REWARD_XP
    ? value
    : REFERRAL_REWARD_XP
}

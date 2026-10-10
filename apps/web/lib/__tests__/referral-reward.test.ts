import { describe, it, expect, vi, afterEach } from 'vitest'

// Growth R5 / F6: admins set the referral reward (Settings → Learning → "XP per Referral"); the
// service awards it and every surface states it. Invalid values fall back to the default.

import { MAX_REFERRAL_REWARD_XP, REFERRAL_REWARD_XP, normalizeReferralRewardXp } from '@/lib/referral/reward'
import { resolveReferralRewardXp } from '@/lib/referral/referral-service'
import { SettingsService } from '@/lib/admin/settings-service'
import type { LearningSettings } from '@/lib/admin/types'

afterEach(() => vi.restoreAllMocks())

describe('normalizeReferralRewardXp', () => {
  it('keeps a positive whole number within bounds', () => {
    expect(normalizeReferralRewardXp(75)).toBe(75)
    expect(normalizeReferralRewardXp(MAX_REFERRAL_REWARD_XP)).toBe(MAX_REFERRAL_REWARD_XP)
  })

  it.each([0, -10, 12.5, MAX_REFERRAL_REWARD_XP + 1, '75', null, undefined, Number.NaN])(
    'falls back to the default for %s',
    (value) => {
      expect(normalizeReferralRewardXp(value)).toBe(REFERRAL_REWARD_XP)
    },
  )

  it('defaults to 50', () => {
    expect(REFERRAL_REWARD_XP).toBe(50)
  })
})

describe('resolveReferralRewardXp', () => {
  const learning = (xpReferralReward: unknown) =>
    vi.spyOn(SettingsService, 'getLearningSettings').mockResolvedValue({ xpReferralReward } as unknown as LearningSettings)

  it('returns the admin-configured reward', async () => {
    learning(75)
    await expect(resolveReferralRewardXp()).resolves.toBe(75)
  })

  it('falls back to the default for an invalid setting or a failed read', async () => {
    learning(-5)
    await expect(resolveReferralRewardXp()).resolves.toBe(REFERRAL_REWARD_XP)

    vi.spyOn(SettingsService, 'getLearningSettings').mockRejectedValue(new Error('down'))
    await expect(resolveReferralRewardXp()).resolves.toBe(REFERRAL_REWARD_XP)
  })
})

describe('admin learning settings', () => {
  it('stores the reward that will be paid, never a value the service would replace', async () => {
    vi.spyOn(SettingsService, 'getLearningSettings').mockResolvedValue({ xpReferralReward: 50 } as unknown as LearningSettings)
    const upsert = vi
      .spyOn(SettingsService as unknown as { upsertSettings: (s: string, v: unknown) => Promise<unknown> }, 'upsertSettings')
      .mockImplementation(async (_section, value) => value)

    await SettingsService.updateLearningSettings({ xpReferralReward: 0 })
    expect((upsert.mock.calls[0][1] as LearningSettings).xpReferralReward).toBe(REFERRAL_REWARD_XP)

    await SettingsService.updateLearningSettings({ xpReferralReward: 80 })
    expect((upsert.mock.calls[1][1] as LearningSettings).xpReferralReward).toBe(80)
  })
})

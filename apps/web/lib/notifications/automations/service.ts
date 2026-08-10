import { createServerSupabaseClient } from '@/lib/supabase'
import type { EmailAutomationKey, EmailAutomationMeta, EmailAutomationsState } from './types'

export const AUTOMATION_METADATA: Array<Omit<EmailAutomationMeta, 'enabled'>> = [
  // Critical Auth (Always On - Non-Toggleable)
  { key: 'auth.verify_email', name: 'Email Verification', description: 'Immediate account verification email with secure token link.', category: 'Transactional', isCritical: true },
  { key: 'auth.password_reset', name: 'Password Reset', description: 'Immediate password reset link email for recovery.', category: 'Transactional', isCritical: true },

  // Optional Transactional
  { key: 'auth.welcome', name: 'Welcome Email', description: 'Triggered exactly once upon new user account creation.', category: 'Transactional', isCritical: false },
  { key: 'learning.module_complete', name: 'Module Completion', description: 'Triggered when a learner completes a module or capstone.', category: 'Transactional', isCritical: false },
  { key: 'achievement.badge_earned', name: 'Badge Earned', description: 'Triggered when a learner earns a new achievement badge.', category: 'Transactional', isCritical: false },
  { key: 'achievement.level_up', name: 'Level Up', description: 'Triggered when a learner reaches a new XP level milestone.', category: 'Transactional', isCritical: false },
  { key: 'achievement.certificate', name: 'Certificate Generated', description: 'Triggered when a digital completion certificate is issued.', category: 'Transactional', isCritical: false },
  { key: 'achievement.portfolio_published', name: 'Portfolio Published', description: 'Triggered when a user publishes their portfolio.', category: 'Transactional', isCritical: false },

  // Scheduled Digests
  { key: 'learning.weekly_recap', name: 'Weekly Recap', description: 'Weekly summary email sent to active learners (Mondays 09:00 UTC).', category: 'Scheduled', isCritical: false },
  { key: 'learning.daily_reminder', name: 'Daily Review Reminder', description: 'Daily SRS review and streak alert sent to active learners (Daily 09:00 UTC).', category: 'Scheduled', isCritical: false },

  // Deferred Post-Launch
  { key: 'inactive.resume_learning', name: 'Resume Learning', description: 'Re-engagement prompt for inactive learners (Deferred for launch).', category: 'Scheduled', isCritical: false, isDeferred: true },
]

export const DEFAULT_AUTOMATION_TOGGLES: Record<EmailAutomationKey, boolean> = {
  'auth.verify_email': true,
  'auth.password_reset': true,
  'auth.welcome': true,
  'learning.module_complete': true,
  'achievement.badge_earned': true,
  'achievement.level_up': true,
  'achievement.certificate': true,
  'achievement.portfolio_published': true,
  'learning.weekly_recap': true,
  'learning.daily_reminder': true,
  'inactive.resume_learning': false,
}

export class EmailAutomationsService {
  /**
   * Fetches full Email Automations state from Supabase system_settings.
   */
  public static async getState(): Promise<EmailAutomationsState> {
    const supabase = createServerSupabaseClient()
    const todayKey = `email_sent_count_${new Date().toISOString().slice(0, 10).replace(/-/g, '_')}`

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: rawRows } = await (supabase.from('system_settings' as any) as any)
        .select('key, value')
        .in('key', ['email_global_pause', 'email_daily_send_limit', 'email_automations', todayKey])

      let globalPause = false
      let dailyLimit = 100
      let dailySentCount = 0
      let toggles: Record<string, boolean> = { ...DEFAULT_AUTOMATION_TOGGLES }

      const rows = (rawRows || []) as Array<{ key: string; value: unknown }>
      for (const row of rows) {
        if (row.key === 'email_global_pause' && row.value && typeof row.value === 'object') {
          globalPause = Boolean((row.value as Record<string, unknown>).enabled)
        }
        if (row.key === 'email_daily_send_limit' && row.value && typeof row.value === 'object') {
          dailyLimit = Number((row.value as Record<string, unknown>).limit) || 100
        }
        if (row.key === todayKey && row.value && typeof row.value === 'object') {
          dailySentCount = Number((row.value as Record<string, unknown>).count) || 0
        }
        if (row.key === 'email_automations' && row.value && typeof row.value === 'object') {
          toggles = { ...toggles, ...(row.value as Record<string, boolean>) }
        }
      }

      const automations: EmailAutomationMeta[] = AUTOMATION_METADATA.map((meta) => ({
        ...meta,
        enabled: meta.isCritical ? true : Boolean(toggles[meta.key] ?? DEFAULT_AUTOMATION_TOGGLES[meta.key]),
      }))

      return {
        globalPause,
        dailyLimit,
        dailySentCount,
        automations,
      }
    } catch {
      return {
        globalPause: false,
        dailyLimit: 100,
        dailySentCount: 0,
        automations: AUTOMATION_METADATA.map((meta) => ({ ...meta, enabled: meta.isCritical ? true : (DEFAULT_AUTOMATION_TOGGLES[meta.key] ?? false) })),
      }
    }
  }

  /**
   * Checks if an individual automation is enabled.
   */
  public static async isAutomationEnabled(key: EmailAutomationKey): Promise<boolean> {
    if (key === 'auth.verify_email' || key === 'auth.password_reset') return true
    const state = await this.getState()
    const automation = state.automations.find((a) => a.key === key)
    return Boolean(automation?.enabled)
  }

  /**
   * Checks if global pause is active.
   */
  public static async isGlobalPauseActive(): Promise<boolean> {
    const state = await this.getState()
    return state.globalPause
  }

  /**
   * Mutates an automation toggle, global pause, or daily send limit in Supabase.
   */
  public static async updateSetting(
    settingKey: 'toggle' | 'global_pause' | 'daily_limit',
    payload: { automationKey?: EmailAutomationKey; enabled?: boolean; limit?: number }
  ): Promise<{ success: boolean; error?: string }> {
    const supabase = createServerSupabaseClient()

    try {
      if (settingKey === 'global_pause') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase.from('system_settings' as any) as any)
          .upsert({ key: 'email_global_pause', value: { enabled: Boolean(payload.enabled) }, updated_at: new Date().toISOString() })
        if (error) return { success: false, error: error.message }
      } else if (settingKey === 'daily_limit') {
        const limitVal = Math.max(10, Math.min(1000, Number(payload.limit) || 100))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase.from('system_settings' as any) as any)
          .upsert({ key: 'email_daily_send_limit', value: { limit: limitVal }, updated_at: new Date().toISOString() })
        if (error) return { success: false, error: error.message }
      } else if (settingKey === 'toggle' && payload.automationKey) {
        if (payload.automationKey === 'auth.verify_email' || payload.automationKey === 'auth.password_reset') {
          return { success: false, error: 'Critical authentication emails cannot be disabled.' }
        }
        const state = await this.getState()
        const updatedToggles: Record<string, boolean> = {}
        state.automations.forEach((a) => {
          updatedToggles[a.key] = a.key === payload.automationKey ? Boolean(payload.enabled) : a.enabled
        })

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase.from('system_settings' as any) as any)
          .upsert({ key: 'email_automations', value: updatedToggles, updated_at: new Date().toISOString() })
        if (error) return { success: false, error: error.message }
      }

      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Database update failed' }
    }
  }
}

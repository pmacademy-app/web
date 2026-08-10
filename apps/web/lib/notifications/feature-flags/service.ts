import type { StandardFeatureFlagKey, FeatureFlagRecord } from './types'

/**
 * Default feature flag values for PM Academy Notification Platform.
 *
 * Communication strategy:
 * - In-App Notifications = Primary channel for all learning events
 * - Email = Secondary, restricted to Auth/Security + Major Milestones + Weekly Recap + Admin broadcasts
 * - Daily reminder emails are NOT supported (learner respect principle)
 * - All product announcement emails are Admin-initiated only (no automatic broadcasts)
 * - Scheduler: GitHub Actions (not Vercel Cron)
 */
export const DEFAULT_FEATURE_FLAGS: Record<string, boolean> = {
  // Global channel controls
  EMAIL_ENABLED: true,
  IN_APP_NOTIFICATIONS_ENABLED: true,
  QUEUE_PROCESSING_ENABLED: true,

  // Email scope: Only major achievement milestones (module completed, certificate, portfolio)
  // Per-lesson/badge/XP events are In-App only
  ACHIEVEMENT_EMAIL_ENABLED: true,
  PORTFOLIO_EMAILS_ENABLED: true,

  // Scheduled emails
  WEEKLY_RECAP_ENABLED: true,     // Only scheduled learner email — max once/week if meaningful activity

  // Marketing: explicit opt-in only, default OFF
  MARKETING_EMAILS_ENABLED: false,

  // Scheduled background tasks (provider-agnostic)
  SCHEDULER_ENABLED: true,
}

export class FeatureFlagService {
  private inMemoryCache: Map<string, FeatureFlagRecord> = new Map()

  constructor(initialFlags?: Record<string, boolean>) {
    const flagsToSet = initialFlags || DEFAULT_FEATURE_FLAGS
    for (const [key, enabled] of Object.entries(flagsToSet)) {
      this.inMemoryCache.set(key, {
        key,
        enabled,
        updatedAt: new Date().toISOString(),
      })
    }
  }

  /**
   * Looks up the state of a feature flag with a default fallback.
   */
  public isEnabled(key: StandardFeatureFlagKey | string, defaultValue?: boolean): boolean {
    const flag = this.inMemoryCache.get(key)
    if (flag !== undefined) {
      return flag.enabled
    }
    if (defaultValue !== undefined) {
      return defaultValue
    }
    return DEFAULT_FEATURE_FLAGS[key] ?? true
  }

  /**
   * Enables a feature flag in runtime state and persists to system_settings.
   */
  public enable(key: StandardFeatureFlagKey | string, description?: string): FeatureFlagRecord {
    const record: FeatureFlagRecord = {
      key,
      description: description || this.inMemoryCache.get(key)?.description,
      enabled: true,
      updatedAt: new Date().toISOString(),
    }
    this.inMemoryCache.set(key, record)
    this.persistToDatabase().catch((err) => console.warn('[FeatureFlagService] Non-fatal DB persist warning:', err))
    return record
  }

  /**
   * Disables a feature flag in runtime state and persists to system_settings.
   */
  public disable(key: StandardFeatureFlagKey | string, description?: string): FeatureFlagRecord {
    const record: FeatureFlagRecord = {
      key,
      description: description || this.inMemoryCache.get(key)?.description,
      enabled: false,
      updatedAt: new Date().toISOString(),
    }
    this.inMemoryCache.set(key, record)
    this.persistToDatabase().catch((err) => console.warn('[FeatureFlagService] Non-fatal DB persist warning:', err))
    return record
  }

  /**
   * Returns all active feature flags.
   */
  public getAll(): FeatureFlagRecord[] {
    return Array.from(this.inMemoryCache.values())
  }

  /**
   * Persists active feature flags to system_settings in Supabase.
   */
  private async persistToDatabase(): Promise<void> {
    try {
      const { createServerSupabaseClient } = await import('../../supabase')
      const supabase = createServerSupabaseClient()
      const flagsObj: Record<string, boolean> = {}
      for (const [k, v] of this.inMemoryCache.entries()) {
        flagsObj[k] = v.enabled
      }
      type DBChain = { upsert: (row: unknown) => Promise<{ error: unknown }> }
      await (supabase.from('system_settings') as unknown as DBChain).upsert({
        key: 'feature_flags',
        value: flagsObj,
        updated_at: new Date().toISOString(),
      })
    } catch {
      // Graceful fallback for offline / test environments
    }
  }

  /**
   * Hydrates memory cache with records from persistent storage.
   */
  public hydrate(records: FeatureFlagRecord[]): void {
    for (const r of records) {
      this.inMemoryCache.set(r.key, r)
    }
  }
}

export const globalFeatureFlagService = new FeatureFlagService()

import type { StandardFeatureFlagKey, FeatureFlagRecord } from './types'

export const DEFAULT_FEATURE_FLAGS: Record<string, boolean> = {
  EMAIL_ENABLED: true,
  WEEKLY_RECAP_ENABLED: true,
  BADGE_EMAILS_ENABLED: true,
  IN_APP_NOTIFICATIONS_ENABLED: true,
  PORTFOLIO_EMAILS_ENABLED: true,
  DAILY_REMINDERS_ENABLED: true,
  MARKETING_EMAILS_ENABLED: false,
  QUEUE_PROCESSING_ENABLED: true,
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
   * Enables a feature flag in runtime state.
   */
  public enable(key: StandardFeatureFlagKey | string, description?: string): FeatureFlagRecord {
    const record: FeatureFlagRecord = {
      key,
      description: description || this.inMemoryCache.get(key)?.description,
      enabled: true,
      updatedAt: new Date().toISOString(),
    }
    this.inMemoryCache.set(key, record)
    return record
  }

  /**
   * Disables a feature flag in runtime state.
   */
  public disable(key: StandardFeatureFlagKey | string, description?: string): FeatureFlagRecord {
    const record: FeatureFlagRecord = {
      key,
      description: description || this.inMemoryCache.get(key)?.description,
      enabled: false,
      updatedAt: new Date().toISOString(),
    }
    this.inMemoryCache.set(key, record)
    return record
  }

  /**
   * Returns all active feature flags.
   */
  public getAll(): FeatureFlagRecord[] {
    return Array.from(this.inMemoryCache.values())
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

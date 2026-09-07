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

/** How long a hydrated snapshot is trusted before the next read-through. */
const HYDRATION_TTL_MS = 10_000

let flagFailureReportInFlight = false

/**
 * Reports a flag read/write failure.
 *
 * These were previously swallowed entirely, which is the worst place to be quiet: if
 * hydration keeps failing, every instance silently serves DEFAULT_FEATURE_FLAGS and
 * the admin kill switch does nothing, with no signal that anything is wrong.
 */
async function reportFlagFailure(operation: string, summary: string, detail: string): Promise<void> {
  // Re-entrancy guard. A critical incident fans out an admin in-app notification,
  // which reads IN_APP_NOTIFICATIONS_ENABLED, which hydrates flags again — so a
  // sustained database outage could otherwise re-enter this path. Incident dedup
  // would eventually break the cycle, but relying on that is timing-dependent.
  if (flagFailureReportInFlight) return
  flagFailureReportInFlight = true

  try {
    const { logErrorReport } = await import('@/lib/monitoring/logger')
    await logErrorReport({
      domain: 'admin',
      kind: 'db_unavailable',
      operation,
      summary,
      nextAction:
        'Feature flags are falling back to compiled defaults, so admin toggles have no effect. Check Supabase availability and the system_settings table.',
      details: { detail },
    })
  } catch {
    // Never let instrumentation break flag resolution.
  } finally {
    flagFailureReportInFlight = false
  }
}

export class FeatureFlagService {
  private inMemoryCache: Map<string, FeatureFlagRecord> = new Map()
  /** Epoch ms of the last successful DB hydration; 0 means never hydrated. */
  private hydratedAt = 0
  /** In-flight hydration, so concurrent callers share one query. */
  private hydrationPromise: Promise<void> | null = null

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
   * Reads the persisted flag set from `system_settings.feature_flags`, refreshing the
   * in-memory cache when the current snapshot is older than the TTL.
   *
   * This is what makes a flag toggle actually take effect. Each serverless instance
   * used to start from `DEFAULT_FEATURE_FLAGS` and never read the database, so an
   * admin disabling EMAIL_ENABLED only mutated the memory of whichever instance served
   * that request — the cron instance running the queue kept the default `true` and
   * kept sending. There was no working kill switch.
   *
   * Failures leave the current cache in place and do NOT mark the snapshot fresh, so
   * the next call retries rather than pinning stale values.
   */
  public async ensureHydrated(force = false): Promise<void> {
    if (!force && Date.now() - this.hydratedAt < HYDRATION_TTL_MS) return
    if (this.hydrationPromise) return this.hydrationPromise

    this.hydrationPromise = this.loadFromDatabase().finally(() => {
      this.hydrationPromise = null
    })
    return this.hydrationPromise
  }

  private async loadFromDatabase(): Promise<void> {
    try {
      const { createServiceRoleClient } = await import('../../supabase')
      const supabase = createServiceRoleClient()
      const { data, error } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'feature_flags')
        .maybeSingle()

      if (error) {
        await reportFlagFailure('config.flag_hydrate', 'Feature flags could not be read from the database', error.message)
        return
      }

      const value = (data as { value?: unknown } | null)?.value
      if (value && typeof value === 'object') {
        const updatedAt = new Date().toISOString()
        for (const [key, enabled] of Object.entries(value as Record<string, unknown>)) {
          this.inMemoryCache.set(key, {
            key,
            description: this.inMemoryCache.get(key)?.description,
            enabled: Boolean(enabled),
            updatedAt,
          })
        }
      }
      // A row that is absent or empty is a legitimate "no overrides" answer, so the
      // defaults stand and the snapshot still counts as fresh.
      this.hydratedAt = Date.now()
    } catch (err) {
      // Offline / test environments: keep serving the current cache. Still reported —
      // a flag read that never succeeds means the kill switch is silently inert.
      await reportFlagFailure(
        'config.flag_hydrate',
        'Feature flags could not be read from the database',
        err instanceof Error ? err.message : String(err)
      )
    }
  }

  /**
   * Hydrate-then-read. Prefer this over `isEnabled()` anywhere the answer gates real
   * behavior (sending mail, processing the queue) rather than just rendering a value.
   */
  public async isEnabledAsync(key: StandardFeatureFlagKey | string, defaultValue?: boolean): Promise<boolean> {
    await this.ensureHydrated()
    return this.isEnabled(key, defaultValue)
  }

  /**
   * Sets a flag and persists it, hydrating first so the write merges onto the current
   * persisted set instead of overwriting it with this instance's stale defaults.
   */
  public async setFlag(
    key: StandardFeatureFlagKey | string,
    enabled: boolean,
    description?: string
  ): Promise<FeatureFlagRecord> {
    await this.ensureHydrated(true)
    const record: FeatureFlagRecord = {
      key,
      description: description || this.inMemoryCache.get(key)?.description,
      enabled,
      updatedAt: new Date().toISOString(),
    }
    this.inMemoryCache.set(key, record)
    await this.persistToDatabase()
    this.hydratedAt = Date.now()
    return record
  }

  /**
   * Enables a feature flag in runtime state and persists to system_settings.
   *
   * Synchronous legacy entry point — prefer `setFlag()`, which merges onto the
   * persisted set before writing.
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
   *
   * Synchronous legacy entry point — prefer `setFlag()`.
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
      const { createServiceRoleClient } = await import('../../supabase')
      const supabase = createServiceRoleClient()
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
    } catch (err) {
      // Graceful fallback for offline / test environments.
      await reportFlagFailure(
        'config.flag_persist',
        'Feature flag change could not be persisted',
        err instanceof Error ? err.message : String(err)
      )
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

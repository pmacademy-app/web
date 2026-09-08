# ADR-003: Database-backed feature-flag control plane

## Status
Accepted

## Date
2026-09-07

## Context

`FeatureFlagService` (`apps/web/lib/notifications/feature-flags/service.ts`) was a per-process in-memory `Map` seeded from `DEFAULT_FEATURE_FLAGS`. Writes persisted to `system_settings.feature_flags`, but `hydrate()` had exactly one call site — `AdminConsoleService.getFeatureFlags()` — and none of the enforcement points read from the database.

On serverless this produced two failures:

1. **The email kill switch did not work.** An admin disabling `EMAIL_ENABLED` mutated the memory of whichever instance served that request. The GitHub Actions cron that runs `processEmailQueue()` hits a different instance, which reads `DEFAULT_FEATURE_FLAGS.EMAIL_ENABLED = true` and keeps sending. There was no working way to stop outbound email from the admin panel — the control an operator would reach for first during an incident like 2026-09-06.

2. **The console showed defaults as if they were saved state.** `SettingsService.getFeatureFlags()` returned `getAll()` without hydrating, so `/admin/settings?section=feature-flags` rendered `DEFAULT_FEATURE_FLAGS` on any cold instance and a saved toggle appeared to revert.

## Decision

Read through to the database, with a short TTL cache.

- `ensureHydrated()` refreshes from `system_settings.feature_flags` when the current snapshot is older than **10 seconds**, and shares one in-flight query between concurrent callers.
- `isEnabledAsync()` hydrates then reads. The three enforcement points use it: `enqueueNotificationItem` (`EMAIL_ENABLED`), `processEmailQueue` (`QUEUE_PROCESSING_ENABLED`), and `createInAppNotification` / `GET /api/notifications` (`IN_APP_NOTIFICATIONS_ENABLED`).
- `setFlag()` hydrates before merging, so a write cannot overwrite other flags with this instance's stale defaults. The admin write paths use it.
- Hydration failures leave the current cache in place and do **not** mark the snapshot fresh, so the next call retries rather than pinning stale values. The failure is reported (ADR-004) instead of being swallowed, because a flag read that never succeeds means every instance is silently serving compiled defaults.
- The synchronous `isEnabled()` remains for display-only callers.

## Alternatives Considered

### Make `isEnabled()` async everywhere
- Rejected: it is called from render paths and from services where an await is not free, and most callers only display a value. Only the points that *gate behaviour* need the guarantee.

### No cache — query on every check
- Rejected: `processEmailQueue` checks flags per batch and `enqueueNotificationItem` per item. A query per check adds latency to the hot path for a value that changes rarely.

### Push invalidation (webhook or realtime) instead of polling
- Rejected as premature. A 10-second staleness window is well inside the human timescale of an operator flipping a kill switch, and the added infrastructure would need its own failure handling.

## Consequences

- A flag change takes effect across every instance within ~10 seconds.
- `toggleFeatureFlag` is now async on `AdminConsoleService` and `AdminFoundationService`; the interface in `lib/notifications/admin/types.ts` was updated to match.
- Settings that persist without a runtime consumer were removed from the admin UI in the same body of work — see [`ADMIN_PANEL.md`](../ADMIN_PANEL.md) and [`admin/platform-settings.md`](../admin/platform-settings.md). The control plane is only trustworthy if every visible control does something.

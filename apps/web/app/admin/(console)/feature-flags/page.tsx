import { redirect } from 'next/navigation'

/**
 * Legacy feature-flags route — superseded by Settings workspace (Phase 8).
 * Feature flags are now managed in /admin/settings?section=feature-flags.
 */
export default function LegacyFeatureFlagsPage() {
  redirect('/admin/settings?section=feature-flags')
}

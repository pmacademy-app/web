import { redirect } from 'next/navigation'

/**
 * Legacy content/curriculum page.
 *
 * The new Admin Panel IA does not include a standalone /admin/content route:
 *   - Curriculum metrics → /admin/curriculum
 *   - Feature flags       → /admin/settings?section=feature-flags
 *   - Marketing controls  → not implemented (future scope)
 *
 * This redirect preserves old bookmarks without keeping a dead nav entry.
 */
export default function LegacyContentPage() {
  redirect('/admin/curriculum')
}

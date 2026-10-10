/**
 * The optional second action on an in-app notification (Growth R5 / B0).
 *
 * Stored as jsonb in `in_app_notifications.secondary_action` and validated here on every read:
 * the column is free-form, so anything that is not exactly one of these shapes is dropped and
 * the notification renders without it. Client-safe (no imports).
 */

export type NotificationSecondaryAction =
  /** Share the learner's public portfolio (LinkedIn, X, native, copy). */
  | { kind: 'share_portfolio'; label: string; username: string; context: 'portfolio' | 'fellow' }
  /** Share the public portfolio with wording about one earned badge. */
  | { kind: 'share_portfolio'; label: string; username: string; context: 'badge'; badgeName: string }
  /** Share one public capstone page (Growth R5 B13b). */
  | { kind: 'share_portfolio'; label: string; username: string; context: 'capstone'; moduleSlug: string; capstoneTitle: string }
  /** An in-app page, e.g. "Publish portfolio". Always a same-origin path. */
  | { kind: 'link'; label: string; href: string }
  /** LinkedIn "Add to profile" for a certificate. Only https links on linkedin.com. */
  | { kind: 'linkedin_add_to_profile'; label: string; url: string }

const MAX_LABEL = 40
const MAX_BADGE_NAME = 60
const MAX_CAPSTONE_TITLE = 120
const SLUG = /^[a-z0-9_-]{1,64}$/
const USERNAME = /^[a-z0-9_.-]{1,64}$/i

const isLabel = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= MAX_LABEL

/** Same-origin app path: one leading slash, no protocol-relative `//host` or backslash tricks. */
const isAppPath = (value: unknown): value is string =>
  typeof value === 'string' && /^\/(?![/\\])[^\s]*$/.test(value) && value.length <= 512

function isLinkedInHttpsUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048) return false
  try {
    const url = new URL(value)
    // Only the add-to-profile endpoint: this kind exists for certificates and nothing else.
    return (
      url.protocol === 'https:' &&
      (url.hostname === 'linkedin.com' || url.hostname === 'www.linkedin.com') &&
      url.pathname === '/profile/add'
    )
  } catch {
    return false
  }
}

/** The action stored in a row, or null when it is absent or not a shape this app understands. */
export function parseNotificationSecondaryAction(value: unknown): NotificationSecondaryAction | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const action = value as Record<string, unknown>
  if (!isLabel(action.label)) return null

  switch (action.kind) {
    case 'share_portfolio':
      if (typeof action.username !== 'string' || !USERNAME.test(action.username)) return null
      if (action.context === 'capstone') {
        const moduleSlug = typeof action.moduleSlug === 'string' ? action.moduleSlug : ''
        const capstoneTitle = typeof action.capstoneTitle === 'string' ? action.capstoneTitle.trim() : ''
        if (!SLUG.test(moduleSlug) || !capstoneTitle || capstoneTitle.length > MAX_CAPSTONE_TITLE) return null
        return { kind: 'share_portfolio', label: action.label, username: action.username, context: 'capstone', moduleSlug, capstoneTitle }
      }
      if (action.context === 'badge') {
        const badgeName = typeof action.badgeName === 'string' ? action.badgeName.trim() : ''
        if (!badgeName || badgeName.length > MAX_BADGE_NAME) return null
        return { kind: 'share_portfolio', label: action.label, username: action.username, context: 'badge', badgeName }
      }
      return {
        kind: 'share_portfolio',
        label: action.label,
        username: action.username,
        context: action.context === 'fellow' ? 'fellow' : 'portfolio',
      }
    case 'link':
      return isAppPath(action.href) ? { kind: 'link', label: action.label, href: action.href } : null
    case 'linkedin_add_to_profile':
      return isLinkedInHttpsUrl(action.url) ? { kind: 'linkedin_add_to_profile', label: action.label, url: action.url } : null
    default:
      return null
  }
}

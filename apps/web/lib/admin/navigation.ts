import {
  LayoutDashboard,
  Users,
  UserCheck,
  MessagesSquare,
  ShieldAlert,
  BookOpen,
  Award,
  Trophy,
  Activity,
  Gauge,
  Filter,
  Settings,
  type LucideIcon,
} from 'lucide-react'

/**
 * Admin navigation data model — final IA (Phase 1 shell).
 *
 * `built` marks routes that exist today. Unbuilt sections stay hidden in the
 * sidebar until their phase lands (no dead links / redirect stubs in nav).
 *
 * Phase 5 navigation decision (spec §5.1 vs §5.7): the UI/UX spec lists
 * Capstones and Portfolios under the Achievements section, while the
 * implementation plan §5.7 places them as Moderation workspace tabs. The
 * implementation follows §5.7 — Capstones and Portfolios are reviewed inside
 * `/admin/moderation` (where the review workflows live), and the Achievements
 * overview tiles link out to them. They are intentionally NOT duplicated as
 * sidebar entries to avoid two routes to the same review surface.
 */
export interface AdminNavItem {
  name: string
  href: string
  icon: LucideIcon
  badge?: string
  built: boolean
}

export interface AdminNavGroup {
  label: string
  items: AdminNavItem[]
}

export const ADMIN_NAV: AdminNavGroup[] = [
  {
    label: 'Overview',
    items: [{ name: 'Dashboard', href: '/admin', icon: LayoutDashboard, built: true }],
  },
  {
    label: 'Operations',
    items: [
      { name: 'Users', href: '/admin/users', icon: Users, built: true },
      { name: 'Communications', href: '/admin/communications', icon: MessagesSquare, built: true },
      { name: 'Moderation', href: '/admin/moderation', icon: ShieldAlert, built: true },
    ],
  },
  {
    label: 'Learning',
    items: [
      { name: 'Curriculum', href: '/admin/curriculum', icon: BookOpen, built: true },
      { name: 'Achievements', href: '/admin/achievements', icon: Award, built: true },
      { name: 'Leaderboard', href: '/admin/leaderboard', icon: Trophy, built: true },
    ],
  },
  {
    label: 'Insights',
    items: [
      { name: 'Analytics', href: '/admin/analytics', icon: Gauge, built: true },
      { name: 'Activation Funnel', href: '/admin/analytics/funnel', icon: Filter, built: true },
    ],
  },
  {
    label: 'System',
    items: [{ name: 'System', href: '/admin/system', icon: Activity, built: true }],
  },
  {
    label: 'Settings',
    items: [
      { name: 'Settings', href: '/admin/settings', icon: Settings, built: true },
      { name: 'Onboarding', href: '/admin/settings?section=onboarding', icon: UserCheck, built: true }
    ],
  },
]


/** Only navigation entries backed by a real page today. */
export const ADMIN_NAV_BUILT = ADMIN_NAV.map((group) => ({
  label: group.label,
  items: group.items.filter((item) => item.built),
})).filter((group) => group.items.length > 0)

/** All nav hrefs, longest first — used to resolve the most specific active match. */
const ALL_NAV_HREFS = ADMIN_NAV.flatMap((group) => group.items.map((item) => item.href)).sort(
  (a, b) => b.length - a.length
)

/**
 * Lookup helper: is `pathname` the active route for a nav item?
 *
 * Exact matches always win. For prefix matches, the most specific nav href wins, so a
 * nested route like `/admin/analytics/funnel` highlights only "Activation Funnel" and not
 * its parent "Analytics" — while `/admin/users/[id]` still keeps "Users" highlighted
 * because no deeper nav item claims that path.
 */
export function isAdminNavItemActive(item: AdminNavItem, pathname: string) {
  if (item.href === '/admin') return pathname === '/admin'
  if (pathname === item.href) return true
  if (!pathname.startsWith(`${item.href}/`)) return false
  // A longer nav href that also prefixes this path is the more specific owner.
  const moreSpecific = ALL_NAV_HREFS.find(
    (href) =>
      href.length > item.href.length &&
      (pathname === href || pathname.startsWith(`${href}/`))
  )
  return !moreSpecific
}

/** Current top-level section label for breadcrumbs ("Operations / Users"). */
export function getAdminSectionLabel(pathname: string): string | undefined {
  for (const group of ADMIN_NAV) {
    const match = group.items.find((item) => isAdminNavItemActive(item, pathname))
    if (match) return group.label
  }
  return undefined
}

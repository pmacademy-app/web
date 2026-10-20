/**
 * Navigation and footer link definitions.
 *
 * Header: the flagship destinations only. Contact lives in the footer.
 * Footer: each href appears in one group. The 'Resources' heading and its
 * /curriculum, /frameworks and /lessons/lesson-001 links are asserted by
 * lib/__tests__/seo-social-metadata.test.ts, so keep them.
 */

import type { NavLink, FooterLinkGroup } from '@/types'

export const NAV_LINKS: NavLink[] = [
  { label: 'Curriculum', href: '/curriculum', weight: 'primary' },
  { label: 'Portfolio', href: '/#portfolio', weight: 'secondary' },
  { label: 'Frameworks', href: '/frameworks', weight: 'secondary' },
  { label: 'About', href: '/about', weight: 'secondary' },
  { label: 'FAQ', href: '/faq', weight: 'tertiary' },
]

/** Sign-in route for returning learners (app/(auth)/login). */
export const LOGIN_HREF = '/login'

/** Where a signed-in visitor goes instead of signup. */
export const DASHBOARD_HREF = '/dashboard'

export const FOOTER_LINK_GROUPS: FooterLinkGroup[] = [
  {
    heading: 'Product',
    links: [
      { label: 'How it works', href: '/#how-it-works' },
      { label: 'Portfolio', href: '/#portfolio' },
    ],
  },
  {
    heading: 'Company',
    links: [
      { label: 'About', href: '/about' },
      { label: 'Contact', href: '/contact' },
      { label: 'FAQ', href: '/faq' },
    ],
  },
  {
    heading: 'Resources',
    links: [
      { label: 'Curriculum', href: '/curriculum' },
      { label: 'Frameworks', href: '/frameworks' },
      { label: 'Preview a Lesson', href: '/lessons/lesson-001' },
      { label: 'Reviews', href: '/reviews' },
      { label: 'Support the mission', href: 'https://buymeacoffee.com/prodily' },
    ],
  },
  {
    heading: 'Legal',
    links: [
      { label: 'Privacy', href: '/privacy' },
      { label: 'Terms', href: '/terms' },
    ],
  },
]

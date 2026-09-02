/**
 * Navigation and footer link definitions.
 * Labels and hrefs are verbatim from Sprint 3 §3 navigation copy.
 */

import type { NavLink, FooterLinkGroup } from '@/types'

export const NAV_LINKS: NavLink[] = [
  { label: 'Curriculum', href: '/curriculum', weight: 'primary' },
  { label: 'Frameworks', href: '/frameworks', weight: 'secondary' },
  { label: 'About', href: '/about', weight: 'secondary' },
  { label: 'Contact', href: '/contact', weight: 'tertiary' },
  { label: 'FAQ', href: '/faq', weight: 'tertiary' },
]

export const FOOTER_LINK_GROUPS: FooterLinkGroup[] = [
  {
    heading: 'Product',
    links: [
      { label: 'Curriculum', href: '/curriculum' },
      { label: 'Frameworks', href: '/frameworks' },
      { label: 'Portfolio', href: '/#portfolio' },
      { label: 'Learning Journey', href: '/#journey' },
    ],
  },
  {
    heading: 'Company',
    links: [
      { label: 'About', href: '/about' },
      { label: 'Reviews', href: '/reviews' },
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

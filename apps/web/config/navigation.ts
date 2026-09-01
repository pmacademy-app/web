/**
 * Navigation and footer link definitions.
 * Labels and hrefs are verbatim from Sprint 3 §3 navigation copy.
 */

import type { NavLink, FooterLinkGroup } from '@/types'

export const NAV_LINKS: NavLink[] = [
  { label: 'Curriculum', href: '/curriculum', weight: 'primary' },
  { label: 'Frameworks', href: '/frameworks', weight: 'secondary' },
  { label: 'Reviews', href: '/reviews', weight: 'secondary' },
  { label: 'About', href: '/about', weight: 'secondary' },
  { label: 'Contact', href: '/contact', weight: 'tertiary' },
  { label: 'FAQ', href: '/faq', weight: 'tertiary' },
]

export const FOOTER_LINK_GROUPS: FooterLinkGroup[] = [
  {
    heading: 'Resources',
    links: [
      { label: 'Curriculum', href: '/curriculum' },
      { label: 'Frameworks & Models', href: '/frameworks' },
      { label: 'Reviews & Feedback', href: '/reviews' },
      { label: 'Preview Sample Lesson', href: '/lessons/lesson-001' },
      { label: 'Buy Me a Coffee', href: 'https://buymeacoffee.com/prodily' },
    ],
  },
  {
    heading: 'Product',
    links: [
      { label: 'Learning Experience', href: '/#experience' },
      { label: 'Portfolio Artifacts', href: '/#portfolio' },
      { label: 'Learning Journey', href: '/#journey' },
    ],
  },
  {
    heading: 'Company',
    links: [
      { label: 'Home', href: '/' },
      { label: 'About', href: '/about' },
      { label: 'Reviews', href: '/reviews' },
      { label: 'Contact', href: '/contact' },
      { label: 'FAQ', href: '/faq' },
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

/**
 * Navigation and footer link definitions.
 * Labels and hrefs are verbatim from Sprint 3 §3 navigation copy.
 */

import type { NavLink, FooterLinkGroup } from '@/types'

export const NAV_LINKS: NavLink[] = [
  { label: 'Home', href: '/' },
  { label: 'Curriculum', href: '/curriculum' },
  { label: 'About', href: '/about' },
  { label: 'Contact', href: '/contact' },
  { label: 'FAQ', href: '/#faq' },
]

export const FOOTER_LINK_GROUPS: FooterLinkGroup[] = [
  {
    heading: 'Resources',
    links: [
      { label: 'Curriculum', href: '/curriculum' },
      { label: 'Preview Sample Lesson', href: '/lessons/lesson-001' },
      { label: 'Buy Me a Coffee', href: 'https://buymeacoffee.com/prodily' },
    ],
  },
  {
    heading: 'Product',
    links: [
      { label: 'Learning Experience', href: '/#experience' },
      { label: 'Skill Radar', href: '/#skill-radar' },
      { label: 'Portfolio', href: '/#portfolio' },
    ],
  },
  {
    heading: 'Company',
    links: [
      { label: 'Home', href: '/' },
      { label: 'About', href: '/about' },
      { label: 'Contact', href: '/contact' },
      { label: 'FAQ', href: '/#faq' },
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

/**
 * Navigation and footer link definitions.
 * Labels and hrefs are verbatim from Sprint 3 §3 navigation copy.
 */

import type { NavLink, FooterLinkGroup } from '@/types'

export const NAV_LINKS: NavLink[] = [
  { label: 'Curriculum',          href: '/#curriculum',   futureRoute: '/curriculum' },
  { label: 'Learning Experience', href: '/#experience',   futureRoute: '/experience' },
  { label: 'Portfolio',           href: '/#portfolio',    futureRoute: '/portfolio' },
  { label: 'About',               href: '/#why',          futureRoute: '/about' },
  { label: 'FAQ',                 href: '/#faq',          futureRoute: '/faq' },
]

export const FOOTER_LINK_GROUPS: FooterLinkGroup[] = [
  {
    heading: 'Resources',
    links: [
      { label: 'Curriculum',     href: '/#curriculum' },
      { label: 'Sample Lessons', href: '/#experience' },
      { label: 'Glossary',       href: '/#curriculum' },
      { label: 'Updates',        href: '/#waitlist' },
    ],
  },
  {
    heading: 'Product',
    links: [
      { label: 'Learning Experience', href: '/#experience' },
      { label: 'Skill Radar',         href: '/#skill-radar' },
      { label: 'Portfolio',           href: '/#portfolio' },
    ],
  },
  {
    heading: 'Company',
    links: [
      { label: 'About',   href: '/#why' },
      { label: 'Contact', href: 'mailto:hello@pmacademy.com' },
      { label: 'FAQ',     href: '/#faq' },
    ],
  },
  {
    heading: 'Legal',
    links: [
      { label: 'Privacy', href: '/privacy' },
      { label: 'Terms',   href: '/terms' },
    ],
  },
]

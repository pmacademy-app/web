'use client'

/**
 * A `next/link` that fires one homepage analytics event on click.
 *
 * Server sections cannot pass an `onClick` across the client boundary, so instead
 * of a function prop this takes a serialisable description of the event: an
 * `event` name plus a plain `args` object. The pair is a discriminated union, so
 * TypeScript checks the args for each event. The mapping to the named helpers in
 * `lib/analytics.ts` lives here, and components never call gtag directly.
 *
 *   <TrackedLink
 *     href={SAMPLE_PORTFOLIO_PATH}
 *     event="home_secondary_cta_click"
 *     args={{ location: 'proof', target: 'sample_portfolio' }}
 *   >
 *
 * Events whose payload includes the destination (`nav_link_click`,
 * `footer_link_click`) read it from `href`, so it cannot drift from the link.
 */

import Link from 'next/link'
import type { ComponentProps } from 'react'

import {
  trackDashboardCTAClick,
  trackFooterLinkClick,
  trackHeroCTAClick,
  trackHomeSecondaryCTAClick,
  trackNavLinkClick,
  trackNavLoginClick,
  trackSampleLessonCardClick,
  type DashboardCTALocation,
  type HeroCTALocation,
  type HomeSecondaryCTALocation,
  type HomeSecondaryCTATarget,
  type NavSurface,
} from '@/lib/analytics'

export type TrackedLinkEvent =
  | { event: 'hero_cta_click'; args: { location: HeroCTALocation } }
  | { event: 'dashboard_cta_click'; args: { location: DashboardCTALocation } }
  | {
      event: 'home_secondary_cta_click'
      args: { location: HomeSecondaryCTALocation; target: HomeSecondaryCTATarget }
    }
  | { event: 'sample_lesson_card_click'; args: { lessonSlug: string; position: number } }
  | { event: 'nav_link_click'; args: { label: string; surface: NavSurface } }
  | { event: 'nav_login_click'; args: { surface: NavSurface } }
  | { event: 'footer_link_click'; args: { group: string; label: string } }

type LinkProps = Omit<ComponentProps<typeof Link>, 'href' | 'onClick'>

export type TrackedLinkProps = LinkProps & { href: string } & TrackedLinkEvent

function fire(e: TrackedLinkEvent, href: string): void {
  switch (e.event) {
    case 'hero_cta_click':
      return trackHeroCTAClick(e.args.location)
    case 'dashboard_cta_click':
      return trackDashboardCTAClick(e.args.location)
    case 'home_secondary_cta_click':
      return trackHomeSecondaryCTAClick(e.args.location, e.args.target)
    case 'sample_lesson_card_click':
      return trackSampleLessonCardClick(e.args.lessonSlug, e.args.position)
    case 'nav_link_click':
      return trackNavLinkClick(e.args.label, href, e.args.surface)
    case 'nav_login_click':
      return trackNavLoginClick(e.args.surface)
    case 'footer_link_click':
      return trackFooterLinkClick(e.args.group, e.args.label, href)
  }
}

export function TrackedLink(props: TrackedLinkProps) {
  const { event, args, href, ...rest } = props
  return (
    <Link
      {...rest}
      href={href}
      onClick={() => fire({ event, args } as TrackedLinkEvent, href)}
    />
  )
}

import Link from 'next/link'
import { TrackedLink } from '@/components/marketing/tracked-link'
import { FOOTER_LINK_GROUPS } from '@/config/navigation'
import { BRAND } from '@/lib/brand'
import { BrandLogo } from '@/components/brand/BrandLogo'
import { SocialLinks } from '@/components/brand/SocialLinks'
import { CookiePreferencesButton } from '@/components/legal/CookiePreferencesButton'
import { HideOnHome } from '@/components/layout/hide-on-home'
import { GRIEVANCE_CONTACT, LEGAL_OPERATOR, operatorAddressLabel, operatorDescription } from '@/lib/legal/legal-config'

/**
 * Marketing site footer.
 * 5-column desktop, 3-column tablet, 2-column mobile.
 * Stays a server component; each group link is a small TrackedLink island that
 * fires footer_link_click with its group and label.
 */
export function Footer() {
  const currentYear = new Date().getFullYear()

  return (
    <footer
      className="border-t border-border bg-background"
      aria-label="Site footer"
    >
      <div className="max-w-[1120px] mx-auto px-5 lg:px-8 py-16">
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-8 lg:gap-12 mb-12">
          <div className="col-span-2 md:col-span-3 xl:col-span-1">
            <div className="flex items-center mb-4">
              <BrandLogo variant="full" size="sm" />
            </div>
            <p className="text-body-sm text-ink-muted leading-relaxed max-w-[260px]">
              Prodily PM Academy. A structured path to learn product management, build product work, and create proof of your skills.
            </p>
          </div>

          {FOOTER_LINK_GROUPS.map((group) => (
            <div key={group.heading}>
              <h3 className="text-caption font-semibold text-foreground uppercase tracking-wide mb-4">
                {group.heading}
              </h3>
              <ul className="space-y-3">
                {group.links.map((link) => (
                  <li key={link.href}>
                    <TrackedLink
                      href={link.href}
                      event="footer_link_click"
                      args={{ group: group.heading, label: link.label }}
                      {...(link.href.startsWith('http')
                        ? { target: '_blank', rel: 'noopener noreferrer' }
                        : {})}
                      className="
                        inline-block text-body-sm text-ink-muted
                        hover:text-foreground hover:translate-x-0.5
                        transition-[color,transform] duration-200 ease-out-quint
                        motion-reduce:transition-colors motion-reduce:hover:translate-x-0
                        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus rounded-xs
                      "
                    >
                      {link.label}
                    </TrackedLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-5 mb-10">
          <h3 className="text-caption font-semibold text-foreground uppercase tracking-wide">
            Follow Prodily
          </h3>
          <SocialLinks />
        </div>

        <div className="pt-8 border-t border-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <p className="text-body-sm text-ink-muted">
            © {currentYear} {BRAND.fullName}. Built by{' '}
            <Link
              href="https://adityagangwani.me"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-4 hover:text-foreground font-medium"
            >
              Aditya Gangwani
            </Link>{' '}
            to make serious product management education more accessible.
          </p>
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <p className="text-body-sm text-ink-muted">
              Free core curriculum. No paywalled lessons.
            </p>
            <CookiePreferencesButton className="text-body-sm text-ink-muted hover:text-foreground" />
          </div>
        </div>

        {/* Operator identity & grievance contact.
            Rendered from lib/legal/legal-config.ts so the site never presents the
            brand name as a registered company. Until real operator details are
            supplied, the honest default below is what visitors see.
            Left off the homepage at the owner's request (a link to the full details
            on /privacy takes its place); every other page still shows it. */}
        <HideOnHome
          fallback={
            <div className="pt-6 mt-6 border-t border-border">
              <Link
                href="/privacy#grievance"
                className="text-caption text-ink-muted underline underline-offset-4 hover:text-foreground"
              >
                Operator and grievance contact
              </Link>
            </div>
          }
        >
        <div className="pt-6 mt-6 border-t border-border space-y-1.5">
          <p className="text-caption text-ink-muted leading-relaxed max-w-[720px]">
            {operatorDescription(BRAND.fullName)}
            {LEGAL_OPERATOR.registrationId ? ` Registration: ${LEGAL_OPERATOR.registrationId}.` : ''}
            {LEGAL_OPERATOR.address ? ` ${operatorAddressLabel()}: ${LEGAL_OPERATOR.address}.` : ''}
          </p>
          <p className="text-caption text-ink-muted leading-relaxed">
            {GRIEVANCE_CONTACT.officerName
              ? `${GRIEVANCE_CONTACT.officerTitle ?? 'Grievance Officer'}: ${GRIEVANCE_CONTACT.officerName} — `
              : 'Grievances and privacy requests: '}
            <a
              href={`mailto:${GRIEVANCE_CONTACT.email ?? BRAND.supportEmail}`}
              className="underline underline-offset-4 hover:text-foreground"
            >
              {GRIEVANCE_CONTACT.email ?? BRAND.supportEmail}
            </a>
            {'. '}
            Acknowledged within {GRIEVANCE_CONTACT.acknowledgementDays} days, resolved within{' '}
            {GRIEVANCE_CONTACT.resolutionDays} days. See the{' '}
            <Link href="/privacy#grievance" className="underline underline-offset-4 hover:text-foreground">
              grievance process
            </Link>
            .
          </p>
        </div>
        </HideOnHome>
      </div>
    </footer>
  )
}

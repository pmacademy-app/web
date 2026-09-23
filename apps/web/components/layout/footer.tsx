import Link from 'next/link'
import { FOOTER_LINK_GROUPS } from '@/config/navigation'
import { BRAND } from '@/lib/brand'
import { BrandLogo } from '@/components/brand/BrandLogo'
import { SocialLinks } from '@/components/brand/SocialLinks'
import { CookiePreferencesButton } from '@/components/legal/CookiePreferencesButton'
import { GRIEVANCE_CONTACT, LEGAL_OPERATOR, operatorAddressLabel, operatorDescription } from '@/lib/legal/legal-config'

/**
 * Marketing site footer — Sprint 2 §20 + Sprint 3 footer copy.
 * 5-column desktop, 3-column tablet, 2-column mobile.
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
            <p className="text-body-sm text-locked leading-relaxed max-w-[240px]">
              Prodily PM Academy — a structured path to learn product management, build product work, and create proof of your skills.
            </p>
          </div>

          {FOOTER_LINK_GROUPS.map((group) => (
            <div key={group.heading}>
              <h3 className="text-caption font-semibold text-foreground uppercase tracking-wide mb-4">
                {group.heading}
              </h3>
              <ul className="space-y-3">
                {group.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="
                        text-body-sm text-locked
                        hover:text-foreground
                        transition-colors duration-[120ms]
                        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus rounded-xs
                      "
                    >
                      {link.label}
                    </Link>
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
          <p className="text-body-sm text-locked">
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
            <p className="text-body-sm text-locked">
              Free core curriculum. No paywalled lessons.
            </p>
            <CookiePreferencesButton className="text-body-sm text-locked hover:text-foreground" />
          </div>
        </div>

        {/* Operator identity & grievance contact.
            Rendered from lib/legal/legal-config.ts so the site never presents the
            brand name as a registered company. Until real operator details are
            supplied, the honest default below is what visitors see. */}
        <div className="pt-6 mt-6 border-t border-border space-y-1.5">
          <p className="text-caption text-locked leading-relaxed max-w-[720px]">
            {operatorDescription(BRAND.fullName)}
            {LEGAL_OPERATOR.registrationId ? ` Registration: ${LEGAL_OPERATOR.registrationId}.` : ''}
            {LEGAL_OPERATOR.address ? ` ${operatorAddressLabel()}: ${LEGAL_OPERATOR.address}.` : ''}
          </p>
          <p className="text-caption text-locked leading-relaxed">
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
      </div>
    </footer>
  )
}

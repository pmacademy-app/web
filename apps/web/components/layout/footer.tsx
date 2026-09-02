import Link from 'next/link'
import { FOOTER_LINK_GROUPS } from '@/config/navigation'
import { BRAND } from '@/lib/brand'
import { BrandLogo } from '@/components/brand/BrandLogo'

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
          <p className="text-body-sm text-locked">
            Free core curriculum. No paywalled lessons.
          </p>
        </div>
      </div>
    </footer>
  )
}

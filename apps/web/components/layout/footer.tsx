import Link from 'next/link'
import { FOOTER_LINK_GROUPS } from '@/config/navigation'

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
        {/* Main footer grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-8 lg:gap-12 mb-12">
          {/* Brand block */}
          <div className="col-span-2 md:col-span-3 xl:col-span-1">
            {/* Logo */}
            <div className="flex items-center gap-2 mb-4">
              <div className="w-6 h-6 rounded-xs bg-primary flex items-center justify-center flex-shrink-0">
                <span className="text-primary-foreground text-micro font-bold">PM</span>
              </div>
              <span className="text-body-sm font-semibold text-foreground">PM Academy</span>
            </div>
            {/* Brand line — Sprint 3 verbatim */}
            <p className="text-body-sm text-locked leading-relaxed max-w-[240px]">
              A free PM academy for people building real product judgment.
            </p>
          </div>

          {/* Link groups */}
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

        {/* Footer bottom */}
        <div className="pt-8 border-t border-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <p className="text-body-sm text-locked">
            © {currentYear} PM Academy. Built by{" "}
            <Link
              href="https://adityagangwani.me"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-4 hover:text-foreground font-medium"
            >
              Aditya Gangwani
            </Link>{" "}
            to make serious PM education accessible.
          </p>
          <p className="text-body-sm text-locked">
            Free core curriculum. No paywalled lessons.
          </p>
        </div>
      </div>
    </footer>
  )
}

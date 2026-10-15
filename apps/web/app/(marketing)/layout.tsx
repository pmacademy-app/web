import type { Metadata } from 'next'
import { Navbar } from '@/components/layout/navbar'
import { Footer } from '@/components/layout/footer'

export const metadata: Metadata = {
  // Individual sections will override this via generateMetadata
}

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="relative min-h-[100dvh] bg-background text-foreground">
      {/* Skip link — must be the first focusable element */}
      <a
        href="#main-content"
        className="
          fixed top-4 left-4 z-[100] px-4 py-2
          bg-surface text-foreground text-body-sm font-medium
          border border-border rounded-md shadow-sm
          -translate-y-20 focus:translate-y-0
          transition-transform duration-[120ms]
          focus:outline-none focus-visible:ring-2 focus-visible:ring-focus
        "
      >
        Skip to main content
      </a>

      <Navbar />

      <main id="main-content" tabIndex={-1} className="relative z-10 outline-none">
        {children}
      </main>

      <div className="relative z-10">
        <Footer />
      </div>

      {/* Static film grain over every marketing page. It sits above the content
          (z-20, below the navbar and dialogs) because the section bands are opaque
          and would hide it otherwise; pointer-events-none and a few percent opacity
          keep it from affecting interaction or text contrast. Not animated. */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-20 bg-grain opacity-[0.035] dark:opacity-[0.05]"
      />
    </div>
  )
}


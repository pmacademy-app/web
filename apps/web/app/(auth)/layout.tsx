import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: {
    default: 'Account Authentication',
    template: '%s | Prodily',
  },
  robots: {
    index: false,
    follow: true,
  },
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-[100dvh] bg-background text-foreground">
      {/* Skip link: must be the first focusable element */}
      <a
        href="#main-content"
        className="fixed top-4 left-4 z-[100] px-4 py-2 bg-surface text-foreground text-body-sm font-medium border border-border rounded-md shadow-sm -translate-y-20 focus:translate-y-0 transition-transform duration-[120ms] focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      >
        Skip to main content
      </a>
      <main id="main-content" tabIndex={-1} className="outline-none min-h-[100dvh]">
        {children}
      </main>
    </div>
  )
}

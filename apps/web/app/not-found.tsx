import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Page Not Found | Prodily PM Academy',
  description: 'This page is not in the curriculum.',
  robots: {
    index: false,
    follow: true,
  },
}

/**
 * 404 page — Sprint 3 error copy verbatim.
 */
export default function NotFound() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center px-4 text-center">
      <p className="text-body-sm text-locked font-medium mb-3">404</p>
      <h1 className="text-h1 font-semibold text-foreground mb-3">
        This page is not in the curriculum.
      </h1>
      <p className="text-body text-locked max-w-[480px] mb-8">
        The link may be outdated, or the page may have moved.
      </p>
      <Link
        href="/#curriculum"
        className="
          inline-flex items-center px-5 py-2.5
          bg-primary text-primary-foreground
          text-body-sm font-medium rounded-sm
          hover:opacity-90 active:scale-[0.98]
          transition-all duration-[120ms]
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus
        "
      >
        View Curriculum
      </Link>
    </div>
  )
}

import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'About — Why Free Forever',
  description: 'Learn why Prodigy PM Academy was created to offer a 90-lesson, business-school caliber Product Management education for free.',
}

export default function AboutPage() {
  return (
    <div className="container mx-auto px-4 py-16 max-w-3xl">
      <h1 className="text-4xl md:text-5xl font-bold font-serif text-foreground mb-6">
        Why Prodigy PM Academy is Free Forever
      </h1>

      <div className="prose prose-neutral dark:prose-invert max-w-none space-y-6 text-foreground/80 leading-relaxed">
        <p className="text-lg text-foreground font-medium">
          Someone learning Product Management for free today chooses between fragmented blog posts and videos with zero structure, or a paid certificate costing $200 to $2,000.
        </p>

        <p>
          We built PM Academy to fill this gap with the rigor of a business-school elective and the habit-forming mechanics of a language-learning app. 90 lessons, 9 modules, 9 applied capstones — zero paywalls.
        </p>

        <h2 className="text-2xl font-bold font-serif text-foreground mt-8 mb-4">
          Our Four Non-Negotiable Principles
        </h2>

        <ul className="space-y-4 list-disc list-inside">
          <li>
            <strong>Depth over gimmick:</strong> Gamification serves retention of real learning — it never replaces it.
          </li>
          <li>
            <strong>Free means free — no dark patterns:</strong> No fake &quot;free trial,&quot; no paywalling lesson 11 onward, ever.
          </li>
          <li>
            <strong>Respect the learner&apos;s time:</strong> Every lesson states an honest estimated time. No artificial waiting periods.
          </li>
          <li>
            <strong>Portfolio, not just certificate:</strong> Every module ends with an applied capstone you can share on LinkedIn.
          </li>
        </ul>
      </div>

      <div className="mt-12 text-center">
        <Link
          href="/waitlist"
          className="inline-flex items-center justify-center rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 transition-colors"
        >
          Join the Waitlist →
        </Link>
      </div>
    </div>
  )
}

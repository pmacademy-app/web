import { FeatureCard } from '@/components/marketing/feature-card'
import { Reveal } from '@/components/marketing/motion/reveal'

const COMPARISON_CARDS = [
  {
    icon: 'Shuffle',
    title: 'Fragmented Self-Study',
    description: 'YouTube, Reddit, blogs, and scattered frameworks. Lots of information, but no coherent sequence or body of work.',
    variant: 'default' as const,
  },
  {
    icon: 'GraduationCap',
    title: 'Expensive Bootcamps',
    description: 'Structured and guided, but often costly — with the price of a program becoming a barrier to getting started.',
    variant: 'default' as const,
  },
  {
    icon: 'BookOpen',
    title: 'Prodily PM Academy',
    description: 'A structured curriculum with interactive practice, applied capstones, skill tracking, and a portfolio you can keep building.',
    variant: 'comparison-highlighted' as const,
  },
]

/**
 * Why PM Academy section — Sprint 2 §9 + Sprint 3 why copy.
 *
 * ## B12-B — server component
 *
 * Two `motion.div` wrappers, one `useInView` and a `STAGGER_CONTAINER`, all to fade the
 * header in and stagger three cards. `<Reveal>` does both: once for the header, once per
 * card with a `delay` that reproduces `staggerChildren: 0.08`. `FeatureCard` was already
 * a server component, so nothing in this section reaches the client bundle now.
 */
export function WhySection() {
  return (
    <section
      id="why"
      aria-labelledby="why-heading"
      className="bg-surface-muted py-20 lg:py-28 scroll-mt-24 lg:scroll-mt-28"
    >
      <div className="max-w-[1120px] mx-auto px-5 lg:px-8">
        {/* Header */}
        <Reveal amount={0.3} className="max-w-[760px] mx-auto text-center mb-14">
          <div className="text-xs font-mono font-semibold uppercase tracking-wider text-primary mb-3">
            THE TRADE-OFF YOU SHOULDN&apos;T HAVE TO MAKE
          </div>
          <h2
            id="why-heading"
            className="font-display text-h1 lg:text-display-lg font-semibold text-foreground mb-4"
          >
            Self-study gives you information. Bootcamps give you structure. Prodily gives you a path to practice and proof.
          </h2>
          <p className="text-body-lg text-locked leading-relaxed">
            Product management is easy to study badly. You can collect hundreds of videos, frameworks, and opinions without ever building a coherent mental model or producing work of your own. Paid programs solve some of the structure problem, but they can be expensive. Prodily combines a structured curriculum with applied practice and portfolio output — without putting the core learning path behind a paywall.
          </p>
        </Reveal>

        {/* Comparison cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {COMPARISON_CARDS.map((card, i) => (
            <Reveal key={card.title} amount={0.2} delay={i * 80} className="h-full">
              <FeatureCard
                icon={card.icon}
                title={card.title}
                description={card.description}
                variant={card.variant}
              />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

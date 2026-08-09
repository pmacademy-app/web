'use client'

import { motion } from 'framer-motion'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { FAQ_ITEMS } from '@/config/content'
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion'
import { trackFAQExpand } from '@/lib/analytics'

/**
 * FAQ section — Sprint 2 §18 + Sprint 3 FAQ copy (all 10 Q&A pairs).
 */
export function FAQSection() {
  const prefersReducedMotion = useReducedMotion()

  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ_ITEMS.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  }

  return (
    <section
      id="faq"
      aria-labelledby="faq-heading"
      className="py-20 lg:py-28 bg-surface"
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <div className="max-w-[1120px] mx-auto px-5 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-[8fr_4fr] gap-12 lg:gap-16 items-start">
          {/* Left: Accordion */}
          <div>
            <motion.div
              initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.18, ease: [0, 0, 0.2, 1] }}
              className="mb-8"
            >
              <h2
                id="faq-heading"
                className="font-display text-h1 font-semibold text-foreground mb-4"
              >
                Frequently Asked Questions
              </h2>
            </motion.div>

            <Accordion multiple className="w-full space-y-4">
              {FAQ_ITEMS.map((item, index) => (
                <AccordionItem
                  key={index}
                  value={`item-${index}`}
                  className="border border-border rounded-lg overflow-hidden bg-surface"
                >
                  <AccordionTrigger
                    onClick={() => trackFAQExpand(index)}
                    className="
                      px-5 py-4 text-body-sm font-semibold text-foreground
                      hover:bg-surface-muted hover:no-underline
                      transition-colors duration-[120ms]
                    "
                  >
                    {item.question}
                  </AccordionTrigger>
                  <AccordionContent className="px-5 pb-4 pt-1 text-body-sm text-locked leading-relaxed">
                    {item.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>

          {/* Right: Trust Panel */}
          <motion.div
            initial={prefersReducedMotion ? false : { opacity: 0, x: 16 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.24, delay: 0.1, ease: [0, 0, 0.2, 1] }}
            className="
              lg:sticky lg:top-24
              p-6 bg-surface-muted border border-border rounded-lg
              space-y-4
            "
          >
            <h3 className="text-h4 font-semibold text-foreground">Serious PM Education</h3>
            <p className="text-body-sm text-locked leading-relaxed">
              We built PM Academy to make high-quality product management education accessible to everyone. No tricks, no hidden paywalls.
            </p>
            <div className="pt-4 border-t border-border space-y-2">
              <div className="flex items-center gap-2 text-body-sm text-foreground">
                <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                90 Structured Lessons
              </div>
              <div className="flex items-center gap-2 text-body-sm text-foreground">
                <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                9 Practical Modules
              </div>
              <div className="flex items-center gap-2 text-body-sm text-foreground">
                <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                Free Core Path
              </div>
              <div className="flex items-center gap-2 text-body-sm text-foreground">
                <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                Portfolio Output
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}

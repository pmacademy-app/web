import Link from 'next/link'
import { ArrowRight, Plus } from 'lucide-react'

import {
  ARROW_NUDGE,
  BAND_PLAIN,
  CONTAINER,
  LINK_QUIET,
  SECTION_TITLE,
  SECTION_Y,
} from '@/components/marketing/styles'
import { FAQ_ITEMS } from '@/config/content'
import type { FAQItem } from '@/types'

/**
 * Short homepage FAQ.
 *
 * Reuses existing answers from FAQ_ITEMS, picked by question text, and writes none of
 * its own. Left out on purpose: the AI question (the homepage makes no AI claims either
 * way), the certification question (the certificate has its own section), and the
 * "get started" and prior-experience questions, which the page already answers.
 *
 * Native <details>/<summary>: keyboard and screen-reader support come from the browser,
 * and the section stays a server component with no client JavaScript.
 */

const HOME_FAQ_QUESTIONS = [
  'Is Prodily really free?',
  'Who is Prodily for?',
  'How long does it take?',
  'What will I build?',
  'What is the public portfolio?',
] as const

export const HOME_FAQ_ITEMS: FAQItem[] = HOME_FAQ_QUESTIONS.map((question) =>
  FAQ_ITEMS.find((item) => item.question === question),
).filter((item): item is FAQItem => item !== undefined)

export function HomeFaqSection() {
  if (HOME_FAQ_ITEMS.length === 0) return null

  return (
    <section
      id="faq"
      aria-labelledby="faq-heading"
      data-home-section="faq"
      className={`${SECTION_Y} ${BAND_PLAIN} scroll-mt-24 lg:scroll-mt-28`}
    >
      <div className={CONTAINER}>
        <div className="mx-auto max-w-3xl">
          <h2 id="faq-heading" className={`${SECTION_TITLE} mb-10 lg:mb-12`}>
            Questions.
          </h2>

          <div className="border-t border-border">
            {HOME_FAQ_ITEMS.map((item) => (
              <details key={item.question} className="group border-b border-border">
                <summary
                  className="
                    flex min-h-11 cursor-pointer list-none items-center justify-between gap-6 py-5
                    text-body-lg font-semibold text-foreground
                    [&::-webkit-details-marker]:hidden
                    rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background
                  "
                >
                  <span>{item.question}</span>
                  <Plus
                    size={18}
                    aria-hidden="true"
                    className="shrink-0 text-ink-muted transition-transform duration-200 ease-out-quint group-open:rotate-45 motion-reduce:transition-none"
                  />
                </summary>
                <p className="max-w-[60ch] pb-6 pr-10 text-body text-ink-muted leading-relaxed text-pretty">
                  {item.answer}
                </p>
              </details>
            ))}
          </div>

          <Link href="/faq" className={`${LINK_QUIET} mt-8`}>
            <span>See all questions</span>
            <ArrowRight size={15} aria-hidden="true" className={ARROW_NUDGE} />
          </Link>
        </div>
      </div>
    </section>
  )
}

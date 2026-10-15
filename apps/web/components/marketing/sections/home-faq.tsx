import Link from 'next/link'
import { ArrowRight, Plus } from 'lucide-react'

import { TrackedLink } from '@/components/marketing/tracked-link'
import {
  ARROW_NUDGE,
  BAND_MUTED,
  CONTAINER,
  LINK_QUIET,
  SECTION_TITLE,
  SECTION_Y,
} from '@/components/marketing/styles'
import { FAQ_ITEMS } from '@/config/content'
import { SAMPLE_PORTFOLIO_PATH } from '@/config/marketing'
import type { FAQItem } from '@/types'

/**
 * Short homepage FAQ.
 *
 * Reuses existing answers from FAQ_ITEMS, picked by question text, and writes none of
 * its own. Only questions the page does not already answer: "What will I build?",
 * "What is the public portfolio?" and "How long does it take?" would repeat the proof,
 * portfolio and curriculum sections. The AI question stays off too (the homepage makes
 * no AI claims either way), as does the certification question.
 *
 * Native <details>/<summary>: keyboard and screen-reader support come from the browser,
 * and the section stays a server component. The only client code is the two
 * `TrackedLink`s.
 *
 * Round 2: the section also absorbs "Check it yourself" (formerly its own section).
 * Desktop: heading plus the two verifiable links on the left (sticky beside the
 * answers), questions on the right. Phone: heading, links, then questions. The links
 * always render; they make no claim about other learners, so they carry no quotes,
 * names or ratings, and they keep the `check_it_yourself` analytics location.
 */

const CHECK_ITEMS = [
  {
    statement: 'Every lesson is public.',
    href: '/curriculum',
    label: 'Browse the curriculum',
    target: 'curriculum',
  },
  {
    statement: 'Portfolios are public.',
    href: SAMPLE_PORTFOLIO_PATH,
    label: 'Open one',
    /** "Open one" is vague out of context (screen-reader link lists); this completes it. */
    srHint: ': a sample portfolio',
    target: 'sample_portfolio',
  },
] as const

const HOME_FAQ_QUESTIONS = [
  'Is Prodily really free?',
  'Who is Prodily for?',
  'Do I need prior PM experience?',
  'How do I get started?',
] as const

export const HOME_FAQ_ITEMS: FAQItem[] = HOME_FAQ_QUESTIONS.map((question) =>
  FAQ_ITEMS.find((item) => item.question === question),
).filter((item): item is FAQItem => item !== undefined)

export function HomeFaqSection() {
  return (
    <section
      id="faq"
      aria-labelledby="faq-heading"
      data-home-section="faq"
      className={`${SECTION_Y} ${BAND_MUTED} scroll-mt-24 lg:scroll-mt-28`}
    >
      <div className={`${CONTAINER} grid grid-cols-1 gap-12 lg:grid-cols-12 lg:gap-x-12`}>
        <div className="lg:col-span-5 lg:self-start lg:sticky lg:top-28">
          <h2 id="faq-heading" className={SECTION_TITLE}>
            Questions.
          </h2>

          <div className="mt-10 lg:mt-12">
            <h3 className="text-body-sm font-semibold text-ink-muted">Check it yourself</h3>
            <ul className="mt-4 grid gap-3">
              {CHECK_ITEMS.map((item) => (
                <li
                  key={item.target}
                  className="rounded-[calc(1.5rem-0.375rem)] border border-border bg-surface px-5 py-4 shadow-tinted"
                >
                  <p className="text-body-lg font-semibold leading-snug tracking-[-0.01em] text-foreground">
                    {item.statement}
                  </p>
                  <TrackedLink
                    href={item.href}
                    event="home_secondary_cta_click"
                    args={{ location: 'check_it_yourself', target: item.target }}
                    className={`${LINK_QUIET} -mb-2`}
                  >
                    <span>
                      {item.label}
                      {'srHint' in item ? <span className="sr-only">{item.srHint}</span> : null}
                    </span>
                    <ArrowRight size={15} aria-hidden="true" className={ARROW_NUDGE} />
                  </TrackedLink>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {HOME_FAQ_ITEMS.length > 0 ? (
          <div className="min-w-0 lg:col-span-7">
            <div className="border-t border-border">
              {HOME_FAQ_ITEMS.map((item) => (
                <details key={item.question} className="group border-b border-border">
                  <summary
                    className="
                      flex min-h-11 cursor-pointer list-none items-center justify-between gap-6 py-5
                      text-body-lg font-semibold text-foreground
                      [&::-webkit-details-marker]:hidden
                      rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-surface-muted
                    "
                  >
                    <span>{item.question}</span>
                    <span
                      aria-hidden="true"
                      className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-ink-muted transition-[transform,background-color] duration-200 ease-out-quint group-open:rotate-45 group-open:bg-primary-soft group-open:text-primary motion-reduce:transition-none"
                    >
                      <Plus size={16} />
                    </span>
                  </summary>
                  <p className="max-w-[60ch] pb-6 pr-12 text-body text-ink-muted leading-relaxed text-pretty">
                    {item.answer}
                  </p>
                </details>
              ))}
            </div>

            <Link href="/faq" className={`${LINK_QUIET} mt-6`}>
              <span>See all questions</span>
              <ArrowRight size={15} aria-hidden="true" className={ARROW_NUDGE} />
            </Link>
          </div>
        ) : null}
      </div>
    </section>
  )
}

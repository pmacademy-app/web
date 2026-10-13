import { ArrowRight } from 'lucide-react'

import { Reveal } from '@/components/marketing/motion/reveal'
import {
  ARROW_NUDGE,
  BAND_MUTED,
  CARD,
  CARD_INTERACTIVE,
  CONTAINER,
  SECTION_LEAD,
  SECTION_TITLE,
  SECTION_Y,
} from '@/components/marketing/styles'
import { TrackedLink } from '@/components/marketing/tracked-link'
import { fetchCompiledLesson, fetchCurriculumData } from '@/lib/lesson-loader'

/**
 * Sample lesson: three real lessons, readable without an account.
 *
 * ## Why this section exists
 *
 * All 90 lessons are public at `/lessons/<slug>`. The strongest evidence Prodily has is
 * the writing itself, so this section shows it instead of describing it: the real
 * title, the real reading time, and the lead lesson's own opening paragraph, read from
 * the compiled content at build time. Nothing here is marketing copy about the content.
 *
 * ## Which lessons
 *
 * The three ids below are the ones `app/(app)/academy/[moduleSlug]/[lessonId]/page.tsx`
 * marks as public samples and the only three the app allows search engines to index.
 * Using any other lesson here would surface a page that is deliberately `noindex`.
 *
 * ## Rendering
 *
 * A server component reading the same compiled JSON the lesson pages read, on a page
 * with `revalidate = 3600`. The only client code is the `TrackedLink` wrapper that
 * reports which card was opened (`sample_lesson_card_click`, 1-based position).
 */

/** Kept in sync with `SAMPLE_LESSON_IDS` in the academy lesson route. */
const SAMPLE_LESSON_IDS = ['les_zoyq8a', 'les_prrl23', 'les_0q4aih'] as const

/**
 * Strips inline markdown so an excerpt renders as plain prose.
 *
 * The compiled `paragraph` block keeps its authored markdown (`**bold**`, `*emphasis*`,
 * `` `code` ``). Rendering it raw would show the asterisks; pulling in the block
 * renderer would drag the whole lesson rendering pipeline into the marketing bundle for
 * one paragraph. Stripping the four inline markers that actually occur in lesson
 * openings is the proportionate answer.
 */
function toPlainText(markdown: string): string {
  return markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Truncates at a sentence boundary so an excerpt never ends mid-clause.
 *
 * Falls back to a word boundary when the first sentence is longer than the budget,
 * which happens in lessons that open on a long rhetorical question.
 */
function excerpt(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text

  const window = text.slice(0, maxChars)
  const lastSentence = Math.max(
    window.lastIndexOf('. '),
    window.lastIndexOf('? '),
    window.lastIndexOf('! ')
  )
  if (lastSentence > maxChars * 0.5) return window.slice(0, lastSentence + 1)

  const lastSpace = window.lastIndexOf(' ')
  return `${window.slice(0, lastSpace > 0 ? lastSpace : maxChars)}…`
}

interface SampleLesson {
  id: string
  slug: string
  title: string
  order: number
  minutes: number
  opening: string
}

async function loadSamples(): Promise<SampleLesson[]> {
  const curriculum = await fetchCurriculumData()
  if (!curriculum) return []

  const samples = await Promise.all(
    SAMPLE_LESSON_IDS.map(async (id): Promise<SampleLesson | null> => {
      const entry = curriculum.lessons.find((l) => l.id === id)
      if (!entry) return null

      const lesson = await fetchCompiledLesson(id)
      if (!lesson) return null

      // The first `paragraph` block is the lesson's opening hook: the "Why This Lesson
      // Matters" lede, before any heading or structure.
      const firstParagraph = lesson.blocks.find(
        (b): b is typeof b & { text: string } => b.type === 'paragraph' && typeof b.text === 'string'
      )
      if (!firstParagraph) return null

      const index = curriculum.lessons.findIndex((l) => l.id === id)

      return {
        id,
        slug: entry.slug,
        title: entry.title,
        order: index >= 0 ? index + 1 : entry.order,
        minutes: entry.estimatedReadingTime,
        opening: excerpt(toPlainText(firstParagraph.text), 200),
      }
    })
  )

  return samples.filter((s): s is SampleLesson => s !== null)
}

export async function SampleLessonSection() {
  const samples = await loadSamples()

  // If the content pipeline has not produced these lessons, render nothing rather than
  // an empty shell. The section only has a job when it has real content to show.
  if (samples.length === 0) return null

  const [lead, ...rest] = samples

  return (
    <section
      id="sample"
      aria-labelledby="sample-heading"
      data-home-section="sample-lesson"
      className={`${BAND_MUTED} ${SECTION_Y} scroll-mt-24 lg:scroll-mt-28`}
    >
      <div className={CONTAINER}>
        <Reveal amount={0.2} className="mb-12 lg:mb-16">
          <h2 id="sample-heading" className={`${SECTION_TITLE} mb-4`}>
            Read a lesson first.
          </h2>
          <p className={SECTION_LEAD}>Three full lessons. No account.</p>
        </Reveal>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-5">
          {/* Lead sample, given the width because its opening paragraph is the argument. */}
          <Reveal amount={0.15} className="h-full lg:col-span-7">
            <TrackedLink
              href={`/lessons/${lead.slug}`}
              event="sample_lesson_card_click"
              args={{ lessonSlug: lead.slug, position: 1 }}
              className={`group flex h-full flex-col justify-between gap-10 p-7 lg:p-10 ${CARD} ${CARD_INTERACTIVE} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus`}
            >
              <div className="space-y-5">
                <LessonMeta order={lead.order} minutes={lead.minutes} />
                <h3 className="font-sans text-[clamp(1.375rem,2.4vw,1.875rem)] font-semibold leading-[1.18] tracking-[-0.015em] text-foreground text-balance">
                  {lead.title}
                </h3>
                {/* The lesson's own words, read from compiled content, not a paraphrase. */}
                <p className="max-w-[56ch] border-l-2 border-primary/30 pl-4 text-body leading-relaxed text-ink-muted text-pretty transition-colors duration-200 group-hover:border-primary motion-reduce:transition-none">
                  {lead.opening}
                </p>
              </div>
              <ReadCue label="Read the lesson" />
            </TrackedLink>
          </Reveal>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:col-span-5 lg:grid-cols-1 lg:gap-5">
            {rest.map((sample, index) => (
              <Reveal key={sample.id} amount={0.15} delay={80 + index * 60} className="h-full">
                <TrackedLink
                  href={`/lessons/${sample.slug}`}
                  event="sample_lesson_card_click"
                  args={{ lessonSlug: sample.slug, position: index + 2 }}
                  className={`group flex h-full flex-col justify-between gap-8 p-6 lg:p-7 ${CARD} ${CARD_INTERACTIVE} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus`}
                >
                  <div className="space-y-3">
                    <LessonMeta order={sample.order} minutes={sample.minutes} />
                    <h3 className="font-sans text-[1.25rem] font-semibold leading-snug tracking-[-0.015em] text-foreground text-balance">
                      {sample.title}
                    </h3>
                  </div>
                  <ReadCue label="Read it" />
                </TrackedLink>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function LessonMeta({ order, minutes }: { order: number; minutes: number }) {
  return (
    <p className="flex items-center gap-3 text-caption font-medium text-ink-muted">
      <span className="font-semibold text-primary">Lesson {order}</span>
      <span>{minutes} min read</span>
    </p>
  )
}

function ReadCue({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-body-sm font-semibold text-primary">
      {label}
      <ArrowRight size={15} aria-hidden="true" className={ARROW_NUDGE} />
    </span>
  )
}

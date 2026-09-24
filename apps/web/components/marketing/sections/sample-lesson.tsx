import Link from 'next/link'
import { ArrowRight, Clock } from 'lucide-react'

import { Reveal } from '@/components/marketing/motion/reveal'
import { fetchCompiledLesson, fetchCurriculumData } from '@/lib/lesson-loader'

/**
 * Proof-by-sample — Phase 0.C.
 *
 * ## Why this section exists
 *
 * The homepage audit in `docs/IMPLEMENTATION_PLAN.md` §Phase 0.C found that all 90
 * lessons are already public at `/lessons/<slug>`, and that the homepage linked to
 * exactly one of them from a small text link inside the curriculum section. The single
 * strongest piece of evidence Prodily has — the writing itself — was effectively
 * invisible.
 *
 * So this section does not describe the lessons. It shows them: the real title, the
 * real reading time, and the lesson's own opening paragraph, read from the compiled
 * content at build time. Nothing here is marketing copy about the content; it *is* the
 * content. That also makes the section impossible to overclaim with — if the writing
 * does not hold up, neither does the section.
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
 * with `revalidate = 3600`. No client JavaScript, no data dependency at request time,
 * and no duplication of lesson prose into marketing copy that could drift from source.
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

      // The first `paragraph` block is the lesson's opening hook — the "Why This Lesson
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
        opening: excerpt(toPlainText(firstParagraph.text), 260),
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
      className="bg-surface-muted py-20 lg:py-28 border-t border-border/80 scroll-mt-24 lg:scroll-mt-28"
    >
      <div className="max-w-[1120px] mx-auto px-5 lg:px-8">
        <Reveal amount={0.2} className="max-w-[640px] mb-10">
          <div className="text-xs font-mono font-semibold uppercase tracking-wider text-primary mb-3">
            READ BEFORE YOU SIGN UP
          </div>
          <h2
            id="sample-heading"
            className="font-display text-h1 lg:text-display-lg font-semibold text-foreground mb-4 tracking-[-0.02em]"
          >
            Judge the teaching, not the landing page.
          </h2>
          <p className="text-body-lg text-locked leading-relaxed">
            Three lessons are open to read in full, no account needed. This is how every
            lesson opens — with the question it exists to answer.
          </p>
        </Reveal>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-5 items-stretch">
          {/* Lead sample — given the width, because the excerpt is the argument. */}
          <Reveal amount={0.15} className="lg:col-span-7 h-full">
            <Link
              href={`/lessons/${lead.slug}`}
              className="
                group flex h-full flex-col justify-between gap-6 rounded-sm
                bg-surface border border-border p-7 lg:p-9
                hover:border-border-strong hover:shadow-sm
                transition-all duration-[120ms]
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus
              "
            >
              <div className="space-y-4">
                <div className="flex items-center gap-3 text-caption font-mono text-locked">
                  <span className="text-primary font-semibold">LESSON {lead.order}</span>
                  <span aria-hidden="true">·</span>
                  <span className="inline-flex items-center gap-1.5">
                    <Clock size={12} aria-hidden="true" />
                    {lead.minutes} min read
                  </span>
                </div>

                <h3 className="font-display text-h2 font-semibold text-foreground leading-snug group-hover:text-primary transition-colors duration-[120ms]">
                  {lead.title}
                </h3>

                {/* The lesson's own words, read from compiled content — not a paraphrase. */}
                <blockquote className="text-body text-foreground/80 leading-relaxed border-l-2 border-primary/30 pl-4">
                  {lead.opening}
                </blockquote>
              </div>

              <span className="inline-flex items-center gap-2 text-body-sm font-semibold text-primary">
                Read the full lesson
                <ArrowRight
                  size={15}
                  aria-hidden="true"
                  className="transition-transform duration-[120ms] group-hover:translate-x-1 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
                />
              </span>
            </Link>
          </Reveal>

          {/* The remaining two, compact — enough to show this is not a one-off. */}
          <div className="lg:col-span-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-4 lg:gap-5">
            {rest.map((sample, index) => (
              <Reveal key={sample.id} amount={0.15} delay={80 + index * 60} className="h-full">
                <Link
                  href={`/lessons/${sample.slug}`}
                  className="
                    group flex h-full flex-col justify-between gap-4 rounded-sm
                    bg-surface border border-border p-6
                    hover:border-border-strong hover:shadow-sm
                    transition-all duration-[120ms]
                    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus
                  "
                >
                  <div className="space-y-2.5">
                    <div className="flex items-center gap-3 text-caption font-mono text-locked">
                      <span className="text-primary font-semibold">LESSON {sample.order}</span>
                      <span aria-hidden="true">·</span>
                      <span>{sample.minutes} min</span>
                    </div>
                    <h3 className="font-display text-h4 font-semibold text-foreground leading-snug group-hover:text-primary transition-colors duration-[120ms]">
                      {sample.title}
                    </h3>
                  </div>

                  <span className="inline-flex items-center gap-1.5 text-body-sm font-medium text-locked group-hover:text-primary transition-colors duration-[120ms]">
                    Read it
                    <ArrowRight
                      size={13}
                      aria-hidden="true"
                      className="transition-transform duration-[120ms] group-hover:translate-x-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
                    />
                  </span>
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

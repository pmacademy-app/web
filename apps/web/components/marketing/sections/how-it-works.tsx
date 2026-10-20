import type { ReactNode } from 'react'
import { Check } from 'lucide-react'

import { IllustrationCaption } from '@/components/marketing/illustration-caption'
import { Reveal } from '@/components/marketing/motion/reveal'
import {
  HowItWorksSteps,
  type LoopStepCopy,
} from '@/components/marketing/sections/how-it-works-steps'
import {
  BAND_PLAIN,
  CHIP,
  CONTAINER,
  SECTION_LEAD,
  SECTION_TITLE,
  SECTION_Y,
  SHELL,
  SHELL_CORE,
} from '@/components/marketing/styles'
import { TrackedLink } from '@/components/marketing/tracked-link'
import { CAPSTONE_DEFINITIONS } from '@/config/capstones'
import { HOME_CAPSTONES, SAMPLE_LEARNER_NAME, padIndex } from '@/config/marketing'
import { fetchCompiledLesson } from '@/lib/lesson-loader'
import type { CompiledBlock, CompiledLesson } from '@/types'

/**
 * The learning loop: read, recall, apply, retain.
 *
 * ## Layout (homepage round 2)
 *
 * One compact sticky split. Left: the heading and a numbered list of the four steps.
 * Right (desktop): one sticky panel that shows the visual for the step in view, swapped
 * by the `HowItWorksSteps` island (one IntersectionObserver, CSS crossfade). Phones get
 * each visual under its own step. The habit chips close the section; the curriculum
 * section follows directly, so there is no curriculum link here.
 *
 * ## Real text in the visuals
 *
 * The visuals quote compiled lesson content, read on the server with the cached
 * `fetchCompiledLesson`:
 * - Read: Lesson 4 (`les_04ix6b`, "Product Lifecycle"): the lesson title, the first
 *   theory heading with the stage names listed under it, the opening sentence of the
 *   paragraph that follows, and the lesson's framework with the start of its intro.
 *   Lesson 4 because the Sample lesson section above already shows Lessons 1 to 3,
 *   and the homepage should not show the same artefact twice.
 * - Recall: Lesson 1 (`les_zoyq8a`): the first quiz question and its four options,
 *   with the correct option marked. No score, no counts.
 * - Retain: Lesson 1: the front of the first flashcard.
 * Apply shows Capstone 3 (the PRD) with its real requirement headings from
 * `config/capstones.ts`, written by the Sample Learner.
 *
 * Markdown is stripped and dashes are normalised to commas. Only `theory`, `framework`,
 * `quiz` and `flashcardDeck` blocks are read; no other block type is ever touched.
 * If the lesson or any block is missing, that visual falls back to a static
 * version with structural copy only.
 *
 * ## Honesty
 *
 * Every visual is captioned as an illustration, hidden from assistive technology and
 * described once in screen-reader text. No scores or metrics. Each step names a
 * mechanic that ships today (`blocks/quiz`, `lib/srs.ts`, `config/capstones.ts`,
 * `/review`, `lib/streaks/streaks.ts`).
 */

/** Lesson 1, "What is Product Management?": source of the quiz and the review card. */
const LESSON_ONE_ID = 'les_zoyq8a'
/**
 * Lesson 4, "Product Lifecycle": source of the Read page. Lessons 1 to 3 are already
 * shown in the Sample lesson section, so the loop quotes the next lesson instead.
 */
const READ_LESSON = { id: 'les_04ix6b', number: 4, title: 'Product Lifecycle' } as const

/** Capstone 3 (the PRD), so this mock differs from the hero's Capstone 1 page. */
const APPLY_CAPSTONE = HOME_CAPSTONES.find((c) => c.number === 3)
const APPLY_REQUIREMENTS = APPLY_CAPSTONE
  ? (CAPSTONE_DEFINITIONS[APPLY_CAPSTONE.moduleSlug]?.requirements ?? [])
  : []

/* ─── Content extraction ──────────────────────────────────────────────────── */

interface ReadContent {
  title: string
  heading: string
  parts: string[]
  excerpt: string
  framework: { name: string; summary: string | null } | null
}

interface LoopContent {
  read: ReadContent | null
  quiz: { question: string; options: string[]; correct: number } | null
  card: string | null
}

/** Inline markdown to plain text; dashes become commas so no em dash reaches the page. */
function toPlainText(markdown: string): string {
  return markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\s*[\u2014\u2013]\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Words a clipped excerpt should not end on ("...and why and then..."). */
const DANGLING = /\s+(and|or|but|then|the|a|an|to|of|for|with|by|in)$/i

/**
 * Cuts under `maxChars`: at the last full sentence when one of 60+ characters fits,
 * otherwise at a word boundary (dropping dangling joiners) with an ellipsis.
 */
function clip(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  const window = text.slice(0, maxChars)
  const sentenceEnd = Math.max(window.lastIndexOf('. '), window.lastIndexOf('? '))
  if (sentenceEnd >= 60) return window.slice(0, sentenceEnd + 1)
  const lastSpace = window.lastIndexOf(' ')
  let cut = window.slice(0, lastSpace > 0 ? lastSpace : maxChars).replace(/[,;:]$/, '')
  while (DANGLING.test(cut)) cut = cut.replace(DANGLING, '')
  return `${cut}…`
}

function findBlock(lesson: CompiledLesson, type: string): CompiledBlock | undefined {
  return lesson.blocks.find((b) => b.type === type)
}

/** Bold lead of a markdown list item ("**Growth** ...") without any parenthetical. */
function boldLead(item: string): string | null {
  const lead = /^\*\*([^*]+)\*\*/.exec(item)?.[1]
  if (!lead) return null
  const plain = toPlainText(lead.replace(/\s*\([^)]*\)/g, ''))
  return plain || null
}

/**
 * The Read page: the lesson title; the first theory heading with the bold leads of
 * the first list under it (the named parts) and the first paragraph under it that is
 * a statement rather than a lead-in to a list; and the framework's name with the
 * start of its opening paragraph. Null if the lesson or its theory section is missing.
 */
async function loadReadContent(): Promise<ReadContent | null> {
  const lesson = await fetchCompiledLesson(READ_LESSON.id)
  if (!lesson) return null

  const theory = findBlock(lesson, 'theory')?.children ?? []
  const headingIndex = theory.findIndex((b) => b.type === 'heading' && typeof b.text === 'string')
  if (headingIndex < 0) return null
  const nextHeading = theory.findIndex((b, i) => i > headingIndex && b.type === 'heading')
  const body = theory.slice(headingIndex + 1, nextHeading < 0 ? undefined : nextHeading)

  const paragraph = body.find(
    (b) => b.type === 'paragraph' && typeof b.text === 'string' && !b.text.trim().endsWith(':'),
  )
  const list = body.find((b) => b.type === 'list' && Array.isArray(b.items))
  const parts = (list?.items ?? []).map(boldLead).filter((p): p is string => Boolean(p))

  const framework = findBlock(lesson, 'framework')
  const frameworkIntro = framework?.children?.find(
    (b) => b.type === 'paragraph' && typeof b.text === 'string',
  )

  if (!paragraph?.text) return null

  return {
    title: toPlainText(lesson.title),
    heading: toPlainText(theory[headingIndex].text ?? ''),
    parts: parts.slice(0, 6),
    excerpt: clip(toPlainText(paragraph.text), 180),
    framework:
      typeof framework?.name === 'string'
        ? {
            name: toPlainText(framework.name),
            summary: frameworkIntro?.text ? clip(toPlainText(frameworkIntro.text), 150) : null,
          }
        : null,
  }
}

async function loadLoopContent(): Promise<LoopContent> {
  const [read, lessonOne] = await Promise.all([
    loadReadContent(),
    fetchCompiledLesson(LESSON_ONE_ID),
  ])

  const question = lessonOne ? findBlock(lessonOne, 'quiz')?.questions?.[0] : undefined
  const card = lessonOne ? findBlock(lessonOne, 'flashcardDeck')?.cards?.[0] : undefined

  return {
    read,
    quiz:
      question && question.options.length > 0
        ? {
            question: toPlainText(question.question),
            options: question.options.map(toPlainText),
            correct: question.correctAnswer,
          }
        : null,
    card: card?.front ? toPlainText(card.front) : null,
  }
}

/* ─── Section ─────────────────────────────────────────────────────────────── */

const HABIT_LINK =
  'rounded-sm underline decoration-primary/40 underline-offset-4 hover:text-primary hover:decoration-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background'

const HABITS: { label: ReactNode; line: string }[] = [
  { label: 'Streaks.', line: 'A daily habit, with freezes for off days.' },
  { label: 'Badges.', line: 'Marks for real milestones.' },
  { label: 'Leaderboard.', line: 'Optional, weekly.' },
  {
    label: (
      <>
        <TrackedLink
          href="/frameworks"
          event="home_secondary_cta_click"
          args={{ location: 'how_it_works', target: 'frameworks' }}
          className={HABIT_LINK}
        >
          Frameworks
        </TrackedLink>
        .
      </>
    ),
    line: 'Look up any framework.',
  },
]

export async function HowItWorksSection() {
  const content = await loadLoopContent()
  const readTitle = content.read?.title ?? READ_LESSON.title

  const steps: LoopStepCopy[] = [
    {
      verb: 'Read',
      line: 'A concept explained plainly, with a worked example.',
      description: `Illustration of a page from Lesson ${READ_LESSON.number}, ${readTitle}: a section heading, the start of the explanation and the lesson's framework.`,
    },
    {
      verb: 'Recall',
      line: 'Scenario quizzes that explain every answer, right or wrong.',
      description: content.quiz
        ? `Illustration of a quiz question from Lesson 1: ${content.quiz.question} Four options, with the correct one marked.`
        : 'Illustration of a quiz question with four options, the correct one marked.',
    },
    {
      verb: 'Apply',
      line: 'Write the module capstone and keep it in your portfolio.',
      description: `Illustration of a capstone document titled ${APPLY_CAPSTONE?.title ?? 'Product Requirements Document'}, written by ${SAMPLE_LEARNER_NAME}, with its section headings.`,
    },
    {
      verb: 'Retain',
      line: 'Short reviews return just before you would forget. A few minutes a day.',
      description: content.card
        ? `Illustration of a review card due today, asking: ${content.card}`
        : 'Illustration of a small stack of review cards, with one card face up.',
    },
  ]

  const readCaption = content.read ? `Illustration. Text from Lesson ${READ_LESSON.number} of the course.` : undefined
  const lessonCaption =
    content.quiz || content.card ? 'Illustration. Text from Lesson 1 of the course.' : undefined

  const visuals = [
    <LoopVisual
      key="read"
      label={`Lesson ${padIndex(READ_LESSON.number)}`}
      meta="Read"
      caption={readCaption}
    >
      <ReadVisual title={readTitle} read={content.read} />
    </LoopVisual>,
    <LoopVisual key="recall" label="Lesson 01" meta="Quiz" caption={lessonCaption}>
      <RecallVisual quiz={content.quiz ?? null} />
    </LoopVisual>,
    <LoopVisual
      key="apply"
      label={`Capstone ${padIndex(APPLY_CAPSTONE?.number ?? 3)}`}
      meta={SAMPLE_LEARNER_NAME}
    >
      <ApplyVisual />
    </LoopVisual>,
    <LoopVisual key="retain" label="Review" meta="Due today" caption={lessonCaption}>
      <RetainVisual front={content.card ?? null} />
    </LoopVisual>,
  ]

  return (
    <section
      id="how-it-works"
      aria-labelledby="how-it-works-heading"
      data-home-section="how-it-works"
      className={`${BAND_PLAIN} ${SECTION_Y} scroll-mt-24 lg:scroll-mt-28`}
    >
      <div className={CONTAINER}>
        <HowItWorksSteps
          steps={steps}
          visuals={visuals}
          intro={
            <Reveal amount={0.25} className="mb-6 lg:mb-8">
              <h2 id="how-it-works-heading" className={`${SECTION_TITLE} mb-4`}>
                Read, recall, apply, retain.
              </h2>
              <p className={SECTION_LEAD}>Four steps. The last one brings you back.</p>
            </Reveal>
          }
        />

        <div className="mt-12 border-t border-border pt-8 lg:mt-14">
          <ul className="flex min-w-0 flex-wrap gap-2">
            {HABITS.map((habit, index) => (
              <li key={index} className={`${CHIP} min-w-0 flex-wrap text-ink-muted max-sm:rounded-2xl`}>
                <span className="font-semibold text-foreground">{habit.label}</span>
                <span>{habit.line}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}

/* ─── Visuals ─────────────────────────────────────────────────────────────── */

/**
 * Double-bezel frame shared by the four step visuals: a small header strip (what the
 * surface is, plus one piece of meta) over the drawn content. The drawing is
 * decorative; the step's screen-reader description carries its meaning.
 */
function LoopVisual({
  label,
  meta,
  caption,
  children,
}: {
  label: string
  meta: string
  caption?: string
  children: ReactNode
}) {
  return (
    <figure className="min-w-0">
      <div aria-hidden="true" className={SHELL}>
        <div className={`${SHELL_CORE} flex flex-col lg:min-h-[25.5rem]`}>
          <div className="flex items-center justify-between gap-3 border-b border-border/70 px-5 py-3 sm:px-7">
            <span className="text-caption font-semibold text-primary">{label}</span>
            <span className="truncate text-caption text-ink-muted">{meta}</span>
          </div>
          <div className="flex flex-1 flex-col px-5 py-5 sm:px-7 sm:py-6">{children}</div>
        </div>
      </div>
      <IllustrationCaption as="figcaption" className="mt-3 px-1">
        {caption}
      </IllustrationCaption>
    </figure>
  )
}

const VISUAL_TITLE =
  'font-sans text-[1.375rem] font-semibold leading-snug tracking-[-0.02em] text-foreground text-balance'

function ReadVisual({ title, read }: { title: string; read: ReadContent | null }) {
  if (!read) {
    return (
      <>
        <p className={VISUAL_TITLE}>{title}</p>
        <p className="mt-4 text-body-sm leading-relaxed text-ink-muted">
          Why the lesson matters, the core idea, then a worked example.
        </p>
      </>
    )
  }

  return (
    <>
      <p className={VISUAL_TITLE}>{title}</p>
      <p className="mt-4 text-body-sm font-semibold text-foreground">{read.heading}</p>
      {read.parts.length > 0 && (
        <ol className="mt-2.5 flex flex-wrap gap-1.5">
          {read.parts.map((part) => (
            <li
              key={part}
              className="rounded-full border border-border bg-surface-muted px-2.5 py-1 text-caption font-medium text-foreground"
            >
              {part}
            </li>
          ))}
        </ol>
      )}
      <p className="mt-3 text-body-sm leading-relaxed text-ink-muted text-pretty">{read.excerpt}</p>
      {read.framework && (
        <div className="mt-5 rounded-xl border border-primary/15 bg-primary-soft px-4 py-3.5 lg:mt-auto">
          <p className="text-caption font-semibold text-primary">
            Framework: {read.framework.name}
          </p>
          {read.framework.summary && (
            <p className="mt-1.5 text-caption leading-relaxed text-foreground/80 text-pretty">
              {read.framework.summary}
            </p>
          )}
        </div>
      )}
    </>
  )
}

function RecallVisual({ quiz }: { quiz: LoopContent['quiz'] }) {
  if (!quiz) {
    return (
      <>
        <p className={VISUAL_TITLE}>Scenario question</p>
        <p className="mt-3 text-body-sm leading-relaxed text-ink-muted">
          Pick an answer, then read why each option is right or wrong.
        </p>
      </>
    )
  }

  return (
    <>
      <p className="font-sans text-body-lg font-semibold leading-snug tracking-[-0.01em] text-foreground text-pretty">
        {quiz.question}
      </p>
      <ul className="mt-4 space-y-2">
        {quiz.options.map((option, i) => {
          const correct = i === quiz.correct
          return (
            <li
              key={`${i}-${option}`}
              className={`flex items-start gap-3 rounded-xl border px-3.5 py-2.5 text-body-sm leading-snug ${
                correct
                  ? 'border-primary bg-primary-soft text-foreground'
                  : 'border-border text-ink-muted'
              }`}
            >
              <span
                className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border ${
                  correct
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border-strong'
                }`}
              >
                {correct && <Check size={10} strokeWidth={3} />}
              </span>
              <span className="min-w-0">{option}</span>
            </li>
          )
        })}
      </ul>
    </>
  )
}

function ApplyVisual() {
  return (
    <>
      <p className={VISUAL_TITLE}>{APPLY_CAPSTONE?.title ?? 'Product Requirements Document'}</p>
      <ol className="mt-4 divide-y divide-border/70 border-y border-border/70">
        {APPLY_REQUIREMENTS.map((req, i) => (
          <li key={req.id} className="flex items-baseline gap-3 py-2.5">
            <span className="w-5 shrink-0 text-caption font-semibold tabular-nums text-primary">
              {i + 1}.
            </span>
            <span className="min-w-0">
              <span className="block text-body-sm font-semibold text-foreground">{req.label}</span>
              <span className="block text-caption leading-snug text-ink-muted">
                {req.description}
              </span>
            </span>
          </li>
        ))}
      </ol>
      <div className="mt-auto pt-5">
        <p className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-caption text-ink-muted">
          <Check size={12} className="text-primary" />
          In your portfolio
        </p>
      </div>
    </>
  )
}

function RetainVisual({ front }: { front: string | null }) {
  return (
    <div className="flex flex-1 flex-col justify-center pt-6">
      <div className="relative">
        {/* Two cards behind, peeking out above, so the face-up card reads as the top of a stack. */}
        <div className="absolute inset-0 -translate-y-5 scale-x-[0.88] rounded-xl border border-border bg-surface-muted/70" />
        <div className="absolute inset-0 -translate-y-2.5 scale-x-[0.94] rounded-xl border border-border bg-surface-muted" />
        <div className="relative rounded-xl border border-border bg-surface px-5 py-6 shadow-tinted sm:px-6">
          <p className="text-caption font-semibold text-primary">Front</p>
          <p className="mt-2 font-sans text-body-lg font-semibold leading-snug tracking-[-0.01em] text-foreground text-pretty">
            {front ?? 'A term or question from a lesson you finished.'}
          </p>
          <div className="mt-6 flex justify-end">
            <span className="rounded-full border border-border px-3 py-1 text-caption font-semibold text-foreground">
              Reveal answer
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

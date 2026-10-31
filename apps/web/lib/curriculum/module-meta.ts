/**
 * Module metadata: the single source of module number, title and study time (PR-07, D3).
 *
 * Order and slugs follow `content/dist/curriculum.json` (foundations, discovery, design,
 * execution, growth, leadership, technical, strategy, capstone). `number` is the module's
 * position in that file, `shortTitle` is the compiled module title, and `title` is written
 * from the ten lessons each module actually contains. Minutes are the sums of the compiled
 * lessons' reading and completion times. `seo03-module-meta.test.ts` checks every one of
 * these facts against curriculum.json, so a content change that moves them fails CI.
 *
 * Static data only (no fs, no server imports), so client components can import it.
 */

import type { SkillCluster } from '@/types'

export const MODULE_SLUGS = [
  'foundations',
  'discovery',
  'design',
  'execution',
  'growth',
  'leadership',
  'technical',
  'strategy',
  'capstone',
] as const

export type ModuleSlug = (typeof MODULE_SLUGS)[number]

export interface ModuleMeta {
  slug: ModuleSlug
  /** 1-indexed position in curriculum.json. */
  number: number
  /** Full display title, written from the module's lessons. */
  title: string
  /** One-word label; equals the compiled module title in curriculum.json. */
  shortTitle: string
  /** One sentence naming what the module's lessons cover. */
  description: string
  /** One-line learning outcome for marketing and JSON-LD. */
  outcome: string
  /** Primary competency clusters, for colour and badges. */
  skills: SkillCluster[]
  /** Short badge labels shown beside the module. */
  skillLabels: string[]
  lessonCount: number
  /** Sum of the lessons' estimatedReadingTime, in minutes. */
  readingMinutes: number
  /** Sum of the lessons' estimatedCompletionTime (reading, quiz, reflection), in minutes. */
  estimatedMinutes: number
}

export const MODULE_META: Readonly<Record<ModuleSlug, ModuleMeta>> = {
  foundations: {
    slug: 'foundations',
    number: 1,
    title: 'Product Thinking Foundations',
    shortTitle: 'Foundations',
    description:
      'What a product manager is accountable for, product vs. project, users vs. customers, Jobs to Be Done, value propositions, and the basics of vision and strategy.',
    outcome: 'A working definition of the PM role and core product judgment',
    skills: ['strategy', 'discovery'],
    skillLabels: ['Strategy', 'Discovery'],
    lessonCount: 10,
    readingMinutes: 250,
    estimatedMinutes: 375,
  },
  discovery: {
    slug: 'discovery',
    number: 2,
    title: 'Users, Problems & Discovery',
    shortTitle: 'Discovery',
    description:
      'User research, customer interviews, surveys, personas, journey maps, pain points, problem statements, segmentation, and turning evidence into opportunities.',
    outcome: 'Research skills that turn evidence into an opportunity brief',
    skills: ['discovery', 'design'],
    skillLabels: ['Discovery', 'Design & UX'],
    lessonCount: 10,
    readingMinutes: 265,
    estimatedMinutes: 415,
  },
  design: {
    slug: 'design',
    number: 3,
    title: 'MVPs, PRDs & UX Design',
    shortTitle: 'Design',
    description:
      'Scoping an MVP, writing PRDs, user stories and acceptance criteria, wireframing and prototyping, UX principles, information architecture, prioritization, and design thinking.',
    outcome: 'A scoped MVP with a PRD, user stories and wireframes',
    skills: ['design', 'execution'],
    skillLabels: ['Design & UX', 'Execution'],
    lessonCount: 10,
    readingMinutes: 255,
    estimatedMinutes: 405,
  },
  execution: {
    slug: 'execution',
    number: 4,
    title: 'Agile Execution & Roadmaps',
    shortTitle: 'Execution',
    description:
      'Agile, Scrum and Kanban, sprint planning and backlog grooming, roadmapping, release and launch planning, working with engineering and design, technical debt, and product operations.',
    outcome: 'A roadmap and release plan a delivery team can run',
    skills: ['execution', 'leadership'],
    skillLabels: ['Execution', 'Communication'],
    lessonCount: 10,
    readingMinutes: 350,
    estimatedMinutes: 500,
  },
  growth: {
    slug: 'growth',
    number: 5,
    title: 'Metrics, Growth & Experiments',
    shortTitle: 'Growth',
    description:
      'Product metrics, North Star metrics and metric trees, funnel and cohort analysis, A/B testing, growth loops, pricing, go-to-market, and product-led growth.',
    outcome: 'A metric tree and an experiment plan',
    skills: ['growth', 'strategy'],
    skillLabels: ['Metrics & Growth', 'Strategy'],
    lessonCount: 10,
    readingMinutes: 355,
    estimatedMinutes: 505,
  },
  leadership: {
    slug: 'leadership',
    number: 6,
    title: 'Communication, Influence & Leadership',
    shortTitle: 'Leadership',
    description:
      'Communicating with executives, storytelling, negotiation and influence without authority, managing up and across, leading product teams, PM career paths, ethics, AI in product work, and localization.',
    outcome: 'A personal product philosophy and a plan for influence',
    skills: ['leadership', 'strategy'],
    skillLabels: ['Leadership', 'Communication'],
    lessonCount: 10,
    readingMinutes: 330,
    estimatedMinutes: 495,
  },
  technical: {
    slug: 'technical',
    number: 7,
    title: 'Platforms, APIs & Data Products',
    shortTitle: 'Technical',
    description:
      'Platform thinking, APIs as products, marketplaces and network effects, data-informed decisions, working with data science and ML teams, recommender systems, trust and safety, platform migrations, and developer experience.',
    outcome: 'A platform or API decision brief',
    skills: ['technical', 'strategy'],
    skillLabels: ['Technical', 'Strategy'],
    lessonCount: 10,
    readingMinutes: 405,
    estimatedMinutes: 560,
  },
  strategy: {
    slug: 'strategy',
    number: 8,
    title: 'Strategy, B2B & Competitive Moats',
    shortTitle: 'Strategy',
    description:
      'Strategy frameworks, enterprise and B2B product management, buying committees, land-and-expand packaging, competitive moats, M&A integration, innovation accounting, build-buy-partner decisions, and enterprise pricing.',
    outcome: 'Strategic judgment for B2B, pricing and competitive bets',
    skills: ['strategy', 'growth'],
    skillLabels: ['Strategy', 'Business'],
    lessonCount: 10,
    readingMinutes: 405,
    estimatedMinutes: 560,
  },
  capstone: {
    slug: 'capstone',
    number: 9,
    title: 'Advanced Contexts & PM at Scale',
    shortTitle: 'Capstone',
    description:
      'Regulated industries, privacy and compliance, hardware products, AI-native companies and responsible AI, international scale, crisis management, scaling a product organization, and a final synthesis of your product philosophy.',
    outcome: 'An end-to-end product case study',
    skills: ['strategy', 'leadership'],
    skillLabels: ['Strategy', 'Leadership'],
    lessonCount: 10,
    readingMinutes: 420,
    estimatedMinutes: 585,
  },
}

/** Every module in curriculum order. */
export const MODULE_META_LIST: readonly ModuleMeta[] = MODULE_SLUGS.map((slug) => MODULE_META[slug])

/**
 * Legacy and capstone slugs that refer to a curriculum module. `metrics` is the Growth
 * capstone's route key (config/capstones.ts); the others are curriculum-registry aliases.
 */
export const MODULE_SLUG_ALIASES: Readonly<Record<string, ModuleSlug>> = {
  metrics: 'growth',
  tech_ai: 'technical',
  platform: 'strategy',
  advanced_strategy: 'capstone',
}

export function isModuleSlug(value: string): value is ModuleSlug {
  return (MODULE_SLUGS as readonly string[]).includes(value)
}

/** Returns the module for a slug or alias, or undefined for anything else. */
export function getModuleMeta(slug: string): ModuleMeta | undefined {
  const key = slug.toLowerCase().trim()
  if (isModuleSlug(key)) return MODULE_META[key]
  const alias = MODULE_SLUG_ALIASES[key]
  return alias ? MODULE_META[alias] : undefined
}

/** Display title for a module slug; unknown slugs are title-cased rather than dropped. */
export function getModuleTitle(slug: string): string {
  return (
    getModuleMeta(slug)?.title ??
    slug
      .split(/[-_]/)
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ')
  )
}

/** Study time rounded to whole hours, e.g. 375 minutes -> "6 hrs". */
export function formatModuleHours(minutes: number): string {
  const hours = Math.max(1, Math.round(minutes / 60))
  return `${hours} ${hours === 1 ? 'hr' : 'hrs'}`
}

/** Whole-course totals, derived from the per-module sums above. */
export const COURSE_TOTALS = {
  modules: MODULE_META_LIST.length,
  lessons: MODULE_META_LIST.reduce((sum, m) => sum + m.lessonCount, 0),
  readingMinutes: MODULE_META_LIST.reduce((sum, m) => sum + m.readingMinutes, 0),
  estimatedMinutes: MODULE_META_LIST.reduce((sum, m) => sum + m.estimatedMinutes, 0),
} as const

/** Whole hours of reading plus practice for the full course (73 for the current content). */
export const COURSE_WORKLOAD_HOURS = Math.round(COURSE_TOTALS.estimatedMinutes / 60)

/** Whole hours of reading alone for the full course (51 for the current content). */
export const COURSE_READING_HOURS = Math.round(COURSE_TOTALS.readingMinutes / 60)

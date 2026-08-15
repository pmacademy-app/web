/**
 * Curriculum module metadata (Phase 4 Learning Workspace).
 *
 * Promoted from the learner-facing `/academy` page so the admin Curriculum
 * workspace and the learner shell share a single source of truth for module
 * names, descriptions, colors and icons. Module *numbers* are derived from the
 * curriculum order (see `getOrderedModuleSlugs` in curriculum-aggregation.ts)
 * rather than hardcoded here, so the admin view always matches the learner
 * experience.
 */

export interface CurriculumModuleMeta {
  slug: string
  name: string
  description: string
  /** Tailwind classes for the module accent chip (bg/text/border). */
  color: string
  /** Tailwind class for the left accent border. */
  accentBorder: string
  /** Emoji icon used by the learner shell and admin module cards. */
  icon: string
}

export const CURRICULUM_MODULE_META: Record<string, CurriculumModuleMeta> = {
  foundations: {
    slug: 'foundations',
    name: 'Product Thinking Foundations',
    description:
      'Core PM concepts, the product mindset, user vs. customer, Jobs to Be Done, and the fundamental frameworks every PM must know.',
    color: 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20',
    accentBorder: 'border-l-violet-500',
    icon: '🧠',
  },
  discovery: {
    slug: 'discovery',
    name: 'Users, Problems & Discovery',
    description:
      'User research methods, problem framing, opportunity identification, and how to build real understanding before committing to a solution.',
    color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
    accentBorder: 'border-l-blue-500',
    icon: '🔍',
  },
  strategy: {
    slug: 'strategy',
    name: 'Product Strategy',
    description:
      'Vision setting, prioritization frameworks, roadmap planning, competitive thinking, and how to make sound trade-off decisions.',
    color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
    accentBorder: 'border-l-emerald-500',
    icon: '🎯',
  },
  execution: {
    slug: 'execution',
    name: 'Product Execution',
    description:
      'Agile methodologies, writing PRDs, cross-functional collaboration, sprint planning, and how to ship effectively with an engineering team.',
    color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
    accentBorder: 'border-l-amber-500',
    icon: '⚙️',
  },
  growth: {
    slug: 'growth',
    name: 'Growth & Metrics',
    description:
      'Product analytics, experimentation, A/B testing, funnels, growth loops, and how to measure what actually matters.',
    color: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',
    accentBorder: 'border-l-red-500',
    icon: '📈',
  },
  leadership: {
    slug: 'leadership',
    name: 'PM Leadership',
    description:
      'Influence without authority, stakeholder management, executive communication, managing up, and building your PM career.',
    color: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20',
    accentBorder: 'border-l-indigo-500',
    icon: '👥',
  },
  technical: {
    slug: 'technical',
    name: 'Technical Fluency for PMs',
    description:
      'APIs, databases, system architecture basics, data pipelines, and how to have credible technical conversations with engineering teams.',
    color: 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20',
    accentBorder: 'border-l-teal-500',
    icon: '💻',
  },
  design: {
    slug: 'design',
    name: 'Design Thinking & UX',
    description:
      'UX principles, design collaboration, wireframing, prototyping, and how to make user-centred product decisions.',
    color: 'bg-pink-500/10 text-pink-600 dark:text-pink-400 border-pink-500/20',
    accentBorder: 'border-l-pink-500',
    icon: '🎨',
  },
  capstone: {
    slug: 'capstone',
    name: 'Capstone & Career Portfolio',
    description:
      'Applied portfolio projects, interview preparation, case studies, and building interview-ready PM artifacts demonstrating full-cycle product mastery.',
    color: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20',
    accentBorder: 'border-l-yellow-500',
    icon: '🏆',
  },
}

/** Lookup helper — returns undefined for unknown module slugs. */
export function getCurriculumModuleMeta(slug: string): CurriculumModuleMeta | undefined {
  return CURRICULUM_MODULE_META[slug]
}
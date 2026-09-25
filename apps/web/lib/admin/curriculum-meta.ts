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
    color: 'bg-primary/10 text-primary border-primary/20',
    accentBorder: 'border-l-primary',
    icon: 'Brain',
  },
  discovery: {
    slug: 'discovery',
    name: 'Users, Problems & Discovery',
    description:
      'User research methods, problem framing, opportunity identification, and how to build real understanding before committing to a solution.',
    color: 'bg-primary/10 text-primary border-primary/20',
    accentBorder: 'border-l-primary',
    icon: 'Search',
  },
  strategy: {
    slug: 'strategy',
    name: 'Product Strategy',
    description:
      'Vision setting, prioritization frameworks, roadmap planning, competitive thinking, and how to make sound trade-off decisions.',
    color: 'bg-primary/10 text-primary border-primary/20',
    accentBorder: 'border-l-primary',
    icon: 'Target',
  },
  execution: {
    slug: 'execution',
    name: 'Product Execution',
    description:
      'Agile methodologies, writing PRDs, cross-functional collaboration, sprint planning, and how to ship effectively with an engineering team.',
    color: 'bg-primary/10 text-primary border-primary/20',
    accentBorder: 'border-l-primary',
    icon: 'Workflow',
  },
  growth: {
    slug: 'growth',
    name: 'Growth & Metrics',
    description:
      'Product analytics, experimentation, A/B testing, funnels, growth loops, and how to measure what actually matters.',
    color: 'bg-primary/10 text-primary border-primary/20',
    accentBorder: 'border-l-primary',
    icon: 'TrendingUp',
  },
  leadership: {
    slug: 'leadership',
    name: 'PM Leadership',
    description:
      'Influence without authority, stakeholder management, executive communication, managing up, and building your PM career.',
    color: 'bg-primary/10 text-primary border-primary/20',
    accentBorder: 'border-l-primary',
    icon: 'Users',
  },
  technical: {
    slug: 'technical',
    name: 'Technical Fluency for PMs',
    description:
      'APIs, databases, system architecture basics, data pipelines, and how to have credible technical conversations with engineering teams.',
    color: 'bg-primary/10 text-primary border-primary/20',
    accentBorder: 'border-l-primary',
    icon: 'Terminal',
  },
  design: {
    slug: 'design',
    name: 'Design Thinking & UX',
    description:
      'UX principles, design collaboration, wireframing, prototyping, and how to make user-centred product decisions.',
    color: 'bg-primary/10 text-primary border-primary/20',
    accentBorder: 'border-l-primary',
    icon: 'Palette',
  },
  capstone: {
    slug: 'capstone',
    name: 'Capstone & Career Portfolio',
    description:
      'Applied portfolio projects, interview preparation, case studies, and building interview-ready PM artifacts demonstrating full-cycle product mastery.',
    color: 'bg-primary/10 text-primary border-primary/20',
    accentBorder: 'border-l-primary',
    icon: 'Trophy',
  },
}

/** Lookup helper — returns undefined for unknown module slugs. */
export function getCurriculumModuleMeta(slug: string): CurriculumModuleMeta | undefined {
  return CURRICULUM_MODULE_META[slug]
}
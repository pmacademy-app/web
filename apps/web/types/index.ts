/**
 * Shared TypeScript types for Prodily.
 * These types are the contract between config, components, and the API.
 * All marketing content conforms to these shapes.
 */

// ─── Design System ────────────────────────────────────────────────────────────

/** The seven PM competency clusters defined in Sprint 1. */
export type SkillCluster =
  | 'discovery'
  | 'strategy'
  | 'design'
  | 'execution'
  | 'growth'
  | 'leadership'
  | 'technical'

/** A radar value map — 0 to 100 per cluster. */
export type SkillValues = Record<SkillCluster, number>


export interface JourneyStage {
  /** Display label on the roadmap node */
  label: string
  /** Short description below the node */
  description: string
  /** 2–3 example topics or milestones */
  milestones: string[]
  /** Optional primary competency for accent color */
  cluster?: SkillCluster
}

export interface FAQItem {
  question: string
  answer: string
}

export interface SkillRadarDemoData {
  /** Ghost polygon — represents baseline state */
  before: SkillValues
  /** Filled polygon — represents current/after state */
  after: SkillValues
}

// ─── Navigation ───────────────────────────────────────────────────────────────

export interface NavLink {
  label: string
  /** Anchor href — e.g. "/#curriculum" */
  href: string
  /** Future standalone route */
  futureRoute?: string
  /** Visual hierarchy weight for navigation rendering */
  weight?: 'primary' | 'secondary' | 'tertiary'
}

export interface FooterLinkGroup {
  heading: string
  links: { label: string; href: string }[]
}

// ─── v2 Compiled Lesson Types (from content/dist/lessons/*.json) ──────────────
// These match the Block JSON schema produced by the v2 AST compiler
// (content-pipeline.md §4). Used by the /academy/** routes.

interface CompiledLessonRef {
  id: string    // stable les_XXXXXX ID
  title: string
  module?: string
}

export interface CompiledBlock {
  blockId: string
  type: string
  /**
   * Phase 4 (revised): explicit Core/Deep-dive override for this block, independent of its
   * generic type. Optional — when absent the type default (and content-aware rules for
   * diagrams) in `lib/academy/lesson-structure.ts` applies. Lets an important block stay in
   * Core even if its type would normally be Deep-dive, and vice-versa.
   */
  depth?: 'core' | 'deepDive'
  // Shared optional fields across all block types
  text?: string
  level?: number
  items?: string[]
  ordered?: boolean
  headers?: string[]
  rows?: string[][]
  code?: string
  language?: string
  source?: string
  normalized?: string
  authorTheme?: Record<string, string>
  // Block-specific fields
  objectives?: string[]         // learningObjectives
  mistakes?: { title: string; body: string }[] // commonMistakes
  name?: string                 // mentalModel, framework
  title?: string                // caseStudy, companyExample, etc.
  company?: string              // companyExample
  assumptionFlags?: string[]    // companyExample
  segments?: { context: string; body: string }[] // realWorldPerspective
  questions?: CompiledQuizQuestion[] // quiz
  id?: string                   // quiz, flashcardDeck
  cards?: CompiledFlashcard[]   // flashcardDeck
  entries?: CompiledGlossaryEntry[] // glossary
  prompts?: string[]            // reflection
  // resources items
  citation?: string
  note?: string
  // connections
  previous?: CompiledLessonRef | null
  current?: CompiledLessonRef
  next?: CompiledLessonRef | null
  unlocks?: { lesson: CompiledLessonRef; coreIdea: string }[]
  // Recursive children for container blocks
  children?: CompiledBlock[]
  // Forward-compatible catch-all
  [key: string]: unknown
}

export interface CompiledQuizQuestion {
  id: string
  question: string
  options: string[]
  correctAnswer: number
  explanation: string
  objectivesTested: number[]
  difficulty: 'easy' | 'medium' | 'medium-hard' | 'hard'
}

interface CompiledFlashcard {
  id: string
  front: string
  back: string
  difficulty: number
  tags: string[]
}

interface CompiledGlossaryEntry {
  term: string
  definition: string
  relatedConcepts?: string[]
  difficulty?: number
}

export interface CompiledLesson {
  schemaVersion: number
  id: string                    // stable les_XXXXXX ID
  contentHash: string
  title: string
  slug: string                  // e.g. 'lesson-001' (kept for legacy redirects)
  module: string
  order: number
  totalInModule: number
  difficulty: number
  estimatedReadingTime: number  // minutes
  estimatedCompletionTime: number // minutes
  prerequisites: string[]       // array of les_XXXXXX IDs
  seoTitle?: string
  seoDescription?: string
  inShort?: string
  sourceFile: string
  blocks: CompiledBlock[]
  assets?: unknown[]
  searchable?: {
    plainText: string
    headings: string[]
  }
  glossaryTermsIntroduced?: string[]
  generator?: {
    model: string
    promptVersion: string
    generatedAt: string
  }
  createdAt?: string
  updatedAt?: string
}

/** Minimal curriculum entry for sidebar navigation */
export interface CurriculumEntry {
  id: string
  slug: string
  title: string
  module: string
  order: number
  difficulty: number
  estimatedReadingTime: number
  estimatedCompletionTime: number
  prerequisites: string[]
  seoTitle?: string
  seoDescription?: string
  inShort?: string
  updatedAt?: string
}

/** Full curriculum.json shape from content/dist/ */
export interface CurriculumData {
  lessons: CurriculumEntry[]
}

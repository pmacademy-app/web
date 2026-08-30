/**
 * Shared TypeScript types for PM Academy.
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

// ─── Marketing Content ────────────────────────────────────────────────────────

export interface MarketingModule {
  /** Display number, 1-indexed. e.g. 1 renders as "01" */
  number: number
  title: string
  /** One or two primary skill clusters for this module */
  skills: SkillCluster[]
  estimatedTime: string
  lessonCount: number
  /** One-line portfolio or learning outcome */
  outcome: string
  /** Short skill labels shown as badges */
  skillLabels: string[]
}

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

export interface FeatureItem {
  /** Lucide icon component name */
  icon: string
  title: string
  description: string
  href?: string
}

export interface FAQItem {
  question: string
  answer: string
}

export interface TestimonialItem {
  quote: string
  /** Attribution — use 'Placeholder' until real quotes exist */
  author: string
  role: string
  category: 'career-switcher' | 'founder' | 'student'
}

export interface SkillRadarDemoData {
  /** Ghost polygon — represents baseline state */
  before: SkillValues
  /** Filled polygon — represents current/after state */
  after: SkillValues
}

// ─── Waitlist ─────────────────────────────────────────────────────────────────

/** Valid role options for the waitlist form dropdown. */
export const ROLE_OPTIONS = [
  'Student',
  'Aspiring Product Manager',
  'Product Manager',
  'Software Engineer',
  'Designer',
  'Founder',
  'Marketing',
  'Sales',
  'Business Analyst',
  'Data Analyst',
  'Consultant',
  'Other',
] as const

export type RoleOption = (typeof ROLE_OPTIONS)[number]

/** Shape of the waitlist form client-side state. */
export interface WaitlistFormValues {
  name: string
  email: string
  career_position: RoleOption
}

/** Shape of the JSON body sent to POST /api/waitlist. */
export interface WaitlistPayload extends WaitlistFormValues {
  /** Client-side UTM params extracted from window.location.search */
  utm_source?: string
  utm_medium?: string
  utm_campaign?: string
}

// ─── API ──────────────────────────────────────────────────────────────────────

export interface ApiSuccess {
  message: string
}

export interface ApiError {
  error: string
  code?: 'DUPLICATE' | 'VALIDATION' | 'SERVER_ERROR'
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

// ─── Parsed Lesson Content Types (from parse-content) ──────────────────────────

export interface QuizQuestion {
  id: string
  questionNumber: number
  questionText: string
  options: string[]
  correctOptionIndex: number // 0-indexed
  correctOptionLetter: string // 'A' | 'B' | 'C' | 'D'
  explanation: string
  learningObjective?: string
  difficulty?: string
}

export interface FlashcardItem {
  id: string
  front: string
  back: string
  difficulty: string
  tags: string[]
  lessonNumber: number
}

export interface LessonMeta {
  slug: string
  number: number
  title: string
  moduleNumber: number
  moduleName: string
  difficulty: number
  estMinutesReading: number
  estMinutesReflection: number
  prerequisites: string
  nextLessonSlug: string
  futureTopicsUnlocked: string
}

export interface ParsedLesson {
  meta: LessonMeta
  learningObjectives: string[]
  theory: string
  mistakes: string
  mentalModel: {
    title: string
    content: string
    diagramMermaid?: string
  }
  caseStudy: {
    title: string
    content: string
  }
  framework: {
    title: string
    content: string
  }
  realWorldPerspective: {
    title: string
    content: string
  }
  quiz: QuizQuestion[]
  flashcards: FlashcardItem[]
  reflectionPrompt: string
  connections: string
  rawMarkdownPath: string
}


// ─── v2 Compiled Lesson Types (from content/dist/lessons/*.json) ──────────────
// These match the Block JSON schema produced by the v2 AST compiler
// (content-pipeline.md §4). Used by the /academy/** routes.

export interface CompiledLessonRef {
  id: string    // stable les_XXXXXX ID
  title: string
  module?: string
}

export interface CompiledBlock {
  blockId: string
  type: string
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

export interface CompiledFlashcard {
  id: string
  front: string
  back: string
  difficulty: number
  tags: string[]
}

export interface CompiledGlossaryEntry {
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
}

/** Full curriculum.json shape from content/dist/ */
export interface CurriculumData {
  lessons: CurriculumEntry[]
}

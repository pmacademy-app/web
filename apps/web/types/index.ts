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
  current_role: RoleOption
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
}

export interface FooterLinkGroup {
  heading: string
  links: { label: string; href: string }[]
}

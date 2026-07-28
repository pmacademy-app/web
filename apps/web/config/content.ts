/**
 * PM Academy marketing content — single source of truth.
 *
 * All copy is verbatim from Sprint 3: Content & Communication System.
 * Do NOT rewrite, paraphrase, or invent alternatives.
 *
 * Testimonials marked // PLACEHOLDER — replace with real quotes before launch.
 */

import type {
  MarketingModule,
  JourneyStage,
  FeatureItem,
  FAQItem,
  TestimonialItem,
  SkillRadarDemoData,
} from '@/types'

// ─── Modules (Sprint 2 §11) ───────────────────────────────────────────────────

export const MODULES: MarketingModule[] = [
  {
    number: 1,
    title: 'Product Thinking Foundations',
    skills: ['strategy', 'leadership'],
    skillLabels: ['Strategy', 'Leadership'],
    estimatedTime: '4–5 hrs',
    lessonCount: 10,
    outcome: 'Product judgment basics',
  },
  {
    number: 2,
    title: 'Users, Problems & Discovery',
    skills: ['discovery', 'design'],
    skillLabels: ['Discovery', 'Design & UX'],
    estimatedTime: '5–6 hrs',
    lessonCount: 10,
    outcome: 'Research notes and opportunity brief',
  },
  {
    number: 3,
    title: 'Defining Products & PRDs',
    skills: ['execution', 'leadership'],
    skillLabels: ['Execution', 'Communication'],
    estimatedTime: '5–6 hrs',
    lessonCount: 10,
    outcome: 'PRD draft',
  },
  {
    number: 4,
    title: 'Prioritization & Roadmaps',
    skills: ['strategy', 'execution'],
    skillLabels: ['Strategy', 'Execution'],
    estimatedTime: '4–5 hrs',
    lessonCount: 10,
    outcome: 'Roadmap and tradeoff memo',
  },
  {
    number: 5,
    title: 'Design, UX & Prototyping',
    skills: ['design', 'discovery'],
    skillLabels: ['Design & UX', 'Discovery'],
    estimatedTime: '5–6 hrs',
    lessonCount: 10,
    outcome: 'Wireframe critique',
  },
  {
    number: 6,
    title: 'Metrics, Growth & Experiments',
    skills: ['growth', 'technical'],
    skillLabels: ['Metrics & Growth', 'Technical'],
    estimatedTime: '5–6 hrs',
    lessonCount: 10,
    outcome: 'Metrics tree and experiment plan',
  },
  {
    number: 7,
    title: 'Technical Fluency for PMs',
    skills: ['technical', 'execution'],
    skillLabels: ['Technical', 'Execution'],
    estimatedTime: '4–5 hrs',
    lessonCount: 10,
    outcome: 'API/platform decision brief',
  },
  {
    number: 8,
    title: 'Stakeholders & Leadership',
    skills: ['leadership', 'strategy'],
    skillLabels: ['Leadership', 'Communication'],
    estimatedTime: '4–5 hrs',
    lessonCount: 10,
    outcome: 'Alignment plan',
  },
  {
    number: 9,
    title: 'Capstone & Career Portfolio',
    skills: ['strategy', 'leadership'],
    skillLabels: ['Strategy', 'Leadership'],
    estimatedTime: '6–8 hrs',
    lessonCount: 10,
    outcome: 'Interview-ready case study',
  },
]

// ─── Journey Stages (Sprint 2 §10) ───────────────────────────────────────────

export const JOURNEY_STAGES: JourneyStage[] = [
  {
    label: 'Beginner',
    description: 'PM vocabulary and product thinking',
    milestones: ['PM vocabulary', 'Product thinking', 'Role clarity'],
    cluster: 'strategy',
  },
  {
    label: 'Foundation',
    description: 'Discovery, users, and problem framing',
    milestones: ['User research', 'Problem framing', 'Opportunity briefs'],
    cluster: 'discovery',
  },
  {
    label: 'Execution',
    description: 'PRDs, prioritization, and shipping',
    milestones: ['Writing PRDs', 'Roadmapping', 'Prioritization frameworks'],
    cluster: 'execution',
  },
  {
    label: 'Strategy',
    description: 'Markets, positioning, and business models',
    milestones: ['Market sizing', 'Positioning', 'Business model thinking'],
    cluster: 'strategy',
  },
  {
    label: 'Leadership',
    description: 'Alignment, influence, and tradeoffs',
    milestones: ['Stakeholder alignment', 'Influence without authority', 'Tradeoff framing'],
    cluster: 'leadership',
  },
  {
    label: 'Career Ready',
    description: 'Portfolio, interview practice, capstones',
    milestones: ['Portfolio artifacts', 'Interview preparation', 'Capstone case study'],
    cluster: 'growth',
  },
]

// ─── Learning Experience Features (Sprint 2 §12) ──────────────────────────────

export const EXPERIENCE_FEATURES: FeatureItem[] = [
  {
    icon: 'BookOpen',
    title: 'Interactive Lessons',
    description: 'Structured lessons that build on each other, with reading, reflection, and immediate application.',
  },
  {
    icon: 'Layers',
    title: 'Flashcards',
    description: 'Spaced repetition keeps key PM concepts fresh and ready for application.',
  },
  {
    icon: 'CheckSquare',
    title: 'Quizzes',
    description: 'Immediate, specific feedback on every question so you know exactly what to revisit.',
  },
  {
    icon: 'PenLine',
    title: 'Assignments',
    description: 'Practical PM tasks that produce real artifacts — not exercises you discard.',
  },
  {
    icon: 'FileSearch',
    title: 'Case Studies',
    description: 'Real product decisions analysed through PM frameworks and structured thinking.',
  },
  {
    icon: 'BriefcaseBusiness',
    title: 'Portfolio Projects',
    description: 'Capstones that become interview-ready artifacts showing how you think, not just that you finished.',
  },
]

// ─── Community Features (Sprint 2 §16) ────────────────────────────────────────

export const COMMUNITY_FEATURES: FeatureItem[] = [
  {
    icon: 'MessagesSquare',
    title: 'Discussion',
    description: 'Structured conversations around lessons, frameworks, and product decisions.',
  },
  {
    icon: 'Users',
    title: 'Peer Review',
    description: 'Give and receive feedback on assignments, PRDs, and capstone work.',
  },
  {
    icon: 'BarChart3',
    title: 'Consistency Leaderboards',
    description: 'Opt-in, cohort-based rankings focused on study consistency, not raw completion.',
  },
]

// ─── Testimonials (Sprint 2 §17, Sprint 3 §3) ────────────────────────────────

// PLACEHOLDER — These are example quotes from Sprint 3. Replace with real beta quotes before launch.
export const TESTIMONIALS: TestimonialItem[] = [
  {
    quote: 'The roadmap made PM feel less mysterious. I knew exactly what to study next.',
    author: 'Placeholder', // PLACEHOLDER
    role: 'Career Switcher',
    category: 'career-switcher',
  },
  {
    quote: 'The capstone prompts pushed me to create work I could actually discuss in interviews.',
    author: 'Placeholder', // PLACEHOLDER
    role: 'Aspiring PM',
    category: 'founder',
  },
  {
    quote: 'The skill radar made my gaps visible without making me feel behind.',
    author: 'Placeholder', // PLACEHOLDER
    role: 'Student',
    category: 'student',
  },
]

// ─── FAQ (Sprint 3 §3) ────────────────────────────────────────────────────────

export const FAQ_ITEMS: FAQItem[] = [
  {
    question: 'Is PM Academy really free?',
    answer: 'Yes. The core curriculum is free. No fake trial, no paywalled lesson 11, and no paid unlocks for the main learning path.',
  },
  {
    question: 'Who is PM Academy for?',
    answer: 'It is built first for career switchers and ambitious learners who want a structured way to learn Product Management. It is also useful for founders, operators, designers, engineers, analysts, students, and anyone who wants stronger product judgment.',
  },
  {
    question: 'Do I need prior PM experience?',
    answer: 'No. The curriculum starts with foundations and builds toward advanced product work.',
  },
  {
    question: 'How long does it take?',
    answer: 'The full curriculum includes 90 lessons across 9 modules. Your pace can vary, but the structure is designed for steady weekly progress rather than cramming.',
  },
  {
    question: 'What will I build?',
    answer: 'You will create practical artifacts like PRDs, roadmaps, research notes, wireframe critiques, metrics trees, strategy memos, and capstone case studies.',
  },
  {
    question: 'Will I get a certificate?',
    answer: 'The product may include a certificate, but the real value is your portfolio: the work you build and can explain.',
  },
  {
    question: 'Is there a community?',
    answer: 'Community features will open gradually, including study groups, peer review, and opt-in cohort leaderboards.',
  },
  {
    question: 'When will PM Academy launch?',
    answer: 'Join the waitlist and we will send launch updates, preview lessons, and beta access information as they become available.',
  },
  {
    question: 'Will lessons ever be paywalled?',
    answer: 'No. The core lesson path is designed to remain free.',
  },
]

// ─── Skill Radar Demo Data ────────────────────────────────────────────────────

export const SKILL_RADAR_DEMO: SkillRadarDemoData = {
  before: {
    discovery:  20,
    strategy:   15,
    design:     25,
    execution:  10,
    growth:     10,
    leadership: 15,
    technical:  20,
  },
  after: {
    discovery:  68,
    strategy:   62,
    design:     55,
    execution:  74,
    growth:     45,
    leadership: 50,
    technical:  40,
  },
}

// ─── Portfolio Artifacts ──────────────────────────────────────────────────────

export const PORTFOLIO_ARTIFACTS = [
  { title: 'Improving onboarding activation', type: 'PRD', icon: 'FileText' },
  { title: 'Q3 Growth bets', type: 'Roadmap', icon: 'Map' },
  { title: 'Reducing checkout drop-off', type: 'Case Study', icon: 'FileSearch' },
  { title: 'Market entry memo', type: 'Strategy Doc', icon: 'Briefcase' },
] as const

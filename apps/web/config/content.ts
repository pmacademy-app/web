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
    outcome: 'Roadmap and trade-off memo',
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
    description: 'Start with the language of product.',
    milestones: ['PM foundations', 'Product vocabulary', 'Core mental models'],
    cluster: 'strategy',
  },
  {
    label: 'Foundation',
    description: 'Understand users, problems, and opportunities.',
    milestones: ['User research', 'Problem framing', 'Opportunity briefs'],
    cluster: 'discovery',
  },
  {
    label: 'Execution',
    description: 'Turn product thinking into clear product work.',
    milestones: ['Writing PRDs', 'Roadmapping', 'Prioritization'],
    cluster: 'execution',
  },
  {
    label: 'Strategy',
    description: 'Make decisions with markets and business models in mind.',
    milestones: ['Market sizing', 'Positioning', 'Business models'],
    cluster: 'strategy',
  },
  {
    label: 'Leadership',
    description: 'Learn to align people around difficult decisions.',
    milestones: ['Stakeholder alignment', 'Influence without authority', 'Trade-off framing'],
    cluster: 'leadership',
  },
  {
    label: 'Career Ready',
    description: 'Bring your strongest work together into a portfolio.',
    milestones: ['Portfolio artifacts', 'Capstone case study', 'Public profile'],
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
    description: 'Practical PM tasks that produce real artifacts, not exercises you discard.',
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

export const TESTIMONIALS: TestimonialItem[] = []

// ─── FAQ (Sprint 3 §3) ────────────────────────────────────────────────────────

export const FAQ_ITEMS: FAQItem[] = [
  {
    question: 'Is Prodily really free?',
    answer:
      'Yes. The core 90-lesson curriculum is free, permanently. There are no paywalled lessons blocking the main learning path.',
  },
  {
    question: 'Do I need to already work in tech or product?',
    answer:
      'No. Prodily is built first for career switchers and people building product judgment from scratch. The curriculum starts with foundations and progresses from there.',
  },
  {
    question: 'Who is Prodily for?',
    answer:
      'It is built primarily for aspiring product managers, career switchers, students, and ambitious learners. It can also help founders, designers, engineers, analysts, and others who want stronger product judgment.',
  },
  {
    question: 'Do I need prior PM experience?',
    answer:
      'No. The curriculum starts with foundations and gradually moves into discovery, execution, strategy, leadership, and applied product work.',
  },
  {
    question: 'How long does it take?',
    answer:
      'The curriculum contains 90 lessons across nine modules. You can move at your own pace; the structure is designed for steady progress rather than cramming.',
  },
  {
    question: 'What will I build?',
    answer:
      "You'll work toward applied product artifacts such as PRDs, opportunity briefs, roadmaps, metrics work, strategy documents, and case studies.",
  },
  {
    question: 'What is the public portfolio?',
    answer:
      'Your strongest completed work can be presented through a public profile that you can share with hiring managers, teammates, or on LinkedIn.',
  },
  {
    question: 'Is Prodily a certification program?',
    answer:
      'Prodily can issue completion credentials, but the focus is on building product judgment and tangible work. A credential should complement your portfolio, not replace it.',
  },
  {
    question: 'Does Prodily use AI to personalize learning?',
    answer:
      "No. Prodily's learning and progress systems are based on its structured curriculum, practice formats, and tracked activity rather than an AI-generated personalized learning path.",
  },
  {
    question: 'How do I get started?',
    answer:
      'Create a free account and start with the curriculum. You can begin with the first lesson and build from there.',
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

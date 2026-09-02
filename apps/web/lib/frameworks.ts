export interface FrameworkItem {
  slug: string
  name: string
  lessonNumber: number
  lessonSlug: string
  moduleNumber: number
  moduleSlug: string
  moduleTitle: string
  summary: string
  definition: string
  keyTakeaway: string
}

export const FRAMEWORKS: FrameworkItem[] = [
  {
    slug: 'accountability-triangle',
    name: 'The Accountability Triangle',
    lessonNumber: 1,
    lessonSlug: 'lesson-001',
    moduleNumber: 1,
    moduleSlug: 'foundations',
    moduleTitle: 'Product Thinking Foundations',
    summary: 'Clarify what a PM owns, what they influence, and where accountability actually sits.',
    definition:
      'A core Product Management model stating that sound decisions require Desirability (users want it), Feasibility (engineering can build it), and Viability (makes business sense) to hold equal weight simultaneously.',
    keyTakeaway:
      'Replaces vague "PM Venn diagrams" with explicit accountability for problem-solution-value fit.',
  },
  {
    slug: 'decision-chain',
    name: 'The PM Decision Chain',
    lessonNumber: 1,
    lessonSlug: 'lesson-001',
    moduleNumber: 1,
    moduleSlug: 'foundations',
    moduleTitle: 'Product Thinking Foundations',
    summary: 'Trace a product decision from evidence and assumptions to the choice and its consequences.',
    definition:
      'A standing diagnostic workflow for evaluating PM decisions: starting with problem framing, advancing to user understanding, making explicit choices, executing with quality, and measuring behavior outcomes.',
    keyTakeaway:
      'Prevents shipping features for output sake by holding teams accountable to behavior change outcomes.',
  },
  {
    slug: 'user-customer-tension',
    name: 'User vs. Customer Distinction',
    lessonNumber: 5,
    lessonSlug: 'lesson-005',
    moduleNumber: 1,
    moduleSlug: 'foundations',
    moduleTitle: 'Product Thinking Foundations',
    summary: 'Separate the person using a product from the person making the buying decision.',
    definition:
      'A framework refining Desirability by separating the person using the software from the decision-maker paying for it—crucial for B2B, enterprise, and multi-sided platforms.',
    keyTakeaway:
      'Prevents misdiagnosing product failures caused by pleasing buyers while alienating actual end users.',
  },
  {
    slug: 'opportunity-brief',
    name: 'The Opportunity Brief',
    lessonNumber: 10,
    lessonSlug: 'lesson-010',
    moduleNumber: 1,
    moduleSlug: 'foundations',
    moduleTitle: 'Product Thinking Foundations',
    summary: 'Turn an observed problem into a clearly framed opportunity worth investigating.',
    definition:
      'A lightweight pre-PRD artifact capturing problem evidence, target persona, success metrics, and explicit non-goals before engineering resources are committed to delivery.',
    keyTakeaway:
      'Forces rigor in discovery before entering delivery, stopping premature solutioning.',
  },
  {
    slug: 'problem-statement-matrix',
    name: 'Problem Statement Matrix',
    lessonNumber: 17,
    lessonSlug: 'lesson-017',
    moduleNumber: 2,
    moduleSlug: 'discovery',
    moduleTitle: 'Users, Problems & Discovery',
    summary: 'Separate symptoms, causes, users, and constraints before jumping to solutions.',
    definition:
      'A structured diagnostic matrix for articulating user friction: specifying the exact user segment, the friction encountered, why existing workarounds fail, and the quantifiable business impact.',
    keyTakeaway:
      'Eliminates solution-bias by keeping problem statements strictly focused on user behavior and pain.',
  },
  {
    slug: 'discovery-delivery-handoff',
    name: 'Discovery-Delivery Handoff',
    lessonNumber: 20,
    lessonSlug: 'lesson-020',
    moduleNumber: 2,
    moduleSlug: 'discovery',
    moduleTitle: 'Users, Problems & Discovery',
    summary: 'Connecting validated user insights to delivery sprint execution.',
    definition:
      'A continuous operating model for transitioning validated user opportunities into engineering backlogs without context loss or telephone-game degradation.',
    keyTakeaway:
      'Ensures user research directly shapes sprint goals rather than sitting in unused slide decks.',
  },
  {
    slug: 'stakeholder-ledger',
    name: 'The Stakeholder Ledger',
    lessonNumber: 29,
    lessonSlug: 'lesson-029',
    moduleNumber: 3,
    moduleSlug: 'strategy',
    moduleTitle: 'Defining Products & PRDs',
    summary: 'Systematically weighting cross-functional inputs.',
    definition:
      'A strategic balancing framework for cataloging cross-functional requirements (Sales, Support, Legal, Security) and weighting them against core product strategy.',
    keyTakeaway:
      'Prevents product roadmaps from devolving into reactive "loudest voice wins" compromise lists.',
  },
  {
    slug: 'ownership-zones-model',
    name: 'Ownership Zones Model',
    lessonNumber: 40,
    lessonSlug: 'lesson-040',
    moduleNumber: 4,
    moduleSlug: 'execution',
    moduleTitle: 'Prioritization & Roadmaps',
    summary: 'Clarifying PM, Engineering, and Design boundaries.',
    definition:
      'A triad governance model establishing clear primary accountability: PM owns Problem & Value, Engineering owns Architecture & Feasibility, Design owns Experience & Interaction.',
    keyTakeaway:
      'Eliminates friction and micromanagement by defining explicit decision boundaries across the triad.',
  },
  {
    slug: 'regulatory-surface-map',
    name: 'Regulatory Surface Map',
    lessonNumber: 50,
    lessonSlug: 'lesson-050',
    moduleNumber: 5,
    moduleSlug: 'design',
    moduleTitle: 'Design, UX & Prototyping',
    summary: 'Mapping compliance, privacy, and technical risk exposure.',
    definition:
      'A proactive auditing tool for mapping data privacy, security compliance, accessibility standards, and regulatory exposure across user flows before launch.',
    keyTakeaway:
      'Integrates legal and security constraints directly into product design rather than blocking launches late.',
  },
  {
    slug: 'escalation-staircase',
    name: 'The Escalation Staircase',
    lessonNumber: 75,
    lessonSlug: 'lesson-075',
    moduleNumber: 8,
    moduleSlug: 'leadership',
    moduleTitle: 'Stakeholders & Leadership',
    summary: '4-step framework for resolving cross-functional friction.',
    definition:
      'A progressive 4-level alignment framework: 1) Direct Data Alignment → 2) Tradeoff Explicit Framing → 3) Executive Context Request → 4) Formal Decision Escalation.',
    keyTakeaway:
      'Provides a constructive, non-defensive protocol for resolving misaligned incentives between teams.',
  },
  {
    slug: 'strategic-judgment-radar',
    name: 'Strategic Judgment Radar',
    lessonNumber: 80,
    lessonSlug: 'lesson-080',
    moduleNumber: 8,
    moduleSlug: 'leadership',
    moduleTitle: 'Stakeholders & Leadership',
    summary: 'Multi-dimensional evaluation of Product craft.',
    definition:
      'A 6-axis assessment radar measuring PM capability across Strategy, Discovery, Execution, Leadership, Design/UX, and Technical Fluency.',
    keyTakeaway:
      'Moves PM career growth beyond subjective feedback to measurable skill competency.',
  },
  {
    slug: 'integrated-practice-wheel',
    name: 'Integrated Practice Wheel',
    lessonNumber: 90,
    lessonSlug: 'lesson-090',
    moduleNumber: 9,
    moduleSlug: 'capstone',
    moduleTitle: 'Capstone & Career Portfolio',
    summary: 'Unifying 90 lessons into continuous product judgment.',
    definition:
      'The overarching capstone synthesis uniting all 90 PM Academy lessons into a single, integrated practice to know which mental model to apply in ambiguous real-world situations.',
    keyTakeaway:
      'Reflects the ultimate goal of the curriculum: building instinctual, business-school caliber product judgment.',
  },
]

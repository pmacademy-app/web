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
      'Replaces vague "PM Venn diagrams" with explicit accountability for problem-solution-value fit (Lesson 1).',
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
      'A standing diagnostic workflow for evaluating PM decisions: starting with problem framing, advancing to user understanding, making explicit choices, executing with quality, and measuring behavior outcomes in a feedback loop.',
    keyTakeaway:
      'Prevents shipping features for output sake by holding teams accountable to behavior change outcomes (Lesson 1).',
  },
  {
    slug: 'user-customer-tension',
    name: 'The Stakeholder Ledger (User vs. Customer)',
    lessonNumber: 5,
    lessonSlug: 'lesson-005',
    moduleNumber: 1,
    moduleSlug: 'foundations',
    moduleTitle: 'Product Thinking Foundations',
    summary: 'Separate the person using a product from the person making the buying decision.',
    definition:
      'A framework refining Desirability by separating the person using the software from the decision-maker paying for it—crucial for B2B, enterprise, and multi-sided platforms.',
    keyTakeaway:
      'Prevents misdiagnosing product failures caused by pleasing buyers while alienating actual end users (Lesson 5).',
  },
  {
    slug: 'opportunity-comparison-grid',
    name: 'The Opportunity Comparison Grid',
    lessonNumber: 19,
    lessonSlug: 'lesson-019',
    moduleNumber: 2,
    moduleSlug: 'discovery',
    moduleTitle: 'Users, Problems & Discovery',
    summary: 'Turn observed user friction into a prioritized opportunity portfolio.',
    definition:
      'A structured evaluation matrix comparing opportunities across prevalence, severity, and alignment before committing engineering resources to delivery.',
    keyTakeaway:
      'Forces disciplined opportunity pruning so backlogs represent validated user value rather than endless feature requests (Lesson 19).',
  },
  {
    slug: 'problem-statement-matrix',
    name: 'The Problem Statement Review Matrix',
    lessonNumber: 17,
    lessonSlug: 'lesson-017',
    moduleNumber: 2,
    moduleSlug: 'discovery',
    moduleTitle: 'Users, Problems & Discovery',
    summary: 'Separate symptoms, causes, users, and constraints before jumping to solutions.',
    definition:
      'A structured diagnostic matrix for articulating user friction: specifying the exact user segment, the friction encountered, why existing workarounds fail, and the quantifiable business impact.',
    keyTakeaway:
      'Eliminates solution-bias by keeping problem statements strictly focused on user behavior and pain (Lesson 17).',
  },
  {
    slug: 'discovery-flywheel',
    name: 'The Discovery Flywheel (Continuous Discovery)',
    lessonNumber: 20,
    lessonSlug: 'lesson-020',
    moduleNumber: 2,
    moduleSlug: 'discovery',
    moduleTitle: 'Users, Problems & Discovery',
    summary: 'Connecting validated user insights to delivery sprint execution.',
    definition:
      'A continuous operating model for transitioning validated user opportunities into engineering backlogs without context loss or telephone-game degradation.',
    keyTakeaway:
      'Ensures user research directly shapes sprint goals rather than sitting in unused slide decks (Lesson 20).',
  },
  {
    slug: 'prd-precision-dial',
    name: 'The PRD Precision Dial',
    lessonNumber: 22,
    lessonSlug: 'lesson-022',
    moduleNumber: 3,
    moduleSlug: 'design',
    moduleTitle: 'Defining Products & PRDs',
    summary: 'Balancing problem clarity with engineering autonomy in product specs.',
    definition:
      'A mental model for calibrating specification depth: providing absolute clarity on problem statements, success metrics, and non-goals while leaving implementation architecture to engineering specialists.',
    keyTakeaway:
      'Prevents both vague hand-waving and premature over-specification in product requirements (Lesson 22).',
  },
  {
    slug: 'rice-synthesis-funnel',
    name: 'The Prioritization Synthesis Funnel',
    lessonNumber: 29,
    lessonSlug: 'lesson-029',
    moduleNumber: 3,
    moduleSlug: 'design',
    moduleTitle: 'Defining Products & PRDs',
    summary: 'Scoring competing roadmap initiatives with quantitative and qualitative rigor.',
    definition:
      'A dual-track prioritization model combining quantitative RICE scoring (Reach, Impact, Confidence, Effort) with qualitative MoSCoW boundary definition to make strategic trade-offs explicit.',
    keyTakeaway:
      'Treats confidence as a discipline-enforcing factor to prevent reverse-engineered priority scores (Lesson 29).',
  },
  {
    slug: 'metric-tree',
    name: 'North Star Metric Tree',
    lessonNumber: 42,
    lessonSlug: 'lesson-042',
    moduleNumber: 5,
    moduleSlug: 'growth',
    moduleTitle: 'Metrics, Growth & Experiments',
    summary: 'Deconstructing top-level business outcomes into actionable input metrics.',
    definition:
      'A hierarchical decomposition connecting the primary North Star Metric to breadth, depth, frequency, and efficiency input levers that individual product squads can directly influence.',
    keyTakeaway:
      'Prevents teams from optimizing vanity metrics by tying everyday features to core value delivery (Lesson 42).',
  },
  {
    slug: 'escalation-staircase',
    name: 'The Escalation Staircase (Trust & Safety)',
    lessonNumber: 67,
    lessonSlug: 'lesson-067',
    moduleNumber: 7,
    moduleSlug: 'technical',
    moduleTitle: 'Technical Fluency for PMs',
    summary: 'Calibrating platform governance and cross-functional friction resolution.',
    definition:
      'A progressive governance framework balancing user freedom and platform integrity: moving from soft warnings and friction gates to feature restrictions and account suspension.',
    keyTakeaway:
      'Provides a structured, defensible protocol for platform moderation and dispute resolution (Lesson 67).',
  },
  {
    slug: 'strategic-judgment-radar',
    name: 'The Strategic Judgment Radar',
    lessonNumber: 80,
    lessonSlug: 'lesson-080',
    moduleNumber: 8,
    moduleSlug: 'leadership',
    moduleTitle: 'Stakeholders & Leadership',
    summary: 'Multi-dimensional evaluation of Product craft and strategic acumen.',
    definition:
      'A comprehensive competency assessment measuring PM capability across Strategy, Discovery, Execution, Leadership, Design/UX, and Technical Fluency.',
    keyTakeaway:
      'Moves PM career growth beyond subjective feedback to measurable skill competency (Lesson 80).',
  },
  {
    slug: 'integrated-practice-wheel',
    name: 'The Integrated Practice Wheel',
    lessonNumber: 90,
    lessonSlug: 'lesson-090',
    moduleNumber: 9,
    moduleSlug: 'capstone',
    moduleTitle: 'Capstone & Career Portfolio',
    summary: 'Unifying 90 lessons into continuous, instinctive product judgment.',
    definition:
      'The overarching capstone synthesis uniting all 90 PM Academy lessons into a single, integrated practice to know which mental model to apply in ambiguous real-world situations.',
    keyTakeaway:
      'Reflects the ultimate goal of the curriculum: building instinctual, first-principles product judgment (Lesson 90).',
  },
]

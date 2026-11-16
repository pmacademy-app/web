/**
 * 10 Prominent Product Management Frameworks.
 *
 * Source attribution citations credit the creators or popularizers.
 * Prodily teaches and applies these mental models in its curriculum.
 * These frameworks are established industry models and are not proprietary to Prodily.
 */

export interface FrameworkCitation {
  author: string
  source: string
  year?: string
  url?: string
}

export interface FrameworkWorkedExample {
  scenario: string
  application: string
  outcome: string
}

export interface RelatedLessonRef {
  slug: string
  title: string
  lessonNumber: number
}

export interface FrameworkDetail {
  slug: string
  title: string
  summary: string
  whenToUse: string
  workedExample: FrameworkWorkedExample
  citation: FrameworkCitation
  relatedLessons: RelatedLessonRef[]
  updatedAt: string
}

export const FRAMEWORK_DETAILS: FrameworkDetail[] = [
  {
    slug: 'rice',
    title: 'RICE Prioritization Framework',
    summary:
      'A quantitative scoring model designed to rank competing product initiatives across four distinct dimensions: Reach, Impact, Confidence, and Effort. By multiplying Reach, Impact, and Confidence and dividing by Effort, teams derive an objective score that reduces prioritization bias and clarifies roadmap trade-offs.',
    whenToUse:
      'Use RICE when evaluating candidate roadmap features, competing backlog initiatives, or quarterly planning bets where multiple stakeholders advocate for pet projects and the team needs an objective, evidence-grounded scoring mechanism.',
    workedExample: {
      scenario: 'Prioritizing an automated checkout address lookup feature for a retail SaaS platform.',
      application:
        'Reach = 6,000 active checkout sessions per month; Impact = 2 (high impact on conversion); Confidence = 80% (0.8, backed by funnel analytics); Effort = 2 person-months. Formula: (6,000 * 2 * 0.8) / 2 = 4,800.',
      outcome:
        'The resulting score of 4,800 provides an empirical baseline to compare against other initiatives, making the trade-off explicit to stakeholders.',
    },
    citation: {
      author: 'Sean McBride',
      source: 'RICE: Simple prioritization for product managers, Intercom',
      year: '2016',
      url: 'https://www.intercom.com/blog/rice-simple-prioritization-for-product-managers/',
    },
    relatedLessons: [
      {
        slug: 'lesson-029',
        title: 'Prioritization Fundamentals',
        lessonNumber: 29,
      },
    ],
    updatedAt: '2026-11-15',
  },
  {
    slug: 'moscow',
    title: 'MoSCoW Prioritization',
    summary:
      'A qualitative scoping framework that categorizes deliverables into four clear priority buckets: Must have, Should have, Could have, and Won\'t have this time. It establishes explicit release boundaries so engineering, product, and leadership agree on what is non-negotiable versus what can be dropped if schedules compress.',
    whenToUse:
      'Use MoSCoW when defining minimum viable product (MVP) scope, planning fixed-deadline sprint cycles, or managing scope creep during time-sensitive delivery milestones.',
    workedExample: {
      scenario: 'Scoping the v1 launch of a collaborative team document editor.',
      application:
        'Must have: Real-time text sync, document autosave, and workspace authentication. Should have: Commenting threads and version history. Could have: Custom workspace branding and export to PDF. Won\'t have this time: Offline mode and third-party plugin integrations.',
      outcome:
        'The engineering squad focuses exclusively on the Must-have baseline first, protecting the committed launch date without quality regressions.',
    },
    citation: {
      author: 'Dai Clegg',
      source: 'Dynamic Systems Development Method (DSDM) Consortium',
      year: '1994',
    },
    relatedLessons: [
      {
        slug: 'lesson-029',
        title: 'Prioritization Fundamentals',
        lessonNumber: 29,
      },
    ],
    updatedAt: '2026-11-15',
  },
  {
    slug: 'kano-model',
    title: 'Kano Model',
    summary:
      'A customer preference and satisfaction mapping theory that categorizes product features based on how well they satisfy user emotional expectations. Features are classified as Must-be (table stakes), Performance (linear satisfaction), Attractive (unexpected delighters), Indifferent (unnoticed), or Reverse (harmful if present).',
    whenToUse:
      'Use the Kano Model when product backlogs risk over-indexing on marginal feature improvements while neglecting foundational baseline expectations or distinctive delighters.',
    workedExample: {
      scenario: 'Auditing feature investments for a mobile banking application.',
      application:
        'Biometric login and zero-latency transaction updates are classified as Must-be requirements (their absence causes customer churn). Real-time spending insights are Performance features (more accurate charts directly increase satisfaction). Automatic subscription cancellation assistance is an Attractive delighter.',
      outcome:
        'The team avoids building extra cosmetic settings (Indifferent) and instead invests in polishing core transaction reliability while introducing the subscription assistant as a market differentiator.',
    },
    citation: {
      author: 'Professor Noriaki Kano',
      source: 'Attractive Quality and Must-Be Quality, Tokyo University of Science',
      year: '1984',
    },
    relatedLessons: [
      {
        slug: 'lesson-029',
        title: 'Prioritization Fundamentals',
        lessonNumber: 29,
      },
      {
        slug: 'lesson-019',
        title: 'Opportunity Identification',
        lessonNumber: 19,
      },
    ],
    updatedAt: '2026-11-15',
  },
  {
    slug: 'jobs-to-be-done',
    title: 'Jobs to Be Done (JTBD)',
    summary:
      'A customer discovery framework asserting that people do not buy products for their functional features, but rather hire them to make specific progress in a defined circumstance. JTBD decomposes user motivations into functional, emotional, and social dimensions to uncover real substitutes and underserved needs.',
    whenToUse:
      'Use Jobs to Be Done when user research reveals that customers are using workarounds, when exploring adjacent market opportunities, or when evaluating true competitive alternatives beyond direct category rivals.',
    workedExample: {
      scenario: 'Investigating why remote team leads adopt an async standup tool.',
      application:
        'Functional job: Know what teammates shipped yesterday without running an hour-long sync meeting. Emotional job: Feel confident that projects are on schedule without feeling like a micromanager. Social job: Signal a modern, autonomous engineering culture to team members.',
      outcome:
        'The product team shifts focus away from adding video recording features and instead builds summary email digests that give leads peace of mind in under two minutes.',
    },
    citation: {
      author: 'Clayton M. Christensen, Bob Moesta, and Anthony Ulwick',
      source: 'The Innovator\'s Solution and Outcome-Driven Innovation, Harvard Business School',
      year: '2003',
    },
    relatedLessons: [
      {
        slug: 'lesson-006',
        title: 'Jobs To Be Done',
        lessonNumber: 6,
      },
      {
        slug: 'lesson-013',
        title: 'User Research Synthesis',
        lessonNumber: 13,
      },
    ],
    updatedAt: '2026-11-15',
  },
  {
    slug: 'north-star-metric',
    title: 'North Star Metric Framework',
    summary:
      'A key metric that best expresses the core value delivered to customers and directly drives sustainable business revenue. A sound North Star Metric connects day-to-day product squad outputs to company strategy and decomposes into four primary input levers: breadth, depth, frequency, and efficiency.',
    whenToUse:
      'Use the North Star Metric framework when multiple squads lack cross-functional alignment, when teams mistake vanity metrics (such as pageviews) for value delivery, or when structuring squad ownership around input levers.',
    workedExample: {
      scenario: 'Defining the guiding metric for a team collaboration whiteboard product.',
      application:
        'North Star Metric: "Weekly Collaborating Workspaces" (workspaces where 2+ members edit in the same week). Input levers: Breadth (new workspaces created), Depth (average templates utilized per board), Frequency (days active per week per member), Efficiency (invitation-to-join conversion rate).',
      outcome:
        'Squads align around specific input levers rather than vanity signup numbers, leading directly to higher long-term cohort retention.',
    },
    citation: {
      author: 'Sean Ellis',
      source: 'Popularized by Sean Ellis and the Amplitude North Star Playbook',
      year: '2017',
      url: 'https://amplitude.com/north-star',
    },
    relatedLessons: [
      {
        slug: 'lesson-042',
        title: 'North Star Metrics & Metric Trees',
        lessonNumber: 42,
      },
      {
        slug: 'lesson-041',
        title: 'Product Metrics Fundamentals',
        lessonNumber: 41,
      },
    ],
    updatedAt: '2026-11-15',
  },
  {
    slug: 'heart-framework',
    title: 'Google HEART Framework',
    summary:
      'A user experience metric evaluation structure designed to measure product quality and UX health across five distinct dimensions: Happiness, Engagement, Adoption, Retention, and Task Success. Each dimension is paired with the Goals-Signals-Metrics process to translate high-level intent into measurable telemetry.',
    whenToUse:
      'Use the HEART framework when redesigning key user flows, evaluating digital product health, or resolving disagreements between UX designers and engineers over what constitutes quality.',
    workedExample: {
      scenario: 'Evaluating the UX health of an analytics dashboard builder.',
      application:
        'Goal: Enable users to build custom charts with minimal cognitive effort. Signal: User completes chart creation without navigating back or opening support docs. Metric: Task Success rate exceeding 88%, accompanied by Happiness rating (in-app CSAT) above 4.4 out of 5.',
      outcome:
        'The team identifies that high daily time spent on the page was actually due to confusing drag-and-drop mechanics rather than high engagement, prompting an immediate UI simplification.',
    },
    citation: {
      author: 'Kerry Rodden, Hilary Hutchinson, and Xin Fu',
      source: 'Measuring the User Experience on a Large Scale: User-Centered Metrics for Web Applications, Google / ACM CHI',
      year: '2010',
    },
    relatedLessons: [
      {
        slug: 'lesson-041',
        title: 'Product Metrics Fundamentals',
        lessonNumber: 41,
      },
      {
        slug: 'lesson-044',
        title: 'User Experience & Quality Metrics',
        lessonNumber: 44,
      },
    ],
    updatedAt: '2026-11-15',
  },
  {
    slug: 'aarrr-pirate-metrics',
    title: 'AARRR Pirate Metrics',
    summary:
      'A foundational lifecycle funnel framework that organizes growth tracking into five sequential stages: Acquisition (users find you), Activation (users experience initial core value), Retention (users return repeatedly), Referral (users invite peers), and Revenue (users pay for value).',
    whenToUse:
      'Use AARRR Pirate Metrics when diagnosing funnel conversion drop-offs, aligning growth squads around lifecycle phases, or establishing unit economics for early-stage ventures.',
    workedExample: {
      scenario: 'Auditing the user acquisition and onboarding funnel for a developer productivity tool.',
      application:
        'Acquisition: 12,000 CLI downloads per month. Activation: 2,400 developers execute their first successful command within 24 hours (20% conversion). Retention: 960 developers remain active after 30 days (40% retention). Referral: 190 developers share invitations. Revenue: 110 organizations upgrade to team plans.',
      outcome:
        'The audit identifies that the primary growth bottleneck is between CLI download and first successful command, prompting a streamlined 1-line installation script.',
    },
    citation: {
      author: 'Dave McClure',
      source: 'Startup Metrics for Pirates: AARRR!, 500 Startups',
      year: '2007',
    },
    relatedLessons: [
      {
        slug: 'lesson-043',
        title: 'Funnel Analysis',
        lessonNumber: 43,
      },
      {
        slug: 'lesson-004',
        title: 'Product Lifecycle',
        lessonNumber: 4,
      },
    ],
    updatedAt: '2026-11-15',
  },
  {
    slug: 'opportunity-solution-tree',
    title: 'Opportunity Solution Tree',
    summary:
      'A visual discovery mapping framework that connects a top-level target outcome to discovered customer problem opportunities, candidate solutions, and granular assumption tests. It prevents teams from prematurely jumping from a business goal straight to an untested feature idea.',
    whenToUse:
      'Use the Opportunity Solution Tree during continuous discovery to structure customer interview insights, balance solution exploration, and ensure every engineering bet connects to an explicit outcome.',
    workedExample: {
      scenario: 'Driving higher course completion for an online learning platform.',
      application:
        'Target Outcome: Increase 30-day lesson completion rate from 22% to 35%. Customer Opportunities: Opportunity 1 ("I forget to resume when interrupted") and Opportunity 2 ("Lessons feel too dense to read on mobile"). Candidate Solutions for Opportunity 1: Daily streak notifications vs SMS reminders. Assumption Test: Test email reminders on a 500-student cohort.',
      outcome:
        'The team avoids committing 3 engineering sprints to complex gamification and instead discovers that lightweight email reminders achieve 70% of the target outcome.',
    },
    citation: {
      author: 'Teresa Torres',
      source: 'Continuous Discovery Habits: Discover Products that Create Customer Value and Business Value, Product Talk',
      year: '2021',
      url: 'https://www.producttalk.org/opportunity-solution-tree/',
    },
    relatedLessons: [
      {
        slug: 'lesson-020',
        title: 'Product Discovery Process',
        lessonNumber: 20,
      },
      {
        slug: 'lesson-019',
        title: 'Opportunity Identification',
        lessonNumber: 19,
      },
    ],
    updatedAt: '2026-11-15',
  },
  {
    slug: 'desirability-feasibility-viability',
    title: 'Desirability, Feasibility, Viability (DFV)',
    summary:
      'A core innovation filter originating from design thinking that evaluates product ideas at the intersection of three fundamental criteria: Desirability (do users want this and will it solve their problem?), Feasibility (can we technically build and maintain it?), and Viability (does it support a viable business model?).',
    whenToUse:
      'Use DFV during early product discovery, major architectural pivots, or new product concept validation before writing detailed specifications or committing engineering resources.',
    workedExample: {
      scenario: 'Evaluating an automated contract analysis feature for legal operations.',
      application:
        'Desirability: Customer interviews with 15 corporate paralegals confirm that manual review consumes 14 hours per week. Feasibility: Engineering prototypes achieve 94% parsing accuracy using standard open language models within acceptable latency limits. Viability: Customer willingness-to-pay is $120 per month, comfortably exceeding the estimated compute cost of $18 per user.',
      outcome:
        'All three pillars demonstrate positive signal, giving the leadership team confidence to fund MVP development.',
    },
    citation: {
      author: 'IDEO and Tim Brown',
      source: 'Change by Design: How Design Thinking Transforms Organizations and Inspires Innovation, HarperBusiness',
      year: '2009',
      url: 'https://www.ideo.com',
    },
    relatedLessons: [
      {
        slug: 'lesson-001',
        title: 'What is Product Management?',
        lessonNumber: 1,
      },
      {
        slug: 'lesson-003',
        title: 'Product Thinking',
        lessonNumber: 3,
      },
    ],
    updatedAt: '2026-11-15',
  },
  {
    slug: 'okrs',
    title: 'Objectives and Key Results (OKRs)',
    summary:
      'A goal-setting framework that pairs a qualitative, inspiring, and directional Objective with three to five quantitative, measurable Key Results. OKRs measure whether value was created rather than whether a predetermined checklist of tasks was completed.',
    whenToUse:
      'Use OKRs during quarterly company and squad planning to align product strategy with organizational priorities, clarify what success looks like, and give squads autonomy over how to achieve outcomes.',
    workedExample: {
      scenario: 'Setting Q3 product goals for a customer onboarding squad.',
      application:
        'Objective: Deliver a frictionless first-hour product experience that makes new learners feel immediate momentum. Key Result 1: Increase Day-1 lesson completion rate from 28% to 45%. Key Result 2: Decrease average onboarding support tickets from 12% to under 4%. Key Result 3: Achieve an onboarding satisfaction CSAT score of 4.6 out of 5.',
      outcome:
        'The team is empowered to experiment with interactive tours, sample templates, and contextual tooltips rather than being constrained to deliver a rigid PRD specification.',
    },
    citation: {
      author: 'Andy Grove and John Doerr',
      source: 'High Output Management (Andy Grove, Intel) and Measure What Matters (John Doerr, Penguin)',
      year: '1983 / 2018',
    },
    relatedLessons: [
      {
        slug: 'lesson-010',
        title: 'Product Strategy & Strategic Thinking',
        lessonNumber: 10,
      },
      {
        slug: 'lesson-002',
        title: 'Product vs. Project',
        lessonNumber: 2,
      },
    ],
    updatedAt: '2026-11-15',
  },
]

export function getFrameworkBySlug(slug: string): FrameworkDetail | undefined {
  return FRAMEWORK_DETAILS.find((fw) => fw.slug === slug)
}

export function getAllFrameworkSlugs(): string[] {
  return FRAMEWORK_DETAILS.map((fw) => fw.slug)
}

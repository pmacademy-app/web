/**
 * Module Capstone Definitions & Metadata (Phase 3 Sprint 1)
 *
 * Defines instructions, learning objectives, submission requirements,
 * and starter templates for all 9 module capstone projects.
 */

export interface CapstoneRequirement {
  id: string
  label: string
  description: string
}

export interface CapstoneDefinition {
  moduleSlug: string
  moduleNumber: number
  moduleTitle: string
  title: string
  tagline: string
  estimatedHours: string
  competencyCluster: 'strategy' | 'discovery' | 'design' | 'execution' | 'growth' | 'leadership' | 'technical'
  deliverableType: string
  scenario: string
  instructions: string[]
  learningObjectives: string[]
  requirements: CapstoneRequirement[]
  minWordCount: number
  starterTemplate: string
}

export const CAPSTONE_DEFINITIONS: Record<string, CapstoneDefinition> = {
  foundations: {
    moduleSlug: 'foundations',
    moduleNumber: 1,
    moduleTitle: 'Product Thinking Foundations',
    title: 'Product Opportunity Brief & Problem Definition',
    tagline: 'Transform a raw customer problem into an actionable, structured product opportunity brief.',
    estimatedHours: '2–3 hrs',
    competencyCluster: 'strategy',
    deliverableType: 'Opportunity Brief',
    scenario:
      'You are a Product Manager at a growing B2B/B2C hybrid platform. Your team has observed high user drop-off during user onboarding and high churn within the first 14 days. Leadership wants a strategic Opportunity Brief that clearly frames the problem before any code is written.',
    instructions: [
      'Define the core user problem using the Jobs-To-Be-Done (JTBD) framework.',
      'Distinguish clearly between user pain points and customer business objectives.',
      'Document target user personas, key assumptions, and risk factors.',
      'Establish explicit success metrics and measurable KPIs for solving this problem.',
    ],
    learningObjectives: [
      'Master problem framing without jumping to solutions.',
      'Apply Jobs-to-Be-Done (JTBD) to unearth customer motivation.',
      'Formulate falsifiable hypotheses and success metrics.',
    ],
    requirements: [
      { id: 'req_problem', label: 'Problem Statement', description: 'Clear, evidence-backed description of the core user pain point.' },
      { id: 'req_jtbd', label: 'Jobs-To-Be-Done', description: 'When [situation], I want to [motivation], so that [outcome].' },
      { id: 'req_personas', label: 'Target Personas & Constraints', description: 'Primary and secondary user personas with key constraints.' },
      { id: 'req_metrics', label: 'Success Metrics', description: 'Quantifiable input and output metrics to evaluate success.' },
    ],
    minWordCount: 250,
    starterTemplate: `# Product Opportunity Brief: [Product Name / Feature]

## 1. Problem Statement
*Describe the customer pain point, observed evidence, and why this problem matters now.*

## 2. Target Persona & User Segment
*Who experiences this problem most acutely? What are their key constraints?*

## 3. Jobs-To-Be-Done (JTBD)
- **Core Job:** When I [context], I want to [action], so that [outcome].
- **Emotional Job:** How the user wants to feel.
- **Social Job:** How the user wants to be perceived.

## 4. Business Impact & Success Metrics
- **Primary Metric:**
- **Secondary Metrics:**
- **Guardrail Metric:**

## 5. Key Risks & Hypotheses
*What assumptions must be true for this opportunity to succeed?*
`,
  },

  discovery: {
    moduleSlug: 'discovery',
    moduleNumber: 2,
    moduleTitle: 'Users, Problems & Discovery',
    title: 'User Research Plan & Opportunity Solution Tree',
    tagline: 'Design customer discovery interviews and map insights onto an Opportunity Solution Tree.',
    estimatedHours: '3–4 hrs',
    competencyCluster: 'discovery',
    deliverableType: 'Discovery Artifact',
    scenario:
      'Your company wants to expand into a new workflow area. Before committing engineering resources, you must conduct discovery interviews, synthesize qualitative feedback, and build an Opportunity Solution Tree (OST) to map customer opportunities to potential testable solutions.',
    instructions: [
      'Draft a continuous discovery user research script with open-ended, non-leading questions.',
      'Synthesize 3 hypothetical user interview transcripts into key insights and recurring pain patterns.',
      'Construct a text-based Opportunity Solution Tree mapping Desired Outcome -> Opportunities -> Solutions -> Experiments.',
      'Define validation experiments for your top-priority solution branch.',
    ],
    learningObjectives: [
      'Conduct unbiased qualitative user discovery interviews.',
      'Synthesize unstructured qualitative data into structured opportunity insights.',
      'Build an Opportunity Solution Tree to navigate decision trade-offs.',
    ],
    requirements: [
      { id: 'req_research_plan', label: 'Research Protocol', description: 'Target criteria and non-leading interview question script.' },
      { id: 'req_synthesis', label: 'Insight Synthesis', description: 'Categorized user insights backed by qualitative quotes.' },
      { id: 'req_ost', label: 'Opportunity Solution Tree', description: 'Text-formatted OST showing outcome, opportunities, and solutions.' },
      { id: 'req_experiments', label: 'Assumption Tests', description: 'De-risking experiment plan for top candidate solutions.' },
    ],
    minWordCount: 300,
    starterTemplate: `# User Discovery & Opportunity Solution Tree

## 1. Research Objective & Target Participant Profile
*What are you trying to learn? Who did you interview?*

## 2. Customer Interview Guide
1. Tell me about the last time you...
2. What was the hardest part about...
3. Why was that frustrating?
4. How do you currently solve this?

## 3. Key Findings & Insight Synthesis
- **Insight 1:**
- **Insight 2:**
- **Insight 3:**

## 4. Opportunity Solution Tree (OST)
\`\`\`
[Desired Business/User Outcome]
  ├── Opportunity A: [User Pain Point]
  │     ├── Solution A1: [Feature Concept]
  │     └── Solution A2: [Alternative Concept]
  └── Opportunity B: [Secondary Pain Point]
        └── Solution B1: [Feature Concept]
\`\`\`

## 5. De-risking Experiments
*How will you test your solution assumptions before building?*
`,
  },

  strategy: {
    moduleSlug: 'strategy',
    moduleNumber: 3,
    moduleTitle: 'Defining Products & PRDs',
    title: 'Comprehensive Product Requirements Document (PRD)',
    tagline: 'Write an engineering-ready PRD with scope, user stories, acceptance criteria, and edge cases.',
    estimatedHours: '3–4 hrs',
    competencyCluster: 'execution',
    deliverableType: 'Full PRD',
    scenario:
      'You are leading a cross-functional team (Design, Engineering, Data) to build a major new feature for your product. Write a comprehensive PRD that bridges product strategy and technical execution, leaving zero ambiguity for the engineering team.',
    instructions: [
      'Define clear feature scope, non-goals, and explicit out-of-scope boundaries.',
      'Write detailed User Stories with Gherkin-style Acceptance Criteria (Given/When/Then).',
      'Specify user interaction flows, error states, and edge cases.',
      'Define technical non-functional requirements (performance, accessibility, security, privacy).',
    ],
    learningObjectives: [
      'Author unambiguous, developer-ready Product Requirements Documents.',
      'Write rigorous user stories with testable acceptance criteria.',
      'Identify and account for critical edge cases and failure modes.',
    ],
    requirements: [
      { id: 'req_scope', label: 'In-Scope & Out-of-Scope', description: 'Explicit boundaries preventing scope creep.' },
      { id: 'req_user_stories', label: 'User Stories & Acceptance Criteria', description: 'Given/When/Then criteria for key user flows.' },
      { id: 'req_edge_cases', label: 'Edge Cases & Error Handling', description: 'Behavior during network failures, invalid input, and limits.' },
      { id: 'req_nfrs', label: 'Non-Functional Requirements', description: 'Performance, security, accessibility, and analytics instrumentation.' },
    ],
    minWordCount: 350,
    starterTemplate: `# Product Requirements Document (PRD): [Feature Name]

## 1. Executive Overview & Strategic Intent
*Brief summary of the feature, target user value, and business goals.*

## 2. In-Scope vs. Out-of-Scope
### In-Scope (v1)
- 

### Out-of-Scope (Non-Goals)
- 

## 3. User Stories & Acceptance Criteria
### Story 1: [User Goal]
- **As a** [user type]
- **I want to** [action]
- **So that** [benefit]

**Acceptance Criteria:**
- **Given** [initial state]
- **When** [user action]
- **Then** [expected result]

## 4. Edge Cases & Error Handling
- *What happens if the connection drops?*
- *What happens on empty or overflow state?*

## 5. Telemetry & Analytics Events
- \`event_name\`: Trigger conditions & properties.
`,
  },

  execution: {
    moduleSlug: 'execution',
    moduleNumber: 4,
    moduleTitle: 'Prioritization & Roadmaps',
    title: 'Quarterly Product Roadmap & Tradeoff Defense Memo',
    tagline: 'Prioritize feature bets using RICE/Kano frameworks and defend tradeoffs in an executive memo.',
    estimatedHours: '2–3 hrs',
    competencyCluster: 'execution',
    deliverableType: 'Roadmap & Memo',
    scenario:
      'Engineering bandwidth is cut by 30% for next quarter, while Sales demands 3 enterprise features and Marketing asks for self-serve growth items. Evaluate 6 competing feature candidate items, apply a transparent prioritization framework, build a Now/Next/Later roadmap, and defend your trade-offs.',
    instructions: [
      'Score 6 candidate features using RICE (Reach, Impact, Confidence, Effort) or Kano model.',
      'Construct a 3-horizon Now / Next / Later strategic roadmap.',
      'Write a executive memo addressing leadership, explaining why high-profile items were deprioritized.',
      'Define risk mitigation strategies for postponed features.',
    ],
    learningObjectives: [
      'Apply quantitative prioritization frameworks objectively.',
      'Construct outcome-oriented Now/Next/Later roadmaps.',
      'Defend tough trade-off decisions with executive communication mastery.',
    ],
    requirements: [
      { id: 'req_scoring', label: 'Prioritization Scoring Matrix', description: 'Scored table of feature candidates with Reach, Impact, Confidence, Effort.' },
      { id: 'req_roadmap', label: 'Now / Next / Later Roadmap', description: 'Categorized roadmap focused on outcomes over static deadlines.' },
      { id: 'req_defense', label: 'Executive Tradeoff Memo', description: 'Persuasive defense explaining rejected or deferred items.' },
    ],
    minWordCount: 300,
    starterTemplate: `# Quarterly Product Roadmap & Tradeoff Defense Memo

## 1. Executive Summary
*Overview of quarterly focus and key strategic themes.*

## 2. Prioritization Matrix (RICE Scoring)
| Candidate Feature | Reach | Impact | Confidence | Effort (Person-Wks) | RICE Score | Decision |
|---|---|---|---|---|---|---|
| Feature A | 1,000 | 3 (High) | 80% | 4 | 600 | Now |
| Feature B | 5,000 | 1 (Low) | 100% | 2 | 250 | Next |

## 3. Now / Next / Later Strategic Roadmap
### NOW (Current Quarter - High Certainty)
- **Theme 1:** [Outcome description]

### NEXT (Following Quarter - Medium Certainty)
- **Theme 2:** [Outcome description]

### LATER (Future Horizons - Low Certainty)
- **Theme 3:** [Outcome description]

## 4. Trade-off Defense & Stakeholder Communication Memo
*Dear Executive Team & Sales Leadership...*
`,
  },

  design: {
    moduleSlug: 'design',
    moduleNumber: 5,
    moduleTitle: 'Design, UX & Prototyping',
    title: 'UX Wireframe Critique & Interaction Design Spec',
    tagline: 'Audit a product interface, identify usability friction, and specify redesigned interaction flows.',
    estimatedHours: '3–4 hrs',
    competencyCluster: 'design',
    deliverableType: 'UX Design Spec',
    scenario:
      'Your core conversion funnel is suffering from usability friction. Audit an existing key user interface flow using Nielsen’s 10 Usability Heuristics, specify wireframe layout modifications, and write an interaction specification for the Product Designer and Frontend Engineer.',
    instructions: [
      'Conduct a heuristic audit identifying 3 specific UX usability breakdowns.',
      'Describe redesigned layout components, visual hierarchy, and micro-copy.',
      'Detail step-by-step interaction states (default, hover, active, error, loading, empty).',
      'Incorporate WCAG AA accessibility requirements (contrast, keyboard focus, screen reader ARIA labels).',
    ],
    learningObjectives: [
      'Apply Nielsen’s Usability Heuristics to critique digital product UIs.',
      'Collaborate effectively with product designers on interaction specifications.',
      'Design accessible, inclusive user experiences from day one.',
    ],
    requirements: [
      { id: 'req_audit', label: 'Heuristic Audit', description: 'Identification of 3 specific usability breakdowns mapped to heuristics.' },
      { id: 'req_spec', label: 'Interaction Specification', description: 'Detailed layout breakdown, microcopy, and visual hierarchy.' },
      { id: 'req_states', label: 'Component States', description: 'Description of loading, empty, active, and error states.' },
      { id: 'req_a11y', label: 'Accessibility Requirements', description: 'WCAG AA compliance guidelines for the flow.' },
    ],
    minWordCount: 300,
    starterTemplate: `# UX Wireframe Critique & Interaction Spec

## 1. Usability Heuristic Audit
- **Issue 1:** [Violation of Visibility of System Status]
- **Issue 2:** [Violation of Error Prevention]
- **Issue 3:** [Violation of Consistency & Standards]

## 2. Redesigned Layout & Component Hierarchy
*Describe the proposed visual structure and layout improvements.*

## 3. Component State Matrix
- **Default State:**
- **Loading / Skeleton State:**
- **Success / Active State:**
- **Error State:**

## 4. Micro-copy & Micro-interactions
*Exact button labels, error message wording, and micro-animations.*

## 5. Accessibility Specs (WCAG AA)
- Focus ring indicators
- Keyboard navigation flow (Tab order)
- ARIA live region specifications
`,
  },

  metrics: {
    moduleSlug: 'metrics',
    moduleNumber: 6,
    moduleTitle: 'Metrics, Growth & Experiments',
    title: 'North Star Metric Tree & A/B Experiment Spec',
    tagline: 'Deconstruct a company North Star Metric into driver trees and design a rigorous A/B experiment.',
    estimatedHours: '3–4 hrs',
    competencyCluster: 'growth',
    deliverableType: 'Metrics & Experiment Spec',
    scenario:
      'Leadership wants to improve product retention and conversion. Map your product’s North Star Metric into its input levers (Breadth, Depth, Frequency, Efficiency), formulate a testable growth hypothesis, and author a complete A/B experiment spec.',
    instructions: [
      'Define the North Star Metric and construct an input metric driver tree.',
      'Formulate a scientific hypothesis (If [change], then [impact], because [rationale]).',
      'Specify experiment parameters: sample size, allocation split, minimum detectable effect (MDE), and duration.',
      'Define primary metric, secondary metrics, and guardrail metrics.',
    ],
    learningObjectives: [
      'Deconstruct high-level business goals into input metric trees.',
      'Formulate hypothesis-driven growth experiments.',
      'Mitigate risk with guardrail metrics and statistical discipline.',
    ],
    requirements: [
      { id: 'req_nsm', label: 'North Star Metric Tree', description: 'Primary metric with input drivers (Breadth, Depth, Frequency).' },
      { id: 'req_hypothesis', label: 'Experiment Hypothesis', description: 'Structured testable hypothesis statement.' },
      { id: 'req_exp_design', label: 'Experiment Design & Metrics', description: 'Control vs Variant, MDE, duration, primary & guardrail metrics.' },
      { id: 'req_post_mortem', label: 'Decision Protocol', description: 'Pre-defined rules for rollout, iteration, or rollback.' },
    ],
    minWordCount: 300,
    starterTemplate: `# North Star Metric Tree & A/B Experiment Spec

## 1. North Star Metric & Driver Tree
**North Star Metric:** [e.g., Weekly Active Team Creators]

### Input Drivers:
- **Breadth:** [e.g., New user signups]
- **Depth:** [e.g., Actions per session]
- **Frequency:** [e.g., Days active per week]

## 2. Hypothesis Formulation
*If we [change X for segment Y], then [metric Z will improve by W%], because [behavioral insight].*

## 3. Experiment Setup & Statistical Parameters
- **Control (Variant A):** Existing experience
- **Treatment (Variant B):** Modified experience
- **Sample Allocation:** 50/50 split
- **Minimum Detectable Effect (MDE):** 5% relative lift
- **Required Sample Size & Duration:** [e.g., 20,000 visitors over 14 days]

## 4. Metric Tracking Matrix
- **Primary Metric:**
- **Secondary Metrics:**
- **Guardrail Metrics:** [e.g., Unsubscribe rate, latency]

## 5. Rollout / Rollback Protocol
*What happens if Variant B wins? What if guardrail metric degrades?*
`,
  },

  technical: {
    moduleSlug: 'technical',
    moduleNumber: 7,
    moduleTitle: 'Technical Fluency for PMs',
    title: 'System Architecture & API Integration Tradeoff Brief',
    tagline: 'Evaluate technical architecture trade-offs and author an engineering alignment decision brief.',
    estimatedHours: '2–3 hrs',
    competencyCluster: 'technical',
    deliverableType: 'Technical Tradeoff Brief',
    scenario:
      'Your product needs a real-time data sync capability (or third-party integration). The engineering team is divided between two architectural approaches (e.g. WebSockets vs Polling, REST vs GraphQL, or Build in-house vs Third-party API). Write a technical trade-off brief guiding the decision.',
    instructions: [
      'Compare Option A vs Option B across latency, scalability, development cost, and maintainability.',
      'Specify API endpoints, data models, and payloads (JSON schema overview).',
      'Address failure modes: rate limits, database locks, API downtime, and fallback mechanisms.',
      'Formulate a recommended technical path forward aligned with business constraints.',
    ],
    learningObjectives: [
      'Evaluate architectural tradeoffs without needing to write production code.',
      'Communicate credibly with engineering leads and architects.',
      'Account for technical debt, scalability limits, and resilience.',
    ],
    requirements: [
      { id: 'req_tech_context', label: 'Technical Context & Architecture Options', description: 'Clear summary of the two architectural approaches.' },
      { id: 'req_comparison', label: 'Trade-off Evaluation Matrix', description: 'Comparison across latency, cost, complexity, and scale.' },
      { id: 'req_api_spec', label: 'Data Model & Payload Overview', description: 'High-level API endpoint structure or JSON payload schema.' },
      { id: 'req_recommendation', label: 'Recommendation & Mitigation', description: 'Justified decision and technical debt mitigation plan.' },
    ],
    minWordCount: 300,
    starterTemplate: `# Technical Architecture Tradeoff Brief

## 1. Problem Statement & Technical Goal
*Why is this technical decision required? What performance or scale demands exist?*

## 2. Option Comparison Matrix
| Dimension | Option A: [e.g., REST + Webhook] | Option B: [e.g., WebSockets / GraphQL] |
|---|---|---|
| Latency | ~500ms | < 50ms |
| Implementation Effort | 2 Sprints | 4 Sprints |
| Server / Infra Cost | Low | Medium |
| Operational Complexity | Low | High |

## 3. Data Flow & API Schema Overview
\`\`\`json
{
  "event": "data_updated",
  "payload": {
    "id": "res_123",
    "status": "completed",
    "timestamp": "2026-08-05T12:00:00Z"
  }
}
\`\`\`

## 4. Failure Modes & Resilience
- **Rate Limit Handling:** Exponential backoff strategy.
- **Third-Party Downtime:** Fallback queue mechanism.

## 5. Recommendation & Engineering Alignment
*Our recommendation is Option A because...*
`,
  },

  leadership: {
    moduleSlug: 'leadership',
    moduleNumber: 8,
    moduleTitle: 'Stakeholders & Leadership',
    title: 'Cross-Functional Stakeholder Alignment & Crisis Plan',
    tagline: 'Navigate stakeholder conflicts, align divergent incentives, and author an executive communication plan.',
    estimatedHours: '2–3 hrs',
    competencyCluster: 'leadership',
    deliverableType: 'Alignment Plan',
    scenario:
      'A critical release date is 2 weeks away. Sales wants to add a custom enterprise request to close a major deal, Engineering threatens to quit over tech debt, and Security flagged a vulnerability. Manage this multi-party stakeholder conflict and communicate a clear path forward.',
    instructions: [
      'Map stakeholder incentives, influence, and underlying motivations.',
      'Formulate a win-win compromise that protects core product integrity.',
      'Draft an executive communication memo to the CEO/VP outlining the resolution.',
      'Establish a stakeholder communication cadence to rebuild trust.',
    ],
    learningObjectives: [
      'Lead cross-functional alignment without direct authority.',
      'De-escalate high-stakes team conflicts constructively.',
      'Master executive communication during crises.',
    ],
    requirements: [
      { id: 'req_stakeholder_map', label: 'Stakeholder Incentive Mapping', description: 'Analysis of key parties, goals, and conflicts.' },
      { id: 'req_resolution', label: 'Alignment & Compromise Strategy', description: 'Balanced resolution preserving product standards.' },
      { id: 'req_exec_comm', label: 'Executive Briefing Memo', description: 'Clear, concise update to executive leadership.' },
    ],
    minWordCount: 300,
    starterTemplate: `# Cross-Functional Alignment & Stakeholder Crisis Plan

## 1. Conflict & Situation Analysis
*Summary of competing priorities between Sales, Engineering, Security, and Product.*

## 2. Stakeholder Incentive Mapping
- **Sales Lead:** Wants enterprise deal closed -> Needs security assurance & committed timeline.
- **Engineering Lead:** Wants tech debt addressed -> Needs scope protection & zero extra crunch.
- **Security Lead:** Wants zero vulnerabilities -> Needs patch applied before public release.

## 3. Proposed Resolution Strategy
*How we will balance these competing priorities without compromising quality.*

## 4. Executive Communication Briefing (Email to CEO/VPs)
**Subject:** Update: Release Alignment Plan & Timeline Adjustment

*Dear Leadership Team...*

## 5. Ongoing Alignment Cadence
*Weekly check-ins, transparent backlog reviews, and escalation protocols.*
`,
  },

  capstone: {
    moduleSlug: 'capstone',
    moduleNumber: 9,
    moduleTitle: 'Capstone & Career Portfolio',
    title: 'End-to-End Interview-Ready Product Case Study',
    tagline: 'Synthesize all 9 modules into a comprehensive, interview-ready Product Case Study portfolio artifact.',
    estimatedHours: '5–6 hrs',
    competencyCluster: 'strategy',
    deliverableType: 'Comprehensive Portfolio Case Study',
    scenario:
      'This is your final PM Academy milestone. Choose a product problem (or expand one of your earlier deliverables) and construct a complete, end-to-end Product Case Study that you would present in a PM hiring manager interview or attach to your portfolio.',
    instructions: [
      'Synthesize problem discovery, user research, product strategy, PRD specifications, prioritization, design considerations, and growth metrics.',
      'Format as a high-caliber case study suitable for portfolio display.',
      'Include retrospectives and post-launch learnings ("What would you do differently next time?").',
      'Ensure clear structure, professional tone, and compelling narrative arc.',
    ],
    learningObjectives: [
      'Synthesize the complete product management lifecycle into one portfolio piece.',
      'Demonstrate end-to-end product judgment for PM hiring interviews.',
      'Reflect critically on product tradeoffs and post-launch iteration.',
    ],
    requirements: [
      { id: 'req_summary', label: 'Executive Case Summary', description: 'Compelling overview of problem, solution, and impact.' },
      { id: 'req_discovery_strat', label: 'Discovery & Product Strategy', description: 'User insights, market opportunity, and JTBD.' },
      { id: 'req_prd_design', label: 'Solution Architecture & Design', description: 'PRD highlights, key user flows, and technical considerations.' },
      { id: 'req_metrics_retrospective', label: 'Metrics & Post-Mortem Reflection', description: 'Success metrics, experiment results, and key learnings.' },
    ],
    minWordCount: 500,
    starterTemplate: `# Product Case Study: [Product / Feature Name]

## Executive Summary
*Brief elevator pitch of the project, key problem solved, solution built, and business impact achieved.*

---

## 1. Problem Discovery & User Insights
- **Background & Context:**
- **Target Persona & User Pain Points:**
- **Jobs-To-Be-Done:**

---

## 2. Strategic Opportunity & Market Positioning
- **Market Opportunity:**
- **Prioritization Rationale:**

---

## 3. Product Solution & Key Features (PRD Summary)
- **Feature Overview:**
- **Core User Flow & Interaction Spec:**
- **Technical Considerations:**

---

## 4. Growth Metrics & Experimentation Plan
- **North Star Metric & KPIs:**
- **A/B Experiment Hypothesis:**

---

## 5. Results, Impact & Retrospective
- **Quantifiable Outcome / Expected Impact:**
- **What Learned / What Would Do Differently:**
`,
  },
}

/**
 * Returns the capstone definition for a module slug, or null if invalid.
 */
export function getCapstoneDefinition(moduleSlug: string): CapstoneDefinition | null {
  return CAPSTONE_DEFINITIONS[moduleSlug] ?? null
}

/**
 * Returns an ordered array of all capstone definitions (Modules 1 to 9).
 */
export function getAllCapstoneDefinitions(): CapstoneDefinition[] {
  return Object.values(CAPSTONE_DEFINITIONS).sort((a, b) => a.moduleNumber - b.moduleNumber)
}

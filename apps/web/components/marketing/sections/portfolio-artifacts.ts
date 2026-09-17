import { TOKENS } from '@/theme/tokens'

/**
 * The four showcase artifacts for the landing portfolio section.
 *
 * Lifted out of `portfolio.tsx` in B12-B so the section body could become a server
 * component while the carousel that renders these stays a client island. Plain data
 * with one token import — no hooks, no engine, safe on either side of the boundary.
 */

export interface ArtifactCard {
  id: string
  title: string
  type: string
  module: string
  badge: string
  color: string
  summary: string
  deliverableBullets: string[]
  previewSnippet: {
    heading: string
    body: string
    meta: string
  }
}

export const ARTIFACTS: ArtifactCard[] = [
  {
    id: 'prd',
    title: 'One-Click Checkout Activation Funnel PRD',
    type: 'PRD Spec',
    module: 'Module 03 · Execution',
    badge: 'Capstone 01',
    color: TOKENS.colors.primary,
    summary: 'A structured PRD covering the solution-free problem statement, non-goals, user stories, acceptance criteria, and success metrics.',
    deliverableBullets: [
      'Solution-free problem statement',
      'Explicit non-goals & scope bounds',
      'Given/When/Then acceptance criteria',
      'Measurable conversion metrics',
    ],
    previewSnippet: {
      heading: 'Problem Statement & Non-Goals',
      body: '42% of mobile shoppers drop off during address entry due to redundant validation loops. Non-goal: No third-party BNPL integration in Phase 1.',
      meta: 'Module 3 · Lesson 22 (Product Requirements Document)',
    },
  },
  {
    id: 'roadmap',
    title: 'Outcome-Based Product Roadmap & RICE Model',
    type: 'Strategic Roadmap',
    module: 'Module 04 · Execution',
    badge: 'Capstone 02',
    color: '#D97706',
    summary: 'A prioritization and sequencing exercise applying the RICE framework and Now/Next/Later horizons to sequence engineering capacity.',
    deliverableBullets: [
      'RICE quantitative scoring',
      'Now / Next / Later horizons',
      'Explicit strategic trade-offs',
      'Confidence-weighted estimates',
    ],
    previewSnippet: {
      heading: 'RICE Score & Horizon Allocation',
      body: 'Score = (Reach 12k × Impact 3 × Confidence 80%) / Effort 2 sprints = 14.4. Allocated to "Now" horizon for Q3 activation.',
      meta: 'Module 4 · Lesson 35 (Roadmapping & Release Planning)',
    },
  },
  {
    id: 'casestudy',
    title: 'Mobile Shopper Discovery & Journey Synthesis',
    type: 'Discovery Case Study',
    module: 'Module 02 · Discovery',
    badge: 'Capstone 03',
    color: '#0284C7',
    summary: 'A research-led discovery teardown synthesizing customer interviews, journey mapping, and assumption testing into a delivery-ready opportunity.',
    deliverableBullets: [
      'Interview evidence synthesis',
      'User journey drop-off mapping',
      'Opportunity Solution Tree',
      'Validated problem framing',
    ],
    previewSnippet: {
      heading: 'Research Synthesis & Opportunity Framing',
      body: 'Qualitative synthesis across N=32 customer interviews revealed friction was caused by postal code pre-validation rather than payment security concerns.',
      meta: 'Module 2 · Lesson 20 (Product Discovery Process)',
    },
  },
  {
    id: 'strategy',
    title: 'Marketplace Platform Strategy & Moat Analysis',
    type: 'Executive Strategy Memo',
    module: 'Module 08 · Leadership',
    badge: 'Capstone 04',
    color: '#7C3AED',
    summary: 'An executive decision memo using Rumelt’s Strategy Kernel and the Leverage Stack to evaluate two-sided marketplace defensibility and pricing.',
    deliverableBullets: [
      'Strategy Kernel (Diagnosis & Policy)',
      'Two-sided liquidity analysis',
      'Moat durability assessment',
      'Enterprise concession matrix',
    ],
    previewSnippet: {
      heading: 'Diagnosis & Guiding Policy',
      body: 'Diagnosis: Multi-homing suppliers erode take-rates. Guiding Policy: Lock in supplier workflows with proprietary tooling before opening the buyer marketplace.',
      meta: 'Module 8 · Lesson 75 (Competitive Strategy and Moats)',
    },
  },
]

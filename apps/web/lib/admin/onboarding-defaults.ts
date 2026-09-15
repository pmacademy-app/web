/**
 * Onboarding default options (client-safe).
 *
 * Pure data: the option lists and step definitions the onboarding wizard renders
 * before an administrator has customised them. No logic, no imports beyond the
 * shared types.
 *
 * They live here rather than in `settings-service.ts` for the same reason the
 * portfolio layout constants moved out of `portfolio-db.ts` in B9-C. Two client
 * components need them — `app/onboarding/OnboardingWizard.tsx` and
 * `components/admin/OnboardingSettingsSection.tsx` — and importing them from the
 * service dragged `createServiceRoleClient` and the `system_settings` query code
 * into the browser bundle, which the build output confirmed.
 *
 * Nothing secret leaked: `SUPABASE_SERVICE_ROLE_KEY` is not `NEXT_PUBLIC_`-prefixed,
 * so Next.js replaces it with undefined in client code. The cost was bundle weight,
 * server query code shipped to browsers that cannot use it, and a latent build
 * break — the moment anything in that chain gains a node-only dependency, the
 * browser build fails. That is not hypothetical: it is exactly what happened in
 * B9-C when `node:async_hooks` landed behind `portfolio-db`.
 *
 * `settings-service.ts` re-exports all five names, so server call sites are
 * unchanged.
 */

import type { OnboardingFieldOption, OnboardingStepConfig } from './types'

export const DEFAULT_GOAL_OPTIONS: OnboardingFieldOption[] = [
  {
    id: 'become_pm',
    label: 'Become a Product Manager',
    description: 'Build core product thinking and mental models to land your first PM role.',
    badge: 'Aspiring PM',
    icon: 'Target',
    enabled: true,
    recommendedModule: 'foundations',
  },
  {
    id: 'transition_pm',
    label: 'Transition into Product Management',
    description: 'Pivot from engineering, design, consulting, marketing, or operations into product.',
    badge: 'Career Pivot',
    icon: 'Compass',
    enabled: true,
    recommendedModule: 'foundations',
  },
  {
    id: 'grow_career',
    label: 'Grow in my PM career',
    description: 'Sharpen advanced strategy, executive communication, and leadership capabilities.',
    badge: 'Skill Growth',
    icon: 'TrendingUp',
    enabled: true,
    recommendedModule: 'strategy',
  },
  {
    id: 'build_skills',
    label: 'Build practical PM skills',
    description: 'Master discovery, PRDs, metrics trees, and roadmapping through real capstones.',
    badge: 'Hands-on',
    icon: 'Sparkles',
    enabled: true,
    recommendedModule: 'discovery',
  },
  {
    id: 'explore_pm',
    label: 'Explore Product Management',
    description: 'Evaluate PM methodologies, frameworks, and career trajectories.',
    badge: 'Foundations',
    icon: 'BookOpen',
    enabled: true,
    recommendedModule: 'foundations',
  },
]

export const DEFAULT_EXPERIENCE_OPTIONS: OnboardingFieldOption[] = [
  {
    id: 'beginner',
    label: 'Beginner',
    description: 'Brand new to product management concepts and frameworks.',
    badge: 'Level 1',
    icon: 'Sparkles',
    enabled: true,
    recommendedModule: 'foundations',
  },
  {
    id: 'learning',
    label: 'Learning Product Management',
    description: 'Actively studying PM articles, books, or preparing for APM/PM interviews.',
    badge: 'Level 2',
    icon: 'BookOpen',
    enabled: true,
    recommendedModule: 'foundations',
  },
  {
    id: 'working',
    label: 'Working in Product',
    description: 'Associate PM, junior PM, or adjacent role (engineer, designer, analyst) in a product team.',
    badge: 'Level 3',
    icon: 'Briefcase',
    enabled: true,
    recommendedModule: 'discovery',
  },
  {
    id: 'experienced',
    label: 'Experienced Product Manager',
    description: 'Mid to Senior PM looking to level up advanced craft, roadmapping, and leadership.',
    badge: 'Level 4',
    icon: 'Award',
    enabled: true,
    recommendedModule: 'strategy',
  },
]

export const DEFAULT_TOPIC_OPTIONS: OnboardingFieldOption[] = [
  { id: 'discovery', label: 'Product Discovery', badge: 'Discovery', icon: 'Search', enabled: true, recommendedModule: 'discovery' },
  { id: 'user_research', label: 'User Research', badge: 'Research', icon: 'Users', enabled: true, recommendedModule: 'discovery' },
  { id: 'strategy', label: 'Product Strategy', badge: 'Strategy', icon: 'Target', enabled: true, recommendedModule: 'strategy' },
  { id: 'roadmapping', label: 'Product Roadmapping', badge: 'Roadmap', icon: 'Map', enabled: true, recommendedModule: 'strategy' },
  { id: 'prioritization', label: 'Prioritization', badge: 'Decision', icon: 'Sliders', enabled: true, recommendedModule: 'strategy' },
  { id: 'metrics', label: 'Metrics & Analytics', badge: 'Analytics', icon: 'TrendingUp', enabled: true, recommendedModule: 'growth' },
  { id: 'prds', label: 'PRDs & Documentation', badge: 'Execution', icon: 'FileText', enabled: true, recommendedModule: 'execution' },
  { id: 'agile', label: 'Agile & Execution', badge: 'Delivery', icon: 'Zap', enabled: true, recommendedModule: 'execution' },
  { id: 'stakeholders', label: 'Stakeholder Management', badge: 'Leadership', icon: 'Users', enabled: true, recommendedModule: 'leadership' },
  { id: 'launch', label: 'Product Launch', badge: 'GTM', icon: 'Rocket', enabled: true, recommendedModule: 'growth' },
]

export const DEFAULT_PREFERENCE_OPTIONS: OnboardingFieldOption[] = [
  {
    id: 'structured',
    label: 'Structured learning',
    description: 'Follow the progressive 90-lesson curriculum step-by-step from Module 1 to 9.',
    badge: 'Sequential',
    icon: 'ListOrdered',
    enabled: true,
  },
  {
    id: 'hands_on',
    label: 'Hands-on practice',
    description: 'Focus on portfolio capstones, interactive simulations, and real-world exercises.',
    badge: 'Practical',
    icon: 'Hammer',
    enabled: true,
  },
  {
    id: 'case_studies',
    label: 'Case studies',
    description: 'Analyze real teardowns from Stripe, Airbnb, Spotify, Linear, and Notion.',
    badge: 'Analysis',
    icon: 'FileSpreadsheet',
    enabled: true,
  },
  {
    id: 'quick_lessons',
    label: 'Quick lessons',
    description: 'Bite-sized theory with flashcard spaced repetition for rapid retention.',
    badge: 'Micro-learning',
    icon: 'Zap',
    enabled: true,
  },
  {
    id: 'mix',
    label: 'A mix of everything',
    description: 'Balanced approach blending theory, case studies, quizzes, and capstones.',
    badge: 'Comprehensive',
    icon: 'Sparkles',
    enabled: true,
  },
]

export const DEFAULT_ONBOARDING_STEPS: OnboardingStepConfig[] = [
  {
    id: 'step_profile',
    title: 'Build Your Profile',
    description: 'Personalize your learner identity and shareable public portfolio.',
    requiredFields: ['username', 'name'],
  },
  {
    id: 'step_background',
    title: 'Tell Us About You',
    description: 'Help us calibrate your starting point and customized recommendations.',
    requiredFields: ['experience_level', 'goal'],
  },
  {
    id: 'step_interests',
    title: 'Choose What You Want to Learn',
    description: 'Select your focus areas and preferred learning format.',
    requiredFields: ['topics', 'learning_preference'],
  },
  {
    id: 'step_path',
    title: 'Your Prodily Path',
    description: 'Your personalized learning plan is ready to launch.',
    requiredFields: [],
  },
]

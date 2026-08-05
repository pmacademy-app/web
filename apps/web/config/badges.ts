/**
 * PM Academy — Centralized Badge & Achievement Configuration (PRD.md §4.9)
 *
 * Configurable badge rules and metadata for automatic evaluation.
 * Pure configuration object with zero hardcoding in UI or API handlers.
 */

export type BadgeCategory =
  | 'learning'
  | 'quiz'
  | 'xp'
  | 'streak'
  | 'capstones'
  | 'portfolio'
  | 'completion'

export interface BadgeDefinition {
  key: string
  name: string
  description: string
  category: BadgeCategory
  icon: string
  targetGoal: number // target count/metric for progress calculation
  criteriaText: string
}

export const BADGE_CATEGORIES: { id: BadgeCategory; label: string }[] = [
  { id: 'learning', label: 'Learning' },
  { id: 'quiz', label: 'Quiz & Mastery' },
  { id: 'xp', label: 'XP & Progression' },
  { id: 'streak', label: 'Consistency' },
  { id: 'capstones', label: 'Capstones' },
  { id: 'portfolio', label: 'Portfolio' },
  { id: 'completion', label: 'Completion' },
]

export const BADGE_DEFINITIONS: BadgeDefinition[] = [
  // Learning Badges
  {
    key: 'first_lesson',
    name: 'First Step',
    description: 'Completed your very first PM lesson in the curriculum.',
    category: 'learning',
    icon: 'BookOpen',
    targetGoal: 1,
    criteriaText: 'Complete 1 lesson',
  },
  {
    key: 'module_complete',
    name: 'Module Master',
    description: 'Completed all 10 lessons in a single module.',
    category: 'learning',
    icon: 'CheckCircle2',
    targetGoal: 1,
    criteriaText: 'Complete 1 module (10 lessons)',
  },
  {
    key: 'curriculum_explorer',
    name: 'Curriculum Explorer',
    description: 'Completed at least 30 lessons across modules.',
    category: 'learning',
    icon: 'Compass',
    targetGoal: 30,
    criteriaText: 'Complete 30 lessons',
  },

  // Quiz Badges
  {
    key: 'first_perfect_quiz',
    name: 'Sharpshooter',
    description: 'Scored 100% on a quiz on your very first attempt.',
    category: 'quiz',
    icon: 'Target',
    targetGoal: 1,
    criteriaText: '1 perfect first attempt quiz',
  },
  {
    key: 'quiz_master',
    name: 'Quiz Master',
    description: 'Scored 100% on 10 different lesson quizzes.',
    category: 'quiz',
    icon: 'Sparkles',
    targetGoal: 10,
    criteriaText: '10 perfect quiz scores',
  },

  // XP Badges
  {
    key: 'first_level_up',
    name: 'Level Up!',
    description: 'Reached Level 2 (Junior PM) or higher.',
    category: 'xp',
    icon: 'ShieldCheck',
    targetGoal: 2,
    criteriaText: 'Reach Level 2 (250 XP)',
  },
  {
    key: 'xp_1000',
    name: '1,000 XP Club',
    description: 'Earned 1,000 total experience points.',
    category: 'xp',
    icon: 'Zap',
    targetGoal: 1000,
    criteriaText: 'Accumulate 1,000 XP',
  },
  {
    key: 'xp_5000',
    name: '5,000 XP Veteran',
    description: 'Earned 5,000 total experience points.',
    category: 'xp',
    icon: 'Trophy',
    targetGoal: 5000,
    criteriaText: 'Accumulate 5,000 XP',
  },

  // Streak Badges
  {
    key: 'streak_7',
    name: '7-Day Streak',
    description: 'Maintained a 7-day active study streak.',
    category: 'streak',
    icon: 'Flame',
    targetGoal: 7,
    criteriaText: '7 consecutive study days',
  },
  {
    key: 'streak_30',
    name: '30-Day Habit',
    description: 'Maintained a 30-day active study streak.',
    category: 'streak',
    icon: 'Flame',
    targetGoal: 30,
    criteriaText: '30 consecutive study days',
  },
  {
    key: 'streak_comeback',
    name: 'Comeback Kid',
    description: 'Recovered a broken streak using an earned streak freeze.',
    category: 'streak',
    icon: 'RotateCw',
    targetGoal: 1,
    criteriaText: '1 freeze recovery',
  },

  // Capstone Badges
  {
    key: 'first_capstone',
    name: 'Artifact Builder',
    description: 'Submitted your first applied capstone deliverable.',
    category: 'capstones',
    icon: 'Award',
    targetGoal: 1,
    criteriaText: 'Submit 1 capstone',
  },
  {
    key: 'capstones_all',
    name: 'Capstone Titan',
    description: 'Submitted all 9 module capstone deliverables.',
    category: 'capstones',
    icon: 'Crown',
    targetGoal: 9,
    criteriaText: 'Submit 9 capstones',
  },

  // Portfolio Badges
  {
    key: 'portfolio_published',
    name: 'Public Craftsman',
    description: 'Published your public portfolio for peers and recruiters.',
    category: 'portfolio',
    icon: 'Globe',
    targetGoal: 1,
    criteriaText: 'Publish public portfolio',
  },

  // Completion Badges
  {
    key: 'pm_academy_graduate',
    name: 'PM Academy Graduate',
    description: 'Completed all 90 curriculum lessons and 9 capstones.',
    category: 'completion',
    icon: 'GraduationCap',
    targetGoal: 90,
    criteriaText: 'Complete all 90 lessons',
  },
]

/** Retrieves badge definition metadata by key */
export function getBadgeDefinition(key: string): BadgeDefinition | null {
  return BADGE_DEFINITIONS.find((b) => b.key === key) ?? null
}

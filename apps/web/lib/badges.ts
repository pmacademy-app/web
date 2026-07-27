export interface BadgeDefinition {
  key: string
  name: string
  description: string
  icon: string
}

export const BADGE_DEFINITIONS: BadgeDefinition[] = [
  { key: 'first_quiz',         name: 'First Quiz Completed', description: 'Completed your first PM lesson quiz.', icon: 'CheckCircle' },
  { key: 'perfect_quiz',       name: 'Flawless Score',       description: 'Achieved 100% first-attempt on a quiz.', icon: 'Zap' },
  { key: 'first_capstone',     name: 'First Capstone',       description: 'Submitted your first applied capstone.', icon: 'Award' },
  { key: 'module_1_complete',  name: 'Foundations Master',   description: 'Completed all lessons in Module 1.', icon: 'BookOpen' },
  { key: 'module_2_complete',  name: 'Discovery Expert',     description: 'Completed all lessons in Module 2.', icon: 'Search' },
  { key: 'module_3_complete',  name: 'PRD Author',           description: 'Completed all lessons in Module 3.', icon: 'FileText' },
  { key: 'module_4_complete',  name: 'Roadmap Strategist',   description: 'Completed all lessons in Module 4.', icon: 'Map' },
  { key: 'module_5_complete',  name: 'UX Champion',          description: 'Completed all lessons in Module 5.', icon: 'Layout' },
  { key: 'module_6_complete',  name: 'Growth Hacker',        description: 'Completed all lessons in Module 6.', icon: 'TrendingUp' },
  { key: 'module_7_complete',  name: 'Tech Architect',       description: 'Completed all lessons in Module 7.', icon: 'Code' },
  { key: 'module_8_complete',  name: 'Executive Leader',     description: 'Completed all lessons in Module 8.', icon: 'Users' },
  { key: 'module_9_complete',  name: 'Portfolio Builder',    description: 'Completed all lessons in Module 9.', icon: 'Folder' },
  { key: 'streak_7',           name: 'Week-long Scholar',    description: 'Maintained a 7-day learning streak.', icon: 'Flame' },
  { key: 'streak_30',          name: 'Habit Unlocked',       description: 'Maintained a 30-day learning streak.', icon: 'Trophy' },
  { key: 'comeback',           name: 'Resilient Learner',    description: 'Resumed learning after a break of 2+ weeks.', icon: 'RefreshCw' },
  { key: 'cpo_completion',     name: 'Chief Product Officer',description: 'Completed all 90 lessons and 9 capstones.', icon: 'Crown' },
]

export function evaluateNewlyEarnedBadges(context: {
  completedLessonsCount: number
  perfectQuizzesCount: number
  capstonesCount: number
  currentStreak: number
  completedModules: number[]
  existingBadgeKeys: string[]
}): BadgeDefinition[] {
  const earned: BadgeDefinition[] = []

  const checkAndAdd = (key: string) => {
    if (!context.existingBadgeKeys.includes(key)) {
      const def = BADGE_DEFINITIONS.find((b) => b.key === key)
      if (def) earned.push(def)
    }
  }

  if (context.completedLessonsCount >= 1) checkAndAdd('first_quiz')
  if (context.perfectQuizzesCount >= 1) checkAndAdd('perfect_quiz')
  if (context.capstonesCount >= 1) checkAndAdd('first_capstone')

  if (context.currentStreak >= 7) checkAndAdd('streak_7')
  if (context.currentStreak >= 30) checkAndAdd('streak_30')

  context.completedModules.forEach((modNum) => {
    checkAndAdd(`module_${modNum}_complete`)
  })

  if (context.completedLessonsCount >= 90 && context.capstonesCount >= 9) {
    checkAndAdd('cpo_completion')
  }

  return earned
}

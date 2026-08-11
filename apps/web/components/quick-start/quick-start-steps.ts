import {
  Sparkles,
  BookOpen,
  Trophy,
  Award,
  RotateCw,
  Settings,
  Rocket,
  type LucideIcon,
} from 'lucide-react'

export interface QuickStartStep {
  id: string
  stepNumber: number
  title: string
  subtitle?: string
  description: string
  icon: LucideIcon
  highlightSelector?: string
  ctaText?: string
  featureBadge?: string
}

export const QUICK_START_STEPS: QuickStartStep[] = [
  {
    id: 'welcome',
    stepNumber: 1,
    title: 'Welcome to Prodily 👋',
    subtitle: 'Your PM Learning Journey Starts Here',
    description:
      'Prodily brings your learning, progress, achievements, and PM portfolio together in one place. Take a short 1-minute tour to get familiar with your workspace.',
    icon: Sparkles,
    ctaText: "Let's get started →",
  },
  {
    id: 'curriculum',
    stepNumber: 2,
    title: '📚 Curriculum',
    subtitle: '90 Lessons Across 9 Core PM Modules',
    description:
      'This is where your Product Management learning journey happens. Work through structured lessons, sharpen your judgment with practice quizzes, and track your progress.',
    icon: BookOpen,
    highlightSelector: 'a[href="/academy"]',
    ctaText: 'Next →',
    featureBadge: 'Curriculum',
  },
  {
    id: 'leaderboard',
    stepNumber: 3,
    title: '🏆 Leaderboard & Cohorts',
    subtitle: 'Stay Motivated & Learn Together',
    description:
      'See how you rank against other Prodily learners. Earn XP through daily study activities, track weekly leaderboard snapshots, and connect with learning cohorts.',
    icon: Trophy,
    highlightSelector: 'a[href="/leaderboard"]',
    ctaText: 'Next →',
    featureBadge: 'Leaderboard',
  },
  {
    id: 'capstones',
    stepNumber: 4,
    title: '🎯 Capstones & Portfolio',
    subtitle: 'Build Proven PM Proof-of-Work',
    description:
      'Build your Product Management portfolio as you learn. Submit hands-on capstones for each module to showcase your structured thinking and real-world projects.',
    icon: Award,
    highlightSelector: 'a[href="/capstones"]',
    ctaText: 'Next →',
    featureBadge: 'Capstones',
  },
  {
    id: 'badges',
    stepNumber: 5,
    title: '🏅 Badges & Achievements',
    subtitle: 'Milestones Worth Celebrating',
    description:
      'Complete learning activities, reach daily streak goals, and unlock exclusive achievement badges as you progress through the curriculum.',
    icon: Trophy,
    highlightSelector: 'a[href="/badges"]',
    ctaText: 'Next →',
    featureBadge: 'Badges',
  },
  {
    id: 'progress',
    stepNumber: 6,
    title: '📊 Progress & Review Hub',
    subtitle: 'Spaced Repetition & Retention',
    description:
      'Master PM concepts with spaced repetition flashcards in the Review Hub, maintain active daily study streaks, and monitor your overall skill progress.',
    icon: RotateCw,
    highlightSelector: 'a[href="/review"]',
    ctaText: 'Next →',
    featureBadge: 'Review Hub',
  },
  {
    id: 'settings',
    stepNumber: 7,
    title: '👤 Profile & Settings',
    subtitle: 'Account & Portfolio Controls',
    description:
      'Manage your profile, customize your public portfolio link, configure notification preferences, and reopen this Quick Start tour anytime.',
    icon: Settings,
    highlightSelector: 'a[href="/settings"]',
    ctaText: 'Next →',
    featureBadge: 'Settings',
  },
  {
    id: 'ready',
    stepNumber: 8,
    title: "🚀 You're Ready to Start!",
    subtitle: 'Your Workspace is Prepared',
    description:
      "That's the quick tour! Explore the curriculum, complete your first lesson, earn achievements, and build your PM portfolio along the way.",
    icon: Rocket,
    ctaText: 'Start Learning',
  },
]

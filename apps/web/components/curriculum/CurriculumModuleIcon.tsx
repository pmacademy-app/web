import React from 'react'
import {
  Brain,
  Search,
  Target,
  Workflow,
  TrendingUp,
  Users,
  Terminal,
  Palette,
  Trophy,
  Award,
  Sliders,
  BookOpen,
  type LucideIcon,
} from 'lucide-react'

export const MODULE_ICON_MAP: Record<string, LucideIcon> = {
  // Slugs
  foundations: Brain,
  discovery: Search,
  strategy: Target,
  execution: Workflow,
  growth: TrendingUp,
  leadership: Users,
  technical: Terminal,
  design: Palette,
  capstone: Trophy,

  // Icon names
  Brain,
  Search,
  Target,
  Workflow,
  Sliders,
  TrendingUp,
  Users,
  Terminal,
  Palette,
  Trophy,
  Award,
  BookOpen,
}

interface CurriculumModuleIconProps {
  slugOrIcon?: string
  className?: string
}

export function CurriculumModuleIcon({
  slugOrIcon,
  className = 'w-5 h-5',
}: CurriculumModuleIconProps) {
  const IconComponent = (slugOrIcon && MODULE_ICON_MAP[slugOrIcon]) || BookOpen
  return <IconComponent className={className} aria-hidden="true" />
}

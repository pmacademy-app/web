'use client'

import React, { useState, useEffect, useRef } from 'react'
import {
  Compass,
  ChevronDown,
  Sparkles,
  Radar,
  BarChart3,
  Award,
  Briefcase,
  GraduationCap,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface SectionItem {
  id: string
  label: string
  icon: React.ElementType
  tag: string
  tagColor?: string
}

const SECTIONS: SectionItem[] = [
  {
    id: 'section-recommended',
    label: 'Next Milestone',
    icon: Sparkles,
    tag: 'NEW',
    tagColor: 'bg-primary/10 text-primary border-primary/20',
  },
  {
    id: 'section-radar',
    label: 'Skill Radar',
    icon: Radar,
    tag: 'NEW',
    tagColor: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  },
  {
    id: 'section-metrics',
    label: 'Performance Metrics',
    icon: BarChart3,
    tag: 'NEW',
    tagColor: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
  },
  {
    id: 'section-badges',
    label: 'Badge Showcase',
    icon: Award,
    tag: 'NEW',
    tagColor: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20',
  },
  {
    id: 'section-capstones',
    label: 'Capstone Projects',
    icon: Briefcase,
    tag: 'NEW',
    tagColor: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
  },
  {
    id: 'section-certificates',
    label: 'Certificates',
    icon: GraduationCap,
    tag: 'NEW',
    tagColor: 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20',
  },
]

export function ProgressSectionDropdown() {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close on outside click or Escape key
  useEffect(() => {
    if (!isOpen) return

    const handlePointerDown = (e: PointerEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  const scrollToSection = (sectionId: string) => {
    setIsOpen(false)
    const element = document.getElementById(sectionId)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' })
      // Brief subtle highlight
      element.classList.add('transition-all', 'duration-500', 'ring-2', 'ring-primary/30', 'rounded-2xl')
      setTimeout(() => {
        element.classList.remove('ring-2', 'ring-primary/30')
      }, 1500)
    }
  }

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Minimalist Trigger Button */}
      <button
        type="button"
        id="progress-section-nav-btn"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-haspopup="true"
        className={cn(
          'inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all shadow-xs cursor-pointer select-none',
          isOpen
            ? 'bg-primary text-primary-foreground border-primary shadow-sm ring-2 ring-primary/20'
            : 'bg-card border-border/80 text-foreground hover:bg-secondary/70'
        )}
      >
        <Compass className="w-3.5 h-3.5 shrink-0" />
        <span>Jump to Section</span>
        <ChevronDown
          className={cn(
            'w-3 h-3 transition-transform duration-200 opacity-60',
            isOpen && 'rotate-180 opacity-100'
          )}
        />
      </button>

      {/* Minimalist Floating Dropdown Menu */}
      {isOpen && (
        <div
          role="menu"
          aria-label="Progress Page Sections"
          className="absolute right-0 top-full mt-2 w-64 bg-card border border-border/80 rounded-xl shadow-xl p-1.5 z-30 animate-in fade-in zoom-in-95 duration-150 focus:outline-none"
        >
          <div className="px-2.5 py-1.5 text-[10px] font-bold font-mono uppercase tracking-wider text-muted-foreground border-b border-border/50 mb-1">
            Page Sections
          </div>

          <div className="space-y-0.5">
            {SECTIONS.map((section) => {
              const Icon = section.icon
              return (
                <button
                  key={section.id}
                  type="button"
                  role="menuitem"
                  onClick={() => scrollToSection(section.id)}
                  className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-medium text-foreground hover:bg-secondary/70 transition-colors cursor-pointer group text-left"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Icon className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                    <span className="truncate">{section.label}</span>
                  </div>
                  <span
                    className={cn(
                      'ml-2 px-1.5 py-0.5 rounded text-[9px] font-bold font-mono tracking-wide border shrink-0',
                      section.tagColor || 'bg-primary/10 text-primary border-primary/20'
                    )}
                  >
                    {section.tag}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

import type { Metadata } from 'next'
import Link from 'next/link'
import { MODULES } from '@/config/content'

export const metadata: Metadata = {
  title: 'Full Curriculum — 9 Modules, 90 Lessons | PM Academy',
  description: 'Explore the complete free 90-lesson Product Management curriculum across 9 core modules.',
}

export default function CurriculumPage() {
  return (
    <div className="container mx-auto px-4 py-12 max-w-5xl">
      <div className="text-center mb-12">
        <h1 className="text-3xl md:text-5xl font-bold font-serif text-foreground mb-4">
          Full PM Curriculum
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          9 modules, 90 lessons, 9 applied capstones. Rigorous, structured, and free forever.
        </p>
      </div>

      <div className="space-y-8">
        {MODULES.map((module) => (
          <div
            key={module.number}
            className="rounded-xl border border-border bg-card p-6 md:p-8 shadow-sm transition-all hover:border-primary/50"
          >
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
              <div>
                <span className="text-xs uppercase tracking-wider font-semibold text-primary">
                  Module {String(module.number).padStart(2, '0')}
                </span>
                <h2 className="text-xl md:text-2xl font-bold font-serif text-foreground mt-1">
                  {module.title}
                </h2>
              </div>
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <span>{module.estimatedTime}</span>
                <span>•</span>
                <span>{module.lessonCount} Lessons</span>
              </div>
            </div>

            <p className="text-sm text-foreground/80 mb-4 font-medium">
              Outcome: <span className="font-normal text-muted-foreground">{module.outcome}</span>
            </p>

            <div className="flex flex-wrap gap-2 mb-6">
              {module.skillLabels.map((label) => (
                <span
                  key={label}
                  className="inline-flex items-center rounded-md bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground"
                >
                  {label}
                </span>
              ))}
            </div>

            <div className="border-t border-border/60 pt-4 flex justify-between items-center">
              <span className="text-xs text-muted-foreground">10 lessons with theory, quiz, flashcards & reflection</span>
              <Link
                href={`/lessons/lesson-${String((module.number - 1) * 10 + 1).padStart(3, '0')}`}
                className="text-sm font-medium text-primary hover:underline"
              >
                Preview Module 1st Lesson →
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

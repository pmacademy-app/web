import React from 'react'

interface LessonHeaderProps {
  moduleNumber: number
  moduleName: string
  lessonNumber: number
  lessonTitle: string
  difficulty: number
  estMinutesReading: number
}

export default function LessonHeader({
  moduleNumber,
  moduleName,
  lessonNumber,
  lessonTitle,
  difficulty,
  estMinutesReading,
}: LessonHeaderProps) {
  return (
    <div className="border-b border-border pb-6 mb-8">
      <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary mb-3">
        <span>Module {moduleNumber}: {moduleName}</span>
        <span className="text-muted-foreground/40">•</span>
        <span>Lesson {lessonNumber}</span>
        <span className="text-muted-foreground/40">•</span>
        <span>{estMinutesReading} min read</span>
        <span className="text-muted-foreground/40">•</span>
        <span className="flex items-center gap-1">
          Difficulty:{' '}
          <span className="text-foreground font-semibold">
            {'★'.repeat(difficulty)}{'☆'.repeat(Math.max(0, 5 - difficulty))}
          </span>
        </span>
      </div>
      <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold font-serif text-foreground leading-tight">
        {lessonTitle}
      </h1>
    </div>
  )
}

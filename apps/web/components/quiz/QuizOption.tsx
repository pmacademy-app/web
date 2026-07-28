import React from 'react'

interface QuizOptionProps {
  letter: 'A' | 'B' | 'C' | 'D'
  text: string
  state: 'default' | 'selected' | 'correct' | 'incorrect' | 'disabled'
  onClick: () => void
  disabled?: boolean
}

export default function QuizOption({
  letter,
  text,
  state,
  onClick,
  disabled = false,
}: QuizOptionProps) {
  let borderClasses = 'border-border bg-card text-foreground hover:border-foreground/30 hover:bg-accent/30'
  let textClasses = 'text-foreground'
  let badgeClasses = 'bg-muted text-muted-foreground border-border'

  if (state === 'selected') {
    borderClasses = 'border-primary bg-primary/5 text-primary'
    textClasses = 'text-primary'
    badgeClasses = 'bg-primary text-primary-foreground border-primary'
  } else if (state === 'correct') {
    borderClasses = 'border-emerald-500 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400 font-semibold'
    textClasses = 'text-emerald-800 dark:text-emerald-300'
    badgeClasses = 'bg-emerald-500 text-white border-emerald-500'
  } else if (state === 'incorrect') {
    borderClasses = 'border-destructive bg-destructive/5 text-destructive'
    textClasses = 'text-destructive'
    badgeClasses = 'bg-destructive text-white border-destructive'
  } else if (state === 'disabled') {
    borderClasses = 'border-muted bg-muted/40 text-muted-foreground cursor-not-allowed opacity-60'
    textClasses = 'text-muted-foreground'
    badgeClasses = 'bg-muted/60 text-muted-foreground border-muted'
  }

  return (
    <button
      role="radio"
      aria-checked={state === 'selected' || state === 'correct'}
      disabled={disabled || state === 'disabled'}
      onClick={onClick}
      className={`w-full flex items-start gap-4 p-4 rounded-xl border text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${borderClasses}`}
    >
      <span className={`flex items-center justify-center shrink-0 w-8 h-8 rounded-lg border text-sm font-bold transition-all ${badgeClasses}`}>
        {letter}
      </span>
      <span className={`text-sm leading-relaxed mt-1 ${textClasses}`}>{text}</span>
    </button>
  )
}

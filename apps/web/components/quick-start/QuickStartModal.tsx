'use client'

import React, { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  X,
  ChevronLeft,
  ChevronRight,
  Sparkles,
} from 'lucide-react'
import { useQuickStart } from './QuickStartContext'
import { Button } from '@/components/ui/button'
import { ProgressBar } from '@/components/ui/progress-bar'
import { BrandMarkProdily } from '@/components/brand/BrandLogo'

export function QuickStartModal() {
  const router = useRouter()
  const {
    isOpen,
    currentStepIndex,
    currentStep,
    totalSteps,
    nextStep,
    prevStep,
    skipTour,
    finishTour,
  } = useQuickStart()

  const [highlightStyle, setHighlightStyle] = useState<React.CSSProperties | null>(null)
  const isFirstStep = currentStepIndex === 0
  const isLastStep = currentStepIndex === totalSteps - 1

  const IconComponent = currentStep.icon || Sparkles
  const cardRef = useRef<HTMLDivElement>(null)

  // Spotlight effect positioning on desktop
  useEffect(() => {
    if (!isOpen) {
      setHighlightStyle(null)
      return
    }

    const selector = currentStep.highlightSelector
    if (!selector || typeof window === 'undefined' || window.innerWidth < 1024) {
      setHighlightStyle(null)
      return
    }

    const targetEl = document.querySelector(selector) as HTMLElement | null
    if (targetEl) {
      const rect = targetEl.getBoundingClientRect()
      setHighlightStyle({
        position: 'fixed',
        top: `${rect.top - 4}px`,
        left: `${rect.left - 4}px`,
        width: `${rect.width + 8}px`,
        height: `${rect.height + 8}px`,
        pointerEvents: 'none',
        zIndex: 45,
      })
    } else {
      setHighlightStyle(null)
    }
  }, [isOpen, currentStepIndex, currentStep])

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        skipTour()
      } else if (e.key === 'ArrowRight' && !isLastStep) {
        e.preventDefault()
        nextStep()
      } else if (e.key === 'ArrowLeft' && !isFirstStep) {
        e.preventDefault()
        prevStep()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, isFirstStep, isLastStep, nextStep, prevStep, skipTour])

  if (!isOpen) return null

  const handleFinish = async () => {
    await finishTour()
    router.push('/academy')
  }

  const progressPercent = Math.round(((currentStepIndex + 1) / totalSteps) * 100)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-6 animate-in fade-in duration-200">
      {/* Backdrop overlay */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
        onClick={() => skipTour()}
        aria-hidden="true"
      />

      {/* Spotlight Ring around target navigation item (Desktop only) */}
      {highlightStyle && (
        <div
          style={highlightStyle}
          className="rounded-lg border-2 border-primary shadow-[0_0_15px_rgba(var(--primary-rgb),0.5)] ring-4 ring-primary/20 animate-pulse hidden lg:block"
        />
      )}

      {/* Tour Modal Card */}
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="quickstart-title"
        aria-describedby="quickstart-description"
        className="relative z-50 w-full max-w-lg rounded-2xl border border-border bg-card shadow-2xl p-6 md:p-8 space-y-6 outline-none animate-in zoom-in-95 duration-150"
      >
        {/* Header: Logo, Badge, Close/Skip */}
        <div className="flex items-center justify-between gap-2 border-b border-border pb-4">
          <div className="flex items-center gap-2">
            <BrandMarkProdily size="sm" />
            {currentStep.featureBadge && (
              <span className="text-[10px] font-bold uppercase tracking-wider bg-primary/10 text-primary px-2.5 py-1 rounded-full border border-primary/20">
                {currentStep.featureBadge}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-muted-foreground">
              Step {currentStep.stepNumber} of {totalSteps}
            </span>
            <button
              type="button"
              onClick={() => skipTour()}
              className="p-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-secondary/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary transition-colors cursor-pointer"
              aria-label="Skip tour"
              title="Skip tour"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="space-y-1">
          <ProgressBar value={progressPercent} className="h-1.5" />
        </div>

        {/* Step Body Content */}
        <div className="space-y-4 py-2">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-primary/10 border border-primary/20 text-primary flex-shrink-0">
              <IconComponent className="w-6 h-6" />
            </div>
            <div>
              <h2 id="quickstart-title" className="text-xl font-bold font-serif text-foreground">
                {currentStep.title}
              </h2>
              {currentStep.subtitle && (
                <p className="text-xs font-medium text-primary mt-0.5">
                  {currentStep.subtitle}
                </p>
              )}
            </div>
          </div>

          <p id="quickstart-description" className="text-sm text-muted-foreground leading-relaxed">
            {currentStep.description}
          </p>
        </div>

        {/* Actions / Footer Controls */}
        <div className="flex items-center justify-between border-t border-border pt-4">
          <button
            type="button"
            onClick={() => skipTour()}
            className="text-xs font-medium text-muted-foreground hover:text-foreground hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded px-1 cursor-pointer"
          >
            Skip Tour
          </button>

          <div className="flex items-center gap-2">
            {!isFirstStep && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={prevStep}
                className="cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                Back
              </Button>
            )}

            {isLastStep ? (
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={handleFinish}
                className="font-bold cursor-pointer"
              >
                {currentStep.ctaText || 'Start Learning'}
              </Button>
            ) : (
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={nextStep}
                className="font-semibold cursor-pointer"
              >
                {currentStep.ctaText || 'Next →'}
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

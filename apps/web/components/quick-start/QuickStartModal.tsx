'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
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

/** Bounding rect of a DOM element — null when unavailable */
interface TargetRect {
  top: number
  left: number
  width: number
  height: number
}

/** Arrow direction from modal toward spotlight target */
type ArrowDir = 'left' | 'right' | 'up' | 'down' | null

interface ArrowGeometry {
  dir: ArrowDir
  startX: number
  startY: number
  endX: number
  endY: number
}

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

  const isFirstStep = currentStepIndex === 0
  const isLastStep = currentStepIndex === totalSteps - 1
  const IconComponent = currentStep.icon || Sparkles
  const cardRef = useRef<HTMLDivElement>(null)

  const [targetRect, setTargetRect] = useState<TargetRect | null>(null)
  const [isDesktop, setIsDesktop] = useState(false)
  const [arrowGeom, setArrowGeom] = useState<ArrowGeometry | null>(null)

  // Compute spotlight target rect and arrow position
  const updateLayout = useCallback(() => {
    if (typeof window === 'undefined') return

    const desktop = window.innerWidth >= 1024
    setIsDesktop(desktop)

    const selector = currentStep.highlightSelector
    if (!selector || !desktop) {
      setTargetRect(null)
      setArrowGeom(null)
      return
    }

    const targetEl = document.querySelector(selector) as HTMLElement | null
    const cardEl = cardRef.current

    if (!targetEl || !cardEl) {
      setTargetRect(null)
      setArrowGeom(null)
      return
    }

    const tRect = targetEl.getBoundingClientRect()
    const cRect = cardEl.getBoundingClientRect()

    // Clamp target rect to ensure it is on-screen
    if (tRect.width === 0 || tRect.height === 0) {
      setTargetRect(null)
      setArrowGeom(null)
      return
    }

    setTargetRect({
      top: tRect.top,
      left: tRect.left,
      width: tRect.width,
      height: tRect.height,
    })

    // Determine direction: where is target relative to modal?
    const tX = tRect.left + tRect.width / 2
    const tY = tRect.top + tRect.height / 2
    const cX = cRect.left + cRect.width / 2
    const cY = cRect.top + cRect.height / 2

    const dx = tX - cX
    const dy = tY - cY

    let dir: ArrowDir
    if (Math.abs(dx) >= Math.abs(dy)) {
      dir = dx < 0 ? 'left' : 'right'
    } else {
      dir = dy < 0 ? 'up' : 'down'
    }

    let startX = 0
    let startY = 0
    let endX = 0
    let endY = 0

    if (dir === 'left') {
      startX = cRect.left - 4
      startY = Math.max(cRect.top + 32, Math.min(cRect.bottom - 32, tY))
      endX = tRect.left + tRect.width + 10
      endY = startY
      if (startX - endX < 12) {
        setArrowGeom(null)
        return
      }
    } else if (dir === 'right') {
      startX = cRect.right + 4
      startY = Math.max(cRect.top + 32, Math.min(cRect.bottom - 32, tY))
      endX = tRect.left - 10
      endY = startY
      if (endX - startX < 12) {
        setArrowGeom(null)
        return
      }
    } else if (dir === 'up') {
      startX = Math.max(cRect.left + 32, Math.min(cRect.right - 32, tX))
      startY = cRect.top - 4
      endX = startX
      endY = tRect.top + tRect.height + 10
      if (startY - endY < 12) {
        setArrowGeom(null)
        return
      }
    } else {
      startX = Math.max(cRect.left + 32, Math.min(cRect.right - 32, tX))
      startY = cRect.bottom + 4
      endX = startX
      endY = tRect.top - 10
      if (endY - startY < 12) {
        setArrowGeom(null)
        return
      }
    }

    setArrowGeom({ dir, startX, startY, endX, endY })
  }, [currentStep.highlightSelector])

  useEffect(() => {
    if (!isOpen) {
      const raf = requestAnimationFrame(() => {
        setTargetRect(null)
        setArrowGeom(null)
      })
      return () => cancelAnimationFrame(raf)
    }
    // Allow card to render before measuring its rect
    const raf = requestAnimationFrame(() => updateLayout())
    return () => cancelAnimationFrame(raf)
  }, [isOpen, currentStepIndex, currentStep, updateLayout])

  useEffect(() => {
    if (!isOpen) return
    const handleResize = () => updateLayout()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [isOpen, updateLayout])

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
  const hasPreview = Boolean(currentStep.previewImage)

  // ── SVG Spotlight Overlay (desktop only, when target exists) ─────────────
  const renderSpotlightOverlay = () => {
    if (!isDesktop || !targetRect) return null

    const W = typeof window !== 'undefined' ? window.innerWidth : 1920
    const H = typeof window !== 'undefined' ? window.innerHeight : 1080
    const PAD = 6
    const RADIUS = 8

    const holeLeft = Math.max(0, targetRect.left - PAD)
    const holeTop = Math.max(0, targetRect.top - PAD)
    const holeRight = Math.min(W, targetRect.left + targetRect.width + PAD)
    const holeBottom = Math.min(H, targetRect.top + targetRect.height + PAD)
    const holeW = holeRight - holeLeft
    const holeH = holeBottom - holeTop

    // Full-viewport rect path with rounded-rect hole cut out via evenodd fill rule
    const fullRect = `M0,0 H${W} V${H} H0 Z`
    const holeRect = [
      `M${holeLeft + RADIUS},${holeTop}`,
      `H${holeRight - RADIUS}`,
      `Q${holeRight},${holeTop} ${holeRight},${holeTop + RADIUS}`,
      `V${holeBottom - RADIUS}`,
      `Q${holeRight},${holeBottom} ${holeRight - RADIUS},${holeBottom}`,
      `H${holeLeft + RADIUS}`,
      `Q${holeLeft},${holeBottom} ${holeLeft},${holeBottom - RADIUS}`,
      `V${holeTop + RADIUS}`,
      `Q${holeLeft},${holeTop} ${holeLeft + RADIUS},${holeTop} Z`,
    ].join(' ')

    return (
      <svg
        aria-hidden="true"
        style={{
          position: 'fixed',
          inset: 0,
          width: '100%',
          height: '100%',
          zIndex: 48,
          pointerEvents: 'none',
        }}
      >
        {/* Dimmed overlay with hole */}
        <path
          d={`${fullRect} ${holeRect}`}
          fill="rgba(0,0,0,0.65)"
          fillRule="evenodd"
        />
        {/* Subtle teal ring around the spotlight hole */}
        <rect
          x={holeLeft}
          y={holeTop}
          width={holeW}
          height={holeH}
          rx={RADIUS}
          fill="none"
          stroke="var(--color-primary, #1F6B4E)"
          strokeWidth="2"
          strokeOpacity="0.9"
        />
        {/* Outer glow ring */}
        <rect
          x={holeLeft - 3}
          y={holeTop - 3}
          width={holeW + 6}
          height={holeH + 6}
          rx={RADIUS + 3}
          fill="none"
          stroke="var(--color-primary, #1F6B4E)"
          strokeWidth="1"
          strokeOpacity="0.25"
        />
      </svg>
    )
  }

  // ── Arrow pointing from modal edge toward spotlight target ────────────────
  const renderArrow = () => {
    if (!isDesktop || !arrowGeom || !targetRect) return null

    const { dir, startX, startY, endX, endY } = arrowGeom
    const color = 'var(--color-primary, #1F6B4E)'

    const HEAD_LEN = 8
    const HEAD_HALF = 5

    let lineEndX = endX
    let lineEndY = endY
    let headPoints = ''

    if (dir === 'left') {
      // Arrowhead tip points LEFT towards target (endX, endY)
      lineEndX = endX + HEAD_LEN
      lineEndY = endY
      headPoints = `${endX},${endY} ${endX + HEAD_LEN},${endY - HEAD_HALF} ${endX + HEAD_LEN},${endY + HEAD_HALF}`
    } else if (dir === 'right') {
      // Arrowhead tip points RIGHT towards target (endX, endY)
      lineEndX = endX - HEAD_LEN
      lineEndY = endY
      headPoints = `${endX},${endY} ${endX - HEAD_LEN},${endY - HEAD_HALF} ${endX - HEAD_LEN},${endY + HEAD_HALF}`
    } else if (dir === 'up') {
      // Arrowhead tip points UP towards target (endX, endY)
      lineEndX = endX
      lineEndY = endY + HEAD_LEN
      headPoints = `${endX},${endY} ${endX - HEAD_HALF},${endY + HEAD_LEN} ${endX + HEAD_HALF},${endY + HEAD_LEN}`
    } else if (dir === 'down') {
      // Arrowhead tip points DOWN towards target (endX, endY)
      lineEndX = endX
      lineEndY = endY - HEAD_LEN
      headPoints = `${endX},${endY} ${endX - HEAD_HALF},${endY - HEAD_LEN} ${endX + HEAD_HALF},${endY - HEAD_LEN}`
    }

    return (
      <svg
        aria-hidden="true"
        style={{
          position: 'fixed',
          inset: 0,
          width: '100%',
          height: '100%',
          zIndex: 60,
          pointerEvents: 'none',
        }}
      >
        {/* Connector shaft line */}
        <line
          x1={startX}
          y1={startY}
          x2={lineEndX}
          y2={lineEndY}
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
        />
        {/* Target-facing arrowhead tip */}
        <polygon
          points={headPoints}
          fill={color}
        />
        {/* Modal edge anchor dot */}
        <circle
          cx={startX}
          cy={startY}
          r="3"
          fill={color}
        />
      </svg>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-6 animate-in fade-in duration-200">
      {/* SVG Spotlight Overlay — replaces old backdrop + opaque highlight box */}
      {isDesktop && targetRect ? (
        renderSpotlightOverlay()
      ) : (
        /* Plain backdrop when no spotlight target (Steps 1/8 or mobile) */
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
          style={{ zIndex: 48 }}
          onClick={() => skipTour()}
          aria-hidden="true"
        />
      )}

      {/* Clickable plain backdrop behind modal for steps with no spotlight */}
      {isDesktop && targetRect && (
        <div
          className="fixed inset-0"
          style={{ zIndex: 47 }}
          onClick={() => skipTour()}
          aria-hidden="true"
        />
      )}

      {/* Directional arrow toward spotlight target */}
      {renderArrow()}

      {/* Tour Modal Card */}
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="quickstart-title"
        aria-describedby="quickstart-description"
        className={[
          'relative z-50 w-full rounded-2xl border border-border bg-card shadow-2xl outline-none',
          'animate-in zoom-in-95 duration-150 flex flex-col',
          hasPreview ? 'max-w-2xl' : 'max-w-lg',
          'max-h-[90vh] overflow-y-auto',
        ].join(' ')}
        style={{ padding: '1.5rem 2rem' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header: Logo, Feature Badge, Step Counter, Close */}
        <div className="flex items-center justify-between gap-2 border-b border-border pb-4 flex-shrink-0">
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
        <div className="space-y-1 mt-4 flex-shrink-0">
          <ProgressBar value={progressPercent} className="h-1.5" />
        </div>

        {/* Step Body Content */}
        <div className="space-y-4 py-4 flex-1 min-h-0">
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

          {/* Feature Preview Image (Steps 2–7 only) */}
          {currentStep.previewImage && (
            <figure className="mt-2 rounded-xl border border-border/60 overflow-hidden bg-muted/30 flex-shrink-0">
              <Image
                src={currentStep.previewImage}
                alt={currentStep.previewAlt || currentStep.title}
                width={1200}
                height={600}
                className="w-full h-auto object-contain block"
                style={{ maxHeight: '240px', objectFit: 'cover', objectPosition: 'top' }}
                priority={currentStepIndex <= 2}
                unoptimized
              />
            </figure>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-border pt-4 flex-shrink-0">
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

'use client'

import { useEffect, useRef, type HTMLAttributes } from 'react'

/**
 * Wraps a grid of SPOTLIGHT cards and feeds the pointer position to whichever
 * `[data-spotlight]` card is under the pointer, as `--x` / `--y` in px.
 *
 * One passive pointermove listener per group (not per card), throttled to one
 * write per animation frame. It only attaches on devices with a fine, hovering
 * pointer; touch devices and no-JS visitors get the static card, and the CSS
 * hides the glow under reduced motion. Server-rendered children pass through.
 */
export function SpotlightGroup({ children, ...divProps }: HTMLAttributes<HTMLDivElement>) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const root = ref.current
    if (!root || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return

    let frame = 0
    let pending: { target: EventTarget | null; x: number; y: number } | null = null

    const paint = () => {
      frame = 0
      const move = pending
      pending = null
      if (!move || !(move.target instanceof Element)) return
      const card = move.target.closest<HTMLElement>('[data-spotlight]')
      if (!card || !root.contains(card)) return
      const rect = card.getBoundingClientRect()
      card.style.setProperty('--x', `${Math.round(move.x - rect.left)}px`)
      card.style.setProperty('--y', `${Math.round(move.y - rect.top)}px`)
    }

    const onPointerMove = (event: PointerEvent) => {
      pending = { target: event.target, x: event.clientX, y: event.clientY }
      if (!frame) frame = requestAnimationFrame(paint)
    }

    root.addEventListener('pointermove', onPointerMove, { passive: true })
    return () => {
      root.removeEventListener('pointermove', onPointerMove)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [])

  return (
    <div ref={ref} {...divProps}>
      {children}
    </div>
  )
}

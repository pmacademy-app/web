import { useCallback } from 'react'

/**
 * Fade and slide an element in the first time it scrolls into view, without an
 * animation engine.
 *
 * Content is visible at rest. The element only gets `data-reveal="pending"` (styled
 * transparent in globals.css) when JavaScript runs, an IntersectionObserver exists
 * and the element is still below or above the viewport at attach time. So a crawler,
 * a no-JS reader or a browser without the observer always sees the content, and
 * anything already on screen never flashes. The observer flips it to "shown", which
 * runs the CSS transition.
 *
 * Pass `disabled` (from useReducedMotion) to skip the effect entirely; globals.css
 * also pins `[data-reveal]` to its final state under prefers-reduced-motion.
 *
 * The returned callback can be shared by every item in a list: React 19 calls it once
 * per node and keeps each node's cleanup separately.
 */
export function useRevealOnScroll(disabled: boolean, amount = 0.15) {
  return useCallback(
    (node: HTMLElement | null) => {
      if (!node || disabled) return
      if (typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') return

      const rect = node.getBoundingClientRect()
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight
      if (rect.top < viewportHeight && rect.bottom > 0) return

      node.setAttribute('data-reveal', 'pending')
      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              node.setAttribute('data-reveal', 'shown')
              observer.disconnect()
            }
          }
        },
        { threshold: amount },
      )
      observer.observe(node)

      return () => {
        observer.disconnect()
        // Never leave a detached or re-attached node stuck transparent.
        if (node.getAttribute('data-reveal') === 'pending') node.removeAttribute('data-reveal')
      }
    },
    [disabled, amount],
  )
}

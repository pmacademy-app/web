'use client'

import { useEffect } from 'react'

const STORAGE_KEY = 'prodily_open_modules'

/**
 * AcademyNavigationRetention ensures that when a learner navigates between lessons,
 * uses browser back/forward, or refreshes the /academy curriculum page:
 * 1. Deep link / breadcrumb module hashes (#foundations, #discovery, etc.) automatically expand and scroll to the target module.
 * 2. Learner's expanded/collapsed accordion state is retained across session navigation via sessionStorage.
 * 3. First-time visitors automatically see their recommended or active module expanded rather than an empty wall of closed accordions.
 */
export function AcademyNavigationRetention() {
  useEffect(() => {
    if (typeof window === 'undefined') return

    const allDetails = Array.from(document.querySelectorAll<HTMLDetailsElement>('details[data-module-slug]'))
    if (allDetails.length === 0) return

    const hash = window.location.hash.replace('#', '').trim()

    const saveOpenModules = () => {
      try {
        const openSlugs = allDetails
          .filter((d) => d.open)
          .map((d) => d.getAttribute('data-module-slug'))
          .filter(Boolean) as string[]
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(openSlugs))
      } catch {
        // sessionStorage may be disabled or quota restricted
      }
    }

    // Listen to toggle events on every module details accordion
    allDetails.forEach((d) => {
      d.addEventListener('toggle', saveOpenModules)
    })

    // 1. If URL has a module hash, expand that module and scroll to it
    if (hash) {
      const target = allDetails.find((d) => d.getAttribute('data-module-slug') === hash || d.id === hash)
      if (target) {
        target.open = true
        requestAnimationFrame(() => {
          target.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
        })
        saveOpenModules()
        return () => {
          allDetails.forEach((d) => d.removeEventListener('toggle', saveOpenModules))
        }
      }
    }

    // 2. Otherwise restore from sessionStorage
    let restored = false
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY)
      if (stored) {
        const slugs = JSON.parse(stored) as string[]
        if (Array.isArray(slugs) && slugs.length > 0) {
          allDetails.forEach((d) => {
            const slug = d.getAttribute('data-module-slug')
            if (slug && slugs.includes(slug)) {
              d.open = true
              restored = true
            }
          })
        }
      }
    } catch {
      // Fall through if storage corrupted
    }

    // 3. Default fallback: expand recommended module or active target module
    if (!restored) {
      const recommendedOrTarget =
        allDetails.find((d) => d.getAttribute('data-recommended') === 'true') ||
        allDetails.find((d) => d.getAttribute('data-has-target') === 'true') ||
        allDetails[0]

      if (recommendedOrTarget) {
        recommendedOrTarget.open = true
        saveOpenModules()
      }
    }

    // Handle hashchange for in-page navigation / history transitions
    const onHashChange = () => {
      const currentHash = window.location.hash.replace('#', '').trim()
      if (currentHash) {
        const target = allDetails.find(
          (d) => d.getAttribute('data-module-slug') === currentHash || d.id === currentHash
        )
        if (target) {
          target.open = true
          target.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
          saveOpenModules()
        }
      }
    }

    window.addEventListener('hashchange', onHashChange)

    return () => {
      allDetails.forEach((d) => d.removeEventListener('toggle', saveOpenModules))
      window.removeEventListener('hashchange', onHashChange)
    }
  }, [])

  return null
}

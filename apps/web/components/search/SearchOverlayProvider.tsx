'use client'

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

interface SearchContextValue {
  openSearch: () => void
  closeSearch: () => void
  isOpen: boolean
}

const SearchContext = createContext<SearchContextValue>({
  openSearch: () => {},
  closeSearch: () => {},
  isOpen: false,
})

export function useSearch() {
  return useContext(SearchContext)
}

export function SearchOverlayProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const triggerRef = useRef<HTMLElement | null>(null)

  const openSearch = useCallback(() => {
    triggerRef.current = document.activeElement as HTMLElement
    setIsOpen(true)
  }, [])

  const closeSearch = useCallback(() => {
    setIsOpen(false)
    // Return focus to the element that triggered the overlay
    requestAnimationFrame(() => {
      triggerRef.current?.focus()
    })
  }, [])

  // Global Cmd/Ctrl+K keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setIsOpen((prev) => {
          if (prev) {
            // Already open — close
            requestAnimationFrame(() => triggerRef.current?.focus())
            return false
          }
          triggerRef.current = document.activeElement as HTMLElement
          return true
        })
      }
      if (e.key === 'Escape' && isOpen) {
        closeSearch()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, closeSearch])

  return (
    <SearchContext.Provider value={{ openSearch, closeSearch, isOpen }}>
      {children}
    </SearchContext.Provider>
  )
}
